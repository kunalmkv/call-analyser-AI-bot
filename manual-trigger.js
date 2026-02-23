import { runProcessingJob, startProcessingLoop } from './src/services/processor.js';
import logger from './src/utils/logger.js';

const run = async () => {
    try {
        logger.info('Starting manual processing trigger...');
        await startProcessingLoop();
        await runProcessingJob();
        logger.info('Manual processing complete.');
        process.exit(0);
    } catch (error) {
        logger.error('Manual processing failed:', error);
        process.exit(1);
    }
};

run();
