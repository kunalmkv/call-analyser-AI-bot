/**
 * COMPREHENSIVE MIGRATION: Tag IDs + Array Uniformity
 *
 * This migration implements BOTH optimizations:
 * 1. Store tag_id (integer) instead of tag_value (string)
 * 2. Use uniform array structure for ALL tiers
 *
 * BEFORE:
 * - Tier 1:  {"value": "SOFT_LEAD_INTERESTED", "reason": "..."}
 * - Tier 2:  {"values": ["TAG1", "TAG2"], "reasons": {"TAG1": "...", "TAG2": "..."}}
 *
 * AFTER:
 * - Tier 1:  {"value_ids": [42], "reasons": {"42": "..."}}
 * - Tier 2:  {"value_ids": [23, 45], "reasons": {"23": "...", "45": "..."}}
 *
 * Run: node scripts/migrate-to-tag-ids-and-array-uniformity.js
 *
 * CAUTION: This is a BREAKING CHANGE. Ensure you have:
 * 1. Full database backup
 * 2. Updated application code deployed alongside this migration
 * 3. Tested on staging environment first
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../.env` });

const { Pool } = pg;

function getDbConfig() {
    const env = process.env;
    const getEnv = (k1, k2, def) => env[k1] || env[k2] || def;
    return {
        host: getEnv('DB_HOST', 'POSTGRES_HOST'),
        port: parseInt(getEnv('DB_PORT', 'POSTGRES_PORT') || '5432', 10),
        database: getEnv('DB_NAME', 'POSTGRES_DB_NAME'),
        user: getEnv('DB_USER', 'POSTGRES_USER_NAME'),
        password: getEnv('DB_PASSWORD', 'POSTGRES_PASSWORD'),
        ssl: (getEnv('DB_SSL', 'POSTGRES_SSL') === 'true') ? { rejectUnauthorized: false } : false
    };
}

const run = async (client, sql, label) => {
    await client.query(sql);
    console.log(`  ✓ ${label}`);
};

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║   TAG ID + ARRAY UNIFORMITY MIGRATION                     ║');
        console.log('║   Breaking Change - Ensure code is updated!               ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        // ═══════════════════════════════════════════════════════════════
        // SECTION 0: Pre-flight Checks
        // ═══════════════════════════════════════════════════════════════
        console.log('── SECTION 0: Pre-flight Checks ────────────────────────────');

        // Check tag_definitions has required data
        const tagCount = await client.query(
            `SELECT COUNT(*) as count FROM tag_definitions WHERE tag_value IS NOT NULL`
        );
        const numTags = parseInt(tagCount.rows[0].count, 10);
        console.log(`  ✓ Found ${numTags} tag definitions with tag_value`);

        if (numTags === 0) {
            throw new Error('tag_definitions table is empty or missing tag_value! Cannot proceed.');
        }

        // Check current row count
        const rowCount = await client.query(`SELECT COUNT(*) as count FROM call_analysis_v2`);
        const numRows = parseInt(rowCount.rows[0].count, 10);
        console.log(`  ✓ Found ${numRows} rows in call_analysis_v2 to migrate`);

        // Build tag_value → tag_id mapping
        const tagRows = await client.query(
            `SELECT id, tag_value FROM tag_definitions WHERE tag_value IS NOT NULL`
        );
        const valueToId = new Map();
        for (const row of tagRows.rows) {
            valueToId.set(row.tag_value, row.id);
        }
        console.log(`  ✓ Built tag_value → tag_id mapping (${valueToId.size} entries)`);

        // ═══════════════════════════════════════════════════════════════
        // SECTION 1: Create Backup Table
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 1: Create Backup Table ──────────────────────────');

        await client.query(`DROP TABLE IF EXISTS call_analysis_v2_backup_before_tag_id_migration`);
        await client.query(`CREATE TABLE call_analysis_v2_backup_before_tag_id_migration AS SELECT * FROM call_analysis_v2`);

        const backupCount = await client.query(`SELECT COUNT(*) as count FROM call_analysis_v2_backup_before_tag_id_migration`);
        console.log(`  ✓ Created backup table with ${backupCount.rows[0].count} rows`);

        // ═══════════════════════════════════════════════════════════════
        // SECTION 2: Add New _data_new Columns (Temporary)
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 2: Add Temporary New Columns ────────────────────');

        for (let tier = 1; tier <= 10; tier++) {
            await run(client,
                `ALTER TABLE call_analysis_v2
                 ADD COLUMN IF NOT EXISTS tier${tier}_data_new JSONB DEFAULT '{"value_ids":[],"reasons":{}}'`,
                `Added tier${tier}_data_new`
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION 3: Convert Data (String Values → Integer IDs)
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 3: Convert Data to Tag IDs ──────────────────────');

        // Helper function to convert tag_value to tag_id
        const convertValueToId = (value) => {
            const id = valueToId.get(value);
            if (id === undefined) {
                console.warn(`  ⚠️  Unknown tag_value: "${value}" - will be skipped`);
                return null;
            }
            return id;
        };

        // Fetch all rows and convert in batches
        const allRows = await client.query(
            `SELECT ringba_row_id,
                    tier1_data, tier2_data, tier3_data, tier4_data, tier5_data,
                    tier6_data, tier7_data, tier8_data, tier9_data, tier10_data
             FROM call_analysis_v2
             ORDER BY ringba_row_id`
        );

        console.log(`  Processing ${allRows.rows.length} rows...`);

        let processedCount = 0;
        let errorCount = 0;
        const BATCH_SIZE = 100;

        await client.query('BEGIN');

        try {
            for (let i = 0; i < allRows.rows.length; i += BATCH_SIZE) {
                const batch = allRows.rows.slice(i, i + BATCH_SIZE);

                for (const row of batch) {
                    const rowId = row.ringba_row_id;
                    const newTierData = {};

                    try {
                        // Process each tier
                        for (let tier = 1; tier <= 10; tier++) {
                            const oldData = row[`tier${tier}_data`];
                            if (!oldData) {
                                newTierData[tier] = { value_ids: [], reasons: {} };
                                continue;
                            }

                            // Determine if single-value or array tier
                            const isSingleValue = [1, 4, 5].includes(tier);

                            let newData = { value_ids: [], reasons: {} };

                            if (isSingleValue) {
                                // OLD: {"value": "TAG_VALUE", "reason": "..."}
                                // NEW: {"value_ids": [42], "reasons": {"42": "..."}}
                                const oldValue = oldData.value;
                                const oldReason = oldData.reason;

                                if (oldValue && oldValue !== 'UNKNOWN') {
                                    const tagId = convertValueToId(oldValue);
                                    if (tagId !== null) {
                                        newData.value_ids = [tagId];
                                        if (oldReason) {
                                            newData.reasons[tagId.toString()] = oldReason;
                                        }
                                    }
                                }
                            } else {
                                // OLD: {"values": ["TAG1", "TAG2"], "reasons": {"TAG1": "...", "TAG2": "..."}}
                                // NEW: {"value_ids": [23, 45], "reasons": {"23": "...", "45": "..."}}
                                const oldValues = oldData.values || [];
                                const oldReasons = oldData.reasons || {};

                                const newValueIds = [];
                                const newReasons = {};

                                for (const oldValue of oldValues) {
                                    const tagId = convertValueToId(oldValue);
                                    if (tagId !== null) {
                                        newValueIds.push(tagId);
                                        const reason = oldReasons[oldValue];
                                        if (reason) {
                                            newReasons[tagId.toString()] = reason;
                                        }
                                    }
                                }

                                newData.value_ids = newValueIds;
                                newData.reasons = newReasons;
                            }

                            newTierData[tier] = newData;
                        }

                        // Update row with all new tier data
                        await client.query(
                            `UPDATE call_analysis_v2 SET
                                tier1_data_new = $2,  tier2_data_new = $3,  tier3_data_new = $4,
                                tier4_data_new = $5,  tier5_data_new = $6,  tier6_data_new = $7,
                                tier7_data_new = $8,  tier8_data_new = $9,  tier9_data_new = $10,
                                tier10_data_new = $11
                             WHERE ringba_row_id = $1`,
                            [
                                rowId,
                                JSON.stringify(newTierData[1]),  JSON.stringify(newTierData[2]),
                                JSON.stringify(newTierData[3]),  JSON.stringify(newTierData[4]),
                                JSON.stringify(newTierData[5]),  JSON.stringify(newTierData[6]),
                                JSON.stringify(newTierData[7]),  JSON.stringify(newTierData[8]),
                                JSON.stringify(newTierData[9]),  JSON.stringify(newTierData[10])
                            ]
                        );

                        processedCount++;
                    } catch (rowError) {
                        console.error(`  ✗ Error processing row ${rowId}:`, rowError.message);
                        errorCount++;
                    }
                }

                // Progress indicator
                if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= allRows.rows.length) {
                    console.log(`    Progress: ${Math.min(i + BATCH_SIZE, allRows.rows.length)}/${allRows.rows.length} rows`);
                }
            }

            await client.query('COMMIT');
            console.log(`  ✓ Converted ${processedCount} rows successfully`);
            if (errorCount > 0) {
                console.log(`  ⚠️  ${errorCount} rows had errors`);
            }

        } catch (batchError) {
            await client.query('ROLLBACK');
            throw batchError;
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION 4: Drop Dependent Views First
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 4: Drop Dependent Views ─────────────────────────');

        const viewsToDrop = [
            'v_call_analysis_summary',
            'v_dispute_candidates',
            'v_billing_discrepancies',
            'v_call_tags_with_reasons'
        ];

        for (const view of viewsToDrop) {
            await run(client,
                `DROP VIEW IF EXISTS ${view} CASCADE`,
                `Dropped view ${view}`
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION 5: Swap Old and New Columns
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 5: Swap Old and New Columns ─────────────────────');

        // Drop old columns, rename new columns
        for (let tier = 1; tier <= 10; tier++) {
            await run(client,
                `ALTER TABLE call_analysis_v2 DROP COLUMN tier${tier}_data`,
                `Dropped tier${tier}_data (old)`
            );
            await run(client,
                `ALTER TABLE call_analysis_v2 RENAME COLUMN tier${tier}_data_new TO tier${tier}_data`,
                `Renamed tier${tier}_data_new → tier${tier}_data`
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION 6: Ensure Primary Key and Update Indexes
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 6: Ensure Primary Key and Update Indexes ────────');

        // SAFEGUARD: Verify primary key exists, recreate if missing
        const pkCheck = await client.query(`
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name = 'call_analysis_v2'
              AND constraint_type = 'PRIMARY KEY'
        `);

        if (pkCheck.rows.length === 0) {
            console.log('  ⚠️  Primary key missing - recreating...');
            await run(client,
                `ALTER TABLE call_analysis_v2
                 ADD CONSTRAINT call_analysis_v2_pkey PRIMARY KEY (ringba_row_id)`,
                'Recreated primary key on ringba_row_id'
            );
        } else {
            console.log(`  ✓ Primary key verified: ${pkCheck.rows[0].constraint_name}`);
        }

        // Drop old indexes
        for (let tier = 1; tier <= 10; tier++) {
            await client.query(`DROP INDEX IF EXISTS idx_v2_tier${tier}`);
            await client.query(`DROP INDEX IF EXISTS idx_v2_tier${tier}_gin`);
        }
        console.log(`  ✓ Dropped old indexes`);

        // Create new GIN indexes for ALL tiers (now all are arrays)
        for (let tier = 1; tier <= 10; tier++) {
            await run(client,
                `CREATE INDEX idx_v2_tier${tier}_gin ON call_analysis_v2 USING GIN(tier${tier}_data)`,
                `Created GIN index on tier${tier}_data`
            );
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION 7: Recreate Views with JOINs to tag_definitions
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 7: Recreate Views ────────────────────────────────');

        // Helper function to generate JOIN clause for a tier
        const getTagValueExpression = (tier) => {
            return `(
                SELECT td.tag_value
                FROM tag_definitions td
                WHERE td.id = (v2.tier${tier}_data->'value_ids'->>0)::int
            )`;
        };

        // v_call_analysis_summary
        await run(client,
            `CREATE OR REPLACE VIEW v_call_analysis_summary AS
             SELECT
                 v2.ringba_row_id,
                 v2.ringba_caller_id,
                 ${getTagValueExpression(1)} AS outcome,
                 ${getTagValueExpression(4)} AS appliance_type,
                 ${getTagValueExpression(5)} AS billing_status,
                 v2.dispute_recommendation,
                 v2.confidence_score,
                 v2.call_summary,
                 v2.current_revenue,
                 v2.current_billed_status,
                 v2.model_used,
                 v2.processing_time_ms,
                 v2.processed_at
             FROM call_analysis_v2 v2`,
            'Updated v_call_analysis_summary'
        );

        // v_dispute_candidates
        await run(client,
            `CREATE OR REPLACE VIEW v_dispute_candidates AS
             SELECT
                 v2.ringba_row_id,
                 v2.ringba_caller_id,
                 ${getTagValueExpression(1)} AS tier1_value,
                 ${getTagValueExpression(5)} AS tier5_value,
                 v2.dispute_recommendation,
                 v2.dispute_recommendation_reason,
                 v2.call_summary,
                 v2.current_revenue,
                 v2.current_billed_status,
                 v2.confidence_score,
                 v2.processed_at
             FROM call_analysis_v2 v2
             WHERE v2.dispute_recommendation IN ('REVIEW', 'STRONG')
                OR v2.tier5_data->'value_ids' @> (
                    SELECT jsonb_build_array(id)
                    FROM tag_definitions
                    WHERE tag_value = 'DEFINITELY_NOT_BILLABLE'
                    LIMIT 1
                )`,
            'Updated v_dispute_candidates'
        );

        // v_billing_discrepancies
        await run(client,
            `CREATE OR REPLACE VIEW v_billing_discrepancies AS
             SELECT
                 v2.ringba_row_id,
                 v2.ringba_caller_id,
                 ${getTagValueExpression(5)} AS tier5_value,
                 v2.current_revenue,
                 v2.current_billed_status,
                 v2.call_summary,
                 v2.tier5_data->'reasons'->>(v2.tier5_data->'value_ids'->>0) AS tier5_reason,
                 v2.processed_at
             FROM call_analysis_v2 v2
             WHERE (
                 v2.tier5_data->'value_ids' @> (
                     SELECT jsonb_build_array(id) FROM tag_definitions WHERE tag_value = 'LIKELY_BILLABLE' LIMIT 1
                 )
                 AND v2.current_billed_status = false
                 AND v2.current_revenue = 0
             )
             OR (
                 v2.tier5_data->'value_ids' @> (
                     SELECT jsonb_build_array(id) FROM tag_definitions WHERE tag_value = 'DEFINITELY_NOT_BILLABLE' LIMIT 1
                 )
                 AND v2.current_billed_status = true
                 AND v2.current_revenue > 0
             )`,
            'Updated v_billing_discrepancies'
        );

        // v_call_tags_with_reasons
        await run(client,
            `CREATE OR REPLACE VIEW v_call_tags_with_reasons AS
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
                     WHEN td.tier_number BETWEEN 1 AND 10 THEN
                         v2.tier1_data->'reasons'->>ct.tag_id::text
                     END AS detected_reason
             FROM call_tags ct
             JOIN tag_definitions td ON ct.tag_id = td.id
             JOIN call_analysis_v2 v2 ON ct.call_id = v2.ringba_row_id`,
            'Updated v_call_tags_with_reasons'
        );

        // ═══════════════════════════════════════════════════════════════
        // SECTION 8: Validation
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION 8: Validation ────────────────────────────────────');

        // Check for any NULL or empty value_ids in tiers 1, 5 (should have at least one)
        const nullCheck = await client.query(`
            SELECT COUNT(*) as count
            FROM call_analysis_v2
            WHERE jsonb_array_length(tier1_data->'value_ids') = 0
               OR jsonb_array_length(tier5_data->'value_ids') = 0
        `);
        console.log(`  ℹ️  Rows with empty tier1 or tier5: ${nullCheck.rows[0].count}`);

        // Sample a few rows to verify structure
        const samples = await client.query(`
            SELECT ringba_row_id, tier1_data, tier2_data, tier5_data
            FROM call_analysis_v2
            LIMIT 3
        `);

        console.log(`  ✓ Sample converted data:`);
        for (const sample of samples.rows) {
            console.log(`    Row ${sample.ringba_row_id}:`);
            console.log(`      tier1: ${JSON.stringify(sample.tier1_data)}`);
            console.log(`      tier2: ${JSON.stringify(sample.tier2_data)}`);
            console.log(`      tier5: ${JSON.stringify(sample.tier5_data)}`);
        }

        // Test view queries
        const viewTest = await client.query(`SELECT * FROM v_call_analysis_summary LIMIT 1`);
        console.log(`  ✓ View query test successful (returned ${viewTest.rows.length} row)`);

        // ═══════════════════════════════════════════════════════════════
        // SECTION 9: Summary
        // ═══════════════════════════════════════════════════════════════
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║   MIGRATION COMPLETE                                      ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('✅ All tiers now use uniform array format:');
        console.log('   {"value_ids": [1, 2, 3], "reasons": {"1": "...", "2": "...", "3": "..."}}');
        console.log('');
        console.log('✅ All tag values converted to integer IDs');
        console.log(`✅ ${processedCount} rows migrated successfully`);
        console.log('✅ Primary key preserved on ringba_row_id');
        console.log('✅ All indexes updated to GIN (JSONB array support)');
        console.log('✅ All views updated to JOIN with tag_definitions');
        console.log('');
        console.log('⚠️  IMPORTANT NEXT STEPS:');
        console.log('1. Deploy updated application code (processor.js, openRouterClient.js, etc.)');
        console.log('2. Test all API endpoints');
        console.log('3. Verify analytics queries return correct data');
        console.log('4. Monitor performance and storage metrics');
        console.log('');
        console.log('📋 Backup table created: call_analysis_v2_backup_before_tag_id_migration');
        console.log('   Keep this table for at least 30 days before dropping');
        console.log('');

    } catch (error) {
        console.error('\n✗ Migration failed:', error.message);
        console.error(error.stack);
        console.error('\n⚠️  Database may be in inconsistent state!');
        console.error('Restore from backup: call_analysis_v2_backup_before_tag_id_migration');
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
