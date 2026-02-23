/**
 * Backfill call_tags from call_analysis_v2.
 *
 * Reads all rows from call_analysis_v2, extracts tier values (tier1_value,
 * tier2_data->values, tier3_data->values, tier4_value, tier5_value, tier6-9_data->values),
 * maps each value to tag_id via tag_definitions.tag_value, and inserts
 * (call_id = ringba_row_id::text, tag_id, confidence, detected_reason) into call_tags.
 *
 * Prerequisites:
 * - tag_definitions must have tag_value column populated (run load-tag-definitions-from-csv.js).
 * - If call_tags has FK to call_transcriptions(call_id), that constraint may need to be dropped
 *   or call_transcriptions must contain matching call_id rows.
 *
 * Run from project root: node scripts/backfill-call-tags-from-v2.js
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

/** Collect all tier values from a call_analysis_v2 row (single values + JSONB arrays). */
function collectTierValues(row) {
    const values = [];
    const reasons = {};

    if (row.tier1_value) {
        values.push(row.tier1_value);
        if (row.tier1_reason) reasons[row.tier1_value] = row.tier1_reason;
    }
    if (row.tier4_value) {
        values.push(row.tier4_value);
        if (row.tier4_reason) reasons[row.tier4_value] = row.tier4_reason;
    }
    if (row.tier5_value) {
        values.push(row.tier5_value);
        if (row.tier5_reason) reasons[row.tier5_value] = row.tier5_reason;
    }

    for (const col of ['tier2_data', 'tier3_data', 'tier6_data', 'tier7_data', 'tier8_data', 'tier9_data', 'tier10_data']) {
        const data = row[col];
        if (!data) continue;
        let obj = data;
        if (typeof data === 'string') {
            try {
                obj = JSON.parse(data);
            } catch (_) {
                continue;
            }
        }
        const arr = obj?.values;
        if (Array.isArray(arr)) {
            for (const v of arr) {
                if (v && typeof v === 'string') values.push(v);
            }
            if (obj?.reasons && typeof obj.reasons === 'object') {
                for (const [k, r] of Object.entries(obj.reasons)) {
                    if (k && r) reasons[k] = r;
                }
            }
        }
    }

    return { values: [...new Set(values)], reasons };
}

async function main() {
    const pool = new pg.Pool(getDbConfig());
    const client = await pool.connect();

    try {
        // Check tag_definitions has tag_value
        const colCheck = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'tag_definitions' AND column_name = 'tag_value'
        `);
        if (colCheck.rows.length === 0) {
            console.error('tag_definitions.tag_value column not found. Run load-tag-definitions-from-csv.js first.');
            process.exit(1);
        }

        // Build map: tag_value -> { id, ... }
        const tagRows = await client.query(`
            SELECT id, tag_value FROM tag_definitions WHERE tag_value IS NOT NULL AND tag_value != ''
        `);
        const valueToTagId = new Map();
        for (const r of tagRows.rows) {
            valueToTagId.set(r.tag_value, r.id);
        }
        console.log(`Loaded ${valueToTagId.size} tag_definitions with tag_value.`);

        // Drop FK from call_tags to call_transcriptions if it exists (so we can insert by ringba row id)
        const fkResult = await client.query(`
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'call_tags'::regclass AND contype = 'f'
            AND conname LIKE '%call_id%'
        `);
        for (const r of fkResult.rows) {
            await client.query(`ALTER TABLE call_tags DROP CONSTRAINT IF EXISTS "${r.conname}"`);
            console.log(`Dropped FK: ${r.conname}`);
        }

        const v2Rows = await client.query(`
            SELECT ringba_row_id, tier1_value, tier1_reason,
                   tier2_data, tier3_data, tier4_value, tier4_reason, tier5_value, tier5_reason,
                   tier6_data, tier7_data, tier8_data, tier9_data, tier10_data,
                   confidence_score
            FROM call_analysis_v2
            ORDER BY ringba_row_id
        `);
        console.log(`Found ${v2Rows.rows.length} rows in call_analysis_v2.`);

        let insertedTags = 0;
        let skippedUnknown = 0;

        await client.query('BEGIN');
        try {
            for (const row of v2Rows.rows) {
                const callId = String(row.ringba_row_id);
                const { values: tierValues, reasons } = collectTierValues(row);
                const confidence = row.confidence_score != null ? Number(row.confidence_score) : 0.85;

                const rowsToInsert = [];
                for (const value of tierValues) {
                    const tagId = valueToTagId.get(value);
                    if (tagId == null) {
                        skippedUnknown++;
                        continue;
                    }
                    rowsToInsert.push({ callId, tagId, confidence, reason: reasons[value] || null });
                    insertedTags++;
                }
                if (rowsToInsert.length === 0) continue;

                const placeholders = rowsToInsert.map((_, i) =>
                    `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
                ).join(',');
                const params = rowsToInsert.flatMap(r => [r.callId, r.tagId, r.confidence]);
                await client.query(
                    `INSERT INTO call_tags (call_id, tag_id, confidence)
                     VALUES ${placeholders}
                     ON CONFLICT (call_id, tag_id) DO UPDATE
                     SET confidence = EXCLUDED.confidence`,
                    params
                );
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }

        console.log(`Backfill complete. Inserted/updated ${insertedTags} call_tag rows.`);
        if (skippedUnknown > 0) {
            console.log(`Skipped ${skippedUnknown} tier values that had no matching tag_value in tag_definitions.`);
        }

        const countResult = await client.query(`
            SELECT COUNT(DISTINCT call_id) AS calls_with_tags, COUNT(*) AS total_tag_rows
            FROM call_tags
        `);
        console.log(`call_tags now: ${countResult.rows[0].total_tag_rows} rows, ${countResult.rows[0].calls_with_tags} distinct calls.`);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
