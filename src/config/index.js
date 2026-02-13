import dotenv from 'dotenv';
import { pipe, pick, evolve, always } from 'ramda';

dotenv.config();

// Pure function to validate configuration
const validateConfig = (config) => {
    const required = [
        'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'
    ];

    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    return config;
};

// Helper to get env var with fallback
const getEnv = (env, key1, key2, defaultValue) => {
    return env[key1] || env[key2] || defaultValue;
};

// Pure function to transform environment variables
const transformConfig = (env) => {
    // Support both DB_* and POSTGRES_* naming conventions
    const config = {
        DB_HOST: getEnv(env, 'DB_HOST', 'POSTGRES_HOST'),
        DB_PORT: getEnv(env, 'DB_PORT', 'POSTGRES_PORT', '5432'),
        DB_NAME: getEnv(env, 'DB_NAME', 'POSTGRES_DB_NAME'),
        DB_USER: getEnv(env, 'DB_USER', 'POSTGRES_USER_NAME'),
        DB_PASSWORD: getEnv(env, 'DB_PASSWORD', 'POSTGRES_PASSWORD'),
        DB_SSL: env.DB_SSL === 'true',
        OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
        OPENROUTER_BASE_URL: env.OPENROUTER_BASE_URL,
        OPENROUTER_MODEL: env.OPENROUTER_MODEL,
        BATCH_SIZE: parseInt(env.BATCH_SIZE || '10', 10),
        PROCESSING_INTERVAL_MINUTES: parseInt(env.PROCESSING_INTERVAL_MINUTES || '5', 10),
        MAX_RETRIES: parseInt(env.MAX_RETRIES || '3', 10),
        RETRY_DELAY_MS: parseInt(env.RETRY_DELAY_MS || '5000', 10),
        LOG_LEVEL: env.LOG_LEVEL || 'info',
        LOG_DIR: env.LOG_DIR || './logs'
    };

    return evolve({
        DB_PORT: (v) => parseInt(v, 10),
        BATCH_SIZE: (v) => parseInt(v, 10),
        PROCESSING_INTERVAL_MINUTES: (v) => parseInt(v, 10),
        MAX_RETRIES: (v) => parseInt(v, 10),
        RETRY_DELAY_MS: (v) => parseInt(v, 10)
    })(config);
};

// Compose configuration pipeline
const createConfig = (env) => {
    const transformed = transformConfig(env);
    return validateConfig(transformed);
};

// Export immutable configuration
export const config = Object.freeze(createConfig(process.env));

// Helper function to get database connection config
export const getDbConfig = () => ({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Helper function to get OpenRouter config
export const getOpenRouterConfig = () => ({
    apiKey: config.OPENROUTER_API_KEY,
    baseUrl: config.OPENROUTER_BASE_URL,
    model: config.OPENROUTER_MODEL,
    maxTokens: parseInt(process.env.OPENROUTER_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.OPENROUTER_TEMPERATURE || '0.2'),
    useSchema: process.env.OPENROUTER_USE_SCHEMA !== 'false'
});

export default config;
