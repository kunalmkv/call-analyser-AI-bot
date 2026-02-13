import db from '../database/connection.js';
import { processBatch } from './openRouterClient.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

// Save a single V5 tiered result to call_analysis_v2
const saveV2Result = async (client, result) => {
    const { rowId, aiResponse, processingTimeMs, modelUsed } = result;
    const r = aiResponse;

    await client.query(
        `INSERT INTO call_analysis_v2 (
            ringba_row_id,
            ringba_caller_id,
            tier1_value,
            tier1_reason,
            tier2_data,
            tier3_data,
            tier4_value,
            tier4_reason,
            tier5_value,
            tier5_reason,
            tier6_data,
            tier7_data,
            tier8_data,
            tier9_data,
            confidence_score,
            dispute_recommendation,
            dispute_recommendation_reason,
            call_summary,
            extracted_customer_info,
            system_duplicate,
            current_revenue,
            current_billed_status,
            raw_ai_response,
            processing_time_ms,
            model_used
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25
        )
        ON CONFLICT (ringba_row_id) DO UPDATE SET
            ringba_caller_id = EXCLUDED.ringba_caller_id,
            tier1_value = EXCLUDED.tier1_value,
            tier1_reason = EXCLUDED.tier1_reason,
            tier2_data = EXCLUDED.tier2_data,
            tier3_data = EXCLUDED.tier3_data,
            tier4_value = EXCLUDED.tier4_value,
            tier4_reason = EXCLUDED.tier4_reason,
            tier5_value = EXCLUDED.tier5_value,
            tier5_reason = EXCLUDED.tier5_reason,
            tier6_data = EXCLUDED.tier6_data,
            tier7_data = EXCLUDED.tier7_data,
            tier8_data = EXCLUDED.tier8_data,
            tier9_data = EXCLUDED.tier9_data,
            confidence_score = EXCLUDED.confidence_score,
            dispute_recommendation = EXCLUDED.dispute_recommendation,
            dispute_recommendation_reason = EXCLUDED.dispute_recommendation_reason,
            call_summary = EXCLUDED.call_summary,
            extracted_customer_info = EXCLUDED.extracted_customer_info,
            system_duplicate = EXCLUDED.system_duplicate,
            current_revenue = EXCLUDED.current_revenue,
            current_billed_status = EXCLUDED.current_billed_status,
            raw_ai_response = EXCLUDED.raw_ai_response,
            processing_time_ms = EXCLUDED.processing_time_ms,
            model_used = EXCLUDED.model_used,
            processed_at = NOW()`,
        [
            rowId,
            r.ringbaCallerId || null,
            r.tier1?.value || 'UNKNOWN',
            r.tier1?.reason || null,
            JSON.stringify(r.tier2 || { values: [], reasons: {} }),
            JSON.stringify(r.tier3 || { values: [], reasons: {} }),
            r.tier4?.value || 'UNKNOWN_APPLIANCE',
            r.tier4?.reason || null,
            r.tier5?.value || 'QUESTIONABLE_BILLING',
            r.tier5?.reason || null,
            JSON.stringify(r.tier6 || { values: [], reasons: {} }),
            JSON.stringify(r.tier7 || { values: [], reasons: {} }),
            JSON.stringify(r.tier8 || { values: [], reasons: {} }),
            JSON.stringify(r.tier9 || { values: [], reasons: {} }),
            r.confidence_score || 0.5,
            r.dispute_recommendation || 'NONE',
            r.dispute_recommendation_reason || null,
            r.call_summary || '',
            JSON.stringify(r.extracted_customer_info || {}),
            r.system_duplicate || false,
            r.current_revenue || 0,
            r.current_billed_status || false,
            JSON.stringify(r),
            processingTimeMs,
            modelUsed
        ]
    );
};

// Fetch unprocessed rows with all fields needed for V5 prompt
// FILTER: Only fetches calls from 2026-02-13 onwards (fresh calls only)
const fetchUnprocessedRows = async (limit) => {
    return db.query(
        `SELECT
            id,
            "inboundCallId",
            "inboundCallId" as ringba_caller_id,
            transcript,
            REGEXP_REPLACE(
                REGEXP_REPLACE(transcript, '^A\\s*-\\s*', 'Agent: ', 'gm'),
                '^B\\s*-\\s*', 'Customer: ', 'gm'
            ) as transcription,
            CASE
                WHEN "callLengthInSeconds" ~ '^[0-9]+$'
                THEN "callLengthInSeconds"::integer
                ELSE NULL
            END as duration,
            "phoneNumber" as caller_phone,
            revenue,
            "g_zip",
            FALSE as is_duplicate,
            NULL as hung_up,
            "firstName",
            "lastName",
            address,
            street_number,
            street_name,
            street_type,
            city,
            state,
            "targetName",
            "publisherName",
            billed,
            COALESCE(call_timestamp, CURRENT_TIMESTAMP) as call_date
         FROM ringba_call_data
         WHERE transcript IS NOT NULL
         AND transcript != ''
         AND (ai_processed = false OR ai_processed IS NULL)
         AND call_timestamp >= '2026-02-13'::date
         ORDER BY id ASC
         LIMIT $1`,
        [limit]
    );
};

