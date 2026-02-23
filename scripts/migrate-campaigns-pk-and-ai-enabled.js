/**
 * Migration: campaigns table
 * 1. Set ai_enabled default to FALSE
 * 2. Make campaign_id the primary key (drops existing PK, adds PK on campaign_id)
 *
 * Prerequisite: campaign_id must be unique. If duplicates exist, deduplicate first.
 * Run from project root: node scripts/migrate-campaigns-pk-and-ai-enabled.js
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
        // 1. Set ai_enabled default to FALSE
        await client.query(`
            ALTER TABLE campaigns
            ALTER COLUMN ai_enabled SET DEFAULT FALSE
        `);
        console.log('Set campaigns.ai_enabled default to FALSE.');

        // 2. Ensure campaign_id is NOT NULL (required for PK)
        const nullCount = await client.query(`SELECT COUNT(*) as c FROM campaigns WHERE campaign_id IS NULL`);
        if (parseInt(nullCount.rows[0].c, 10) > 0) {
            console.error('Rows with NULL campaign_id exist. Primary key requires NOT NULL. Fix or delete those rows first.');
            process.exit(1);
        }

        // 3. Check for duplicate campaign_id (PK would fail)
        const dup = await client.query(`
            SELECT campaign_id, COUNT(*) as c
            FROM campaigns
            GROUP BY campaign_id
            HAVING COUNT(*) > 1
        `);
        if (dup.rows.length > 0) {
            console.error('Duplicate campaign_id values found. Cannot set primary key. Duplicates:', dup.rows);
            process.exit(1);
        }

        // 4. Drop existing primary key (constraint name is usually campaigns_pkey)
        const pkResult = await client.query(`
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'campaigns'::regclass AND contype = 'p'
        `);
        if (pkResult.rows.length > 0) {
            const conname = pkResult.rows[0].conname;
            await client.query(`ALTER TABLE campaigns DROP CONSTRAINT "${conname}"`);
            console.log('Dropped existing primary key:', conname);
        }

        // 5. Add primary key on campaign_id
        await client.query(`
            ALTER TABLE campaigns
            ADD PRIMARY KEY (campaign_id)
        `);
        console.log('Added primary key on campaigns(campaign_id).');
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
