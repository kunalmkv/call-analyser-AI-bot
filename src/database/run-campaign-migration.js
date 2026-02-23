import db from './connection.js';

const runMigration = async () => {
    try {
        console.log('Starting campaign migration...');
        await db.initDatabase();

        // 1. Add ai_enabled column if not exists
        console.log('Adding ai_enabled column to campaigns table...');
        await db.query(`
            ALTER TABLE campaigns 
            ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT FALSE
        `);

        // 2. Fetch distinct campaign IDs from ringba_call_data
        console.log('Fetching distinct campaigns from ringba_call_data...');
        const distinctCampaigns = await db.query(`
            SELECT DISTINCT campaign_id, "campaignName"
            FROM ringba_call_data
            WHERE campaign_id IS NOT NULL
        `);

        console.log(`Found ${distinctCampaigns.length} distinct campaigns.`);

        // 3. Populate campaigns table (avoiding duplicates manually since no unique constraint)
        let addedCount = 0;
        let updatedCount = 0;

        for (const row of distinctCampaigns) {
            const { campaign_id, campaignName } = row;

            // Check if exists
            const existing = await db.query(
                `SELECT id FROM campaigns WHERE campaign_id = $1`,
                [campaign_id]
            );

            if (existing.rowCount === 0) {
                // Insert new
                await db.query(`
                    INSERT INTO campaigns (id, campaign_id, name, ai_enabled, created_at, updated_at)
                    VALUES (gen_random_uuid(), $1, $2, TRUE, NOW(), NOW())
                `, [campaign_id, campaignName || 'Unknown Campaign']);
                addedCount++;
            } else {
                // Already exists, just ensure ai_enabled is TRUE for now (per plan to keep running)
                // Or should we leave it if it was manually set? 
                // Plan said: "set them to TRUE (active) by default so the system works out-of-the-box."
                // I will update it to TRUE only if it's currently NULL (which default false handles) 
                // But wait, column is new, so it will be FALSE by default. 
                // I'll set it to TRUE to ensure continuity.
                await db.query(`
                    UPDATE campaigns SET ai_enabled = TRUE 
                    WHERE campaign_id = $1
                `, [campaign_id]);
                updatedCount++;
            }
        }

        console.log(`Migration complete: ${addedCount} added, ${updatedCount} updated.`);
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

runMigration();
