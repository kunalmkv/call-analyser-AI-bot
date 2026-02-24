import db from '../database/connection.js';

/**
 * Tier Query Utilities
 * Helper functions for common tier-based queries on call_analysis_v2
 */

// =====================================================================
// TIER 2: QUALITY FLAGS
// =====================================================================

/**
 * Get calls with specific quality issue
 * @param {string} flag - Quality flag (e.g., 'POOR_AUDIO_QUALITY', 'LANGUAGE_BARRIER')
 * @param {number} limit - Max results
 */
export const getQualityFlagCalls = async (flag, limit = 100) => {
    return db.getQualityFlagCalls(flag, limit);
};

// =====================================================================
// TIER 3: CUSTOMER INTENT
// =====================================================================

/**
 * Get calls with specific customer intent
 * @param {string} intent - Intent value (e.g., 'URGENT_REPAIR_NEEDED', 'PRICE_SHOPPING')
 * @param {number} limit - Max results
 */
export const getIntentCalls = async (intent, limit = 100) => {
    return db.getIntentCalls(intent, limit);
};

/**
 * Get all urgent repair calls
 */
export const getUrgentRepairCalls = async (limit = 100) => {
    return getIntentCalls('URGENT_REPAIR_NEEDED', limit);
};

/**
 * Get price shopping calls
 */
export const getPriceShoppingCalls = async (limit = 100) => {
    return getIntentCalls('PRICE_SHOPPING', limit);
};

// =====================================================================
// TIER 4: APPLIANCE TYPE
// =====================================================================

/**
 * Get calls by appliance type
 * @param {string} applianceType - Type (e.g., 'REFRIGERATOR_REPAIR', 'HVAC_SERVICE')
 * @param {number} limit - Max results
 */
export const getApplianceCalls = async (applianceType, limit = 100) => {
    return db.searchByTier(4, applianceType, limit);
};

// =====================================================================
// TIER 5: BILLING
// =====================================================================

/**
 * Get billing discrepancies
 * Finds calls where billing status doesn't match AI recommendation
 */
export const getBillingDiscrepancies = async (limit = 50) => {
    return db.getBillingDiscrepancies(limit);
};

/**
 * Get unbilled but billable calls
 */
export const getUnbilledButBillable = async (limit = 100) => {
    const result = await db.query(
        `SELECT
            v2.ringba_row_id,
            v2.ringba_caller_id,
            td1.tag_value AS tier1_value,
            td5.tag_value AS tier5_value,
            v2.tier5_data->'reasons'->>(v2.tier5_data->'value_ids'->>0) AS tier5_reason,
            v2.current_revenue,
            v2.current_billed_status,
            v2.call_summary,
            v2.processed_at
         FROM call_analysis_v2 v2
         LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
         LEFT JOIN tag_definitions td5 ON td5.id = (v2.tier5_data->'value_ids'->>0)::int
         WHERE td5.tag_value IN ('LIKELY_BILLABLE', 'DEFINITELY_BILLABLE')
           AND v2.current_billed_status = false
           AND v2.current_revenue = 0
         ORDER BY v2.processed_at DESC
         LIMIT $1`,
        [limit]
    );
    return result;
};

/**
 * Get billed but not billable calls
 */
export const getBilledButNotBillable = async (limit = 100) => {
    const result = await db.query(
        `SELECT
            v2.ringba_row_id,
            v2.ringba_caller_id,
            td1.tag_value AS tier1_value,
            td5.tag_value AS tier5_value,
            v2.tier5_data->'reasons'->>(v2.tier5_data->'value_ids'->>0) AS tier5_reason,
            v2.current_revenue,
            v2.current_billed_status,
            v2.call_summary,
            v2.processed_at
         FROM call_analysis_v2 v2
         LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
         LEFT JOIN tag_definitions td5 ON td5.id = (v2.tier5_data->'value_ids'->>0)::int
         WHERE td5.tag_value = 'DEFINITELY_NOT_BILLABLE'
           AND v2.current_billed_status = true
           AND v2.current_revenue > 0
         ORDER BY v2.current_revenue DESC, v2.processed_at DESC
         LIMIT $1`,
        [limit]
    );
    return result;
};

