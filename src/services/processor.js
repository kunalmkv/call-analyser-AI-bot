import db from '../database/connection.js';
import { processBatch } from './openRouterClient.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

/** Collect all tag values from a V5 aiResponse for call_tags mapping. */
const collectTierValuesFromResponse = (r) => {
    const values = [];
    const reasons = {};
    if (r.tier1?.value) {
        values.push(r.tier1.value);
        if (r.tier1.reason) reasons[r.tier1.value] = r.tier1.reason;
    }
    if (r.tier4?.value) {
        values.push(r.tier4.value);
        if (r.tier4.reason) reasons[r.tier4.value] = r.tier4.reason;
    }
    if (r.tier5?.value) {
        values.push(r.tier5.value);
        if (r.tier5.reason) reasons[r.tier5.value] = r.tier5.reason;
    }
    for (const key of ['tier2', 'tier3', 'tier6', 'tier7', 'tier8', 'tier9', 'tier10']) {
        const t = r[key];
        if (Array.isArray(t?.values)) {
            for (const v of t.values) {
                if (v && typeof v === 'string') values.push(v);
            }
            if (t.reasons && typeof t.reasons === 'object') {
                for (const [k, v] of Object.entries(t.reasons)) {
                    if (k && v) reasons[k] = v;
                }
            }
        }
    }
    return { values: [...new Set(values)], reasons };
};

/** Insert call_tags from V5 aiResponse using tag_value -> tag_id map.
 *  Uses a single multi-row INSERT per call instead of one round-trip per tag. */
