/**
 * ROLLBACK SCRIPT: Tag ID + Array Uniformity Migration
 *
 * Restores call_analysis_v2 from backup table created during migration
 *
 * Run: node scripts/rollback-tag-id-migration.js
 *
 * CAUTION: This will REPLACE all data in call_analysis_v2 with the backup
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

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║   ROLLBACK TAG ID MIGRATION                               ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        // Check if backup exists
        const backupExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'call_analysis_v2_backup_before_tag_id_migration'
            ) as exists
        `);

        if (!backupExists.rows[0].exists) {
            console.error('✗ Backup table not found: call_analysis_v2_backup_before_tag_id_migration');
            console.error('Cannot rollback without backup!');
            process.exit(1);
        }

        const backupCount = await client.query(`
            SELECT COUNT(*) as count FROM call_analysis_v2_backup_before_tag_id_migration
        `);
        console.log(`✓ Found backup table with ${backupCount.rows[0].count} rows`);

        console.log('\n⚠️  This will REPLACE all data in call_analysis_v2');
        console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('Starting rollback...\n');

        await client.query('BEGIN');

        // Drop current table
        await client.query('DROP TABLE call_analysis_v2 CASCADE');
        console.log('✓ Dropped current call_analysis_v2 table');

        // Rename backup to main table
        await client.query('ALTER TABLE call_analysis_v2_backup_before_tag_id_migration RENAME TO call_analysis_v2');
        console.log('✓ Restored from backup');

        // Recreate indexes (old format)
        console.log('\nRecreating indexes...');

        // Functional indexes for single-value tiers
        await client.query(`CREATE INDEX idx_v2_tier1 ON call_analysis_v2((tier1_data->>'value'))`);
        await client.query(`CREATE INDEX idx_v2_tier4 ON call_analysis_v2((tier4_data->>'value'))`);
        await client.query(`CREATE INDEX idx_v2_tier5 ON call_analysis_v2((tier5_data->>'value'))`);
        console.log('✓ Created functional indexes for tier1, tier4, tier5');

        // GIN indexes for array tiers
        for (let tier of [2, 3, 6, 7, 8, 9, 10]) {
            await client.query(`CREATE INDEX idx_v2_tier${tier}_gin ON call_analysis_v2 USING GIN(tier${tier}_data)`);
        }
        console.log('✓ Created GIN indexes for array tiers');

        // Other indexes
        await client.query(`CREATE INDEX idx_v2_dispute ON call_analysis_v2(dispute_recommendation)`);
        await client.query(`CREATE INDEX idx_v2_call_timestamp ON call_analysis_v2(call_timestamp)`);
        await client.query(`CREATE INDEX idx_v2_processed_at ON call_analysis_v2(processed_at DESC)`);
        console.log('✓ Created other indexes');

        // Recreate views (old format)
        console.log('\nRecreating views...');

        await client.query(`
            CREATE OR REPLACE VIEW v_call_analysis_summary AS
            SELECT
                ringba_row_id,
                ringba_caller_id,
                tier1_data->>'value' AS outcome,
                tier4_data->>'value' AS appliance_type,
                tier5_data->>'value' AS billing_status,
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
                tier1_data->>'value' AS tier1_value,
                tier5_data->>'value' AS tier5_value,
                dispute_recommendation,
                dispute_recommendation_reason,
                call_summary,
                current_revenue,
                current_billed_status,
                confidence_score,
                processed_at
            FROM call_analysis_v2
            WHERE dispute_recommendation IN ('REVIEW','STRONG')
               OR tier5_data->>'value' = 'DEFINITELY_NOT_BILLABLE'
        `);

        await client.query(`
            CREATE OR REPLACE VIEW v_billing_discrepancies AS
            SELECT
                ringba_row_id,
                ringba_caller_id,
                tier5_data->>'value' AS tier5_value,
                current_revenue,
                current_billed_status,
                call_summary,
                tier5_data->>'reason' AS tier5_reason,
                processed_at
            FROM call_analysis_v2
            WHERE (tier5_data->>'value' = 'LIKELY_BILLABLE' AND current_billed_status = false AND current_revenue = 0)
               OR (tier5_data->>'value' = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true AND current_revenue > 0)
        `);

        console.log('✓ Recreated views');

        await client.query('COMMIT');

        const finalCount = await client.query(`SELECT COUNT(*) as count FROM call_analysis_v2`);

        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║   ROLLBACK COMPLETE                                       ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        console.log(`\n✓ Restored ${finalCount.rows[0].count} rows from backup`);
        console.log('✓ Recreated all indexes');
        console.log('✓ Recreated all views');
        console.log('\n⚠️  Remember to redeploy the OLD application code!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n✗ Rollback failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
