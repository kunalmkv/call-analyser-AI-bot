import { startProcessingLoop } from './services/processor.js';
import logger from './utils/logger.js';
import apiServer from './api/server.js';

const main = async () => {
    try {
        logger.info('='.repeat(50));
        logger.info('Call Tagging Service - Starting Application');
        logger.info('='.repeat(50));
        
        // Start the API server
        await apiServer.start();
        
        // Start the background processing loop
        await startProcessingLoop();
        
        logger.info('Application started successfully');
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
    process.exit(1);
});

// Start the application
main();
