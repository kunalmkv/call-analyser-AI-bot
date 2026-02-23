import processor from './src/services/processor.js';
import db from './src/database/connection.js';
import logger from './src/utils/logger.js';

async function processNext20Calls() {
    try {
        logger.info('='.repeat(60));
        logger.info('Starting batch processing for next 20 calls');
        logger.info('='.repeat(60));
        
        // Initialize database
        await db.initDatabase();
        
        // Load tag definitions
        const tagDefinitions = await db.getTagDefinitions();
        logger.info(`Loaded ${tagDefinitions.length} tag definitions`);
        
        // Process 20 calls in batches of 5 sequentially
        const batchSize = 5;
        const totalLimit = 20;
        
        // Import the sequential batch processing function
        // We'll use a modified version that doesn't require the full service
        let totalProcessed = 0;
        let batchNumber = 1;
        
        logger.info(`Starting sequential batch processing: ${totalLimit} total calls in batches of ${batchSize}`);
        
        while (totalProcessed < totalLimit) {
            const remaining = totalLimit - totalProcessed;
            const currentBatchSize = Math.min(batchSize, remaining);
            
            logger.info('='.repeat(60));
            logger.info(`Batch ${batchNumber}: Processing ${currentBatchSize} calls (${totalProcessed}/${totalLimit} total processed)`);
            logger.info('='.repeat(60));
            
            try {
                // Fetch exactly currentBatchSize unprocessed transcriptions
                const transcriptions = await db.getUnprocessedTranscriptions(currentBatchSize);
                
                if (transcriptions.length === 0) {
                    logger.info('No more unprocessed transcriptions found. Stopping.');
                    break;
                }
                
                logger.info(`Fetched ${transcriptions.length} transcriptions for batch ${batchNumber}`);
                logger.info(`Row IDs: ${transcriptions.map(t => t.id).join(', ')}`);
                
                // Process with AI
                const { processBatch } = await import('./src/services/openRouterClient.js');
                const { successful, failed } = await processBatch(tagDefinitions, transcriptions);
                
                logger.info(`Batch ${batchNumber} AI processing complete: ${successful.length} successful, ${failed.length} failed`);
                
                // Save results to database sequentially
                let savedInBatch = 0;
                for (const result of successful) {
                    try {
                        await db.withTransaction(async (client) => {
                            // Save analysis (handle duplicates with ON CONFLICT)
                            await client.query(
                                `INSERT INTO call_analysis 
                                 (id, summary, sentiment, confidence_score, processing_time_ms, model_used)
                                 VALUES ($1, $2, $3, $4, $5, $6)
                                 ON CONFLICT (id) DO UPDATE
                                 SET summary = EXCLUDED.summary,
                                     sentiment = EXCLUDED.sentiment,
                                     confidence_score = EXCLUDED.confidence_score,
                                     processing_time_ms = EXCLUDED.processing_time_ms,
                                     model_used = EXCLUDED.model_used,
                                     processed_at = CURRENT_TIMESTAMP`,
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
                            
                            logger.info(`✓ Batch ${batchNumber} - Processed call ID: ${result.callId} (${result.analysis.sentiment}, ${result.tags.length} tags)`);
                            savedInBatch++;
                        });
                    } catch (error) {
                        logger.error(`Failed to save result for call ${result.callId} in batch ${batchNumber}:`, error.message);
                    }
                }
                
                totalProcessed += savedInBatch;
                
                logger.info(`Batch ${batchNumber} complete: ${savedInBatch} saved, ${failed.length} failed`);
                logger.info(`Total progress: ${totalProcessed}/${totalLimit} calls processed`);
                
                // If we've reached the limit, stop
                if (totalProcessed >= totalLimit) {
                    logger.info(`Reached limit of ${totalLimit} calls. Stopping batch processing.`);
                    break;
                }
                
                // If no more transcriptions available, stop
                if (transcriptions.length < currentBatchSize) {
                    logger.info('No more transcriptions available. Stopping.');
                    break;
                }
                
                batchNumber++;
                
                // Small delay between batches
                if (totalProcessed < totalLimit) {
                    logger.info('Waiting 2 seconds before next batch...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                logger.error(`Error processing batch ${batchNumber}:`, error);
                batchNumber++;
            }
        }
        
        logger.info('='.repeat(60));
        logger.info(`Sequential batch processing complete: ${totalProcessed} total calls processed in ${batchNumber} batches`);
        logger.info('='.repeat(60));
        
        // Final summary
        const stats = await db.queryOne(`
            SELECT 
                COUNT(*) as total_processed,
                COUNT(DISTINCT ca.id) as analyzed,
                COUNT(DISTINCT ct.call_id) as tagged
            FROM ringba_call_data rcd
            LEFT JOIN call_analysis ca ON rcd.id::text = ca.id
            LEFT JOIN call_tags ct ON rcd.id::text = ct.call_id
            WHERE rcd.ai_processed = true
        `);
        
        logger.info('=== FINAL STATISTICS ===');
        logger.info(`Total processed in ringba_call_data: ${stats.total_processed}`);
        logger.info(`Calls analyzed: ${stats.analyzed}`);
        logger.info(`Calls with tags: ${stats.tagged}`);
        
        await db.closeDatabase();
        process.exit(0);
        
    } catch (error) {
        logger.error('Fatal error:', error);
        await db.closeDatabase();
        process.exit(1);
    }
}

// Run the processing
processNext20Calls();

