import cron from 'node-cron';
import logger from '../utils/logger.js';
import { runProcessingJob } from './processor.js';

let isJobRunning = false;

/** Timezone for schedule window: IST (Indian Standard Time). */
const TZ = 'Asia/Kolkata';

/**
 * Get hour, minute, and weekday in IST (Asia/Kolkata).
 */
const getTimeInWindowTz = (date) => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false
    });
    const parts = fmt.formatToParts(date);
    const get = (type) => {
        const p = parts.find((x) => x.type === type);
        return p ? p.value : '';
    };
    const hour = parseInt(get('hour'), 10) || 0;
    const minute = parseInt(get('minute'), 10) || 0;
    const wd = get('weekday');
    const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
    const day = dayMap[wd] ?? date.getDay();
    return { hour, minute, day };
};

/**
 * Returns true if current time is within the allowed run window:
 * 9:00 PM (21:00) to 6:30 AM (06:30) inclusive, Monday–Friday.
 * Saturday and Sunday are excluded.
 */
const isWithinRunWindow = () => {
    const now = new Date();
    const { day, hour, minute } = getTimeInWindowTz(now);

    if (day === 0 || day === 6) return false;  // no Sunday, Saturday

    if (hour >= 21) return true;                // 9 PM – midnight
    if (hour < 6) return true;                  // midnight – 5:59 AM
    if (hour === 6 && minute <= 30) return true; // 6:00 – 6:30 AM

    return false;
};

/**
 * Initialize and start the scheduler.
 * Runs every 15 minutes; executes the job only when within 9 PM – 6:30 AM, Mon–Fri.
 */
export const startScheduler = () => {
    logger.info('Initializing scheduler...');

    // Every 15 minutes, Mon–Fri (cron day 1–5)
    const JOB_SCHEDULE = '*/15 * * * 1-5';

    cron.schedule(JOB_SCHEDULE, async () => {
        if (!isWithinRunWindow()) {
            logger.debug('Outside run window (9 PM – 6:30 AM). Skipping.');
            return;
        }

        if (isJobRunning) {
            logger.warn('A processing job is already in progress. Skipping this run.');
            return;
        }

        isJobRunning = true;
        logger.info('Cron trigger: Starting scheduled job execution (window 9 PM – 6:30 AM, Mon–Fri).');

        try {
            await runProcessingJob();
        } catch (error) {
            logger.error('Scheduled job failed:', error);
        } finally {
            isJobRunning = false;
        }
    });

    logger.info('Scheduler started: every 15 min, 9 PM – 6:30 AM IST, Mon–Fri only. Calls processed after 1 Feb 2026.');
};

export default {
    startScheduler
};
