/**
 * Migrate call_analysis_v2 to consistent tier columns (tierN_value, tierN_reason for all tiers) and add Tier 10.
 *
 * Adds:
 * - tier2_value, tier2_reason
 * - tier3_value, tier3_reason
 * - tier6_value, tier6_reason
 * - tier7_value, tier7_reason
 * - tier8_value, tier8_reason
 * - tier9_value, tier9_reason
 * - tier10_value, tier10_reason, tier10_data
 *
 * Backfills tierN_value and tierN_reason from existing tierN_data (first value and its reason) for array tiers.
 * Run from project root: node scripts/migrate-call-analysis-v2-consistent-tiers.js
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../.env` });

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

async function main() {
    const pool = new pg.Pool(getDbConfig());
    const client = await pool.connect();

    try {
        const alters = [
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier2_value VARCHAR(50)`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier2_reason TEXT`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier3_value VARCHAR(50)`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier3_reason TEXT`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier6_value VARCHAR(50)`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier6_reason TEXT`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier7_value VARCHAR(50)`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier7_reason TEXT`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier8_value VARCHAR(50)`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier8_reason TEXT`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier9_value VARCHAR(50)`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier9_reason TEXT`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier10_value VARCHAR(50)`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier10_reason TEXT`,
            `ALTER TABLE call_analysis_v2 ADD COLUMN IF NOT EXISTS tier10_data JSONB DEFAULT '{"values":[],"reasons":{}}'`
        ];
        for (const sql of alters) {
            await client.query(sql);
            console.log('OK:', sql.slice(0, 70) + '...');
        }

        // Backfill tierN_value from first value in tierN_data (tierN_reason left NULL for old rows)
        const backfills = [
            ['tier2_value', 'tier2_data'],
            ['tier3_value', 'tier3_data'],
            ['tier6_value', 'tier6_data'],
            ['tier7_value', 'tier7_data'],
            ['tier8_value', 'tier8_data'],
            ['tier9_value', 'tier9_data']
        ];
        for (const [vCol, dCol] of backfills) {
            await client.query(`
                UPDATE call_analysis_v2
                SET ${vCol} = (${dCol}->'values'->>0)
                WHERE ${dCol} IS NOT NULL
                AND jsonb_array_length(COALESCE(${dCol}->'values', '[]'::jsonb)) > 0
            `);
            const count = await client.query(`SELECT COUNT(*) c FROM call_analysis_v2 WHERE ${vCol} IS NOT NULL`);
            console.log(`Backfilled ${count.rows[0].c} rows for ${vCol}`);
        }

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_v2_tier10_gin ON call_analysis_v2 USING GIN(tier10_data)
        `);
        console.log('Created index idx_v2_tier10_gin');
        console.log('Migration complete.');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
