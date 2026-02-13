import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure log directory exists
const logDir = path.resolve(config.LOG_DIR || './logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Create custom format
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: config.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { service: 'call-tagging-service' },
    transports: [
        // Console transport
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // File transport for all logs
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5
        }),
        // File transport for errors
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5
        })
    ]
});

// Export logger functions
export default {
    info: (message, ...args) => logger.info(message, ...args),
    error: (message, ...args) => logger.error(message, ...args),
    warn: (message, ...args) => logger.warn(message, ...args),
    debug: (message, ...args) => logger.debug(message, ...args),
    verbose: (message, ...args) => logger.verbose(message, ...args)
};
