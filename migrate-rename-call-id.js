import db from './src/database/connection.js';
import logger from './src/utils/logger.js';

async function renameCallIdColumns() {
    try {
        logger.info('='.repeat(60));
        logger.info('Starting migration: Rename call_id to id in call_analysis table only');
        logger.info('='.repeat(60));
        
        await db.initDatabase();
        
        // Start transaction - only migrate call_analysis table
        await db.withTransaction(async (client) => {
            logger.info('\\n=== Migrating call_analysis table ===');
            
            // Step 1: Drop primary key constraint on call_analysis.id
            logger.info('Step 1: Dropping primary key constraint on call_analysis.id...');
            await client.query(`
                ALTER TABLE call_analysis 
                DROP CONSTRAINT IF EXISTS call_analysis_pkey
            `);
            logger.info('✓ Primary key constraint dropped');
            
            // Step 2: Rename old id column to temp_old_id
            logger.info('Step 2: Renaming old id column to temp_old_id...');
            await client.query(`
                ALTER TABLE call_analysis 
                RENAME COLUMN id TO temp_old_id
            `);
            logger.info('✓ Old id column renamed to temp_old_id');
            
            // Step 3: Rename call_id to id
            logger.info('Step 3: Renaming call_id to id...');
            await client.query(`
                ALTER TABLE call_analysis 
                RENAME COLUMN call_id TO id
            `);
            logger.info('✓ Column call_id renamed to id');
            
            // Step 4: Drop the temp_old_id column
            logger.info('Step 4: Dropping temp_old_id column...');
            await client.query(`
                ALTER TABLE call_analysis 
                DROP COLUMN temp_old_id
            `);
            logger.info('✓ Old id column dropped');
            
            // Step 5: Update index name
            logger.info('Step 5: Updating index name...');
            await client.query(`
                DROP INDEX IF EXISTS idx_call_analysis_call_id;
                CREATE INDEX IF NOT EXISTS idx_call_analysis_id ON call_analysis(id);
            `);
            logger.info('✓ Index updated');
        });
        
        // Verify the changes
        logger.info('\\n=== VERIFICATION ===');
        
        const analysisColumns = await db.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'call_analysis'
            ORDER BY ordinal_position
        `);
        
        logger.info('call_analysis columns:');
        analysisColumns.forEach(col => {
            logger.info(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        
        // Check data
        const analysisCount = await db.queryOne(`
            SELECT COUNT(*) as count FROM call_analysis
        `);
        
        logger.info(`\\nData verification:`);
        logger.info(`  call_analysis rows: ${analysisCount.count}`);
        
        logger.info('\\n' + '='.repeat(60));
        logger.info('Migration completed successfully!');
        logger.info('='.repeat(60));
        
        await db.closeDatabase();
        process.exit(0);
        
    } catch (error) {
        logger.error('Migration failed:', error);
        await db.closeDatabase();
        process.exit(1);
    }
}

// Run the migration
renameCallIdColumns();

