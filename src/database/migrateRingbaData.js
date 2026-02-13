import db from './connection.js';
import logger from '../utils/logger.js';

/**
 * Clean transcript by removing "A -" and "B -" prefixes
 * and formatting it for better readability
 */
const cleanTranscript = (transcript) => {
    if (!transcript) return null;
    
    // Remove "A -" and "B -" prefixes and clean up
    return transcript
        .replace(/^A\s*-\s*/gm, 'Agent: ')
        .replace(/^B\s*-\s*/gm, 'Customer: ')
        .replace(/\n+/g, '\n')
        .trim();
};

/**
 * Construct call_date from date components
 */
const constructCallDate = (row) => {
    const year = row.callYear || '2024';
    const month = row.callMonth?.padStart(2, '0') || '01';
    const day = row.callDay?.padStart(2, '0') || '01';
    const hour = row.callHour?.padStart(2, '0') || '00';
    const minute = row.callMinute?.padStart(2, '0') || '00';
    const second = row.callSecond?.padStart(2, '0') || '00';
    
    try {
        const dateString = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        return new Date(dateString);
    } catch (error) {
        logger.warn(`Invalid date for row ${row.id}, using current date`);
        return new Date();
    }
};

/**
 * Generate unique call_id from inboundCallId and timestamp
 * If duplicates exist, append row id to make it unique
 */
const generateCallId = (inboundCallId, callDate, rowId, existingIds) => {
    // Base call_id: inboundCallId_timestamp
    const timestamp = callDate.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    let baseCallId = `${inboundCallId}_${timestamp}`;
    
    // If this call_id already exists, append row id to make it unique
    let callId = baseCallId;
    let counter = 0;
    while (existingIds.has(callId)) {
        counter++;
        callId = `${baseCallId}_${rowId}_${counter}`;
    }
    
    // Add to set to prevent duplicates in this batch
    existingIds.add(callId);
    return callId;
};

/**
 * Migrate data from ringba_call_data to call_transcriptions
 */
const migrateRingbaData = async (dryRun = false, limit = null) => {
    try {
        logger.info('='.repeat(60));
        logger.info('Starting Ringba Data Migration');
        logger.info(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will insert data)'}`);
        logger.info('='.repeat(60));
        
        await db.initDatabase();
        
        // Get all rows with transcripts
        let query = `
            SELECT 
                id,
                "inboundCallId",
                "phoneNumber",
                "callYear",
                "callMonth",
                "callDay",
                "callHour",
                "callMinute",
                "callSecond",
                "callLengthInSeconds",
                revenue,
                "g_zip",
                "campaignName",
                transcript,
                "recordingUrl",
                "isDuplicate",
                "hasConnected"
            FROM ringba_call_data
            WHERE transcript IS NOT NULL 
            AND transcript != ''
            AND "inboundCallId" IS NOT NULL
            ORDER BY id ASC
        `;
        
        if (limit) {
            query += ` LIMIT ${parseInt(limit)}`;
        }
        
        const rows = await db.query(query);
        logger.info(`Found ${rows.length} rows to migrate`);
        
        if (rows.length === 0) {
            logger.info('No rows to migrate');
            await db.closeDatabase();
            return;
        }
        
        // Track existing call_ids to avoid duplicates
        const existingCallIds = new Set();
        const existingInDb = await db.query('SELECT call_id FROM call_transcriptions');
        existingInDb.forEach(row => existingCallIds.add(row.call_id));
        logger.info(`Found ${existingCallIds.size} existing call_ids in call_transcriptions`);
        
        // Process each row
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        const errors = [];
        
        for (const row of rows) {
            try {
                // Construct call_date
                const callDate = constructCallDate(row);
                
                // Generate unique call_id (function ensures uniqueness)
                const callId = generateCallId(
                    row.inboundCallId,
                    callDate,
                    row.id,
                    existingCallIds
                );
                
                // Clean transcript
                const cleanedTranscript = cleanTranscript(row.transcript);
                
                // Parse duration (handle text to integer)
                let duration = null;
                if (row.callLengthInSeconds) {
                    const parsed = parseInt(row.callLengthInSeconds, 10);
                    duration = isNaN(parsed) ? null : parsed;
                }
                
                // Parse revenue
                let revenue = null;
                if (row.revenue) {
                    const parsed = parseFloat(row.revenue);
                    revenue = isNaN(parsed) ? null : parsed;
                }
                
                if (dryRun) {
                    logger.info(`[DRY RUN] Would insert: ${callId}`);
                    logger.debug(`  - Phone: ${row.phoneNumber}`);
                    logger.debug(`  - Date: ${callDate.toISOString()}`);
                    logger.debug(`  - Duration: ${duration}s`);
                    logger.debug(`  - Transcript length: ${cleanedTranscript?.length || 0} chars`);
                    successCount++;
                } else {
                    // Insert into call_transcriptions
                    await db.queryOne(
                        `INSERT INTO call_transcriptions 
                         (call_id, caller_phone, transcription, duration, call_date, created_at)
                         VALUES ($1, $2, $3, $4, $5, NOW())
                         ON CONFLICT (call_id) DO UPDATE
                         SET transcription = EXCLUDED.transcription,
                             duration = EXCLUDED.duration,
                             call_date = EXCLUDED.call_date
                         RETURNING call_id`,
                        [
                            callId,
                            row.phoneNumber || null,
                            cleanedTranscript,
                            duration,
                            callDate
                        ]
                    );
                    
                    logger.info(`✓ Migrated: ${callId} (ID: ${row.id})`);
                    successCount++;
                }
                
            } catch (error) {
                errorCount++;
                const errorMsg = `Error processing row ${row.id}: ${error.message}`;
                errors.push({ rowId: row.id, error: errorMsg });
                logger.error(errorMsg);
            }
        }
        
        // Summary
        logger.info('='.repeat(60));
        logger.info('Migration Summary:');
        logger.info(`  Total rows processed: ${rows.length}`);
        logger.info(`  Successfully ${dryRun ? 'prepared' : 'migrated'}: ${successCount}`);
        logger.info(`  Skipped (duplicates): ${skipCount}`);
        logger.info(`  Errors: ${errorCount}`);
        
        if (errors.length > 0) {
            logger.warn('Errors encountered:');
            errors.slice(0, 10).forEach(err => {
                logger.warn(`  - ${err.error}`);
            });
            if (errors.length > 10) {
                logger.warn(`  ... and ${errors.length - 10} more errors`);
            }
        }
        
        logger.info('='.repeat(60));
        
    } catch (error) {
        logger.error('Migration failed:', error);
        throw error;
    } finally {
        await db.closeDatabase();
    }
};

// Run migration if called directly
if (process.argv[1].endsWith('migrateRingbaData.js')) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const limitArg = args.find(arg => arg.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
    
    migrateRingbaData(dryRun, limit)
        .then(() => {
            logger.info('Migration completed');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('Migration failed:', error);
            process.exit(1);
        });
}

export default migrateRingbaData;

