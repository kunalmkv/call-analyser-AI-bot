/**
 * Verify full-text search index on call_analysis_v2.call_summary
 *
 * 1. Checks that idx_v2_summary_fts exists.
 * 2. If missing, creates it (CREATE INDEX IF NOT EXISTS).
 * 3. Runs EXPLAIN on a sample keyword query to confirm the planner uses the index.
 *
 * Run from project root:
 *   node scripts/verify-fts-index.js
 */

import 'dotenv/config';
import pg from 'pg';
import { getDbConfig } from '../src/config/index.js';

const { Pool } = pg;

const main = async () => {
    const pool = new Pool(getDbConfig());
    const client = await pool.connect();

    try {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║   Verify FTS index on call_analysis_v2.call_summary     ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        // 1. Check if index exists
        const idx = await client.query(
            `SELECT indexname, indexdef
             FROM pg_indexes
             WHERE tablename = 'call_analysis_v2' AND indexname = 'idx_v2_summary_fts'`
        );

        if (idx.rows.length === 0) {
            console.log('Index idx_v2_summary_fts not found. Creating it...');
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_v2_summary_fts ON call_analysis_v2
                    USING GIN(to_tsvector('english', COALESCE(call_summary, '')))
            `);
            console.log('✓ Created idx_v2_summary_fts\n');
        } else {
            console.log('✓ Index exists: idx_v2_summary_fts');
            console.log('  Definition:', idx.rows[0].indexdef?.slice(0, 80) + '...\n');
        }

        // 2. Run EXPLAIN on a sample keyword query
        const keyword = 'refrigerator';
        console.log(`Running EXPLAIN for keyword search: "${keyword}"\n`);
        const explain = await client.query(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
             SELECT ringba_row_id, call_summary
             FROM call_analysis_v2
             WHERE to_tsvector('english', COALESCE(call_summary, '')) @@ plainto_tsquery('english', $1)
             LIMIT 10`,
            [keyword]
        );

        const planText = explain.rows.map((r) => Object.values(r)[0]).join('\n');
        console.log(planText);

        const usesIndex = planText.includes('idx_v2_summary_fts');
        const seqScan = planText.includes('Seq Scan');
        if (usesIndex && !seqScan) {
            console.log('\n✓ Planner is using idx_v2_summary_fts (Bitmap Index Scan or Index Scan).');
        } else if (seqScan) {
            console.log('\n⚠ Plan shows Seq Scan. Index may not be used (e.g. empty table or small dataset).');
        } else {
            console.log('\n  Check plan above for index usage.');
        }

        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║                     Verification complete                ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
    } catch (err) {
        console.error('\n✗ Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

main();
