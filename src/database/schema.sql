-- Database schema for call tagging service

-- Table for storing raw call transcriptions
CREATE TABLE IF NOT EXISTS call_transcriptions (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) UNIQUE NOT NULL,
    caller_phone VARCHAR(20),
    receiver_phone VARCHAR(20),
    transcription TEXT NOT NULL,
    duration INTEGER, -- in seconds
    call_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP
);

-- Table for storing tag definitions (matches your screenshot)
CREATE TABLE IF NOT EXISTS tag_definitions (
    id SERIAL PRIMARY KEY,
    priority VARCHAR(20) NOT NULL,
    tag_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    importance TEXT NOT NULL,
    color_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for storing processed call analysis
CREATE TABLE IF NOT EXISTS call_analysis (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) REFERENCES call_transcriptions(call_id),
    summary TEXT NOT NULL,
    sentiment VARCHAR(20),
    confidence_score DECIMAL(3,2),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER,
    model_used VARCHAR(100)
);

-- Table for storing assigned tags
CREATE TABLE IF NOT EXISTS call_tags (
    id SERIAL PRIMARY KEY,
    call_id VARCHAR(100) REFERENCES call_transcriptions(call_id),
    tag_id INTEGER REFERENCES tag_definitions(id),
    confidence DECIMAL(3,2),
    detected_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(call_id, tag_id)
);

-- Table for storing V5 tiered AI analysis (new 9-tier system)
CREATE TABLE IF NOT EXISTS call_analysis_v2 (
    id SERIAL PRIMARY KEY,
    ringba_row_id INTEGER NOT NULL,
    ringba_caller_id VARCHAR(200),

    -- Primary outcome (Tier 1)
    tier1_value VARCHAR(50) NOT NULL,
    tier1_reason TEXT,

    -- Billing indicator (Tier 5) - extracted for fast queries
    tier5_value VARCHAR(50),
    tier5_reason TEXT,

    -- Appliance type (Tier 4) - extracted for fast queries
    tier4_value VARCHAR(50),
    tier4_reason TEXT,

    -- Full tiered response stored as JSONB for flexibility
    tier2_data JSONB DEFAULT '{"values":[],"reasons":{}}',
    tier3_data JSONB DEFAULT '{"values":[],"reasons":{}}',
    tier6_data JSONB DEFAULT '{"values":[],"reasons":{}}',
    tier7_data JSONB DEFAULT '{"values":[],"reasons":{}}',
    tier8_data JSONB DEFAULT '{"values":[],"reasons":{}}',
    tier9_data JSONB DEFAULT '{"values":[],"reasons":{}}',

    -- Overall assessment
    confidence_score DECIMAL(3,2),
    dispute_recommendation VARCHAR(20) DEFAULT 'NONE',
    dispute_recommendation_reason TEXT,
    call_summary TEXT,

    -- Extracted customer info (only diffs from input)
    extracted_customer_info JSONB DEFAULT '{}',

    -- Metadata
    system_duplicate BOOLEAN DEFAULT FALSE,
    current_revenue DECIMAL(10,2),
    current_billed_status BOOLEAN,

    -- Full raw AI response for debugging
    raw_ai_response JSONB,

    -- Processing metadata
    processing_time_ms INTEGER,
    model_used VARCHAR(100),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(ringba_row_id)
);

-- Indexes for better performance
CREATE INDEX idx_transcriptions_processed ON call_transcriptions(processed);
CREATE INDEX idx_transcriptions_call_date ON call_transcriptions(call_date);
CREATE INDEX idx_call_tags_call_id ON call_tags(call_id);
CREATE INDEX idx_call_tags_tag_id ON call_tags(tag_id);
CREATE INDEX idx_call_analysis_call_id ON call_analysis(call_id);

-- V2 indexes for common queries
CREATE INDEX idx_v2_tier1 ON call_analysis_v2(tier1_value);
CREATE INDEX idx_v2_tier5 ON call_analysis_v2(tier5_value);
CREATE INDEX idx_v2_tier4 ON call_analysis_v2(tier4_value);
CREATE INDEX idx_v2_dispute ON call_analysis_v2(dispute_recommendation);
CREATE INDEX idx_v2_ringba_row ON call_analysis_v2(ringba_row_id);
CREATE INDEX idx_v2_tier2_gin ON call_analysis_v2 USING GIN(tier2_data);
CREATE INDEX idx_v2_tier3_gin ON call_analysis_v2 USING GIN(tier3_data);

-- Insert tag definitions based on your screenshot
INSERT INTO tag_definitions (priority, tag_name, description, importance, color_code) VALUES
-- Highest Priority (Critical)
('Highest', 'High-Quality Unbilled', 'Call duration ≥90s, Revenue = 0, Valid ZIP & Need Category Match', 'Immediate revenue loss (Dispute ASAP)', 'red'),
('Highest', 'Chargeback Risk', 'Call indicates repeat calls, customer service inquiry, warranty/status query, or clearly wrong appliance', 'Likely chargeback candidate (Requires quick QA)', 'red'),
('Highest', 'Duplicate Call', 'Caller ID made multiple calls within short time frame (Ringba duplicate flag or AI duplicate detection)', 'Billing rejection / Compliance risk', 'red'),
('Highest', 'Compliance Issue', 'Explicit red flags (Do Not Call violation, caller abuse, profanity detected, negative sentiment)', 'Compliance / Legal risk', 'red'),

