/**
 * Seed: No global prompt + Appliance repair campaign prompt
 *
 * 1. Deactivates any active global prompt (campaign_id = NULL).
 * 2. Looks up the existing "Appliance repair" campaign in campaigns (by name) — does NOT create one.
 * 3. Adds the active AI prompt for that campaign from prompt/CALL_TAGGING_SYSTEM_PROMPT_V5.md.
 *
 * Idempotent — safe to run multiple times.
 *
 * Run from project root:
 *   node scripts/seed-appliance-repair-prompt.js
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
        console.log('║   No global prompt + Appliance repair campaign prompt    ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        await client.query('BEGIN');

        // ── 1. Deactivate any active global prompt ────────────────────────
        const globalResult = await client.query(`
            UPDATE campaign_prompts
            SET is_active = FALSE, updated_at = NOW()
            WHERE campaign_id IS NULL AND is_active = TRUE
            RETURNING id
        `);
        if (globalResult.rowCount > 0) {
            console.log(`✓ Deactivated ${globalResult.rowCount} global prompt(s) (campaign_id = NULL)`);
        } else {
            console.log('  No active global prompt to deactivate');
        }

        // ── 2. Use existing Appliance repair campaign (do not create) ───────
        const campaignRow = await client.query(
            `SELECT campaign_id, name FROM campaigns
             WHERE TRIM(LOWER(name)) = 'appliance repair'
             ORDER BY created_at ASC
             LIMIT 1`
        );
        if (campaignRow.rows.length === 0) {
            await client.query('ROLLBACK');
            console.error('\n✗ No campaign named "Appliance repair" found in campaigns table. Add it there first (do not create from this script).');
            process.exit(1);
        }
        const { campaign_id: campaignId, name: campaignName } = campaignRow.rows[0];
        console.log(`✓ Using existing campaign: ${campaignId} ("${campaignName}")`);

        // ── 3. Deactivate any existing active prompt for this campaign ───────
        await client.query(
            `UPDATE campaign_prompts
             SET is_active = FALSE, updated_at = NOW()
             WHERE campaign_id = $1 AND is_active = TRUE`,
            [campaignId]
        );

        // ── 4. Insert new active prompt from V5 file ───────────────────────
        const promptPath = join(__dirname, '..', 'prompt', 'CALL_TAGGING_SYSTEM_PROMPT_V5.md');
        const promptText = readFileSync(promptPath, 'utf-8');

        await client.query(
            `INSERT INTO campaign_prompts
                (campaign_id, campaign_name, prompt_version, system_prompt, is_active, notes)
             VALUES ($1, $2, 'V5', $3, TRUE, 'Seeded from prompt/CALL_TAGGING_SYSTEM_PROMPT_V5.md')`,
            [campaignId, campaignName, promptText]
        );
        console.log(`✓ Added active prompt for "${campaignName}" (${promptText.length} chars)`);

        await client.query('COMMIT');

        // ── 5. Verification ───────────────────────────────────────────────
        const summary = await client.query(`
            SELECT campaign_id, campaign_name, prompt_version, is_active,
                   LENGTH(system_prompt) AS prompt_chars
            FROM campaign_prompts
            WHERE is_active = TRUE
            ORDER BY campaign_id
        `);
        console.log('\n── Active campaign prompts ─────────────────────────────────');
        for (const r of summary.rows) {
            console.log(`  ${r.campaign_id}  "${r.campaign_name}"  v${r.prompt_version}  ${r.prompt_chars} chars`);
        }

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║                     Seed complete                        ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n✗ Seed failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
