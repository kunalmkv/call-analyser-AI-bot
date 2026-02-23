/**
 * Recreates call_analysis_v2 with perfectly ordered columns.
 *
 * Target column order (logical groups):
 *   1. Identity:   ringba_row_id, ringba_caller_id, call_timestamp
 *   2. Per-tier:   tierN_data then tierN_value (generated), grouped by tier number
 *      Single-value tiers (1,4,5): tierN_value first (indexed), then tierN_data
 *      Array tiers (2,3,6–10):     tierN_data first, then tierN_value (GENERATED)
 *   3. Assessment: confidence_score … call_summary … extracted_customer_info
 *   4. Flags:      system_duplicate, current_revenue, current_billed_status
 *   5. Processing: processing_time_ms, model_used, processed_at
 *
 * Steps:
 *   A. Drop FK from call_analysis_v2_raw (re-added after rename)
 *   B. Create call_analysis_v2_new with correct layout
 *   C. Copy all non-GENERATED columns from old table
 *   D. Drop old table (CASCADE clears remaining constraints)
 *   E. Rename new table → call_analysis_v2
 *   F. Recreate FK to ringba_call_data, all indexes, views, call_analysis_v2_raw FK
 */

import 'dotenv/config';
import pg from 'pg';
import { getDbConfig } from '../src/config/index.js';

