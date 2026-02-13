module.exports = {
    apps: [{
        name: 'call-tagging-service',
        script: './src/index.js',
        instances: 1,
        exec_mode: 'fork',

        // Environment variables (optional - loads from .env automatically)
        env: {
            NODE_ENV: 'production'
        },

        // Logging
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',

        // Restart configuration
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',

        // Memory management
        max_memory_restart: '500M',

        // Watch for file changes (useful for development)
        watch: false,
        ignore_watch: ['node_modules', 'logs'],

        // Graceful shutdown
        kill_timeout: 5000
    }]
};
