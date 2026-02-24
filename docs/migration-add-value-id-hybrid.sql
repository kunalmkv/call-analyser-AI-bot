/**
 * Migration: Add value_id alongside value (Hybrid Approach)
 * Phase 1: Non-breaking change - adds value_id fields without removing value fields
 *
 * Benefits:
 * - No breaking changes
 * - Allows gradual migration
 * - Enables data validation (value matches value_id)
 * - Can rollback easily
 *
 * Run: psql $DATABASE_URL -f docs/migration-add-value-id-hybrid.sql
 */

BEGIN;

-- =====================================================================
-- SECTION 1: Add value_id fields to single-value tiers
-- =====================================================================
-- Tier 1: Primary outcome
ALTER TABLE call_analysis_v2
    ADD COLUMN IF NOT EXISTS tier1_value_id INTEGER;

-- Tier 4: Appliance type
ALTER TABLE call_analysis_v2
    ADD COLUMN IF NOT EXISTS tier4_value_id INTEGER;

-- Tier 5: Billing indicator
ALTER TABLE call_analysis_v2
    ADD COLUMN IF NOT EXISTS tier5_value_id INTEGER;

COMMENT ON COLUMN call_analysis_v2.tier1_value_id IS 'Foreign key to tag_definitions.id (hybrid period - stores alongside tier1_data->value)';
COMMENT ON COLUMN call_analysis_v2.tier4_value_id IS 'Foreign key to tag_definitions.id (hybrid period - stores alongside tier4_data->value)';
COMMENT ON COLUMN call_analysis_v2.tier5_value_id IS 'Foreign key to tag_definitions.id (hybrid period - stores alongside tier5_data->value)';

