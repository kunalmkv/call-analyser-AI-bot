import { startProcessingLoop } from './services/processor.js';
import { startScheduler } from './services/scheduler.js';
import logger from './utils/logger.js';
import apiServer from './api/server.js';
import db from './database/connection.js';

const main = async () => {
    try {
        logger.info('='.repeat(50));
        logger.info('Call Tagging Service - Starting Application');
        logger.info('='.repeat(50));

        // Start the API server
        const port = process.env.PORT || 3000;
        await apiServer.start(port);

        // Initialize Database and Tables
        await startProcessingLoop();

        // Start the Scheduler
        startScheduler();

        logger.info('Application started successfully and scheduler is active');
    } catch (error) {
        logger.error('Failed to start application:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received: Shutting down gracefully...`);
    try {
        await db.closeDatabase();
        logger.info('Database connection closed.');
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

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