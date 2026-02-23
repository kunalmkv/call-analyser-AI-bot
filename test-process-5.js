import { startProcessingLoop } from './src/services/processor.js';
import logger from './src/utils/logger.js';
import db from './src/database/connection.js';
import config from './src/config/index.js';

const process5Rows = async () => {
    try {
        logger.info('='.repeat(60));
        logger.info('Testing Service with 5 Rows from ringba_call_data');
        logger.info('='.repeat(60));

        await db.initDatabase();

        // Load tag definitions
        const tagDefinitions = await db.getTagDefinitions();
        logger.info(`Loaded ${tagDefinitions.length} tag definitions`);

        // Fetch exactly 5 unprocessed transcriptions
        const transcriptions = await db.getUnprocessedTranscriptions(5);

        if (transcriptions.length === 0) {
            logger.info('No unprocessed transcriptions found');
            await db.closeDatabase();
            return;
        }

        logger.info(`Processing ${transcriptions.length} transcriptions from ringba_call_data`);
        logger.info(`Row IDs: ${transcriptions.map(t => t.id).join(', ')}`);

        // Import processBatch
        const { processBatch } = await import('./src/services/openRouterClient.js');

        // Process with AI
        const { successful, failed } = await processBatch(tagDefinitions, transcriptions);

        logger.info(`Processing complete: ${successful.length} successful, ${failed.length} failed`);

        // Save results
        const saveResults = await Promise.allSettled(
            successful.map(async (result) => {
                try {
                    return await db.withTransaction(async (client) => {
                        // Save analysis
                        await client.query(
                            `INSERT INTO call_analysis 
                         (id, summary, sentiment, confidence_score, processing_time_ms, model_used)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                            [
                                result.analysis.callId,
                                result.analysis.summary,
                                result.analysis.sentiment,
                                result.analysis.confidenceScore,
                                result.analysis.processingTimeMs,
                                result.analysis.modelUsed
                            ]
                        );

                        // Save tags
                        if (result.tags.length > 0) {
                            const tagValues = result.tags.map((tag, index) =>
                                `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`
                            ).join(',');

                            const tagParams = result.tags.flatMap(tag => [
                                result.callId,
                                tag.tagId,
                                tag.confidence
                            ]);

                            await client.query(
                                `INSERT INTO call_tags (call_id, tag_id, confidence)
                             VALUES ${tagValues}
                             ON CONFLICT (call_id, tag_id) DO UPDATE 
                             SET confidence = EXCLUDED.confidence`,
                                tagParams
                            );
                        }

                        // Mark as processed in ringba_call_data
                        await client.query(
                            `UPDATE ringba_call_data 
                         SET ai_processed = true, processed_at = NOW() 
                         WHERE id = $1::integer`,
                            [result.callId]
                        );

                        logger.info(`✓ Successfully processed ringba_call_data ID: ${result.callId}`);
                        logger.info(`  Summary: ${result.analysis.summary.substring(0, 100)}...`);
                        logger.info(`  Sentiment: ${result.analysis.sentiment}`);
                        logger.info(`  Tags: ${result.tags.length} tags assigned`);
                        result.tags.forEach(tag => {
                            logger.info(`    - Tag ID ${tag.tagId}, Confidence: ${tag.confidence}`);
                        });
                    });
                } catch (error) {
                    logger.error(`Failed to save result for call ${result.callId}:`, error.message);
                    logger.error('Stack:', error.stack);
                    throw error;
                }
            })
        );

        const savedCount = saveResults.filter(r => r.status === 'fulfilled').length;
        const saveFailedCount = saveResults.filter(r => r.status === 'rejected').length;

        logger.info('='.repeat(60));
        logger.info('Final Results:');
        logger.info(`  Successfully processed and saved: ${savedCount}`);
        logger.info(`  Failed to save: ${saveFailedCount}`);
        logger.info(`  Failed during AI processing: ${failed.length}`);
        logger.info('='.repeat(60));

        // Show results
        if (savedCount > 0) {
            const results = await db.query(`
                SELECT 
                    ca.call_id,
                    ca.summary,
                    ca.sentiment,
                    ca.confidence_score,
                    COUNT(ct.id) as tag_count
                FROM call_analysis ca
                LEFT JOIN call_tags ct ON ca.call_id = ct.call_id
                WHERE ca.call_id IN (${successful.map(s => `'${s.callId}'`).join(',')})
                GROUP BY ca.call_id, ca.summary, ca.sentiment, ca.confidence_score
                ORDER BY ca.call_id
            `);

            logger.info('\\nProcessed Calls:');
            results.forEach(r => {
                logger.info(`  Call ID ${r.call_id}: ${r.sentiment} sentiment, ${r.tag_count} tags, confidence: ${r.confidence_score}`);
            });
        }

    } catch (error) {
        logger.error('Processing failed:', error);
        throw error;
    } finally {
        await db.closeDatabase();
    }
};

// Run if called directly
if (process.argv[1].endsWith('test-process-5.js')) {
    process5Rows()
        .then(() => {
            logger.info('Test completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Test failed:', error);
            process.exit(1);
        });
}

export default process5Rows;

