/**
 * Migration: Add tier_number to tag_definitions, drop detected_reason from call_tags,
 * create v_call_tags_with_reasons view.
 *
 * tier_number values come from docs/tag_definitions_v5_modified.csv (column 2).
 * Single-value tiers: 1, 4, 5  → reason at tierN_data->>'reason'
 * Array tiers:        2,3,6-10 → reason at tierN_data->'reasons'->>'tag_value'
 */

import 'dotenv/config';
import pg from 'pg';
import { getDbConfig } from '../src/config/index.js';

const { Pool } = pg;

// Full tier mapping from the CSV (tag_value → tier_number)
const TAG_TIER_MAP = {
    // Tier 1 — single-value (primary outcome)
    QUALIFIED_APPOINTMENT_SET:      1,
    SOFT_LEAD_INTERESTED:           1,
    INFORMATION_ONLY_CALL:          1,
    BUYER_EARLY_HANGUP:             1,
    USER_EARLY_HANGUP:              1,
    NO_BUYER_INTEREST:              1,

    // Tier 2 — array (quality flags)
    WRONG_NUMBER:                   2,
    UNSERVICEABLE_GEOGRAPHY:        2,
    UNSERVICEABLE_APPLIANCE_TV:     2,
    UNSERVICEABLE_APPLIANCE_COMMERCIAL: 2,
    UNSERVICEABLE_APPLIANCE_HVAC:   2,
    UNSERVICEABLE_APPLIANCE_POOL:   2,
    UNSERVICEABLE_APPLIANCE_OTHER:  2,
    IMMEDIATE_DISCONNECT:           2,
    POSSIBLE_DISPUTE:               2,

    // Tier 3 — array (customer intent)
    URGENT_REPAIR_NEEDED:           3,
    PREVENTIVE_MAINTENANCE:         3,
    WARRANTY_CLAIM_ATTEMPT:         3,
    PRICE_COMPARISON_SHOPPING:      3,
    CONSIDERING_NEW_PURCHASE:       3,
    PARTS_INQUIRY:                  3,

    // Tier 4 — single-value (appliance type)
    WASHER_REPAIR:                  4,
    DRYER_REPAIR:                   4,
    REFRIGERATOR_REPAIR:            4,
    DISHWASHER_REPAIR:              4,
    OVEN_STOVE_REPAIR:              4,
    MICROWAVE_REPAIR:               4,
    GARBAGE_DISPOSAL_REPAIR:        4,
    MULTIPLE_APPLIANCES:            4,
    UNKNOWN_APPLIANCE:              4,
    UNSERVICED_APPLIANCE_TV:        4,
    UNSERVICED_APPLIANCE_HVAC:      4,
    UNSERVICED_APPLIANCE_OTHER:     4,

    // Tier 5 — single-value (billing indicator)
    LIKELY_BILLABLE:                5,
    QUESTIONABLE_BILLING:           5,
    DEFINITELY_NOT_BILLABLE:        5,

    // Tier 6 — array (customer demographics)
    ELDERLY_CUSTOMER:               6,
    RENTAL_PROPERTY_OWNER:          6,
    FIRST_TIME_HOMEOWNER:           6,
    MULTILINGUAL_CUSTOMER:          6,
    COMMERCIAL_PROPERTY:            6,

    // Tier 7 — array (buyer performance)
    EXCELLENT_BUYER_SERVICE:        7,
    POOR_BUYER_SERVICE:             7,
    BUYER_MISSED_OPPORTUNITY:       7,

    // Tier 8 — array (traffic quality)
    HIGH_INTENT_TRAFFIC:            8,
    BRAND_CONFUSION_TRAFFIC:        8,
    CONSUMER_SHOPPING_MULTIPLE:     8,

    // Tier 9 — array (special situations)
    DIY_ATTEMPT_FAILED:             9,
    INSURANCE_CLAIM_RELATED:        9,

    // Tier 10 — array (buyer operational issues)
    // BUYER_AVAILABILITY_ISSUE and BUYER_ROUTING_FAILURE appear in both tier 2 and tier 10 in the CSV;
    // we assign tier 10 so the view sources reasons from tier10_data for Buyer Ops context.
    BUYER_AVAILABILITY_ISSUE:       10,
    BUYER_ROUTING_FAILURE:          10,
};

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║   Add tier_number + Remove detected_reason redundancy    ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        await client.query('BEGIN');

        // ── 1. Add tier_number to tag_definitions ─────────────────────────
        const colExists = await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'tag_definitions' AND column_name = 'tier_number'
        `);
        if (colExists.rows.length === 0) {
            await client.query(`ALTER TABLE tag_definitions ADD COLUMN tier_number INTEGER`);
            console.log('✓ Added tier_number column to tag_definitions');
        } else {
            console.log('  tier_number already exists — skipping ADD COLUMN');
        }

        // Populate tier_number for every tag_value in the map
        let updated = 0;
        for (const [tagValue, tierNum] of Object.entries(TAG_TIER_MAP)) {
            const r = await client.query(
                `UPDATE tag_definitions SET tier_number = $1 WHERE tag_value = $2`,
                [tierNum, tagValue]
            );
            updated += r.rowCount;
        }
        console.log(`✓ Populated tier_number for ${updated} tag_definitions rows`);

        // Show any rows still missing tier_number
        const missing = await client.query(
            `SELECT id, tag_value FROM tag_definitions WHERE tier_number IS NULL`
        );
        if (missing.rows.length > 0) {
            console.warn(`  ⚠ ${missing.rows.length} tag_definitions rows still have no tier_number:`);
            missing.rows.forEach(r => console.warn(`    id=${r.id}  tag_value=${r.tag_value}`));
        } else {
            console.log('✓ All tag_definitions rows have tier_number assigned');
        }

        // ── 2. Drop detected_reason from call_tags ────────────────────────
        const drColExists = await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'call_tags' AND column_name = 'detected_reason'
        `);
        if (drColExists.rows.length > 0) {
            await client.query(`ALTER TABLE call_tags DROP COLUMN detected_reason`);
            console.log('✓ Dropped detected_reason from call_tags');
        } else {
            console.log('  detected_reason already absent from call_tags — skipping');
        }

        // ── 3. Create v_call_tags_with_reasons view ───────────────────────
        await client.query(`DROP VIEW IF EXISTS v_call_tags_with_reasons`);
        await client.query(`
            CREATE VIEW v_call_tags_with_reasons AS
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
                    WHEN td.tier_number = 1  THEN v2.tier1_data->>'reason'
                    WHEN td.tier_number = 2  THEN v2.tier2_data->'reasons'->>td.tag_value
                    WHEN td.tier_number = 3  THEN v2.tier3_data->'reasons'->>td.tag_value
                    WHEN td.tier_number = 4  THEN v2.tier4_data->>'reason'
                    WHEN td.tier_number = 5  THEN v2.tier5_data->>'reason'
                    WHEN td.tier_number = 6  THEN v2.tier6_data->'reasons'->>td.tag_value
                    WHEN td.tier_number = 7  THEN v2.tier7_data->'reasons'->>td.tag_value
                    WHEN td.tier_number = 8  THEN v2.tier8_data->'reasons'->>td.tag_value
                    WHEN td.tier_number = 9  THEN v2.tier9_data->'reasons'->>td.tag_value
                    WHEN td.tier_number = 10 THEN v2.tier10_data->'reasons'->>td.tag_value
                END AS detected_reason
            FROM call_tags ct
            JOIN tag_definitions td ON ct.tag_id = td.id
            JOIN call_analysis_v2 v2 ON ct.call_id = v2.ringba_row_id
        `);
        console.log('✓ Created v_call_tags_with_reasons view');

        await client.query('COMMIT');

        // ── 4. Verify with a sample query ─────────────────────────────────
        const sample = await client.query(`
            SELECT call_id, tag_value, tier_number, LEFT(detected_reason, 80) AS reason
            FROM v_call_tags_with_reasons
            LIMIT 5
        `);
        console.log('\n── Sample from v_call_tags_with_reasons ────────────────────');
        sample.rows.forEach(r =>
            console.log(`  call=${r.call_id}  [tier${r.tier_number}] ${r.tag_value}\n    reason: "${r.reason}"`)
        );

        // ── 5. Show final tag_definitions with tier_number ────────────────
        const tdCheck = await client.query(`
            SELECT tier_number, COUNT(*) AS tags
            FROM tag_definitions GROUP BY tier_number ORDER BY tier_number
        `);
        console.log('\n── tag_definitions by tier ─────────────────────────────────');
        tdCheck.rows.forEach(r => console.log(`  tier ${r.tier_number}: ${r.tags} tags`));

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║                 Migration complete                       ║');
        console.log('╚══════════════════════════════════════════════════════════╝');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n✗ Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