// Process multiple batches sequentially
const processSequentialBatches = async (batchSize, totalLimit) => {
    let totalProcessed = 0;
    let batchNumber = 1;

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

            // Process with AI (V5 prompt - no tag definitions needed)
            const { successful, failed } = await processBatch(rows);

            logger.info(`Batch ${batchNumber} AI complete: ${successful.length} successful, ${failed.length} failed`);

            // Save results one at a time
            let savedInBatch = 0;
            for (const result of successful) {
                try {
                    await db.withTransaction(async (client) => {
                        // Save V5 tiered analysis
                        await saveV2Result(client, result);

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
                    logger.error(`Failed to save row ${result.rowId} in batch ${batchNumber}:`, error.message);
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

// Generate analytics report from V2 data
export const generateAnalyticsReport = async (startDate, endDate) => {
    try {
        const report = await db.queryOne(
            `SELECT json_build_object(
                'period', json_build_object('start', $1, 'end', $2),
                'total_calls', (
                    SELECT COUNT(*) FROM call_analysis_v2
                    WHERE processed_at BETWEEN $1 AND $2
                ),
                'tier1_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT tier1_value, COUNT(*) as count
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY tier1_value ORDER BY count DESC
                    ) t
                ),
                'tier5_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT tier5_value, COUNT(*) as count,
                               AVG(current_revenue) as avg_revenue
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY tier5_value ORDER BY count DESC
                    ) t
                ),
                'tier4_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT tier4_value, COUNT(*) as count
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY tier4_value ORDER BY count DESC
                    ) t
                ),
                'dispute_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT dispute_recommendation, COUNT(*) as count
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY dispute_recommendation ORDER BY count DESC
                    ) t
                ),
                'avg_confidence', (
                    SELECT AVG(confidence_score) FROM call_analysis_v2
                    WHERE processed_at BETWEEN $1 AND $2
                )
            ) as report`,
            [startDate, endDate]
        );
        return report?.report || {};
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
                tier1_value,
                tier5_value,
                dispute_recommendation,
                dispute_recommendation_reason,
                call_summary,
                confidence_score,
                current_revenue,
                current_billed_status,
                processed_at
             FROM call_analysis_v2
             WHERE dispute_recommendation IN ('REVIEW', 'STRONG')
                OR tier5_value = 'DEFINITELY_NOT_BILLABLE'
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

        // Ensure call_analysis_v2 exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS call_analysis_v2 (
                id SERIAL PRIMARY KEY,
                ringba_row_id INTEGER NOT NULL,
                ringba_caller_id VARCHAR(200),
                tier1_value VARCHAR(50) NOT NULL,
                tier1_reason TEXT,
                tier2_data JSONB DEFAULT '{"values":[],"reasons":{}}',
                tier3_data JSONB DEFAULT '{"values":[],"reasons":{}}',
                tier4_value VARCHAR(50),
                tier4_reason TEXT,
                tier5_value VARCHAR(50),
                tier5_reason TEXT,
                tier6_data JSONB DEFAULT '{"values":[],"reasons":{}}',
                tier7_data JSONB DEFAULT '{"values":[],"reasons":{}}',
                tier8_data JSONB DEFAULT '{"values":[],"reasons":{}}',
                tier9_data JSONB DEFAULT '{"values":[],"reasons":{}}',
                confidence_score DECIMAL(3,2),
                dispute_recommendation VARCHAR(20) DEFAULT 'NONE',
                dispute_recommendation_reason TEXT,
                call_summary TEXT,
                extracted_customer_info JSONB DEFAULT '{}',
                system_duplicate BOOLEAN DEFAULT FALSE,
                current_revenue DECIMAL(10,2),
                current_billed_status BOOLEAN,
                raw_ai_response JSONB,
                processing_time_ms INTEGER,
                model_used VARCHAR(100),
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ringba_row_id)
            )
        `);
        logger.info('call_analysis_v2 table ready');
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
