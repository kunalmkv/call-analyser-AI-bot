/**
 * Migration: campaign_prompts table
 *
 * 1. Creates campaign_prompts table — stores AI system prompts per campaign.
 * 2. Enforces one active prompt per campaign (partial unique index).
 * 3. Seeds a global default prompt (campaign_id = NULL) from the existing
 *    prompt/CALL_TAGGING_SYSTEM_PROMPT_V5.md file.
 *
 * Idempotent — safe to run multiple times.
 *
 * Run from project root:
 *   node scripts/migrate-add-campaign-prompts.js
 */

import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDbConfig } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║        campaign_prompts — Migration                      ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        await client.query('BEGIN');

        // ── 1. Create campaign_prompts table ──────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS campaign_prompts (
                id              SERIAL PRIMARY KEY,
                campaign_id     VARCHAR REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
                campaign_name   VARCHAR(200),
                prompt_version  VARCHAR(20)  NOT NULL DEFAULT 'V5',
                system_prompt   TEXT         NOT NULL,
                is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
                notes           TEXT,
                created_at      TIMESTAMPTZ  DEFAULT NOW(),
                updated_at      TIMESTAMPTZ  DEFAULT NOW()
            )
        `);
        console.log('✓ campaign_prompts table ready');

        // ── 2. Unique index: one active prompt per campaign ───────────────
        // Handles rows where campaign_id IS NOT NULL (campaign-specific prompts)
        const idxCampaign = await client.query(`
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'campaign_prompts'
              AND indexname  = 'idx_campaign_prompts_active_per_campaign'
        `);
        if (idxCampaign.rows.length === 0) {
            await client.query(`
                CREATE UNIQUE INDEX idx_campaign_prompts_active_per_campaign
                    ON campaign_prompts(campaign_id)
                    WHERE is_active = TRUE AND campaign_id IS NOT NULL
            `);
            console.log('✓ Created index: one active prompt per campaign');
        } else {
            console.log('  idx_campaign_prompts_active_per_campaign already exists — skipping');
        }

        // ── 3. Unique index: one global default (campaign_id IS NULL) ─────
        const idxDefault = await client.query(`
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'campaign_prompts'
              AND indexname  = 'idx_campaign_prompts_global_default'
        `);
        if (idxDefault.rows.length === 0) {
            await client.query(`
                CREATE UNIQUE INDEX idx_campaign_prompts_global_default
                    ON campaign_prompts((campaign_id IS NULL))
                    WHERE campaign_id IS NULL AND is_active = TRUE
            `);
            console.log('✓ Created index: one global default prompt');
        } else {
            console.log('  idx_campaign_prompts_global_default already exists — skipping');
        }

        // ── 4. Seed global default from V5 markdown file ──────────────────
        const existing = await client.query(`
            SELECT id FROM campaign_prompts
            WHERE campaign_id IS NULL AND is_active = TRUE
        `);

        if (existing.rows.length === 0) {
            const promptPath = join(__dirname, '..', 'prompt', 'CALL_TAGGING_SYSTEM_PROMPT_V5.md');
            const promptText = readFileSync(promptPath, 'utf-8');

            await client.query(
                `INSERT INTO campaign_prompts
                    (campaign_id, campaign_name, prompt_version, system_prompt, is_active, notes)
                 VALUES
                    (NULL, 'Global Default', 'V5', $1, TRUE,
                     'Seeded from prompt/CALL_TAGGING_SYSTEM_PROMPT_V5.md')`,
                [promptText]
            );
            console.log('✓ Seeded global default prompt (campaign_id = NULL, version = V5)');
        } else {
            console.log('  Global default prompt already seeded (id=' + existing.rows[0].id + ') — skipping');
        }

        await client.query('COMMIT');

        // ── 5. Verification ───────────────────────────────────────────────
        const summary = await client.query(`
            SELECT
                COALESCE(campaign_id::TEXT, '(global default)') AS campaign,
                campaign_name,
                prompt_version,
                is_active,
                LENGTH(system_prompt) AS prompt_chars,
                created_at
            FROM campaign_prompts
            ORDER BY campaign_id NULLS FIRST
        `);
        console.log('\n── campaign_prompts contents ────────────────────────────────');
        for (const r of summary.rows) {
            console.log(
                `  [${r.is_active ? 'active' : 'inactive'}] ${r.campaign.padEnd(25)} ` +
                `${r.campaign_name || ''} v${r.prompt_version} — ${r.prompt_chars} chars`
            );
        }

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