-- High Priority
('High', 'No Coverage (ZIP)', 'Buyer rejected due to unmatched ZIP or ZIP not serviced', 'Loss of revenue (routing optimization)', 'orange'),
('High', 'Wrong Appliance Category', 'Caller requested service outside tagged need_id category [1]', 'Routing / ad targeting issue', 'orange'),
('High', 'Wrong Pest Control Category', 'Caller requested service outside tagged need_id category For Pest Control', 'Routing / ad targeting issue', 'orange'),
('High', 'Short Call (<90s)', 'Duration below minimum billing threshold', 'Call Quality (investigate IVR)', 'orange'),
('High', 'Buyer Hung Up', 'Buyer prematurely ended call', 'Quality & service concern', 'orange'),
('High', 'Caller Hung Up (IVR)', 'Caller disconnected during IVR', 'IVR experience improvement', 'orange'),
('High', 'Immediate Hangup (<10s)', 'Call disconnected quickly after connecting', 'Spam or connection issue', 'orange'),
('High', 'Repeated Caller', 'Caller ID appeared multiple times historically (7-30 days)', 'Likely customer service or dissatisfied caller', 'orange'),
('High', 'Low Confidence Transcription', 'Transcription unclear or low confidence score by AI model', 'Quality Assurance', 'orange'),

-- Medium Priority
('Medium', 'Booking Intent', 'Caller explicitly requested service or appointment', 'Positive intent indicator', 'yellow'),
('Medium', 'Inquiry / Pricing Call', 'Caller asked price or service availability', 'Potential future conversion', 'yellow'),
('Medium', 'Warranty/Status Inquiry', 'Caller asked warranty/status questions', 'Identify non-converting inquiries', 'yellow'),
('Medium', 'General Customer Service', 'Caller clearly indicated billing, refund, cancellation request', 'Route away from paid targets', 'yellow'),

-- Lower Priority
('Lower', 'Positive Sentiment', 'Caller sounded explicitly positive or satisfied', 'Long-term customer satisfaction insights', 'green'),
('Lower', 'Negative Sentiment', 'Caller explicitly dissatisfied, angry or unhappy', 'Identify quality concerns', 'green'),
('Lower', 'Repeat Customer', 'Caller previously booked successfully', 'Retention & loyalty insight', 'green'),
('Lower', 'Technical Terms Used', 'Caller used specific appliance keywords (e.g. "compressor", "refrigerant")', 'Ad keyword or targeting insights', 'green'),
('Lower', 'Competitor Mentioned', 'Caller referenced another company by name', 'Competitive market insights', 'green');

-- =====================================================================
-- V2 ADDITIONAL INDEXES (for optimal tier-based queries)
-- =====================================================================

-- GIN indexes for all JSONB tier columns (enables fast containment queries)
CREATE INDEX IF NOT EXISTS idx_v2_tier6_gin ON call_analysis_v2 USING GIN(tier6_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier7_gin ON call_analysis_v2 USING GIN(tier7_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier8_gin ON call_analysis_v2 USING GIN(tier8_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier9_gin ON call_analysis_v2 USING GIN(tier9_data);

-- Full-text search index on call summaries
CREATE INDEX IF NOT EXISTS idx_v2_summary_fts ON call_analysis_v2 USING GIN(to_tsvector('english', call_summary));

-- Index on processed_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_v2_processed_at ON call_analysis_v2(processed_at DESC);

-- Composite index for common filtering patterns
CREATE INDEX IF NOT EXISTS idx_v2_tier1_tier5 ON call_analysis_v2(tier1_value, tier5_value);

-- Index for confidence score filtering
CREATE INDEX IF NOT EXISTS idx_v2_confidence ON call_analysis_v2(confidence_score DESC);

-- =====================================================================
-- HELPFUL VIEWS
-- =====================================================================

-- Summary view for quick analysis queries
CREATE OR REPLACE VIEW v_call_analysis_summary AS
SELECT 
    ringba_row_id,
    ringba_caller_id,
    tier1_value as outcome,
    tier4_value as appliance_type,
    tier5_value as billing_status,
    dispute_recommendation,
    confidence_score,
    call_summary,
    current_revenue,
    current_billed_status,
    model_used,
    processing_time_ms,
    processed_at
FROM call_analysis_v2
ORDER BY processed_at DESC;

-- View for dispute candidates
CREATE OR REPLACE VIEW v_dispute_candidates AS
SELECT 
    ringba_row_id,
    ringba_caller_id,
    tier1_value,
    tier5_value,
    dispute_recommendation,
    dispute_recommendation_reason,
    call_summary,
    current_revenue,
    current_billed_status,
    confidence_score,
    processed_at
FROM call_analysis_v2
WHERE dispute_recommendation IN ('REVIEW', 'STRONG')
   OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true)
ORDER BY 
    CASE dispute_recommendation
        WHEN 'STRONG' THEN 1
        WHEN 'REVIEW' THEN 2
        ELSE 3
    END,
    processed_at DESC;

-- View for billing discrepancies
CREATE OR REPLACE VIEW v_billing_discrepancies AS
SELECT 
    ringba_row_id,
    ringba_caller_id,
    tier5_value,
    current_revenue,
    current_billed_status,
    call_summary,
    tier5_reason,
    processed_at
FROM call_analysis_v2
WHERE 
    (tier5_value = 'LIKELY_BILLABLE' AND current_billed_status = false AND current_revenue = 0)
    OR (tier5_value = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true AND current_revenue > 0)
ORDER BY current_revenue DESC, processed_at DESC;

