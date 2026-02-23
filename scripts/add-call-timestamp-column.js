/**
 * Add call_timestamp column to call_analysis_v2 (when the call occurred).
 *
 * Run from project root: node scripts/add-call-timestamp-column.js
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

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
        await client.query(`
            ALTER TABLE call_analysis_v2
            ADD COLUMN IF NOT EXISTS call_timestamp TIMESTAMP
        `);
        console.log('Column call_analysis_v2.call_timestamp added (or already exists).');

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_v2_call_timestamp ON call_analysis_v2(call_timestamp)
        `);
        console.log('Index idx_v2_call_timestamp created (or already exists).');
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
