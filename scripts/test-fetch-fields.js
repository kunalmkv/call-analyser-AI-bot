/**
 * Test: Verify all fields needed for the AI request body are fetched from the
 * database correctly and mapped by buildCallData().
 *
 * Uses the same fetch logic as the processor (ringba_call_data + elocal + campaigns).
 * If no unprocessed rows exist, fetches one row from ringba_call_data with
 * LEFT JOINs to still verify column mapping.
 *
 * Run from project root: node scripts/test-fetch-fields.js
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildCallData } from '../src/services/openRouterClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const REQUIRED_KEYS = [
    'ringbaCallerId',
    'callerId',
    'transcript',
    'callLengthInSeconds',
    'revenue',
    'billed',
    'hung_up',
    'duplicate',
    'firstName',
    'lastName',
    'address',
    'street_number',
    'street_name',
    'street_type',
    'city',
    'state',
    'g_zip',
    'targetName',
    'publisherName'
];

const KEY_TYPES = {
    ringbaCallerId: 'string',
    callerId: ['string', 'object'], // string | null
    transcript: 'string',
    callLengthInSeconds: 'number',
    revenue: 'number',
    billed: 'boolean',
    hung_up: 'string',
    duplicate: 'boolean',
    firstName: ['string', 'object'],
    lastName: ['string', 'object'],
    address: ['string', 'object'],
    street_number: ['string', 'object'],
    street_name: ['string', 'object'],
    street_type: ['string', 'object'],
    city: ['string', 'object'],
    state: ['string', 'object'],
    g_zip: ['string', 'object'],
    targetName: ['string', 'object'],
    publisherName: ['string', 'object']
};

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

// Same query as processor fetchUnprocessedRows (LIMIT 1)
const FETCH_UNPROCESSED_SQL = `
    SELECT
        r.id,
        r.ringba_id as "inboundCallId",
        r.ringba_id as ringba_caller_id,
        r.transcript,
        REGEXP_REPLACE(
            REGEXP_REPLACE(r.transcript, '^A\\s*-\\s*', 'Agent: ', 'gm'),
            '^B\\s*-\\s*', 'Customer: ', 'gm'
        ) as transcription,
        CASE
            WHEN r.call_duration ~ '^[0-9]+$'
            THEN r.call_duration::integer
            ELSE NULL
        END as duration,
        r.caller_id as caller_phone,
        e.elocal_payout as revenue,
        r.g_zip,
        FALSE as is_duplicate,
        NULL as hung_up,
        r."firstName",
        r."lastName",
        r.address,
        r.street_number,
        r.street_name,
        r.street_type,
        r.city,
        r.state,
        r."targetName",
        r."publisherName",
        r.billed,
        COALESCE(r.call_timestamp, CURRENT_TIMESTAMP) as call_date
     FROM ringba_call_data r
     INNER JOIN elocal_call_data e ON r.ringba_id = e.ringba_id
     INNER JOIN campaigns c ON r.campaign_id = c.campaign_id AND c.ai_enabled = TRUE
     WHERE r.transcript IS NOT NULL
     AND r.transcript != ''
     AND (r.ai_processed = false OR r.ai_processed IS NULL)
     AND (r.call_timestamp >= '2026-02-01'::date OR r.call_timestamp IS NULL)
     ORDER BY r.id ASC
     LIMIT 1
`;

// Fallback: one row from ringba_call_data with LEFT JOINs (when no unprocessed or joins fail)
const FALLBACK_SQL = `
    SELECT
        r.id,
        r.ringba_id as "inboundCallId",
        r.ringba_id as ringba_caller_id,
        r.transcript,
        REGEXP_REPLACE(
            REGEXP_REPLACE(r.transcript, '^A\\s*-\\s*', 'Agent: ', 'gm'),
            '^B\\s*-\\s*', 'Customer: ', 'gm'
        ) as transcription,
        CASE WHEN r.call_duration ~ '^[0-9]+$' THEN r.call_duration::integer ELSE NULL END as duration,
        r.caller_id as caller_phone,
        e.elocal_payout as revenue,
        r.g_zip,
        FALSE as is_duplicate,
        NULL as hung_up,
        r."firstName",
        r."lastName",
        r.address,
        r.street_number,
        r.street_name,
        r.street_type,
        r.city,
        r.state,
        r."targetName",
        r."publisherName",
        r.billed,
        COALESCE(r.call_timestamp, CURRENT_TIMESTAMP) as call_date
     FROM ringba_call_data r
     LEFT JOIN elocal_call_data e ON r.ringba_id = e.ringba_id
     LEFT JOIN campaigns c ON r.campaign_id = c.campaign_id
     WHERE r.transcript IS NOT NULL AND r.transcript != ''
     ORDER BY r.id ASC
     LIMIT 1
`;

function checkType(value, expected) {
    const actual = value === null ? 'object' : typeof value;
    if (Array.isArray(expected)) return expected.includes(actual);
    return actual === expected;
}

function runAssertions(callData) {
    const missing = [];
    const wrongType = [];

    for (const key of REQUIRED_KEYS) {
        if (!(key in callData)) {
            missing.push(key);
            continue;
        }
        const expected = KEY_TYPES[key];
        if (!checkType(callData[key], expected)) {
            wrongType.push({ key, expected, actual: callData[key] === null ? 'null' : typeof callData[key] });
        }
    }

    return { missing, wrongType };
}

async function main() {
    console.log('=== Test: Fetch fields for AI request body ===\n');

    const pool = new pg.Pool(getDbConfig());
    const client = await pool.connect();

    let row;
    let source;

    try {
        let res1;
        try {
            res1 = await client.query(FETCH_UNPROCESSED_SQL);
        } catch (e) {
            if (e.message && (e.message.includes('does not exist') || e.message.includes('ai_enabled'))) {
                console.log('Main query not available (e.g. campaigns.ai_enabled missing); using fallback.\n');
                res1 = { rows: [] };
            } else {
                throw e;
            }
        }
        if (res1.rows && res1.rows.length > 0) {
            row = res1.rows[0];
            source = 'fetchUnprocessedRows (unprocessed)';
        } else {
            console.log('Fetching one row from ringba_call_data (with LEFT JOINs)...\n');
            const res2 = await client.query(FALLBACK_SQL);
            if (res2.rows.length === 0) {
                console.log('No rows in ringba_call_data with transcript. Cannot run field test.');
                process.exit(1);
            }
            row = res2.rows[0];
            source = 'fallback (ringba_call_data + LEFT JOINs)';
        }
    } finally {
        client.release();
        await pool.end();
    }

    console.log('Row source:', source);
    console.log('Row id:', row.id);
    console.log('\n--- Raw row keys (from DB) ---');
    console.log(Object.keys(row).sort().join(', '));

    const callData = buildCallData(row);

    console.log('\n--- Built callData keys (for AI request) ---');
    console.log(Object.keys(callData).sort().join(', '));

    const { missing, wrongType } = runAssertions(callData);

    let passed = true;
    if (missing.length > 0) {
        console.log('\n❌ MISSING keys in callData:', missing.join(', '));
        passed = false;
    }
    if (wrongType.length > 0) {
        console.log('\n❌ Wrong type:', wrongType.map(({ key, expected, actual }) => `${key}: expected ${expected}, got ${actual}`).join('; '));
        passed = false;
    }

    if (passed) {
        console.log('\n✅ All required keys present and types correct.');
    }

    console.log('\n--- Sample callData (values) ---');
    const sample = {};
    for (const k of REQUIRED_KEYS) {
        const v = callData[k];
        sample[k] = v === null || v === '' ? '(null/empty)' : (typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '...' : v);
    }
    console.log(JSON.stringify(sample, null, 2));

    process.exit(passed ? 0 : 1);
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
