import db from './src/database/connection.js';
import { runProcessingJob, startProcessingLoop } from './src/services/processor.js';
import logger from './src/utils/logger.js';

const cleanupAndRun = async () => {
    try {
        logger.info('Starting cleanup and re-processing...');
        await db.initDatabase();

        // 1. Delete V2 analysis entries for calls from Feb 13th onwards
        // We identify these by joining with ringba_call_data to check timestamp
        const deleteQuery = `
            DELETE FROM call_analysis_v2
            WHERE ringba_row_id IN (
                SELECT id FROM ringba_call_data
                WHERE (call_timestamp >= '2026-02-01'::date OR call_timestamp IS NULL)
                AND ai_processed = true
            )
        `;
        const deleteResult = await db.query(deleteQuery);
        logger.info(`Deleted ${deleteResult.rowCount || 0} incorrect analysis records.`);

        // 2. Reset ai_processed flag in ringba_call_data
        const resetQuery = `
            UPDATE ringba_call_data
            SET ai_processed = false, processed_at = NULL
            WHERE (call_timestamp >= '2026-02-01'::date OR call_timestamp IS NULL)
            AND ai_processed = true
        `;
        const resetResult = await db.query(resetQuery);
        logger.info(`Reset ${resetResult.rowCount || 0} calls to unprocessed state.`);

        // 3. Trigger processing job
        logger.info('Triggering new processing job with corrected revenue logic...');
        // We need to initialize the processor's DB table check
        await startProcessingLoop();

        // Run the job
        await runProcessingJob();

        logger.info('Cleanup and re-processing complete.');
        process.exit(0);
    } catch (error) {
        logger.error('Cleanup/Run failed:', error);
        process.exit(1);
    }
};

cleanupAndRun();
