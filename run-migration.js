import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import db from './src/database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
    try {
        console.log('🚀 Starting schema migration...\n');

        await db.initDatabase();

        // Read the SQL file
        const schemaPath = join(__dirname, 'src/database/schema.sql');
        const sql = readFileSync(schemaPath, 'utf-8');

        // Split by semicolons and filter out empty statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

        let created = 0;
        let skipped = 0;
        let errors = 0;

        for (const statement of statements) {
            try {
                // Show what we're executing
                const firstLine = statement.split('\n')[0].substring(0, 60);
                process.stdout.write(`  Executing: ${firstLine}... `);

                await db.query(statement);

                console.log('✅');
                created++;
            } catch (error) {
                if (error.message.includes('already exists') ||
                    error.message.includes('duplicate key')) {
                    console.log('⏭️  (already exists)');
                    skipped++;
                } else {
                    console.log(`❌ ${error.message.split('\n')[0]}`);
                    errors++;
                }
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 Migration Summary:');
        console.log(`  ✅ Created: ${created}`);
        console.log(`  ⏭️  Skipped: ${skipped}`);
        console.log(`  ❌ Errors: ${errors}`);
        console.log('='.repeat(60) + '\n');

        // Verify indexes were created
        console.log('🔍 Verifying call_analysis_v2 indexes...\n');
        const indexes = await db.query(
            `SELECT indexname, indexdef 
             FROM pg_indexes 
             WHERE schemaname = 'public' 
             AND tablename = 'call_analysis_v2' 
             ORDER BY indexname`
        );

        console.log(`Found ${indexes.length} indexes:`);
        indexes.forEach(idx => {
            console.log(`  - ${idx.indexname}`);
        });

        // Verify views were created
        console.log('\n👁️  Verifying views...\n');
        const views = await db.query(
            `SELECT table_name 
             FROM information_schema.views 
             WHERE table_schema = 'public' 
             AND table_name LIKE 'v_%'
             ORDER BY table_name`
        );

        console.log(`Found ${views.length} views:`);
        views.forEach(v => {
            console.log(`  - ${v.table_name}`);
        });

        await db.closeDatabase();

        console.log('\n✅ Migration complete!\n');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        await db.closeDatabase();
        process.exit(1);
    }
}

runMigration();
