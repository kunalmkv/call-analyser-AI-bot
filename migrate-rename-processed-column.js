import db from './src/database/connection.js';
import logger from './src/utils/logger.js';

async function renameProcessedColumn() {
    try {
        logger.info('='.repeat(60));
        logger.info('Starting migration: Rename "processed" to "ai_processed" in ringba_call_data');
        logger.info('='.repeat(60));
        
        await db.initDatabase();
        
        // Check if column already exists
        const existingColumn = await db.queryOne(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'ringba_call_data'
            AND column_name = 'ai_processed'
        `);
        
        if (existingColumn) {
            logger.info('Column "ai_processed" already exists. Skipping migration.');
            await db.closeDatabase();
            return;
        }
        
        // Start transaction
        await db.withTransaction(async (client) => {
            logger.info('\\n=== STEP 1: Renaming column ===');
            
            // Rename processed to ai_processed
            logger.info('Renaming "processed" to "ai_processed"...');
            await client.query(`
                ALTER TABLE ringba_call_data 
                RENAME COLUMN processed TO ai_processed
            `);
            logger.info('✓ Column renamed successfully');
            
            // Verify the rename
            const columns = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'ringba_call_data'
                AND column_name IN ('ai_processed', 'processed')
                ORDER BY column_name
            `);
            
            logger.info('\\n=== VERIFICATION ===');
            columns.forEach(col => {
                logger.info(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
                if (col.column_default) {
                    logger.info(`    Default: ${col.column_default}`);
                }
            });
            
            // Check data preservation
            const stats = await client.queryOne(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN ai_processed = true THEN 1 END) as ai_processed_true,
                    COUNT(CASE WHEN ai_processed = false THEN 1 END) as ai_processed_false,
                    COUNT(CASE WHEN ai_processed IS NULL THEN 1 END) as ai_processed_null
                FROM ringba_call_data
                WHERE transcript IS NOT NULL
                AND transcript != ''
            `);
            
            logger.info('\\n=== DATA VERIFICATION ===');
            logger.info(`Total rows with transcripts: ${stats.total}`);
            logger.info(`ai_processed = true: ${stats.ai_processed_true}`);
            logger.info(`ai_processed = false: ${stats.ai_processed_false}`);
            logger.info(`ai_processed = NULL: ${stats.ai_processed_null}`);
            
            if (stats.total > 0) {
                logger.info('✓ Data preserved successfully');
            }
        });
        
        logger.info('\\n' + '='.repeat(60));
        logger.info('Migration completed successfully!');
        logger.info('='.repeat(60));
        logger.info('\\n⚠ IMPORTANT: Update all code references from "processed" to "ai_processed"');
        
        await db.closeDatabase();
        process.exit(0);
        
    } catch (error) {
        logger.error('Migration failed:', error);
        await db.closeDatabase();
        process.exit(1);
    }
}

// Run the migration
renameProcessedColumn();