const saveCallTagsFromV2Response = async (client, rowId, aiResponse, valueToTagId, confidenceScore) => {
    if (!valueToTagId || valueToTagId.size === 0) return;
    const { values, reasons } = collectTierValuesFromResponse(aiResponse || {});
    const confidence = typeof confidenceScore === 'number' ? confidenceScore : 0.85;

    // Build rows to insert (skip values not in tag map)
    const rows = [];
    for (const value of values) {
        const tagId = valueToTagId.get(value);
        if (tagId == null) continue;
        rows.push({ tagId, reason: reasons[value] || null });
    }
    if (rows.length === 0) return;

    // Single multi-row INSERT for the whole call
    const valuePlaceholders = rows.map(
        (_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`
    ).join(', ');
    const params = [rowId];
    for (const { tagId } of rows) {
        params.push(tagId, confidence);
    }

    // Use ON CONFLICT on constraint name instead
    await client.query(
        `INSERT INTO call_tags (call_id, tag_id, confidence)
         VALUES ${valuePlaceholders}
         ON CONFLICT ON CONSTRAINT call_tags_pkey DO UPDATE
         SET confidence = EXCLUDED.confidence`,
        params
    );
};

// Save a single V5 tiered result to call_analysis_v2 (main) + call_analysis_v2_raw (debug blob).
//
// NEW FORMAT - ALL tiers use uniform array structure with tag IDs:
//   • ALL tiers: {"value_ids":[1,2,3], "reasons":{"1":"…","2":"…","3":"…"}}
//
// The AI response comes with tag_values (strings), so we convert to tag_ids before saving.
const saveV2Result = async (client, result, callTimestamp = null, valueToTagId) => {
    const { rowId, aiResponse, processingTimeMs, modelUsed } = result;
    const r = aiResponse;

    if (!valueToTagId || valueToTagId.size === 0) {
        throw new Error('saveV2Result: valueToTagId map is required for tag ID conversion');
    }

    /**
     * Convert AI response tier (with string tag_values) to database format (with integer tag_ids)
     * @param {Object} tier - AI response tier data
     * @param {Boolean} isSingleValue - True for tiers 1, 4, 5 (convert value → [value_id])
     * @returns {String} JSON string for database storage
     */
    const convertTierToTagIds = (tier, isSingleValue = false) => {
        if (!tier) {
            return JSON.stringify({ value_ids: [], reasons: {} });
        }

        const value_ids = [];
        const reasons = {};

        if (isSingleValue) {
            // Single-value tier: {"value": "TAG_VALUE", "reason": "..."}
            // Convert to: {"value_ids": [42], "reasons": {"42": "..."}}
            const tagValue = tier.value;
            const tagReason = tier.reason;

            if (tagValue && tagValue !== 'UNKNOWN') {
                const tagId = valueToTagId.get(tagValue);
                if (tagId !== undefined) {
                    value_ids.push(tagId);
                    if (tagReason) {
                        reasons[tagId.toString()] = tagReason;
                    }
                } else {
                    logger.warn(`Unknown tag_value: "${tagValue}" - skipping`);
                }
            }
        } else {
            // Array tier: {"values": ["TAG1", "TAG2"], "reasons": {"TAG1": "...", "TAG2": "..."}}
            // Convert to: {"value_ids": [1, 2], "reasons": {"1": "...", "2": "..."}}
            const tagValues = tier.values || [];
            const tagReasons = tier.reasons || {};

            for (const tagValue of tagValues) {
                if (tagValue && typeof tagValue === 'string') {
                    const tagId = valueToTagId.get(tagValue);
                    if (tagId !== undefined) {
                        value_ids.push(tagId);
                        const reason = tagReasons[tagValue];
                        if (reason) {
                            reasons[tagId.toString()] = reason;
                        }
                    } else {
                        logger.warn(`Unknown tag_value: "${tagValue}" - skipping`);
                    }
                }
            }
        }

        return JSON.stringify({ value_ids, reasons });
    };

    await client.query(
        `INSERT INTO call_analysis_v2 (
            ringba_row_id,
            ringba_caller_id,
            call_timestamp,
            tier1_data,
            tier2_data,
            tier3_data,
            tier4_data,
            tier5_data,
            tier6_data,
            tier7_data,
            tier8_data,
            tier9_data,
            tier10_data,
            confidence_score,
            dispute_recommendation,
            dispute_recommendation_reason,
            call_summary,
            extracted_customer_info,
            system_duplicate,
            current_revenue,
            current_billed_status,
            processing_time_ms,
            model_used
        ) VALUES (
            $1,  $2,  $3,  $4,  $5,  $6,  $7,  $8,
            $9,  $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (ringba_row_id) DO UPDATE SET
            ringba_caller_id              = EXCLUDED.ringba_caller_id,
            call_timestamp                = EXCLUDED.call_timestamp,
            tier1_data                    = EXCLUDED.tier1_data,
            tier2_data                    = EXCLUDED.tier2_data,
            tier3_data                    = EXCLUDED.tier3_data,
            tier4_data                    = EXCLUDED.tier4_data,
            tier5_data                    = EXCLUDED.tier5_data,
            tier6_data                    = EXCLUDED.tier6_data,
            tier7_data                    = EXCLUDED.tier7_data,
            tier8_data                    = EXCLUDED.tier8_data,
            tier9_data                    = EXCLUDED.tier9_data,
            tier10_data                   = EXCLUDED.tier10_data,
            confidence_score              = EXCLUDED.confidence_score,
            dispute_recommendation        = EXCLUDED.dispute_recommendation,
            dispute_recommendation_reason = EXCLUDED.dispute_recommendation_reason,
            call_summary                  = EXCLUDED.call_summary,
            extracted_customer_info       = EXCLUDED.extracted_customer_info,
            system_duplicate              = EXCLUDED.system_duplicate,
            current_revenue               = EXCLUDED.current_revenue,
            current_billed_status         = EXCLUDED.current_billed_status,
            processing_time_ms            = EXCLUDED.processing_time_ms,
            model_used                    = EXCLUDED.model_used,
            processed_at                  = NOW()`,
        [
            rowId,                                   // $1
            r.ringbaCallerId || null,                // $2
            callTimestamp,                           // $3
            convertTierToTagIds(r.tier1, true),      // $4  {"value_ids":[42],"reasons":{"42":"…"}}
            convertTierToTagIds(r.tier2, false),     // $5  {"value_ids":[1,2],"reasons":{"1":"…","2":"…"}}
            convertTierToTagIds(r.tier3, false),     // $6
            convertTierToTagIds(r.tier4, true),      // $7
            convertTierToTagIds(r.tier5, true),      // $8
            convertTierToTagIds(r.tier6, false),     // $9
            convertTierToTagIds(r.tier7, false),     // $10
            convertTierToTagIds(r.tier8, false),     // $11
            convertTierToTagIds(r.tier9, false),     // $12
            convertTierToTagIds(r.tier10, false),    // $13
            r.confidence_score || 0.5,               // $14
            r.dispute_recommendation || 'NONE',      // $15
            r.dispute_recommendation_reason || null, // $16
            r.call_summary || '',                    // $17
            JSON.stringify(r.extracted_customer_info || {}), // $18
            r.system_duplicate || false,             // $19
            r.current_revenue || 0,                  // $20
            r.current_billed_status || false,        // $21
            processingTimeMs,                        // $22
            modelUsed                                // $23
        ]
    );

    // Store raw debug blob in separate table to avoid bloating the main table
    await client.query(
        `INSERT INTO call_analysis_v2_raw (ringba_row_id, raw_ai_response)
         VALUES ($1, $2)
         ON CONFLICT (ringba_row_id) DO UPDATE
         SET raw_ai_response = EXCLUDED.raw_ai_response, stored_at = NOW()`,
        [rowId, JSON.stringify(r)]
    );
};

// Fetch unprocessed rows with all fields needed for V5 prompt
// FILTER: Only fetches calls on or after 1 Feb 2026 (call_timestamp >= 2026-02-01)
const fetchUnprocessedRows = async (limit) => {
    return db.query(
        `SELECT
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
            COALESCE(e.elocal_payout, 0) as revenue,
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
            COALESCE(r.call_timestamp, CURRENT_TIMESTAMP) as call_date,
            r.campaign_id
         FROM ringba_call_data r
         LEFT JOIN elocal_call_data e ON r.ringba_id = e.ringba_id
         INNER JOIN campaigns c ON r.campaign_id = c.campaign_id AND c.ai_enabled = TRUE
         WHERE r.transcript IS NOT NULL
         AND r.transcript != ''
         AND (r.ai_processed = false OR r.ai_processed IS NULL)
         AND r.call_timestamp >= '2026-02-01'::date
         ORDER BY r.id ASC
         LIMIT $1`,
        [limit]
    );
};

// Build prompt lookup from campaign_prompts table. No global default — only campaign-specific prompts.
// Returns { map: Map<campaignId, promptText> }
const loadPrompts = async () => {
    const rows = await db.getActivePrompts();
    const map = new Map();
    for (const row of rows) {
        if (row.campaign_id != null) {
            map.set(row.campaign_id, row.system_prompt);
        }
    }
    logger.info(`Loaded ${map.size} campaign prompt(s) from campaign_prompts (no global default)`);
    return { map };
};

// Resolve system prompt for a row. Only campaign-specific; no fallback. Returns undefined if no prompt.
const getPromptForRow = (row, map) => map.get(row.campaign_id);

// Process multiple batches sequentially
const processSequentialBatches = async (batchSize, totalLimit) => {
    let totalProcessed = 0;
    let batchNumber = 1;

    // Load tag definitions for call_tags mapping (tag_value -> tag_id)
    const tagDefinitions = await db.getTagDefinitions();
    const valueToTagId = new Map();
    for (const t of tagDefinitions) {
        if (t.tag_value) valueToTagId.set(t.tag_value, t.id);
    }
    logger.info(`Loaded ${valueToTagId.size} tag_definitions with tag_value for call_tags mapping`);

    // Load campaign prompts once — only campaign-specific; no global default
    const { map: promptMap } = await loadPrompts();
    if (promptMap.size === 0) {
        throw new Error('No campaign prompts available. Add prompts via API or scripts (e.g. scripts/seed-appliance-repair-prompt.js).');
    }

    logger.info(`Starting V5 batch processing: ${totalLimit} total calls in batches of ${batchSize}`);

    while (totalProcessed < totalLimit) {
        const remaining = totalLimit - totalProcessed;
        const currentBatchSize = Math.min(batchSize, remaining);

        logger.info('='.repeat(60));
        logger.info(`Batch ${batchNumber}: Processing ${currentBatchSize} calls (${totalProcessed}/${totalLimit} total)`);
        logger.info('='.repeat(60));

        try {
            const rows = await fetchUnprocessedRows(currentBatchSize);

            if (rows.length === 0) {
                logger.info('No more unprocessed transcriptions found. Stopping.');
                break;
            }

            logger.info(`Fetched ${rows.length} rows for batch ${batchNumber}`);
            logger.info(`Row IDs: ${rows.map(t => t.id).join(', ')}`);

            // Group rows by resolved prompt so prompt-caching is maximally effective.
            // Only process rows whose campaign has an active prompt (no global fallback).
            const promptGroups = new Map(); // promptText → row[]
            let skippedNoPrompt = 0;
            for (const row of rows) {
                const prompt = getPromptForRow(row, promptMap);
                if (!prompt) {
                    skippedNoPrompt++;
                    continue;
                }
                if (!promptGroups.has(prompt)) promptGroups.set(prompt, []);
                promptGroups.get(prompt).push(row);
            }
            if (skippedNoPrompt > 0) {
                logger.info(`Skipped ${skippedNoPrompt} row(s) with no campaign prompt for this batch`);
            }
            logger.info(`Prompt groups for batch ${batchNumber}: ${promptGroups.size} unique prompt(s)`);

            // Process all groups — collect into flat successful/failed arrays
            const successful = [];
            const failed = [];
            for (const [prompt, groupRows] of promptGroups) {
                const result = await processBatch(groupRows, prompt);
                successful.push(...result.successful);
                failed.push(...result.failed);
            }

            logger.info(`Batch ${batchNumber} AI complete: ${successful.length} successful, ${failed.length} failed`);

            // Save results one at a time
            let savedInBatch = 0;
            for (const result of successful) {
                try {
                    const row = rows.find((r) => r.id === result.rowId);
                    const callTimestamp = row?.call_date ?? null;
                    await db.withTransaction(async (client) => {
                        // Save V5 tiered analysis (include call timestamp from source row, convert tag_values to tag_ids)
                        await saveV2Result(client, result, callTimestamp, valueToTagId);

                        // Save call_tags from tier values (tag_value -> tag_id)
                        await saveCallTagsFromV2Response(
                            client,
                            result.rowId,
                            result.aiResponse,
                            valueToTagId,
                            result.aiResponse?.confidence_score
                        );

                        // Mark as processed in ringba_call_data
                        await client.query(
                            `UPDATE ringba_call_data
                             SET ai_processed = true, processed_at = NOW()
                             WHERE id = $1::integer`,
                            [result.rowId]
                        );

                        const tier1 = result.aiResponse.tier1?.value || 'UNKNOWN';
                        const tier5 = result.aiResponse.tier5?.value || 'UNKNOWN';
                        logger.info(`  Batch ${batchNumber} - Row ${result.rowId}: ${tier1} / ${tier5} (${result.processingTimeMs}ms)`);
                        savedInBatch++;
                    });
                } catch (error) {
                    logger.error(`Failed to save row ${result.rowId} in batch ${batchNumber}:`);
                    logger.error(`  Error: ${error.message}`);
                    logger.error(`  Code: ${error.code}`);
                    if (error.detail) logger.error(`  Detail: ${error.detail}`);
                    console.error('Full error:', error);
                }
            }

            totalProcessed += savedInBatch;
            logger.info(`Batch ${batchNumber} done: ${savedInBatch} saved, ${failed.length} failed`);
            logger.info(`Progress: ${totalProcessed}/${totalLimit}`);

            if (totalProcessed >= totalLimit) {
                logger.info(`Reached limit of ${totalLimit}. Stopping.`);
                break;
            }

            if (rows.length < currentBatchSize) {
                logger.info('No more rows available. Stopping.');
                break;
            }

            batchNumber++;

            if (totalProcessed < totalLimit) {
                logger.info('Waiting 2 seconds before next batch...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

        } catch (error) {
            logger.error(`Error in batch ${batchNumber}:`, error);
            batchNumber++;
        }
    }

    logger.info('='.repeat(60));
    logger.info(`V5 processing complete: ${totalProcessed} calls in ${batchNumber} batches`);
    logger.info('='.repeat(60));

    return { totalProcessed, batchesCompleted: batchNumber - 1 };
};

// Generate analytics report from V2 data (delegates to the shared CTE query in dbOperations)
export const generateAnalyticsReport = async (startDate, endDate) => {
    try {
        const result = await db.getAnalyticsData(startDate, endDate);
        return result?.report || {};
    } catch (error) {
        logger.error('Failed to generate analytics report:', error);
        throw error;
    }
};

// Get high-priority calls (disputes + not billable)
export const getHighPriorityCalls = async (limit = 50) => {
    try {
        return await db.query(
            `SELECT
                ringba_row_id,
                ringba_caller_id,
                tier1_data->>'value'  AS tier1_value,
                tier5_data->>'value'  AS tier5_value,
                dispute_recommendation,
                dispute_recommendation_reason,
                call_summary,
                confidence_score,
                current_revenue,
                current_billed_status,
                processed_at
             FROM call_analysis_v2
             WHERE dispute_recommendation IN ('REVIEW', 'STRONG')
                OR tier5_data->>'value' = 'DEFINITELY_NOT_BILLABLE'
             ORDER BY
                CASE dispute_recommendation
                    WHEN 'STRONG' THEN 1
                    WHEN 'REVIEW' THEN 2
                    ELSE 3
                END,
                processed_at DESC
             LIMIT $1`,
            [limit]
        );
    } catch (error) {
        logger.error('Failed to get high-priority calls:', error);
        throw error;
    }
};

/**
 * Run a single processing job
 * This is called by the scheduler or manual trigger
 */
export const runProcessingJob = async () => {
    logger.info('Starting scheduled call processing job...');

    const batchSize = 5;
    const totalLimit = 5000; // Process all unprocessed calls (production setting)

    try {
        const { totalProcessed, batchesCompleted } = await processSequentialBatches(batchSize, totalLimit);
        logger.info(`Job completed: ${totalProcessed} calls processed in ${batchesCompleted} batches.`);
        return { totalProcessed, batchesCompleted };
    } catch (error) {
        logger.error('Error during processing job:', error);
        throw error;
    }
};

/**
 * Initialize database and preparation
 */
export const startProcessingLoop = async () => {
    try {
        await db.initDatabase();

        // Ensure call_analysis_v2 exists (fresh-install DDL — run migrate-*.js for upgrades).
        // Tier uniformity layout:
        //   • Single-value tiers 1/4/5: tierN_value (indexed), tierN_data = {"value":"…","reason":"…"}
        //   • Array tiers 2/3/6-10: tierN_data = {"values":[…],"reasons":{…}},
        //                            tierN_value = GENERATED from tierN_data
        await db.query(`
            CREATE TABLE IF NOT EXISTS call_analysis_v2 (
                ringba_row_id    INTEGER NOT NULL PRIMARY KEY,
                ringba_caller_id VARCHAR(200),
                call_timestamp   TIMESTAMPTZ,

                -- ALL tiers use only tierN_data JSONB — no separate _value shortcut columns.
                -- Single-value tiers (1,4,5): {"value":"…","reason":"…"}
                -- Array tiers (2,3,6-10):     {"values":[…],"reasons":{…}}
                tier1_data  JSONB NOT NULL DEFAULT '{"value":"UNKNOWN","reason":null}',
                tier2_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier3_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier4_data  JSONB NOT NULL DEFAULT '{"value":null,"reason":null}',
                tier5_data  JSONB NOT NULL DEFAULT '{"value":null,"reason":null}',
                tier6_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier7_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier8_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier9_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
                tier10_data JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',

                confidence_score              DECIMAL(3,2),
                dispute_recommendation        VARCHAR(20) NOT NULL DEFAULT 'NONE',
                dispute_recommendation_reason TEXT,
                call_summary                  TEXT NOT NULL DEFAULT '',
                extracted_customer_info       JSONB NOT NULL DEFAULT '{}',
                system_duplicate              BOOLEAN NOT NULL DEFAULT FALSE,
                current_revenue               DECIMAL(10,2),
                current_billed_status         BOOLEAN NOT NULL DEFAULT FALSE,
                processing_time_ms            INTEGER,
                model_used                    VARCHAR(100),
                processed_at                  TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Separate table for raw debug blobs — keeps main table lean
        await db.query(`
            CREATE TABLE IF NOT EXISTS call_analysis_v2_raw (
                ringba_row_id INTEGER PRIMARY KEY
                    REFERENCES call_analysis_v2(ringba_row_id) ON DELETE CASCADE,
                raw_ai_response JSONB NOT NULL,
                stored_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        logger.info('call_analysis_v2 + call_analysis_v2_raw tables ready');
    } catch (error) {
        if (!error.message.includes('already exists')) {
            throw error;
        }
    }
};

// Manual processing function (for API endpoint)
export const processTranscription = async (transcription, metadata) => {
    const row = {
        id: metadata.callId,
        transcription,
        duration: metadata.duration,
        caller_phone: metadata.callerPhone,
        call_date: metadata.callDate,
        revenue: 0,
        g_zip: null,
    };

    const { successful, failed } = await processBatch([row]);
    return successful[0] || failed[0];
};

export default {
    startProcessingLoop,
    generateAnalyticsReport,
    getHighPriorityCalls,
    processTranscription
};
