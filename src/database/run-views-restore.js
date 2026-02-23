import db from './connection.js';

const runRestore = async () => {
    try {
        console.log('Restoring database views...');
        await db.initDatabase();

        // 1. v_call_analysis_summary
        console.log('Restoring v_call_analysis_summary...');
        await db.query(`
            CREATE OR REPLACE VIEW v_call_analysis_summary AS
            SELECT
                ringba_row_id,
                ringba_caller_id,
                tier1_data->>'value' AS outcome,
                tier4_data->>'value' AS appliance_type,
                tier5_data->>'value' AS billing_status,
                dispute_recommendation,
                confidence_score,
                call_summary,
                current_revenue,
                current_billed_status,
                model_used,
                processing_time_ms,
                processed_at
            FROM call_analysis_v2
        `);

        // 2. v_dispute_candidates
        console.log('Restoring v_dispute_candidates...');
        await db.query(`
            CREATE OR REPLACE VIEW v_dispute_candidates AS
            SELECT
                ringba_row_id,
                ringba_caller_id,
                tier1_data->>'value'  AS tier1_value,
                tier5_data->>'value'  AS tier5_value,
                dispute_recommendation,
                dispute_recommendation_reason,
                call_summary,
                current_revenue,
                current_billed_status,
                confidence_score,
                processed_at
            FROM call_analysis_v2
            WHERE dispute_recommendation IN ('REVIEW','STRONG')
               OR (tier5_data->>'value' = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true)
        `);

        // 3. v_billing_discrepancies
        console.log('Restoring v_billing_discrepancies...');
        await db.query(`
            CREATE OR REPLACE VIEW v_billing_discrepancies AS
            SELECT
                ringba_row_id,
                ringba_caller_id,
                tier5_data->>'value'  AS tier5_value,
                current_revenue,
                current_billed_status,
                call_summary,
                tier5_data->>'reason' AS tier5_reason,
                processed_at
            FROM call_analysis_v2
            WHERE (tier5_data->>'value' = 'LIKELY_BILLABLE'          AND current_billed_status = false AND current_revenue = 0)
               OR (tier5_data->>'value' = 'DEFINITELY_NOT_BILLABLE'  AND current_billed_status = true  AND current_revenue > 0)
        `);

        console.log('Views restored successfully.');
        process.exit(0);

    } catch (error) {
        console.error('View restore failed:', error);
        process.exit(1);
    }
};

runRestore();