-- =====================================================================
-- SECTION 2: Create helper function to look up tag_id by tag_value
-- =====================================================================
CREATE OR REPLACE FUNCTION get_tag_id_by_value(p_tag_value TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_tag_id INTEGER;
BEGIN
    SELECT id INTO v_tag_id
    FROM tag_definitions
    WHERE tag_value = p_tag_value
    LIMIT 1;

    RETURN v_tag_id;
END;
$$;

COMMENT ON FUNCTION get_tag_id_by_value IS 'Helper function to resolve tag_value → tag_id during migration';

-- =====================================================================
-- SECTION 3: Backfill value_id from existing value fields
-- =====================================================================

-- Tier 1 backfill
UPDATE call_analysis_v2
SET tier1_value_id = get_tag_id_by_value(tier1_data->>'value')
WHERE tier1_data->>'value' IS NOT NULL
  AND tier1_value_id IS NULL;

-- Tier 4 backfill
UPDATE call_analysis_v2
SET tier4_value_id = get_tag_id_by_value(tier4_data->>'value')
WHERE tier4_data->>'value' IS NOT NULL
  AND tier4_value_id IS NULL;

-- Tier 5 backfill
UPDATE call_analysis_v2
SET tier5_value_id = get_tag_id_by_value(tier5_data->>'value')
WHERE tier5_data->>'value' IS NOT NULL
  AND tier5_value_id IS NULL;

-- =====================================================================
-- SECTION 4: Add indexes for value_id lookups
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_v2_tier1_value_id ON call_analysis_v2(tier1_value_id);
CREATE INDEX IF NOT EXISTS idx_v2_tier4_value_id ON call_analysis_v2(tier4_value_id);
CREATE INDEX IF NOT EXISTS idx_v2_tier5_value_id ON call_analysis_v2(tier5_value_id);

-- =====================================================================
-- SECTION 5: Create validation view to check data consistency
-- =====================================================================
CREATE OR REPLACE VIEW v_tier_value_id_consistency AS
SELECT
    ringba_row_id,
    -- Tier 1 validation
    tier1_data->>'value' AS tier1_value,
    tier1_value_id,
    td1.tag_value AS tier1_tag_value,
    (tier1_data->>'value' = td1.tag_value) AS tier1_consistent,
    -- Tier 4 validation
    tier4_data->>'value' AS tier4_value,
    tier4_value_id,
    td4.tag_value AS tier4_tag_value,
    (tier4_data->>'value' = td4.tag_value) AS tier4_consistent,
    -- Tier 5 validation
    tier5_data->>'value' AS tier5_value,
    tier5_value_id,
    td5.tag_value AS tier5_tag_value,
    (tier5_data->>'value' = td5.tag_value) AS tier5_consistent
FROM call_analysis_v2
LEFT JOIN tag_definitions td1 ON tier1_value_id = td1.id
LEFT JOIN tag_definitions td4 ON tier4_value_id = td4.id
LEFT JOIN tag_definitions td5 ON tier5_value_id = td5.id
WHERE
    -- Show only inconsistent rows
    (tier1_data->>'value' IS NOT NULL AND tier1_data->>'value' != td1.tag_value)
    OR (tier4_data->>'value' IS NOT NULL AND tier4_data->>'value' != td4.tag_value)
    OR (tier5_data->>'value' IS NOT NULL AND tier5_data->>'value' != td5.tag_value);

COMMENT ON VIEW v_tier_value_id_consistency IS 'Validation view to detect mismatches between value and value_id during hybrid period';

-- =====================================================================
-- SECTION 6: Create trigger to keep value and value_id in sync
-- =====================================================================
CREATE OR REPLACE FUNCTION sync_tier_value_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Sync tier1
    IF NEW.tier1_data IS DISTINCT FROM OLD.tier1_data THEN
        NEW.tier1_value_id := get_tag_id_by_value(NEW.tier1_data->>'value');
    END IF;

    -- Sync tier4
    IF NEW.tier4_data IS DISTINCT FROM OLD.tier4_data THEN
        NEW.tier4_value_id := get_tag_id_by_value(NEW.tier4_data->>'value');
    END IF;

    -- Sync tier5
    IF NEW.tier5_data IS DISTINCT FROM OLD.tier5_data THEN
        NEW.tier5_value_id := get_tag_id_by_value(NEW.tier5_data->>'value');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tier_value_id ON call_analysis_v2;

CREATE TRIGGER trg_sync_tier_value_id
    BEFORE INSERT OR UPDATE ON call_analysis_v2
    FOR EACH ROW
    EXECUTE FUNCTION sync_tier_value_id();

COMMENT ON TRIGGER trg_sync_tier_value_id ON call_analysis_v2 IS 'Auto-sync value_id when tier_data changes during hybrid period';

-- =====================================================================
-- SECTION 7: Create backwards-compatible views (for gradual migration)
-- =====================================================================

-- View that joins with tag_definitions to show human-readable values
CREATE OR REPLACE VIEW v_call_analysis_v2_with_tags AS
SELECT
    v2.*,
    td1.tag_name AS tier1_tag_name,
    td1.tag_value AS tier1_tag_value,
    td1.priority AS tier1_priority,
    td4.tag_name AS tier4_tag_name,
    td4.tag_value AS tier4_tag_value,
    td5.tag_name AS tier5_tag_name,
    td5.tag_value AS tier5_tag_value
FROM call_analysis_v2 v2
LEFT JOIN tag_definitions td1 ON v2.tier1_value_id = td1.id
LEFT JOIN tag_definitions td4 ON v2.tier4_value_id = td4.id
LEFT JOIN tag_definitions td5 ON v2.tier5_value_id = td5.id;

COMMENT ON VIEW v_call_analysis_v2_with_tags IS 'Convenience view that JOINs with tag_definitions for human-readable output';

-- =====================================================================
-- SECTION 8: Verification queries
-- =====================================================================

-- Check backfill coverage
DO $$
DECLARE
    tier1_backfilled INTEGER;
    tier4_backfilled INTEGER;
    tier5_backfilled INTEGER;
    total_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_rows FROM call_analysis_v2;
    SELECT COUNT(*) INTO tier1_backfilled FROM call_analysis_v2 WHERE tier1_value_id IS NOT NULL;
    SELECT COUNT(*) INTO tier4_backfilled FROM call_analysis_v2 WHERE tier4_value_id IS NOT NULL;
    SELECT COUNT(*) INTO tier5_backfilled FROM call_analysis_v2 WHERE tier5_value_id IS NOT NULL;

    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'Migration Summary:';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'Total rows in call_analysis_v2: %', total_rows;
    RAISE NOTICE 'Tier 1 backfilled: % (%.1f%%)', tier1_backfilled, (tier1_backfilled::FLOAT / NULLIF(total_rows, 0) * 100);
    RAISE NOTICE 'Tier 4 backfilled: % (%.1f%%)', tier4_backfilled, (tier4_backfilled::FLOAT / NULLIF(total_rows, 0) * 100);
    RAISE NOTICE 'Tier 5 backfilled: % (%.1f%%)', tier5_backfilled, (tier5_backfilled::FLOAT / NULLIF(total_rows, 0) * 100);
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- Check for inconsistencies
SELECT
    COUNT(*) AS inconsistent_rows,
    COUNT(*) FILTER (WHERE NOT tier1_consistent) AS tier1_inconsistent,
    COUNT(*) FILTER (WHERE NOT tier4_consistent) AS tier4_inconsistent,
    COUNT(*) FILTER (WHERE NOT tier5_consistent) AS tier5_inconsistent
FROM v_tier_value_id_consistency;

COMMIT;

-- =====================================================================
-- Post-migration verification
-- =====================================================================
-- Run these queries AFTER migration to verify:

-- 1. Check for orphan tag_values (values not in tag_definitions)
SELECT DISTINCT
    'tier1' AS tier,
    tier1_data->>'value' AS orphan_value
FROM call_analysis_v2
WHERE tier1_data->>'value' IS NOT NULL
  AND tier1_value_id IS NULL

UNION ALL

SELECT DISTINCT
    'tier4' AS tier,
    tier4_data->>'value' AS orphan_value
FROM call_analysis_v2
WHERE tier4_data->>'value' IS NOT NULL
  AND tier4_value_id IS NULL

UNION ALL

SELECT DISTINCT
    'tier5' AS tier,
    tier5_data->>'value' AS orphan_value
FROM call_analysis_v2
WHERE tier5_data->>'value' IS NOT NULL
  AND tier5_value_id IS NULL;

-- 2. Verify indexes were created
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'call_analysis_v2'
  AND indexname LIKE '%value_id%'
ORDER BY indexname;
