import db from './src/database/connection.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    // Check total count by user's query
    const res1 = await db.query(`
        SELECT COUNT(*) 
        FROM ringba_call_data 
        WHERE (ai_processed = FALSE OR ai_processed IS NULL)
          AND call_timestamp > '2026-01-31 17:22:46'
          AND campaign_id = 'CA56446512fe4e4926a05e76574a7d6963'
    `);
    console.log('Total calls matching user criteria:', res1[0].count);

    // Check how many have transcripts
    const res2 = await db.query(`
        SELECT COUNT(*) 
        FROM ringba_call_data 
        WHERE (ai_processed = FALSE OR ai_processed IS NULL)
          AND call_timestamp > '2026-01-31 17:22:46'
          AND campaign_id = 'CA56446512fe4e4926a05e76574a7d6963'
          AND transcript IS NOT NULL 
          AND transcript != ''
    `);
    console.log('...of which have transcripts:', res2[0].count);

    // Check if campaign is ai_enabled
    const res3 = await db.query(`
        SELECT ai_enabled, name 
        FROM campaigns 
        WHERE campaign_id = 'CA56446512fe4e4926a05e76574a7d6963'
    `);
    console.log('Campaign details:', res3[0]);

    // Apply the full processor.js conditions
    const res4 = await db.query(`
        SELECT COUNT(*)
        FROM ringba_call_data r
        INNER JOIN campaigns c ON r.campaign_id = c.campaign_id AND c.ai_enabled = TRUE
        WHERE r.transcript IS NOT NULL
        AND r.transcript != ''
        AND (r.ai_processed = false OR r.ai_processed IS NULL)
        AND r.call_timestamp >= '2026-02-01'::date
        AND r.campaign_id = 'CA56446512fe4e4926a05e76574a7d6963'
    `);
    console.log('Fully matching processor.js conditions:', res4[0]?.count || 0);

    // Filtered by ai_enabled missing
    console.log('Done.');
    process.exit(0);
}

check().catch((e) => { console.error(e); process.exit(1); });
