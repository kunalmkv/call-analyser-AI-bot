/**
 * Migration: Convert single-value tiers to uniform array format
 * Phase 4 (Optional): Only run if you need multi-value support for tiers 1, 4, 5
 *
 * CAUTION: Breaking change - all queries accessing tier1/4/5 must be updated
 *
 * Before: tier1_data = {"value":"SOFT_LEAD_INTERESTED", "reason":"..."}
 * After:  tier1_data = {"values":["SOFT_LEAD_INTERESTED"], "reasons":{"SOFT_LEAD_INTERESTED":"..."}}
 *
 * Run: psql $DATABASE_URL -f docs/migration-array-uniformity.sql
 */

BEGIN;

-- =====================================================================
-- SECTION 1: Create backup table (RECOMMENDED)
-- =====================================================================
DROP TABLE IF EXISTS call_analysis_v2_backup_before_array_migration;

CREATE TABLE call_analysis_v2_backup_before_array_migration AS
SELECT * FROM call_analysis_v2;

RAISE NOTICE '✓ Created backup table: call_analysis_v2_backup_before_array_migration';

-- =====================================================================
-- SECTION 2: Convert tier1_data to array format
-- =====================================================================
-- Before: {"value":"SOFT_LEAD_INTERESTED", "reason":"..."}
-- After:  {"values":["SOFT_LEAD_INTERESTED"], "reasons":{"SOFT_LEAD_INTERESTED":"..."}}

UPDATE call_analysis_v2
SET tier1_data = jsonb_build_object(
    'values', jsonb_build_array(tier1_data->>'value'),
    'reasons', jsonb_build_object(
        tier1_data->>'value',
        tier1_data->>'reason'
    )
)
WHERE tier1_data ? 'value'  -- Only convert rows with old format
  AND NOT (tier1_data ? 'values');  -- Skip already-converted rows

RAISE NOTICE '✓ Converted tier1_data to array format';

-- =====================================================================
-- SECTION 3: Convert tier4_data to array format
-- =====================================================================
UPDATE call_analysis_v2
SET tier4_data = jsonb_build_object(
    'values', jsonb_build_array(tier4_data->>'value'),
    'reasons', jsonb_build_object(
        tier4_data->>'value',
        tier4_data->>'reason'
    )
)
WHERE tier4_data ? 'value'
  AND NOT (tier4_data ? 'values');

RAISE NOTICE '✓ Converted tier4_data to array format';

-- =====================================================================
-- SECTION 4: Convert tier5_data to array format
-- =====================================================================
UPDATE call_analysis_v2
SET tier5_data = jsonb_build_object(
    'values', jsonb_build_array(tier5_data->>'value'),
    'reasons', jsonb_build_object(
        tier5_data->>'value',
        tier5_data->>'reason'
    )
)
WHERE tier5_data ? 'value'
  AND NOT (tier5_data ? 'values');

RAISE NOTICE '✓ Converted tier5_data to array format';

-- =====================================================================
-- SECTION 5: Update default values in schema
-- =====================================================================
ALTER TABLE call_analysis_v2
    ALTER COLUMN tier1_data SET DEFAULT '{"values":[],"reasons":{}}',
    ALTER COLUMN tier4_data SET DEFAULT '{"values":[],"reasons":{}}',
    ALTER COLUMN tier5_data SET DEFAULT '{"values":[],"reasons":{}}';

RAISE NOTICE '✓ Updated default values for tier1/4/5_data';

-- =====================================================================
-- SECTION 6: Drop old functional indexes (will be recreated as GIN)
-- =====================================================================
DROP INDEX IF EXISTS idx_v2_tier1;
DROP INDEX IF EXISTS idx_v2_tier4;
DROP INDEX IF EXISTS idx_v2_tier5;

RAISE NOTICE '✓ Dropped old B-tree indexes on tier1/4/5';

