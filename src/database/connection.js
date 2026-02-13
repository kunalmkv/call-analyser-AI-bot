import pg from 'pg';
import { getDbConfig } from '../config/index.js';
import { curry, pipe, map, prop } from 'ramda';

const { Pool } = pg;

// Create connection pool
let pool = null;

// Initialize database connection
export const initDatabase = async () => {
    if (!pool) {
        pool = new Pool(getDbConfig());

        // Test connection
        try {
            const client = await pool.connect();
            console.log('Database connected successfully');
            client.release();
        } catch (error) {
            console.error('Failed to connect to database:', error);
            throw error;
        }
    }
    return pool;
};

// Close database connection
export const closeDatabase = async () => {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('Database connection closed');
    }
};

// Generic query executor (curried for partial application)
export const query = curry(async (queryText, params = []) => {
    if (!pool) {
        await initDatabase();
    }

    try {
        const result = await pool.query(queryText, params);
        return result.rows;
    } catch (error) {
        console.error('Query error:', error);
        throw error;
    }
});

// Generic single row query
export const queryOne = curry(async (queryText, params = []) => {
    const rows = await query(queryText, params);
    return rows[0] || null;
});

// Transaction helper
export const withTransaction = async (callback) => {
    if (!pool) {
        await initDatabase();
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// V2 Database Operations for Tier-Based Queries
export const dbOperations = {
    // Get analysis by ringba row ID
    getAnalysisByRowId: (rowId) =>
        queryOne(
            `SELECT * FROM call_analysis_v2 WHERE ringba_row_id = $1`,
            [rowId]
        ),

    // Search by tier value
    searchByTier: async (tierNumber, value, limit = 100) => {
        const tierColumn = `tier${tierNumber}_value`;
        return query(
            `SELECT 
                ringba_row_id,
                ringba_caller_id,
                tier1_value,
                tier4_value,
                tier5_value,
                ${tierColumn},
                call_summary,
                confidence_score,
                processed_at
             FROM call_analysis_v2
             WHERE ${tierColumn} = $1
             ORDER BY processed_at DESC
             LIMIT $2`,
            [value, limit]
        );
    },

    // Get dispute candidates
    getDisputeCandidates: (limit = 50) =>
        query(
            `SELECT * FROM v_dispute_candidates LIMIT $1`,
            [limit]
        ),

    // Get billing discrepancies
    getBillingDiscrepancies: (limit = 50) =>
        query(
            `SELECT * FROM v_billing_discrepancies LIMIT $1`,
            [limit]
        ),

    // Search call summaries with full-text search
    searchCallSummaries: (searchTerm, limit = 50) =>
        query(
            `SELECT 
                ringba_row_id,
                ringba_caller_id,
                tier1_value,
                tier5_value,
                call_summary,
                ts_rank(to_tsvector('english', call_summary), plainto_tsquery('english', $1)) as rank
             FROM call_analysis_v2
             WHERE to_tsvector('english', call_summary) @@ plainto_tsquery('english', $1)
             ORDER BY rank DESC, processed_at DESC
             LIMIT $2`,
            [searchTerm, limit]
        ),

    // Query by tier2 quality flags (JSONB containment)
    getQualityFlagCalls: (flag, limit = 100) =>
        query(
            `SELECT 
                ringba_row_id,
                ringba_caller_id,
                tier1_value,
                tier2_data,
                call_summary,
                processed_at
             FROM call_analysis_v2
             WHERE tier2_data->'values' @> $1::jsonb
             ORDER BY processed_at DESC
             LIMIT $2`,
            [JSON.stringify([flag]), limit]
        ),

    // Query by tier3 customer intent
    getIntentCalls: (intent, limit = 100) =>
        query(
            `SELECT 
                ringba_row_id,
                ringba_caller_id,
                tier1_value,
                tier3_data,
                tier4_value,
                call_summary,
                processed_at
             FROM call_analysis_v2
             WHERE tier3_data->'values' @> $1::jsonb
             ORDER BY processed_at DESC
             LIMIT $2`,
            [JSON.stringify([intent]), limit]
        ),

    // Get analytics report data (used by processor.js)
    getAnalyticsData: (startDate, endDate) =>
        queryOne(
            `SELECT json_build_object(
                'period', json_build_object('start', $1, 'end', $2),
                'total_calls', (
                    SELECT COUNT(*) FROM call_analysis_v2
                    WHERE processed_at BETWEEN $1 AND $2
                ),
                'tier1_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT tier1_value, COUNT(*) as count
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY tier1_value ORDER BY count DESC
                    ) t
                ),
                'tier5_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT tier5_value, COUNT(*) as count,
                               AVG(current_revenue) as avg_revenue
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY tier5_value ORDER BY count DESC
                    ) t
                ),
                'tier4_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT tier4_value, COUNT(*) as count
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY tier4_value ORDER BY count DESC
                    ) t
                ),
                'dispute_breakdown', (
                    SELECT json_agg(row_to_json(t))
                    FROM (
                        SELECT dispute_recommendation, COUNT(*) as count
                        FROM call_analysis_v2
                        WHERE processed_at BETWEEN $1 AND $2
                        GROUP BY dispute_recommendation ORDER BY count DESC
                    ) t
                ),
                'avg_confidence', (
                    SELECT AVG(confidence_score) FROM call_analysis_v2
                    WHERE processed_at BETWEEN $1 AND $2
                )
            ) as report`,
            [startDate, endDate]
        )
};

export default {
    initDatabase,
    closeDatabase,
    query,
    queryOne,
    withTransaction,
    ...dbOperations
};
