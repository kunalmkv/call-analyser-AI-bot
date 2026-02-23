/**
 * Tier-uniformity and redundancy-reduction migration.
 *
 * Goals:
 *  1. All 10 tiers now have a tierN_data JSONB column as the single source of truth.
 *     - Single-value tiers (1, 4, 5): {"value": "...", "reason": "..."}
 *     - Array tiers (2, 3, 6–10): {"values": [...], "reasons": {...}}  (already existed)
 *  2. tierN_reason columns for single-value tiers are DROPPED (moved into tierN_data).
 *  3. tierN_value and tierN_reason shortcut columns for array tiers are DROPPED.
 *     They are replaced by GENERATED ALWAYS AS computed columns derived from tierN_data,
 *     so searchByTier() and analytics queries continue to work unchanged.
 *  4. v_billing_discrepancies view is updated (tier5_reason → tier5_data->>'reason').
 */

import 'dotenv/config';
import pg from 'pg';
import { getDbConfig } from '../src/config/index.js';

const { Pool } = pg;

const run = async (client, sql, label) => {
    await client.query(sql);
    console.log(`  ✓ ${label}`);
};

const colExists = async (client, table, column) => {
    const r = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        [table, column]
    );
    return r.rows.length > 0;
};

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║         Tier Uniformity & Redundancy Migration           ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        // ═══════════════════════════════════════════════════════════════
        // SECTION A: Add tierN_data for single-value tiers (1, 4, 5)
        // ═══════════════════════════════════════════════════════════════
        console.log('── SECTION A: Add tier1_data / tier4_data / tier5_data ────');

        for (const [tier, defaultVal] of [
            [1, '{"value":"UNKNOWN","reason":null}'],
            [4, '{"value":null,"reason":null}'],
            [5, '{"value":null,"reason":null}'],
        ]) {
            const col = `tier${tier}_data`;
            if (!(await colExists(client, 'call_analysis_v2', col))) {
                await run(client,
                    `ALTER TABLE call_analysis_v2 ADD COLUMN ${col} JSONB DEFAULT '${defaultVal}'`,
                    `Added ${col}`
                );

                // Backfill from existing value + reason columns
                const valueCol  = `tier${tier}_value`;
                const reasonCol = `tier${tier}_reason`;
                const hasReason = await colExists(client, 'call_analysis_v2', reasonCol);
                if (hasReason) {
                    const upd = await client.query(
                        `UPDATE call_analysis_v2
                         SET ${col} = json_build_object(
                             'value', ${valueCol},
                             'reason', ${reasonCol}
                         )`
                    );
                    console.log(`  ✓ Backfilled ${col} from ${valueCol}/${reasonCol} (${upd.rowCount} rows)`);
                } else {
                    const upd = await client.query(
                        `UPDATE call_analysis_v2
                         SET ${col} = json_build_object('value', ${valueCol}, 'reason', null)`
                    );
                    console.log(`  ✓ Backfilled ${col} from ${valueCol} (${upd.rowCount} rows)`);
                }
            } else {
                console.log(`  ~ ${col} already exists`);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION B: Drop tierN_reason for single-value tiers (moved into _data)
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION B: Drop _reason columns for single-value tiers ──');

        for (const tier of [1, 4, 5]) {
            const col = `tier${tier}_reason`;
            if (await colExists(client, 'call_analysis_v2', col)) {
                // Views may reference tier5_reason — drop views first
                if (tier === 5) {
                    await client.query(`DROP VIEW IF EXISTS v_billing_discrepancies`);
                }
                await run(client,
                    `ALTER TABLE call_analysis_v2 DROP COLUMN ${col}`,
                    `Dropped ${col} (now in tier${tier}_data->>'reason')`
                );
            } else {
                console.log(`  ~ tier${tier}_reason already dropped`);
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION C: Array tiers — replace regular value/reason with GENERATED value
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION C: Array tier shortcut columns → GENERATED ──────');

        // tier2_data->'values'->>0 extracts first element; use #>> path operator for safety
        const ARRAY_TIERS = [2, 3, 6, 7, 8, 9, 10];

        for (const tier of ARRAY_TIERS) {
            const dataCol  = `tier${tier}_data`;
            const valueCol = `tier${tier}_value`;
            const reasonCol = `tier${tier}_reason`;

            // Drop regular reason column first (no dependencies)
            if (await colExists(client, 'call_analysis_v2', reasonCol)) {
                await run(client,
                    `ALTER TABLE call_analysis_v2 DROP COLUMN ${reasonCol}`,
                    `Dropped ${reasonCol}`
                );
            } else {
                console.log(`  ~ ${reasonCol} already dropped`);
            }

            // Check if valueCol is GENERATED or regular
            const genCheck = await client.query(
                `SELECT is_generated FROM information_schema.columns
                 WHERE table_name = 'call_analysis_v2' AND column_name = $1`,
                [valueCol]
            );
            const isGenerated = genCheck.rows[0]?.is_generated === 'ALWAYS';

            if (!isGenerated) {
                // Drop regular value column
                if (await colExists(client, 'call_analysis_v2', valueCol)) {
                    // Drop any dependent index first
                    await client.query(`DROP INDEX IF EXISTS idx_v2_tier${tier}`);
                    await run(client,
                        `ALTER TABLE call_analysis_v2 DROP COLUMN ${valueCol}`,
                        `Dropped regular ${valueCol}`
                    );
                }
                // Add GENERATED column derived from the JSONB array
                await run(client,
                    `ALTER TABLE call_analysis_v2
                     ADD COLUMN ${valueCol} VARCHAR(50)
                     GENERATED ALWAYS AS (${dataCol} #>> '{values,0}') STORED`,
                    `Added GENERATED ${valueCol} ← ${dataCol}->values[0]`
                );
            } else {
                console.log(`  ~ ${valueCol} is already GENERATED`);
            }

            // Ensure index on generated column for searchByTier performance
            await run(client,
                `CREATE INDEX IF NOT EXISTS idx_v2_tier${tier} ON call_analysis_v2(${valueCol})`,
                `Index idx_v2_tier${tier} on generated ${valueCol}`
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION D: Rebuild v_billing_discrepancies (tier5_reason → _data)
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION D: Rebuild views ────────────────────────────────');

        await run(client,
            `CREATE OR REPLACE VIEW v_billing_discrepancies AS
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
                OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true AND current_revenue > 0)`,
            'v_billing_discrepancies: tier5_reason → tier5_data->>reason'
        );

        // Rebuild the other two views for completeness (no structural change)
        await run(client,
            `CREATE OR REPLACE VIEW v_call_analysis_summary AS
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
             FROM call_analysis_v2`,
            'v_call_analysis_summary: refreshed'
        );

        await run(client,
            `CREATE OR REPLACE VIEW v_dispute_candidates AS
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
                OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true)`,
            'v_dispute_candidates: refreshed'
        );

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║   Migration complete — tier uniformity applied           ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('\nResult:');
        console.log('  • ALL 10 tiers now have tierN_data JSONB column');
        console.log('  • Single-value tiers 1/4/5: {"value":"…","reason":"…"}');
        console.log('  • Array tiers 2/3/6–10:     {"values":[…],"reasons":{…}}');
        console.log('  • Array tierN_value = GENERATED from tierN_data (auto-sync)');
        console.log('  • tierN_reason columns removed (data lives in tierN_data)');

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
