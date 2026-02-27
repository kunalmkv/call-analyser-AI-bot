/**
 * UPDATED DATABASE CONNECTION WITH TAG ID SUPPORT
 *
 * This file contains the updated query functions that work with the new tag ID format.
 * After testing, replace connection.js with this file.
 *
 * Key changes:
 * - All tier queries JOIN with tag_definitions to get human-readable tag_values
 * - searchByTier works with tag_id filtering (requires tag_value → tag_id lookup)
 * - All views updated to include JOINs
 */

import pg from 'pg';
import { getDbConfig } from '../config/index.js';
import { curry, pipe, map, prop } from 'ramda';

const { Pool } = pg;

// Create connection pool
let pool = null;

// Initialize database connection
export const initDatabase = async () => {
    if (!pool) {
        pool = new Pool(getDbConfig());

        // Test connection
        try {
            const client = await pool.connect();
            console.log('Database connected successfully');
            client.release();
        } catch (error) {
            console.error('Failed to connect to database:', error);
            throw error;
        }
    }
    return pool;
};

// Close database connection
export const closeDatabase = async () => {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('Database connection closed');
    }
};

// Generic query executor (curried for partial application)
export const query = curry(async (queryText, params = []) => {
    if (!pool) {
        await initDatabase();
    }

    try {
        const result = await pool.query(queryText, params);
        return result.rows;
    } catch (error) {
        console.error('Query error:', error);
        throw error;
    }
});

// Generic single row query
export const queryOne = curry(async (queryText, params = []) => {
    const rows = await query(queryText, params);
    return rows[0] || null;
});

