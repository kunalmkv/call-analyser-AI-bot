/**
 * Pre-flight check before migration
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
        console.log('║   PRE-FLIGHT CHECK: Migration Readiness                  ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        // Check 1: Database connection
        await client.query('SELECT 1');
        console.log('✅ Database connection successful');

        // Check 2: Tag definitions
        const tagCount = await client.query(
            `SELECT COUNT(*) as count FROM tag_definitions WHERE tag_value IS NOT NULL`
        );
        const numTags = parseInt(tagCount.rows[0].count, 10);
        console.log(`✅ Tag definitions: ${numTags} tags with tag_value`);

        if (numTags === 0) {
            console.log('❌ ERROR: No tag definitions found! Migration cannot proceed.');
            process.exit(1);
        }

        // Check 3: Call analysis rows
        const rowCount = await client.query(`SELECT COUNT(*) as count FROM call_analysis_v2`);
        const numRows = parseInt(rowCount.rows[0].count, 10);
        console.log(`✅ Rows to migrate: ${numRows}`);

        // Check 4: Current data format
        const sample = await client.query(
            `SELECT tier1_data, tier2_data FROM call_analysis_v2 LIMIT 1`
        );

        if (sample.rows.length > 0) {
            const tier1 = sample.rows[0].tier1_data;
            const tier2 = sample.rows[0].tier2_data;

            const hasOldFormat = tier1 && (tier1.value !== undefined || tier1.value !== null);
            const hasNewFormat = tier1 && Array.isArray(tier1.value_ids);

            console.log(`✅ Current format detected:`);
            if (hasNewFormat) {
                console.log('   ⚠️  NEW FORMAT DETECTED - Data may already be migrated!');
                console.log('   Sample tier1:', JSON.stringify(tier1));
            } else if (hasOldFormat) {
                console.log('   OLD FORMAT - Ready for migration');
                console.log('   Sample tier1:', JSON.stringify(tier1));
                console.log('   Sample tier2:', JSON.stringify(tier2));
            } else {
                console.log('   UNKNOWN FORMAT');
                console.log('   Sample tier1:', JSON.stringify(tier1));
            }
        } else {
            console.log('⚠️  No data in call_analysis_v2 to check format');
        }

        // Check 5: Backup table existence
        const backupCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'call_analysis_v2_backup_before_tag_id_migration'
            ) as exists
        `);

        if (backupCheck.rows[0].exists) {
            console.log('⚠️  Backup table already exists - previous migration may have been attempted');
        } else {
            console.log('✅ No existing backup table - clean slate for migration');
        }

        // Summary
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║   SUMMARY                                                 ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        console.log(`Tags available: ${numTags}`);
        console.log(`Rows to migrate: ${numRows}`);
        console.log(`Estimated migration time: ${Math.ceil(numRows / 100)} - ${Math.ceil(numRows / 50)} minutes`);
        console.log('');

        if (sample.rows.length > 0 && sample.rows[0].tier1_data?.value_ids) {
            console.log('⚠️  WARNING: Data appears to already be in new format!');
            console.log('Migration may have already been run.');
            console.log('');
        } else {
            console.log('✅ READY TO MIGRATE');
            console.log('Run: node scripts/migrate-to-tag-ids-and-array-uniformity.js');
            console.log('');
        }

    } catch (error) {
        console.error('\n❌ Pre-flight check failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