// =====================================================================
// TIER 1: PRIMARY OUTCOME
// =====================================================================

/**
 * Get calls by primary outcome
 * @param {string} outcome - Outcome (e.g., 'QUALIFIED_APPOINTMENT_SET', 'NO_ANSWER')
 * @param {number} limit - Max results
 */
export const getOutcomeCalls = async (outcome, limit = 100) => {
    return db.searchByTier(1, outcome, limit);
};

/**
 * Get qualified appointment calls
 */
export const getQualifiedAppointments = async (limit = 100) => {
    return getOutcomeCalls('QUALIFIED_APPOINTMENT_SET', limit);
};

/**
 * Get unqualified/wrong number calls
 */
export const getWrongNumberCalls = async (limit = 100) => {
    return getOutcomeCalls('WRONG_NUMBER_UNQUALIFIED', limit);
};

// =====================================================================
// DISPUTES
// =====================================================================

/**
 * Get all dispute candidates
 */
export const getDisputeCandidates = async (limit = 50) => {
    return db.getDisputeCandidates(limit);
};

/**
 * Get strong dispute recommendations only
 */
export const getStrongDisputeCandidates = async (limit = 50) => {
    const result = await db.query(
        `SELECT * FROM v_dispute_candidates 
         WHERE dispute_recommendation = 'STRONG'
         LIMIT $1`,
        [limit]
    );
    return result;
};

// =====================================================================
// SEARCH & ANALYTICS
// =====================================================================

/**
 * Search call summaries by keyword
 * @param {string} searchTerm - Search term
 * @param {number} limit - Max results
 */
export const searchCallSummaries = async (searchTerm, limit = 50) => {
    return db.searchCallSummaries(searchTerm, limit);
};

/**
 * Get calls within confidence score range
 * @param {number} minConfidence - Minimum confidence (0-1)
 * @param {number} maxConfidence - Maximum confidence (0-1)
 * @param {number} limit - Max results
 */
export const getCallsByConfidence = async (minConfidence = 0, maxConfidence = 1, limit = 100) => {
    const result = await db.query(
        `SELECT
            v2.ringba_row_id,
            v2.ringba_caller_id,
            td1.tag_value AS tier1_value,
            td5.tag_value AS tier5_value,
            v2.confidence_score,
            v2.call_summary,
            v2.processed_at
         FROM call_analysis_v2 v2
         LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
         LEFT JOIN tag_definitions td5 ON td5.id = (v2.tier5_data->'value_ids'->>0)::int
         WHERE v2.confidence_score BETWEEN $1 AND $2
         ORDER BY v2.confidence_score ASC, v2.processed_at DESC
         LIMIT $3`,
        [minConfidence, maxConfidence, limit]
    );
    return result;
};

/**
 * Get low confidence calls (< 0.7)
 */
export const getLowConfidenceCalls = async (limit = 100) => {
    return getCallsByConfidence(0, 0.7, limit);
};

/**
 * Get recent analyses
 * @param {number} limit - Number of results
 */
export const getRecentAnalyses = async (limit = 100) => {
    const result = await db.query(
        `SELECT * FROM v_call_analysis_summary LIMIT $1`,
        [limit]
    );
    return result;
};

/**
 * Get analysis by ringba row ID
 * @param {number} rowId - Ringba row ID
 */
export const getAnalysisById = async (rowId) => {
    return db.getAnalysisByRowId(rowId);
};

// =====================================================================
// EXPORT ALL UTILITIES
// =====================================================================

export default {
    // Tier 2
    getQualityFlagCalls,

    // Tier 3
    getIntentCalls,
    getUrgentRepairCalls,
    getPriceShoppingCalls,

    // Tier 4
    getApplianceCalls,

    // Tier 5
    getBillingDiscrepancies,
    getUnbilledButBillable,
    getBilledButNotBillable,

    // Tier 1
    getOutcomeCalls,
    getQualifiedAppointments,
    getWrongNumberCalls,

    // Disputes
    getDisputeCandidates,
    getStrongDisputeCandidates,

    // Search & Analytics
    searchCallSummaries,
    getCallsByConfidence,
    getLowConfidenceCalls,
    getRecentAnalyses,
    getAnalysisById
};