-- =====================================================================
-- SECTION 7: Create new GIN indexes for array containment queries
-- =====================================================================
CREATE INDEX idx_v2_tier1_gin ON call_analysis_v2 USING GIN(tier1_data);
CREATE INDEX idx_v2_tier4_gin ON call_analysis_v2 USING GIN(tier4_data);
CREATE INDEX idx_v2_tier5_gin ON call_analysis_v2 USING GIN(tier5_data);

RAISE NOTICE '✓ Created GIN indexes on tier1/4/5_data';

-- =====================================================================
-- SECTION 8: Create generated columns for backwards compatibility
-- =====================================================================
-- These allow old queries (tier1_data->>'value') to still work

-- Add generated columns that extract first value from array
ALTER TABLE call_analysis_v2
    ADD COLUMN IF NOT EXISTS tier1_value_compat VARCHAR
        GENERATED ALWAYS AS (tier1_data->'values'->>0) STORED;

ALTER TABLE call_analysis_v2
    ADD COLUMN IF NOT EXISTS tier4_value_compat VARCHAR
        GENERATED ALWAYS AS (tier4_data->'values'->>0) STORED;

ALTER TABLE call_analysis_v2
    ADD COLUMN IF NOT EXISTS tier5_value_compat VARCHAR
        GENERATED ALWAYS AS (tier5_data->'values'->>0) STORED;

-- Create indexes on generated columns for query performance
CREATE INDEX idx_v2_tier1_value_compat ON call_analysis_v2(tier1_value_compat);
CREATE INDEX idx_v2_tier4_value_compat ON call_analysis_v2(tier4_value_compat);
CREATE INDEX idx_v2_tier5_value_compat ON call_analysis_v2(tier5_value_compat);

RAISE NOTICE '✓ Created backwards-compatible generated columns';

-- =====================================================================
-- SECTION 9: Update views to use new array format
-- =====================================================================

-- v_call_analysis_summary
CREATE OR REPLACE VIEW v_call_analysis_summary AS
SELECT
    ringba_row_id,
    ringba_caller_id,
    tier1_data->'values'->>0 AS outcome,           -- Changed from ->>'value'
    tier4_data->'values'->>0 AS appliance_type,    -- Changed from ->>'value'
    tier5_data->'values'->>0 AS billing_status,    -- Changed from ->>'value'
    dispute_recommendation,
    confidence_score,
    call_summary,
    current_revenue,
    current_billed_status,
    model_used,
    processing_time_ms,
    processed_at
FROM call_analysis_v2;

-- v_dispute_candidates
CREATE OR REPLACE VIEW v_dispute_candidates AS
SELECT
    ringba_row_id,
    ringba_caller_id,
    tier1_data->'values'->>0 AS tier1_value,       -- Changed
    tier5_data->'values'->>0 AS tier5_value,       -- Changed
    dispute_recommendation,
    dispute_recommendation_reason,
    call_summary,
    current_revenue,
    current_billed_status,
    confidence_score,
    processed_at
FROM call_analysis_v2
WHERE dispute_recommendation IN ('REVIEW','STRONG')
   OR tier5_data->'values' @> '["DEFINITELY_NOT_BILLABLE"]'::jsonb;  -- Changed

-- v_billing_discrepancies
CREATE OR REPLACE VIEW v_billing_discrepancies AS
SELECT
    ringba_row_id,
    ringba_caller_id,
    tier5_data->'values'->>0 AS tier5_value,
    current_revenue,
    current_billed_status,
    call_summary,
    tier5_data->'reasons'->>tier5_data->'values'->>0 AS tier5_reason,  -- Changed
    processed_at
FROM call_analysis_v2
WHERE (tier5_data->'values' @> '["LIKELY_BILLABLE"]'::jsonb
           AND current_billed_status = false AND current_revenue = 0)
   OR (tier5_data->'values' @> '["DEFINITELY_NOT_BILLABLE"]'::jsonb
           AND current_billed_status = true  AND current_revenue > 0);

