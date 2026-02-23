/**
 * Erase current tag_definitions data and replace with definitions from
 * docs/tag_definitions_v5_modified.csv.
 *
 * CSV structure: id, tier, priority, tag_name, tag_value, description,
 * business_impact, action_required, dispute_trigger, billing_impact,
 * color_code, category, created_at
 *
 * Current tag_definitions table: id, priority, tag_name, description,
 * importance, color_code, created_at
 * Mapping: importance <- business_impact
 *
 * WARNING: TRUNCATE tag_definitions CASCADE will also remove all rows from
 * call_tags (foreign key). Existing AI-assigned tags on calls will be lost.
 * Run from project root: node scripts/load-tag-definitions-from-csv.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { parseCSVLine } from './parseCSVLine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const CSV_PATH = join(__dirname, '..', 'docs', 'tag_definitions_v5_modified.csv');

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

function parseCSV(content) {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, j) => {
            row[h] = values[j] !== undefined ? values[j].trim() : '';
        });
        rows.push(row);
    }
    return { headers, rows };
}

async function main() {
    console.log('Reading CSV:', CSV_PATH);
    const content = readFileSync(CSV_PATH, 'utf8');
    const { rows } = parseCSV(content);
    if (rows.length === 0) {
        console.error('No data rows in CSV.');
        process.exit(1);
    }
    console.log(`Parsed ${rows.length} tag definitions from CSV.`);

    const pool = new pg.Pool(getDbConfig());
    const client = await pool.connect();

    try {
        // Ensure tag_value column exists (for mapping V5 tier values to tag_id)
        await client.query(`
            ALTER TABLE tag_definitions
            ADD COLUMN IF NOT EXISTS tag_value VARCHAR(100)
        `);
        console.log('Truncating tag_definitions (CASCADE will also clear call_tags)...');
        await client.query('TRUNCATE TABLE tag_definitions RESTART IDENTITY CASCADE');
        console.log('Inserting new tag definitions...');

        for (const row of rows) {
            const id = parseInt(row.id, 10);
            if (Number.isNaN(id)) continue;
            const priority = row.priority || 'Medium';
            const tag_name = row.tag_name || '';
            const tag_value = (row.tag_value && String(row.tag_value).trim()) || null;
            const description = row.description || '';
            const importance = row.business_impact || '';
            const color_code = row.color_code || null;
            const created_at = (row.created_at && String(row.created_at).trim()) ? row.created_at : null;

            await client.query(
                `INSERT INTO tag_definitions (id, priority, tag_name, tag_value, description, importance, color_code, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamp)`,
                [id, priority, tag_name, tag_value, description, importance, color_code, created_at ?? new Date()]
            );
        }

        await client.query(
            `SELECT setval(pg_get_serial_sequence('tag_definitions', 'id'), (SELECT COALESCE(MAX(id), 1) FROM tag_definitions))`
        );
        console.log(`Done. Loaded ${rows.length} rows into tag_definitions.`);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