// Transaction helper
export const withTransaction = async (callback) => {
    if (!pool) {
        await initDatabase();
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Tag definitions (used by legacy batch scripts and APIs)
export const getTagDefinitions = () =>
    query('SELECT id, priority, tag_name, tag_value, description, importance, color_code, created_at FROM tag_definitions ORDER BY id');

// Campaign prompts — returns active campaign-specific prompts only (no global default).
// Callers build a Map from campaign_id to system_prompt.
export const getActivePrompts = () =>
    query(
        `SELECT campaign_id, campaign_name, prompt_version, system_prompt
         FROM campaign_prompts
         WHERE is_active = TRUE AND campaign_id IS NOT NULL
         ORDER BY campaign_id`
    );

// ── campaign_prompts API helpers ─────────────────────────────────────────────

// List all prompts (all versions) with metadata only — omits system_prompt body
// to keep the list response lean. Pass campaign_id to filter.
export const listPrompts = (campaignId = undefined) => {
    if (campaignId !== undefined) {
        return query(
            `SELECT id, campaign_id, campaign_name, prompt_version, is_active, notes,
                    LENGTH(system_prompt) AS prompt_chars, created_at, updated_at
             FROM campaign_prompts
             WHERE campaign_id = $1
             ORDER BY created_at DESC`,
            [campaignId]
        );
    }
    return query(
        `SELECT id, campaign_id, campaign_name, prompt_version, is_active, notes,
                LENGTH(system_prompt) AS prompt_chars, created_at, updated_at
         FROM campaign_prompts
         ORDER BY campaign_id NULLS FIRST, created_at DESC`
    );
};

// Get a single prompt by id — includes the full system_prompt text.
export const getPromptById = (id) =>
    queryOne(
        `SELECT id, campaign_id, campaign_name, prompt_version, is_active, notes,
                system_prompt, LENGTH(system_prompt) AS prompt_chars, created_at, updated_at
         FROM campaign_prompts WHERE id = $1`,
        [id]
    );

// Create a new prompt version:
// 1. Deactivate any currently-active row for the same campaign_id (or global default).
// 2. Insert the new active row.
// Returns the newly created row id.
export const createPromptVersion = async (campaignId, campaignName, promptVersion, systemPrompt, notes) => {
    if (!pool) await initDatabase();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Deactivate existing active prompt for this campaign (or global default)
        if (campaignId === null || campaignId === undefined) {
            await client.query(
                `UPDATE campaign_prompts
                 SET is_active = FALSE, updated_at = NOW()
                 WHERE campaign_id IS NULL AND is_active = TRUE`
            );
        } else {
            await client.query(
                `UPDATE campaign_prompts
                 SET is_active = FALSE, updated_at = NOW()
                 WHERE campaign_id = $1 AND is_active = TRUE`,
                [campaignId]
            );
        }

        // Insert new active row
        const result = await client.query(
            `INSERT INTO campaign_prompts
                 (campaign_id, campaign_name, prompt_version, system_prompt, is_active, notes)
             VALUES ($1, $2, $3, $4, TRUE, $5)
             RETURNING id, campaign_id, campaign_name, prompt_version, is_active, notes,
                       LENGTH(system_prompt) AS prompt_chars, created_at, updated_at`,
            [campaignId ?? null, campaignName ?? null, promptVersion ?? 'V5', systemPrompt, notes ?? null]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Update lightweight metadata (campaign_name, notes, prompt_version) for an existing row.
// Does NOT touch system_prompt — use createPromptVersion for that.
export const updatePromptMeta = (id, { campaign_name, notes, prompt_version } = {}) =>
    queryOne(
        `UPDATE campaign_prompts
         SET campaign_name   = COALESCE($2, campaign_name),
             notes           = COALESCE($3, notes),
             prompt_version  = COALESCE($4, prompt_version),
             updated_at      = NOW()
         WHERE id = $1
         RETURNING id, campaign_id, campaign_name, prompt_version, is_active, notes,
                   LENGTH(system_prompt) AS prompt_chars, updated_at`,
        [id, campaign_name ?? null, notes ?? null, prompt_version ?? null]
    );

// Deactivate a prompt row (soft delete — row kept for history).
export const deactivatePrompt = (id) =>
    queryOne(
        `UPDATE campaign_prompts
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = $1
         RETURNING id, campaign_id, is_active, updated_at`,
        [id]
    );

// ══════════════════════════════════════════════════════════════════════════════
// V2 Database Operations for Tier-Based Queries (UPDATED FOR TAG IDS)
// ══════════════════════════════════════════════════════════════════════════════

export const dbOperations = {
    // Get analysis by ringba row ID (with human-readable tag values via JOINs)
    getAnalysisByRowId: async (rowId) => {
        const result = await queryOne(
            `SELECT
                v2.*,
                td1.tag_value AS tier1_tag_value,
                td4.tag_value AS tier4_tag_value,
                td5.tag_value AS tier5_tag_value
             FROM call_analysis_v2 v2
             LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
             LEFT JOIN tag_definitions td4 ON td4.id = (v2.tier4_data->'value_ids'->>0)::int
             LEFT JOIN tag_definitions td5 ON td5.id = (v2.tier5_data->'value_ids'->>0)::int
             WHERE v2.ringba_row_id = $1`,
            [rowId]
        );
        return result;
    },

    /**
     * Search by tier value (with tag ID conversion)
     * @param {number} tierNumber - Tier number (1-10)
     * @param {string} value - Tag value to search for (will be converted to tag_id)
     * @param {number} limit - Max results
     */
    searchByTier: async (tierNumber, value, limit = 100) => {
        const VALID_TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const n = Number(tierNumber);
        if (!VALID_TIERS.includes(n)) {
            throw new Error(`Invalid tier number: ${tierNumber}. Must be 1–10.`);
        }

        const dataCol = `tier${n}_data`;

        // First, look up the tag_id for the given tag_value
        const tagRow = await queryOne(
            `SELECT id FROM tag_definitions WHERE tag_value = $1 LIMIT 1`,
            [value]
        );

        if (!tagRow) {
            // Tag value not found in definitions, return empty result
            console.warn(`searchByTier: Unknown tag_value "${value}"`);
            return [];
        }

        const tagId = tagRow.id;

        // Query using tag_id in the value_ids array
        return query(
            `SELECT
                v2.ringba_row_id,
                v2.ringba_caller_id,
                td1.tag_value AS tier1_value,
                td4.tag_value AS tier4_value,
                td5.tag_value AS tier5_value,
                v2.${dataCol},
                v2.call_summary,
                v2.confidence_score,
                v2.processed_at
             FROM call_analysis_v2 v2
             LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
             LEFT JOIN tag_definitions td4 ON td4.id = (v2.tier4_data->'value_ids'->>0)::int
             LEFT JOIN tag_definitions td5 ON td5.id = (v2.tier5_data->'value_ids'->>0)::int
             WHERE v2.${dataCol}->'value_ids' @> $1::jsonb
             ORDER BY v2.processed_at DESC
             LIMIT $2`,
            [JSON.stringify([tagId]), limit]
        );
    },

    // Get dispute candidates (uses view, which now has JOINs)
    getDisputeCandidates: (limit = 50) =>
        query(
            `SELECT * FROM v_dispute_candidates LIMIT $1`,
            [limit]
        ),

    // Get billing discrepancies (uses view, which now has JOINs)
    getBillingDiscrepancies: (limit = 50) =>
        query(
            `SELECT * FROM v_billing_discrepancies LIMIT $1`,
            [limit]
        ),

    // Search call summaries with full-text search (uses idx_v2_summary_fts GIN index)
    searchCallSummaries: async (searchTerm, limit = 50) =>
        query(
            `SELECT
                v2.ringba_row_id,
                v2.ringba_caller_id,
                v2.tier1_data->>'value' AS tier1_value,
                v2.tier5_data->>'value' AS tier5_value,
                v2.call_summary,
                ts_rank(to_tsvector('english', COALESCE(v2.call_summary, '')), plainto_tsquery('english', $1)) AS rank
             FROM call_analysis_v2 v2
             WHERE to_tsvector('english', COALESCE(v2.call_summary, '')) @@ plainto_tsquery('english', $1)
             ORDER BY rank DESC, v2.processed_at DESC
             LIMIT $2`,
            [searchTerm, limit]
        ),

    // Query by tier2 quality flags (using tag_value → tag_id conversion)
    getQualityFlagCalls: async (flag, limit = 100) => {
        const tagRow = await queryOne(
            `SELECT id FROM tag_definitions WHERE tag_value = $1 LIMIT 1`,
            [flag]
        );
        if (!tagRow) return [];

        return query(
            `SELECT
                v2.ringba_row_id,
                v2.ringba_caller_id,
                td1.tag_value AS tier1_value,
                v2.tier2_data,
                v2.call_summary,
                v2.processed_at
             FROM call_analysis_v2 v2
             LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
             WHERE v2.tier2_data->'value_ids' @> $1::jsonb
             ORDER BY v2.processed_at DESC
             LIMIT $2`,
            [JSON.stringify([tagRow.id]), limit]
        );
    },

    // Query by tier3 customer intent (using tag_value → tag_id conversion)
    getIntentCalls: async (intent, limit = 100) => {
        const tagRow = await queryOne(
            `SELECT id FROM tag_definitions WHERE tag_value = $1 LIMIT 1`,
            [intent]
        );
        if (!tagRow) return [];

        return query(
            `SELECT
                v2.ringba_row_id,
                v2.ringba_caller_id,
                td1.tag_value AS tier1_value,
                v2.tier3_data,
                td4.tag_value AS tier4_value,
                v2.call_summary,
                v2.processed_at
             FROM call_analysis_v2 v2
             LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
             LEFT JOIN tag_definitions td4 ON td4.id = (v2.tier4_data->'value_ids'->>0)::int
             WHERE v2.tier3_data->'value_ids' @> $1::jsonb
             ORDER BY v2.processed_at DESC
             LIMIT $2`,
            [JSON.stringify([tagRow.id]), limit]
        );
    },

    // Get analytics report data — single MATERIALIZED CTE scan instead of 5 independent scans
    getAnalyticsData: (startDate, endDate) =>
        queryOne(
            `WITH base AS MATERIALIZED (
                SELECT
                    v2.tier1_data->'value_ids'->>0 AS tier1_id,
                    v2.tier4_data->'value_ids'->>0 AS tier4_id,
                    v2.tier5_data->'value_ids'->>0 AS tier5_id,
                    td1.tag_value AS tier1,
                    td4.tag_value AS tier4,
                    td5.tag_value AS tier5,
                    v2.dispute_recommendation,
                    v2.confidence_score,
                    v2.current_revenue
                FROM call_analysis_v2 v2
                LEFT JOIN tag_definitions td1 ON td1.id = v2.tier1_data->'value_ids'->>0::int
                LEFT JOIN tag_definitions td4 ON td4.id = v2.tier4_data->'value_ids'->>0::int
                LEFT JOIN tag_definitions td5 ON td5.id = v2.tier5_data->'value_ids'->>0::int
                WHERE v2.processed_at BETWEEN $1 AND $2
             )
             SELECT json_build_object(
                'period',           json_build_object('start', $1, 'end', $2),
                'total_calls',      (SELECT COUNT(*) FROM base),
                'tier1_breakdown',  (
                    SELECT json_agg(row_to_json(t))
                    FROM (SELECT tier1 AS tier1_value, COUNT(*) AS count
                          FROM base GROUP BY tier1 ORDER BY count DESC) t
                ),
                'tier5_breakdown',  (
                    SELECT json_agg(row_to_json(t))
                    FROM (SELECT tier5 AS tier5_value, COUNT(*) AS count,
                                 AVG(current_revenue) AS avg_revenue
                          FROM base GROUP BY tier5 ORDER BY count DESC) t
                ),
                'tier4_breakdown',  (
                    SELECT json_agg(row_to_json(t))
                    FROM (SELECT tier4 AS tier4_value, COUNT(*) AS count
                          FROM base GROUP BY tier4 ORDER BY count DESC) t
                ),
                'dispute_breakdown',(
                    SELECT json_agg(row_to_json(t))
                    FROM (SELECT dispute_recommendation, COUNT(*) AS count
                          FROM base GROUP BY dispute_recommendation ORDER BY count DESC) t
                ),
                'avg_confidence',   (SELECT AVG(confidence_score) FROM base)
             ) AS report`,
            [startDate, endDate]
        )
};

export default {
    initDatabase,
    closeDatabase,
    query,
    queryOne,
    withTransaction,
    getTagDefinitions,
    getActivePrompts,
    listPrompts,
    getPromptById,
    createPromptVersion,
    updatePromptMeta,
    deactivatePrompt,
    ...dbOperations
};