-- v_call_tags_with_reasons (update tier 1, 4, 5 lookups)
CREATE OR REPLACE VIEW v_call_tags_with_reasons AS
SELECT
    ct.call_id,
    ct.tag_id,
    td.tag_value,
    td.tag_name,
    td.tier_number,
    td.priority,
    ct.confidence,
    ct.created_at,
    CASE
        WHEN td.tier_number = 1  THEN v2.tier1_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 2  THEN v2.tier2_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 3  THEN v2.tier3_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 4  THEN v2.tier4_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 5  THEN v2.tier5_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 6  THEN v2.tier6_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 7  THEN v2.tier7_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 8  THEN v2.tier8_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 9  THEN v2.tier9_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 10 THEN v2.tier10_data->'reasons'->>td.tag_value
    END AS detected_reason
FROM call_tags ct
JOIN tag_definitions td ON ct.tag_id = td.id
JOIN call_analysis_v2 v2 ON ct.call_id = v2.ringba_row_id;

RAISE NOTICE '✓ Updated all views to use array format';

-- =====================================================================
-- SECTION 10: Verification
-- =====================================================================
DO $$
DECLARE
    tier1_converted INTEGER;
    tier4_converted INTEGER;
    tier5_converted INTEGER;
    total_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_rows FROM call_analysis_v2;
    SELECT COUNT(*) INTO tier1_converted FROM call_analysis_v2 WHERE tier1_data ? 'values';
    SELECT COUNT(*) INTO tier4_converted FROM call_analysis_v2 WHERE tier4_data ? 'values';
    SELECT COUNT(*) INTO tier5_converted FROM call_analysis_v2 WHERE tier5_data ? 'values';

    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'Array Uniformity Migration Summary:';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'Total rows: %', total_rows;
    RAISE NOTICE 'Tier 1 converted: % (%.1f%%)', tier1_converted, (tier1_converted::FLOAT / NULLIF(total_rows, 0) * 100);
    RAISE NOTICE 'Tier 4 converted: % (%.1f%%)', tier4_converted, (tier4_converted::FLOAT / NULLIF(total_rows, 0) * 100);
    RAISE NOTICE 'Tier 5 converted: % (%.1f%%)', tier5_converted, (tier5_converted::FLOAT / NULLIF(total_rows, 0) * 100);
    RAISE NOTICE '';
    RAISE NOTICE 'Backwards-compatible columns created:';
    RAISE NOTICE '  - tier1_value_compat';
    RAISE NOTICE '  - tier4_value_compat';
    RAISE NOTICE '  - tier5_value_compat';
    RAISE NOTICE '';
    RAISE NOTICE 'All views updated to use array format';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    IF tier1_converted != total_rows OR tier4_converted != total_rows OR tier5_converted != total_rows THEN
        RAISE WARNING 'Some rows were not converted - check data manually';
    END IF;
END $$;

COMMIT;

-- =====================================================================
-- Post-migration testing queries
-- =====================================================================

-- Test 1: Verify array structure
SELECT
    ringba_row_id,
    tier1_data->'values' AS tier1_values,
    tier4_data->'values' AS tier4_values,
    tier5_data->'values' AS tier5_values
FROM call_analysis_v2
LIMIT 5;

-- Test 2: Verify backwards compatibility
SELECT
    ringba_row_id,
    tier1_value_compat,
    tier4_value_compat,
    tier5_value_compat
FROM call_analysis_v2
LIMIT 5;

-- Test 3: Check for any unconverted rows
SELECT
    COUNT(*) AS unconverted_tier1
FROM call_analysis_v2
WHERE tier1_data ? 'value' AND NOT (tier1_data ? 'values');

-- Test 4: Verify GIN index usage
EXPLAIN ANALYZE
SELECT ringba_row_id
FROM call_analysis_v2
WHERE tier1_data->'values' @> '["SOFT_LEAD_INTERESTED"]'::jsonb;
