/**
 * Comprehensive PostgreSQL schema improvements migration.
 * Implements all recommendations from the PostgreSQL Schema and Query Analysis.
 *
 * Sections:
 *   A – tag_definitions: NOT NULL/UNIQUE on tag_value, CHECKs, TIMESTAMPTZ
 *   B – call_analysis_v2 structural: drop id, promote ringba_row_id to PK
 *   C – call_analysis_v2 FK to ringba_call_data
 *   D – call_analysis_v2 CHECK constraints + NOT NULL booleans
 *   E – call_analysis_v2_raw: move raw_ai_response out of main table
 *   F – call_analysis_v2 index cleanup + new partial/FTS indexes, TIMESTAMPTZ
 *   G – Fix views (remove ORDER BY)
 *   H – call_tags structural: call_id → INTEGER, composite PK
 *   I – call_tags FK to ringba_call_data
 *   J – call_tags CHECK on confidence, TIMESTAMPTZ on created_at
 */

import 'dotenv/config';
import pg from 'pg';
import { getDbConfig } from '../src/config/index.js';

const { Pool } = pg;

const run = async (client, sql, label) => {
    await client.query(sql);
    console.log(`  ✓ ${label}`);
};

const checkExists = async (client, sql) => {
    const r = await client.query(sql);
    return r.rows.length > 0;
};

