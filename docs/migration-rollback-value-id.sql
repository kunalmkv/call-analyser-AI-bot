/**
 * Rollback script for value_id hybrid migration
 *
 * Use this if you need to revert the migration-add-value-id-hybrid.sql changes
 * Safe to run - only drops added columns, doesn't touch existing data
 *
 * Run: psql $DATABASE_URL -f docs/migration-rollback-value-id.sql
 */

BEGIN;

RAISE NOTICE 'Starting rollback of value_id hybrid migration...';

-- Drop trigger and function
DROP TRIGGER IF EXISTS trg_sync_tier_value_id ON call_analysis_v2;
DROP FUNCTION IF EXISTS sync_tier_value_id();
RAISE NOTICE '✓ Dropped trigger and sync function';

-- Drop views
DROP VIEW IF EXISTS v_call_analysis_v2_with_tags;
DROP VIEW IF EXISTS v_tier_value_id_consistency;
RAISE NOTICE '✓ Dropped validation and convenience views';

-- Drop indexes
DROP INDEX IF EXISTS idx_v2_tier1_value_id;
DROP INDEX IF EXISTS idx_v2_tier4_value_id;
DROP INDEX IF EXISTS idx_v2_tier5_value_id;
RAISE NOTICE '✓ Dropped value_id indexes';

-- Drop value_id columns
ALTER TABLE call_analysis_v2
    DROP COLUMN IF EXISTS tier1_value_id,
    DROP COLUMN IF EXISTS tier4_value_id,
    DROP COLUMN IF EXISTS tier5_value_id;
RAISE NOTICE '✓ Dropped value_id columns';

-- Drop helper function
DROP FUNCTION IF EXISTS get_tag_id_by_value(TEXT);
RAISE NOTICE '✓ Dropped helper function';

RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
RAISE NOTICE 'Rollback complete - table restored to pre-migration state';
RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

COMMIT;
