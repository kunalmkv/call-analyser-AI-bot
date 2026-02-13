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
            ringba_row_id,
            ringba_caller_id,
            tier1_value,
            tier5_value,
            tier5_reason,
            current_revenue,
            current_billed_status,
            call_summary,
            processed_at
         FROM call_analysis_v2
         WHERE tier5_value IN ('LIKELY_BILLABLE', 'DEFINITELY_BILLABLE')
           AND current_billed_status = false
           AND current_revenue = 0
         ORDER BY processed_at DESC
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
            ringba_row_id,
            ringba_caller_id,
            tier1_value,
            tier5_value,
            tier5_reason,
            current_revenue,
            current_billed_status,
            call_summary,
            processed_at
         FROM call_analysis_v2
         WHERE tier5_value = 'DEFINITELY_NOT_BILLABLE'
           AND current_billed_status = true
           AND current_revenue > 0
         ORDER BY current_revenue DESC, processed_at DESC
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
            ringba_row_id,
            ringba_caller_id,
            tier1_value,
            tier5_value,
            confidence_score,
            call_summary,
            processed_at
         FROM call_analysis_v2
         WHERE confidence_score BETWEEN $1 AND $2
         ORDER BY confidence_score ASC, processed_at DESC
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