const colType = async (client, table, column) => {
    const r = await client.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_name = $1 AND column_name = $2`,
        [table, column]
    );
    return r.rows[0]?.data_type ?? null;
};

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║       PostgreSQL Schema Improvements Migration           ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        // ═══════════════════════════════════════════════════════════════
        // SECTION A: tag_definitions
        // ═══════════════════════════════════════════════════════════════
        console.log('── SECTION A: tag_definitions ─────────────────────────────');

        // A1. NOT NULL on tag_value
        const nullTagValues = await client.query(
            `SELECT id, tag_name FROM tag_definitions WHERE tag_value IS NULL`
        );
        if (nullTagValues.rows.length === 0) {
            await run(client,
                `ALTER TABLE tag_definitions ALTER COLUMN tag_value SET NOT NULL`,
                'tag_definitions.tag_value: SET NOT NULL'
            );
        } else {
            console.log(`  ⚠  Skipped tag_value NOT NULL — ${nullTagValues.rows.length} NULL rows:`);
            nullTagValues.rows.forEach(r => console.log(`       id=${r.id}, tag_name=${r.tag_name}`));
        }

        // A2. UNIQUE index on tag_value (only if no duplicates exist)
        const dupTagValues = await client.query(
            `SELECT tag_value, COUNT(*) AS cnt, array_agg(id || ':' || tag_name ORDER BY id) AS entries
             FROM tag_definitions
             WHERE tag_value IS NOT NULL
             GROUP BY tag_value
             HAVING COUNT(*) > 1`
        );
        if (dupTagValues.rows.length > 0) {
            console.log(`  ⚠  Duplicate tag_values found — creating non-unique index instead of UNIQUE:`);
            dupTagValues.rows.forEach(r =>
                console.log(`       tag_value="${r.tag_value}" → ${r.entries.join(', ')}`)
            );
            console.log('     To resolve: update duplicate rows with distinct tag_values or set to NULL for secondary entries.');
            await run(client,
                `CREATE INDEX IF NOT EXISTS idx_tag_definitions_tag_value
                 ON tag_definitions(tag_value) WHERE tag_value IS NOT NULL`,
                'Non-unique INDEX idx_tag_definitions_tag_value (duplicates present)'
            );
        } else {
            await run(client,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_definitions_tag_value
                 ON tag_definitions(tag_value) WHERE tag_value IS NOT NULL`,
                'UNIQUE INDEX idx_tag_definitions_tag_value'
            );
        }

        // A3. CHECK on priority
        const hasPriorityCheck = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'chk_tag_priority'`
        );
        if (!hasPriorityCheck) {
            await run(client,
                `ALTER TABLE tag_definitions
                 ADD CONSTRAINT chk_tag_priority
                 CHECK (priority IN ('Highest', 'High', 'Medium', 'Lower'))`,
                'CHECK chk_tag_priority on priority'
            );
        } else {
            console.log('  ~ chk_tag_priority already exists');
        }

        // A4. CHECK on color_code
        const hasColorCheck = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'chk_color_code'`
        );
        if (!hasColorCheck) {
            await run(client,
                `ALTER TABLE tag_definitions
                 ADD CONSTRAINT chk_color_code
                 CHECK (color_code IS NULL OR color_code IN ('red', 'orange', 'yellow', 'green'))`,
                'CHECK chk_color_code on color_code'
            );
        } else {
            console.log('  ~ chk_color_code already exists');
        }

        // A5. TIMESTAMPTZ on created_at
        if (await colType(client, 'tag_definitions', 'created_at') === 'timestamp without time zone') {
            await run(client,
                `ALTER TABLE tag_definitions
                 ALTER COLUMN created_at TYPE TIMESTAMPTZ
                 USING created_at AT TIME ZONE 'UTC'`,
                'tag_definitions.created_at → TIMESTAMPTZ'
            );
        } else {
            console.log('  ~ tag_definitions.created_at already TIMESTAMPTZ');
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION B: call_analysis_v2 structural
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION B: call_analysis_v2 structural ─────────────────');

        // B1-B3. Backfill NULLs before adding NOT NULL constraints
        const bfRows = await client.query(
            `UPDATE call_analysis_v2 SET call_summary = '' WHERE call_summary IS NULL`
        );
        console.log(`  ✓ Backfilled ${bfRows.rowCount} NULL call_summary → ''`);

        const bfBilled = await client.query(
            `UPDATE call_analysis_v2 SET current_billed_status = FALSE WHERE current_billed_status IS NULL`
        );
        console.log(`  ✓ Backfilled ${bfBilled.rowCount} NULL current_billed_status → FALSE`);

        const bfDup = await client.query(
            `UPDATE call_analysis_v2 SET system_duplicate = FALSE WHERE system_duplicate IS NULL`
        );
        console.log(`  ✓ Backfilled ${bfDup.rowCount} NULL system_duplicate → FALSE`);

        // B4. Drop id column → promotes ringba_row_id to PK
        const hasV2Id = await checkExists(client,
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = 'call_analysis_v2' AND column_name = 'id'`
        );
        if (hasV2Id) {
            // Drop the SERIAL PK column (also drops call_analysis_v2_pkey constraint)
            await run(client,
                `ALTER TABLE call_analysis_v2 DROP COLUMN id`,
                'Dropped call_analysis_v2.id (and its PK constraint)'
            );
            // Add new PK on ringba_row_id
            await run(client,
                `ALTER TABLE call_analysis_v2 ADD CONSTRAINT call_analysis_v2_pkey PRIMARY KEY (ringba_row_id)`,
                'Promoted ringba_row_id to PRIMARY KEY'
            );
            // Drop redundant UNIQUE constraint that was shadowing the PK
            await run(client,
                `ALTER TABLE call_analysis_v2 DROP CONSTRAINT IF EXISTS call_analysis_v2_ringba_row_id_key`,
                'Dropped old UNIQUE constraint (redundant with PK)'
            );
            // Drop separate non-unique index (also redundant with PK)
            await run(client,
                `DROP INDEX IF EXISTS idx_v2_ringba_row`,
                'Dropped idx_v2_ringba_row (redundant with PK)'
            );
        } else {
            console.log('  ~ call_analysis_v2.id already dropped');
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION C: call_analysis_v2 FK
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION C: call_analysis_v2 FK to ringba_call_data ─────');

        const hasFkV2 = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'fk_v2_ringba_row'`
        );
        if (!hasFkV2) {
            const orphans = await client.query(
                `SELECT COUNT(*) AS cnt FROM call_analysis_v2 v
                 LEFT JOIN ringba_call_data r ON r.id = v.ringba_row_id
                 WHERE r.id IS NULL`
            );
            const orphanCount = parseInt(orphans.rows[0].cnt, 10);
            if (orphanCount > 0) {
                console.log(`  ⚠  Skipping FK fk_v2_ringba_row: ${orphanCount} orphaned ringba_row_id values`);
                console.log('     Clean orphans first: DELETE FROM call_analysis_v2 v WHERE NOT EXISTS (SELECT 1 FROM ringba_call_data r WHERE r.id = v.ringba_row_id)');
            } else {
                await run(client,
                    `ALTER TABLE call_analysis_v2
                     ADD CONSTRAINT fk_v2_ringba_row
                     FOREIGN KEY (ringba_row_id)
                     REFERENCES ringba_call_data(id) ON DELETE CASCADE`,
                    'Added FK fk_v2_ringba_row → ringba_call_data(id)'
                );
            }
        } else {
            console.log('  ~ FK fk_v2_ringba_row already exists');
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION D: call_analysis_v2 CHECK constraints + NOT NULL
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION D: call_analysis_v2 constraints ─────────────────');

        // D1. CHECK on dispute_recommendation
        const hasDisputeCheck = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'chk_dispute_recommendation'`
        );
        if (!hasDisputeCheck) {
            await run(client,
                `ALTER TABLE call_analysis_v2
                 ADD CONSTRAINT chk_dispute_recommendation
                 CHECK (dispute_recommendation IN ('NONE', 'REVIEW', 'STRONG'))`,
                'CHECK chk_dispute_recommendation'
            );
        } else {
            console.log('  ~ chk_dispute_recommendation already exists');
        }

        // D2. CHECK on tier1_value (only if all existing values are valid)
        const TIER1_VALID = [
            'QUALIFIED_APPOINTMENT_SET', 'SOFT_LEAD_INTERESTED', 'INFORMATION_ONLY_CALL',
            'BUYER_EARLY_HANGUP', 'USER_EARLY_HANGUP', 'NO_BUYER_INTEREST', 'UNKNOWN'
        ];
        const invalidTier1 = await client.query(
            `SELECT DISTINCT tier1_value FROM call_analysis_v2
             WHERE tier1_value NOT IN (${TIER1_VALID.map((_, i) => `$${i + 1}`).join(',')})`,
            TIER1_VALID
        );
        const hasTier1Check = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'chk_tier1_value'`
        );
        if (!hasTier1Check) {
            if (invalidTier1.rows.length > 0) {
                console.log(`  ⚠  Skipping chk_tier1_value — invalid values: ${invalidTier1.rows.map(r => r.tier1_value).join(', ')}`);
            } else {
                await run(client,
                    `ALTER TABLE call_analysis_v2
                     ADD CONSTRAINT chk_tier1_value
                     CHECK (tier1_value IN (
                       'QUALIFIED_APPOINTMENT_SET','SOFT_LEAD_INTERESTED','INFORMATION_ONLY_CALL',
                       'BUYER_EARLY_HANGUP','USER_EARLY_HANGUP','NO_BUYER_INTEREST','UNKNOWN'
                     ))`,
                    'CHECK chk_tier1_value'
                );
            }
        } else {
            console.log('  ~ chk_tier1_value already exists');
        }

        // D3. CHECK on tier5_value
        const hasTier5Check = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'chk_tier5_value'`
        );
        if (!hasTier5Check) {
            await run(client,
                `ALTER TABLE call_analysis_v2
                 ADD CONSTRAINT chk_tier5_value
                 CHECK (tier5_value IS NULL OR tier5_value IN (
                   'LIKELY_BILLABLE','QUESTIONABLE_BILLING','DEFINITELY_NOT_BILLABLE'
                 ))`,
                'CHECK chk_tier5_value'
            );
        } else {
            console.log('  ~ chk_tier5_value already exists');
        }

        // D4. CHECK on confidence_score
        const hasConfCheck = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'chk_confidence_score'`
        );
        if (!hasConfCheck) {
            await run(client,
                `ALTER TABLE call_analysis_v2
                 ADD CONSTRAINT chk_confidence_score
                 CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))`,
                'CHECK chk_confidence_score in [0,1]'
            );
        } else {
            console.log('  ~ chk_confidence_score already exists');
        }

        // D5. NOT NULL + DEFAULT on current_billed_status
        await run(client,
            `ALTER TABLE call_analysis_v2 ALTER COLUMN current_billed_status SET NOT NULL`,
            'current_billed_status: SET NOT NULL'
        );
        await run(client,
            `ALTER TABLE call_analysis_v2 ALTER COLUMN current_billed_status SET DEFAULT FALSE`,
            'current_billed_status: SET DEFAULT FALSE'
        );

        // D6. NOT NULL on system_duplicate
        await run(client,
            `ALTER TABLE call_analysis_v2 ALTER COLUMN system_duplicate SET NOT NULL`,
            'system_duplicate: SET NOT NULL'
        );

        // D7. NOT NULL + DEFAULT '' on call_summary
        await run(client,
            `ALTER TABLE call_analysis_v2 ALTER COLUMN call_summary SET NOT NULL`,
            'call_summary: SET NOT NULL'
        );
        await run(client,
            `ALTER TABLE call_analysis_v2 ALTER COLUMN call_summary SET DEFAULT ''`,
            "call_summary: SET DEFAULT ''"
        );

        // ═══════════════════════════════════════════════════════════════
        // SECTION E: call_analysis_v2_raw table (move raw_ai_response)
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION E: call_analysis_v2_raw ────────────────────────');

        // E1. Create call_analysis_v2_raw
        await run(client,
            `CREATE TABLE IF NOT EXISTS call_analysis_v2_raw (
               ringba_row_id INTEGER PRIMARY KEY
                 REFERENCES call_analysis_v2(ringba_row_id) ON DELETE CASCADE,
               raw_ai_response JSONB NOT NULL,
               stored_at TIMESTAMPTZ DEFAULT NOW()
             )`,
            'Created table call_analysis_v2_raw'
        );

        // E2-E4. Migrate data and drop column
        const hasRawCol = await checkExists(client,
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = 'call_analysis_v2' AND column_name = 'raw_ai_response'`
        );
        if (hasRawCol) {
            const migrated = await client.query(
                `INSERT INTO call_analysis_v2_raw (ringba_row_id, raw_ai_response)
                 SELECT ringba_row_id, raw_ai_response
                 FROM call_analysis_v2
                 WHERE raw_ai_response IS NOT NULL
                 ON CONFLICT (ringba_row_id) DO NOTHING`
            );
            console.log(`  ✓ Migrated ${migrated.rowCount} rows → call_analysis_v2_raw`);

            await run(client,
                `ALTER TABLE call_analysis_v2 DROP COLUMN raw_ai_response`,
                'Dropped raw_ai_response from call_analysis_v2'
            );
        } else {
            console.log('  ~ raw_ai_response already removed from call_analysis_v2');
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION F: Indexes, FTS, TIMESTAMPTZ
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION F: Indexes, FTS, TIMESTAMPTZ ───────────────────');

        // F1. Drop unused GIN indexes (tier6–tier10)
        for (const idx of ['idx_v2_tier6_gin', 'idx_v2_tier7_gin', 'idx_v2_tier8_gin',
            'idx_v2_tier9_gin', 'idx_v2_tier10_gin']) {
            await client.query(`DROP INDEX IF EXISTS ${idx}`);
        }
        console.log('  ✓ Dropped 5 unused GIN indexes (tier6–tier10)');

        // F2. Add partial index for dispute OR condition
        await run(client,
            `CREATE INDEX IF NOT EXISTS idx_v2_tier5_billed_not_billable
             ON call_analysis_v2(tier5_value, current_billed_status)
             WHERE tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true`,
            'Created partial index idx_v2_tier5_billed_not_billable'
        );

        // F3. Rebuild FTS index with COALESCE (call_summary now NOT NULL, but COALESCE is future-proof)
        await client.query(`DROP INDEX IF EXISTS idx_v2_summary_fts`);
        await run(client,
            `CREATE INDEX idx_v2_summary_fts
             ON call_analysis_v2 USING GIN(to_tsvector('english', COALESCE(call_summary, '')))`,
            'Rebuilt idx_v2_summary_fts with COALESCE'
        );

        // F4. TIMESTAMPTZ on call_timestamp (drop views first to unblock type change)
        if (await colType(client, 'call_analysis_v2', 'call_timestamp') === 'timestamp without time zone') {
            await client.query(`DROP VIEW IF EXISTS v_call_analysis_summary`);
            await client.query(`DROP VIEW IF EXISTS v_dispute_candidates`);
            await client.query(`DROP VIEW IF EXISTS v_billing_discrepancies`);
            await run(client,
                `ALTER TABLE call_analysis_v2
                 ALTER COLUMN call_timestamp TYPE TIMESTAMPTZ
                 USING call_timestamp AT TIME ZONE 'UTC'`,
                'call_analysis_v2.call_timestamp → TIMESTAMPTZ'
            );
        } else {
            console.log('  ~ call_analysis_v2.call_timestamp already TIMESTAMPTZ');
        }

        // F5. TIMESTAMPTZ on processed_at (drop views if still present)
        if (await colType(client, 'call_analysis_v2', 'processed_at') === 'timestamp without time zone') {
            await client.query(`DROP VIEW IF EXISTS v_call_analysis_summary`);
            await client.query(`DROP VIEW IF EXISTS v_dispute_candidates`);
            await client.query(`DROP VIEW IF EXISTS v_billing_discrepancies`);
            await run(client,
                `ALTER TABLE call_analysis_v2
                 ALTER COLUMN processed_at TYPE TIMESTAMPTZ
                 USING processed_at AT TIME ZONE 'UTC'`,
                'call_analysis_v2.processed_at → TIMESTAMPTZ'
            );
            await run(client,
                `ALTER TABLE call_analysis_v2 ALTER COLUMN processed_at SET DEFAULT NOW()`,
                'call_analysis_v2.processed_at DEFAULT → NOW()'
            );
        } else {
            console.log('  ~ call_analysis_v2.processed_at already TIMESTAMPTZ');
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION G: Fix views (remove ORDER BY)
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION G: Fix views ────────────────────────────────────');

        await run(client,
            `CREATE OR REPLACE VIEW v_call_analysis_summary AS
             SELECT
               ringba_row_id,
               ringba_caller_id,
               tier1_value  AS outcome,
               tier4_value  AS appliance_type,
               tier5_value  AS billing_status,
               dispute_recommendation,
               confidence_score,
               call_summary,
               current_revenue,
               current_billed_status,
               model_used,
               processing_time_ms,
               processed_at
             FROM call_analysis_v2`,
            'v_call_analysis_summary: removed ORDER BY'
        );

        await run(client,
            `CREATE OR REPLACE VIEW v_dispute_candidates AS
             SELECT
               ringba_row_id,
               ringba_caller_id,
               tier1_value,
               tier5_value,
               dispute_recommendation,
               dispute_recommendation_reason,
               call_summary,
               current_revenue,
               current_billed_status,
               confidence_score,
               processed_at
             FROM call_analysis_v2
             WHERE dispute_recommendation IN ('REVIEW', 'STRONG')
                OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true)`,
            'v_dispute_candidates: removed ORDER BY'
        );

        await run(client,
            `CREATE OR REPLACE VIEW v_billing_discrepancies AS
             SELECT
               ringba_row_id,
               ringba_caller_id,
               tier5_value,
               current_revenue,
               current_billed_status,
               call_summary,
               tier5_reason,
               processed_at
             FROM call_analysis_v2
             WHERE (tier5_value = 'LIKELY_BILLABLE' AND current_billed_status = false AND current_revenue = 0)
                OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true AND current_revenue > 0)`,
            'v_billing_discrepancies: removed ORDER BY'
        );

        // ═══════════════════════════════════════════════════════════════
        // SECTION H: call_tags structural
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION H: call_tags structural ────────────────────────');

        const currentCallIdType = await colType(client, 'call_tags', 'call_id');

        if (currentCallIdType === 'character varying') {
            // Check for non-integer values before type change
            const nonIntegers = await client.query(
                `SELECT call_id FROM call_tags WHERE call_id !~ '^[0-9]+$' LIMIT 5`
            );
            if (nonIntegers.rows.length > 0) {
                console.log(`  ⚠  Skipping call_id type change: non-integer values: ${nonIntegers.rows.map(r => r.call_id).join(', ')}`);
            } else {
                const hasId = await checkExists(client,
                    `SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'call_tags' AND column_name = 'id'`
                );

                if (hasId) {
                    // Drop UNIQUE constraint so we can drop id and rebuild PK
                    await client.query(
                        `ALTER TABLE call_tags DROP CONSTRAINT IF EXISTS call_tags_call_id_tag_id_key`
                    );
                    await run(client,
                        `ALTER TABLE call_tags ALTER COLUMN call_id TYPE INTEGER USING call_id::integer`,
                        'call_tags.call_id: VARCHAR → INTEGER'
                    );
                    await run(client,
                        `ALTER TABLE call_tags DROP COLUMN id`,
                        'Dropped call_tags.id (and its PK)'
                    );
                    await run(client,
                        `ALTER TABLE call_tags ADD PRIMARY KEY (call_id, tag_id)`,
                        'call_tags: promoted (call_id, tag_id) to PRIMARY KEY'
                    );
                } else {
                    // No id column, just change type and set PK
                    await client.query(
                        `ALTER TABLE call_tags DROP CONSTRAINT IF EXISTS call_tags_pkey`
                    );
                    await run(client,
                        `ALTER TABLE call_tags ALTER COLUMN call_id TYPE INTEGER USING call_id::integer`,
                        'call_tags.call_id: VARCHAR → INTEGER'
                    );
                    await run(client,
                        `ALTER TABLE call_tags ADD PRIMARY KEY (call_id, tag_id)`,
                        'call_tags: composite PK (call_id, tag_id)'
                    );
                }

                // Recreate single-column index for FK lookup performance
                await client.query(`DROP INDEX IF EXISTS idx_call_tags_call_id`);
                await run(client,
                    `CREATE INDEX idx_call_tags_call_id ON call_tags(call_id)`,
                    'Recreated idx_call_tags_call_id'
                );
            }
        } else if (currentCallIdType === 'integer') {
            console.log('  ~ call_tags.call_id already INTEGER');
            // Ensure id is dropped and composite PK exists
            const hasIdCol = await checkExists(client,
                `SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'call_tags' AND column_name = 'id'`
            );
            if (hasIdCol) {
                await client.query(`ALTER TABLE call_tags DROP CONSTRAINT IF EXISTS call_tags_pkey`);
                await client.query(`ALTER TABLE call_tags DROP CONSTRAINT IF EXISTS call_tags_call_id_tag_id_key`);
                await run(client, `ALTER TABLE call_tags DROP COLUMN id`, 'Dropped call_tags.id');
                await run(client,
                    `ALTER TABLE call_tags ADD PRIMARY KEY (call_id, tag_id)`,
                    'call_tags: composite PK (call_id, tag_id)'
                );
            } else {
                console.log('  ~ call_tags.id already dropped');
            }
        } else {
            console.log(`  ~ call_tags.call_id type is '${currentCallIdType}' — no change`);
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION I: call_tags FK to ringba_call_data
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION I: call_tags FK ─────────────────────────────────');

        const hasCTFk = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'fk_call_tags_ringba'`
        );
        if (!hasCTFk) {
            const ctOrphans = await client.query(
                `SELECT COUNT(*) AS cnt FROM call_tags ct
                 LEFT JOIN ringba_call_data r ON r.id = ct.call_id
                 WHERE r.id IS NULL`
            );
            const orphanCount = parseInt(ctOrphans.rows[0].cnt, 10);
            if (orphanCount > 0) {
                console.log(`  ⚠  Skipping FK fk_call_tags_ringba: ${orphanCount} orphaned call_id values`);
                console.log('     Clean orphans first: DELETE FROM call_tags WHERE call_id NOT IN (SELECT id FROM ringba_call_data)');
            } else {
                await run(client,
                    `ALTER TABLE call_tags
                     ADD CONSTRAINT fk_call_tags_ringba
                     FOREIGN KEY (call_id)
                     REFERENCES ringba_call_data(id) ON DELETE CASCADE`,
                    'Added FK fk_call_tags_ringba → ringba_call_data(id)'
                );
            }
        } else {
            console.log('  ~ FK fk_call_tags_ringba already exists');
        }

        // ═══════════════════════════════════════════════════════════════
        // SECTION J: call_tags constraints
        // ═══════════════════════════════════════════════════════════════
        console.log('\n── SECTION J: call_tags constraints ───────────────────────');

        // J1. DEFAULT + CHECK on confidence
        await run(client,
            `ALTER TABLE call_tags ALTER COLUMN confidence SET DEFAULT 0.85`,
            'call_tags.confidence: SET DEFAULT 0.85'
        );
        const hasCTConfCheck = await checkExists(client,
            `SELECT 1 FROM pg_constraint WHERE conname = 'chk_call_tags_confidence'`
        );
        if (!hasCTConfCheck) {
            await run(client,
                `ALTER TABLE call_tags
                 ADD CONSTRAINT chk_call_tags_confidence
                 CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))`,
                'CHECK chk_call_tags_confidence in [0,1]'
            );
        } else {
            console.log('  ~ chk_call_tags_confidence already exists');
        }

        // J2. TIMESTAMPTZ on created_at
        if (await colType(client, 'call_tags', 'created_at') === 'timestamp without time zone') {
            await run(client,
                `ALTER TABLE call_tags
                 ALTER COLUMN created_at TYPE TIMESTAMPTZ
                 USING created_at AT TIME ZONE 'UTC'`,
                'call_tags.created_at → TIMESTAMPTZ'
            );
            await run(client,
                `ALTER TABLE call_tags ALTER COLUMN created_at SET DEFAULT NOW()`,
                'call_tags.created_at DEFAULT → NOW()'
            );
        } else {
            console.log('  ~ call_tags.created_at already TIMESTAMPTZ');
        }

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║   Migration complete — all sections applied successfully ║');
        console.log('╚══════════════════════════════════════════════════════════╝');

    } catch (err) {
        console.error('\n✗ Migration failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
