import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './connection.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigration = async () => {
    try {
        logger.info('Starting database migration...');
        
        // Initialize database connection
        await db.initDatabase();
        
        // Read schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Split into individual statements (simple split on semicolons)
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        // Execute each statement
        for (const statement of statements) {
            try {
                await db.query(statement + ';');
                logger.info(`Executed: ${statement.substring(0, 50)}...`);
            } catch (error) {
                if (error.message.includes('already exists')) {
                    logger.info(`Skipping (already exists): ${statement.substring(0, 50)}...`);
                } else if (error.message.includes('duplicate key')) {
                    logger.info(`Skipping (duplicate): ${statement.substring(0, 50)}...`);
                } else {
                    throw error;
                }
            }
        }
        
        logger.info('Database migration completed successfully');
        
        // Verify tables
        const tables = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `);
        
        logger.info('Created tables:', tables.map(t => t.table_name));
        
        // Count tag definitions
        const tagCount = await db.queryOne('SELECT COUNT(*) as count FROM tag_definitions');
        logger.info(`Tag definitions loaded: ${tagCount.count}`);
        
    } catch (error) {
        logger.error('Migration failed:', error);
        throw error;
    } finally {
        await db.closeDatabase();
    }
};

// Run migration if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

export default runMigration;