const { Pool } = pg;

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║      Reorder call_analysis_v2 Columns (table rebuild)    ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        // ── A. Drop call_analysis_v2_raw FK so we can drop the parent table ──
        await client.query(`
            ALTER TABLE IF EXISTS call_analysis_v2_raw
              DROP CONSTRAINT IF EXISTS call_analysis_v2_raw_ringba_row_id_fkey
        `);
        console.log('✓ Dropped FK from call_analysis_v2_raw');

        // ── B. Drop views that reference the table ──────────────────────────
        await client.query(`DROP VIEW IF EXISTS v_call_analysis_summary`);
        await client.query(`DROP VIEW IF EXISTS v_dispute_candidates`);
        await client.query(`DROP VIEW IF EXISTS v_billing_discrepancies`);
        console.log('✓ Dropped dependent views');

        // ── C. Create call_analysis_v2_new with correct column order ─────────
        await client.query(`
            CREATE TABLE call_analysis_v2_new (
                -- ── Identity ──────────────────────────────────────────────────
                ringba_row_id    INTEGER NOT NULL,
                ringba_caller_id VARCHAR(200),
                call_timestamp   TIMESTAMPTZ,

                -- ── Tier 1: single value ──────────────────────────────────────
                -- tier1_value: regular indexed column (CHECK constraint, fast filter)
                -- tier1_data:  {"value":"…","reason":"…"}
                tier1_value VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
                tier1_data  JSONB       NOT NULL DEFAULT '{"value":"UNKNOWN","reason":null}',

                -- ── Tier 2: array ─────────────────────────────────────────────
                -- tier2_data:  {"values":[…],"reasons":{…}}
                -- tier2_value: GENERATED — first element of values array
                tier2_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier2_value VARCHAR(50) GENERATED ALWAYS AS (tier2_data #>> '{values,0}') STORED,

                -- ── Tier 3: array ─────────────────────────────────────────────
                tier3_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier3_value VARCHAR(50) GENERATED ALWAYS AS (tier3_data #>> '{values,0}') STORED,

                -- ── Tier 4: single value ──────────────────────────────────────
                tier4_value VARCHAR(50),
                tier4_data  JSONB NOT NULL DEFAULT '{"value":null,"reason":null}',

                -- ── Tier 5: single value ──────────────────────────────────────
                tier5_value VARCHAR(50),
                tier5_data  JSONB NOT NULL DEFAULT '{"value":null,"reason":null}',

                -- ── Tier 6: array ─────────────────────────────────────────────
                tier6_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier6_value VARCHAR(50) GENERATED ALWAYS AS (tier6_data #>> '{values,0}') STORED,

                -- ── Tier 7: array ─────────────────────────────────────────────
                tier7_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier7_value VARCHAR(50) GENERATED ALWAYS AS (tier7_data #>> '{values,0}') STORED,

                -- ── Tier 8: array ─────────────────────────────────────────────
                tier8_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier8_value VARCHAR(50) GENERATED ALWAYS AS (tier8_data #>> '{values,0}') STORED,

                -- ── Tier 9: array ─────────────────────────────────────────────
                tier9_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier9_value VARCHAR(50) GENERATED ALWAYS AS (tier9_data #>> '{values,0}') STORED,

                -- ── Tier 10: array ────────────────────────────────────────────
                tier10_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier10_value VARCHAR(50) GENERATED ALWAYS AS (tier10_data #>> '{values,0}') STORED,

                -- ── Overall assessment ────────────────────────────────────────
                confidence_score             DECIMAL(3,2),
                dispute_recommendation       VARCHAR(20) NOT NULL DEFAULT 'NONE',
                dispute_recommendation_reason TEXT,
                call_summary                 TEXT        NOT NULL DEFAULT '',
                extracted_customer_info      JSONB       NOT NULL DEFAULT '{}',

                -- ── Flags ─────────────────────────────────────────────────────
                system_duplicate      BOOLEAN     NOT NULL DEFAULT FALSE,
                current_revenue       DECIMAL(10,2),
                current_billed_status BOOLEAN     NOT NULL DEFAULT FALSE,

                -- ── Processing metadata ───────────────────────────────────────
                processing_time_ms INTEGER,
                model_used         VARCHAR(100),
                processed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                -- ── Constraints ───────────────────────────────────────────────
                PRIMARY KEY (ringba_row_id),

                CONSTRAINT chk_dispute_recommendation
                    CHECK (dispute_recommendation IN ('NONE','REVIEW','STRONG')),

                CONSTRAINT chk_tier1_value
                    CHECK (tier1_value IN (
                        'QUALIFIED_APPOINTMENT_SET','SOFT_LEAD_INTERESTED',
                        'INFORMATION_ONLY_CALL','BUYER_EARLY_HANGUP',
                        'USER_EARLY_HANGUP','NO_BUYER_INTEREST','UNKNOWN'
                    )),

                CONSTRAINT chk_tier5_value
                    CHECK (tier5_value IS NULL OR tier5_value IN (
                        'LIKELY_BILLABLE','QUESTIONABLE_BILLING','DEFINITELY_NOT_BILLABLE'
                    )),

                CONSTRAINT chk_confidence_score
                    CHECK (confidence_score IS NULL
                        OR (confidence_score >= 0 AND confidence_score <= 1))
            )
        `);
        console.log('✓ Created call_analysis_v2_new with correct column order');

        // ── D. Copy data (exclude GENERATED columns — they are auto-computed) ──
        const copied = await client.query(`
            INSERT INTO call_analysis_v2_new (
                ringba_row_id, ringba_caller_id, call_timestamp,
                tier1_value, tier1_data,
                tier2_data,
                tier3_data,
                tier4_value, tier4_data,
                tier5_value, tier5_data,
                tier6_data,
                tier7_data,
                tier8_data,
                tier9_data,
                tier10_data,
                confidence_score, dispute_recommendation, dispute_recommendation_reason,
                call_summary, extracted_customer_info,
                system_duplicate, current_revenue, current_billed_status,
                processing_time_ms, model_used, processed_at
            )
            SELECT
                ringba_row_id,
                ringba_caller_id,
                call_timestamp,
                tier1_value,
                COALESCE(tier1_data,  '{"value":"UNKNOWN","reason":null}'::jsonb),
                COALESCE(tier2_data,  '{"values":[],"reasons":{}}'::jsonb),
                COALESCE(tier3_data,  '{"values":[],"reasons":{}}'::jsonb),
                tier4_value,
                COALESCE(tier4_data,  '{"value":null,"reason":null}'::jsonb),
                tier5_value,
                COALESCE(tier5_data,  '{"value":null,"reason":null}'::jsonb),
                COALESCE(tier6_data,  '{"values":[],"reasons":{}}'::jsonb),
                COALESCE(tier7_data,  '{"values":[],"reasons":{}}'::jsonb),
                COALESCE(tier8_data,  '{"values":[],"reasons":{}}'::jsonb),
                COALESCE(tier9_data,  '{"values":[],"reasons":{}}'::jsonb),
                COALESCE(tier10_data, '{"values":[],"reasons":{}}'::jsonb),
                confidence_score,
                COALESCE(dispute_recommendation, 'NONE'),
                dispute_recommendation_reason,
                COALESCE(call_summary, ''),
                COALESCE(extracted_customer_info, '{}'::jsonb),
                COALESCE(system_duplicate, FALSE),
                current_revenue,
                COALESCE(current_billed_status, FALSE),
                processing_time_ms,
                model_used,
                COALESCE(processed_at, NOW())
            FROM call_analysis_v2
        `);
        console.log(`✓ Copied ${copied.rowCount} rows → call_analysis_v2_new`);

        // ── E. Drop old table (CASCADE drops fk_v2_ringba_row + any remaining FKs) ──
        await client.query(`DROP TABLE call_analysis_v2 CASCADE`);
        console.log('✓ Dropped old call_analysis_v2 (CASCADE)');

        // ── F. Rename new table ───────────────────────────────────────────────
        await client.query(`ALTER TABLE call_analysis_v2_new RENAME TO call_analysis_v2`);
        console.log('✓ Renamed call_analysis_v2_new → call_analysis_v2');

        // ── G. FK to ringba_call_data ─────────────────────────────────────────
        await client.query(`
            ALTER TABLE call_analysis_v2
              ADD CONSTRAINT fk_v2_ringba_row
              FOREIGN KEY (ringba_row_id)
              REFERENCES ringba_call_data(id) ON DELETE CASCADE
        `);
        console.log('✓ Re-added FK → ringba_call_data');

        // ── H. Recreate all indexes ───────────────────────────────────────────
        const indexes = [
            [`CREATE INDEX idx_v2_tier1      ON call_analysis_v2(tier1_value)`,                            'idx_v2_tier1'],
            [`CREATE INDEX idx_v2_tier2      ON call_analysis_v2(tier2_value)`,                            'idx_v2_tier2'],
            [`CREATE INDEX idx_v2_tier3      ON call_analysis_v2(tier3_value)`,                            'idx_v2_tier3'],
            [`CREATE INDEX idx_v2_tier4      ON call_analysis_v2(tier4_value)`,                            'idx_v2_tier4'],
            [`CREATE INDEX idx_v2_tier5      ON call_analysis_v2(tier5_value)`,                            'idx_v2_tier5'],
            [`CREATE INDEX idx_v2_tier6      ON call_analysis_v2(tier6_value)`,                            'idx_v2_tier6'],
            [`CREATE INDEX idx_v2_tier7      ON call_analysis_v2(tier7_value)`,                            'idx_v2_tier7'],
            [`CREATE INDEX idx_v2_tier8      ON call_analysis_v2(tier8_value)`,                            'idx_v2_tier8'],
            [`CREATE INDEX idx_v2_tier9      ON call_analysis_v2(tier9_value)`,                            'idx_v2_tier9'],
            [`CREATE INDEX idx_v2_tier10     ON call_analysis_v2(tier10_value)`,                           'idx_v2_tier10'],
            [`CREATE INDEX idx_v2_dispute    ON call_analysis_v2(dispute_recommendation)`,                 'idx_v2_dispute'],
            [`CREATE INDEX idx_v2_call_timestamp ON call_analysis_v2(call_timestamp)`,                    'idx_v2_call_timestamp'],
            [`CREATE INDEX idx_v2_processed_at   ON call_analysis_v2(processed_at DESC)`,                 'idx_v2_processed_at'],
            [`CREATE INDEX idx_v2_tier1_tier5    ON call_analysis_v2(tier1_value, tier5_value)`,          'idx_v2_tier1_tier5'],
            [`CREATE INDEX idx_v2_confidence     ON call_analysis_v2(confidence_score DESC)`,             'idx_v2_confidence'],
            [`CREATE INDEX idx_v2_tier2_gin  ON call_analysis_v2 USING GIN(tier2_data)`,                  'idx_v2_tier2_gin'],
            [`CREATE INDEX idx_v2_tier3_gin  ON call_analysis_v2 USING GIN(tier3_data)`,                  'idx_v2_tier3_gin'],
            [`CREATE INDEX idx_v2_tier5_billed_not_billable ON call_analysis_v2(tier5_value, current_billed_status) WHERE tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true`, 'idx_v2_tier5_billed_not_billable'],
            [`CREATE INDEX idx_v2_summary_fts ON call_analysis_v2 USING GIN(to_tsvector('english', COALESCE(call_summary,'')))`, 'idx_v2_summary_fts'],
        ];

        for (const [sql, name] of indexes) {
            await client.query(sql);
            console.log(`  ✓ ${name}`);
        }

        // ── I. Recreate call_analysis_v2_raw table (or re-add FK if table exists) ──
        const rawExists = await client.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name = 'call_analysis_v2_raw'`
        );
        if (rawExists.rows.length > 0) {
            await client.query(`
                ALTER TABLE call_analysis_v2_raw
                  ADD CONSTRAINT call_analysis_v2_raw_ringba_row_id_fkey
                  FOREIGN KEY (ringba_row_id)
                  REFERENCES call_analysis_v2(ringba_row_id) ON DELETE CASCADE
            `);
            console.log('✓ Re-added FK from call_analysis_v2_raw → call_analysis_v2');
        } else {
            await client.query(`
                CREATE TABLE call_analysis_v2_raw (
                    ringba_row_id INTEGER PRIMARY KEY
                        REFERENCES call_analysis_v2(ringba_row_id) ON DELETE CASCADE,
                    raw_ai_response JSONB NOT NULL,
                    stored_at       TIMESTAMPTZ DEFAULT NOW()
                )
            `);
            console.log('✓ Recreated call_analysis_v2_raw table');
        }

        // ── J. Recreate views ─────────────────────────────────────────────────
        await client.query(`
            CREATE OR REPLACE VIEW v_call_analysis_summary AS
            SELECT
              ringba_row_id,
              ringba_caller_id,
              tier1_value  AS outcome,
              tier4_value  AS appliance_type,
              tier5_value  AS billing_status,
              dispute_recommendation,
              confidence_score,
              call_summary,
              current_revenue,
              current_billed_status,
              model_used,
              processing_time_ms,
              processed_at
            FROM call_analysis_v2
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_dispute_candidates AS
            SELECT
              ringba_row_id,
              ringba_caller_id,
              tier1_value,
              tier5_value,
              dispute_recommendation,
              dispute_recommendation_reason,
              call_summary,
              current_revenue,
              current_billed_status,
              confidence_score,
              processed_at
            FROM call_analysis_v2
            WHERE dispute_recommendation IN ('REVIEW', 'STRONG')
               OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true)
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_billing_discrepancies AS
            SELECT
              ringba_row_id,
              ringba_caller_id,
              tier5_value,
              current_revenue,
              current_billed_status,
              call_summary,
              tier5_data->>'reason' AS tier5_reason,
              processed_at
            FROM call_analysis_v2
            WHERE (tier5_value = 'LIKELY_BILLABLE' AND current_billed_status = false AND current_revenue = 0)
               OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true AND current_revenue > 0)
        `);
        console.log('✓ Recreated all 3 views');

        // ── K. Verify final column order ──────────────────────────────────────
        const cols = await client.query(`
            SELECT column_name, data_type, is_generated, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'call_analysis_v2'
            ORDER BY ordinal_position
        `);
        console.log('\n── Final column order ──────────────────────────────────────');
        cols.rows.forEach((c, i) => {
            const gen = c.is_generated === 'ALWAYS' ? ' [GENERATED]' : '';
            console.log(`  ${String(i + 1).padStart(2)}. ${c.column_name}${gen}`);
        });

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║   Column reorder complete — call_analysis_v2 is clean   ║');
        console.log('╚══════════════════════════════════════════════════════════╝');

    } catch (err) {
        console.error('\n✗ Migration failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
