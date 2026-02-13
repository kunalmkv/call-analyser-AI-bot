import cron from 'node-cron';
import logger from '../utils/logger.js';
import { runProcessingJob } from './processor.js';

let isJobRunning = false;

/**
 * Initialize and start the scheduler
 */
export const startScheduler = () => {
    logger.info('Initializing scheduler...');

    // Schedule: 9 PM to 7 AM (Every hour at minute 0), Mon-Fri
    // 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7
    const cronExpression = '0 21-23,0-7 * * 1-5';

    cron.schedule(cronExpression, async () => {
        if (isJobRunning) {
            logger.warn('A processing job is already in progress. Skipping this run.');
            return;
        }

        isJobRunning = true;
        logger.info('Cron trigger: Starting scheduled job execution.');

        try {
            await runProcessingJob();
        } catch (error) {
            logger.error('Scheduled job failed:', error);
        } finally {
            isJobRunning = false;
        }
    });

    logger.info('Scheduler started. Monitoring for jobs in window (9 PM - 7 AM, Mon-Fri).');
};

export default {
    startScheduler
};
