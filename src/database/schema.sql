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

-- Table for storing tag definitions
CREATE TABLE IF NOT EXISTS tag_definitions (
    id SERIAL PRIMARY KEY,
    priority VARCHAR(20) NOT NULL,
    tag_name VARCHAR(100) NOT NULL UNIQUE,
    tag_value VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    importance TEXT NOT NULL,
    color_code VARCHAR(20),
    tier_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_tag_priority CHECK (priority IN ('Highest', 'High', 'Medium', 'Lower')),
    CONSTRAINT chk_color_code  CHECK (color_code IS NULL OR color_code IN ('red', 'orange', 'yellow', 'green'))
);
-- Index for AI tag_value → tag_id lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_definitions_tag_value
    ON tag_definitions(tag_value) WHERE tag_value IS NOT NULL;

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

-- Table for storing assigned tags per call
-- call_id is INTEGER (matches ringba_call_data.id)
CREATE TABLE IF NOT EXISTS call_tags (
    call_id    INTEGER NOT NULL REFERENCES ringba_call_data(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tag_definitions(id),
    confidence DECIMAL(3,2) DEFAULT 0.85,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (call_id, tag_id),
    CONSTRAINT chk_call_tags_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

-- Table for storing V5 tiered AI analysis (10-tier system, aligned with prompt).
-- ringba_row_id is the natural PK (one row per source call).
-- raw_ai_response lives in call_analysis_v2_raw to avoid bloating this table.
--
-- TIER COLUMN UNIFORMITY: every tier has ONLY a tierN_data JSONB column.
--   • Single-value tiers (1, 4, 5): {"value":"…", "reason":"…"}
--   • Array tiers (2, 3, 6–10):     {"values":[…], "reasons":{…}}
-- Access values as: tier1_data->>'value'  /  tier2_data->'values'
-- No separate _value or _reason shortcut columns — no partial / misleading display.
CREATE TABLE IF NOT EXISTS call_analysis_v2 (
    ringba_row_id    INTEGER NOT NULL PRIMARY KEY
        REFERENCES ringba_call_data(id) ON DELETE CASCADE,
    ringba_caller_id VARCHAR(200),
    call_timestamp   TIMESTAMPTZ,

    -- Tier 1: Primary outcome  {"value":"…","reason":"…"}
    tier1_data  JSONB NOT NULL DEFAULT '{"value":"UNKNOWN","reason":null}',
    -- Tier 2: Quality/dispute flags  {"values":[…],"reasons":{…}}
    tier2_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
    -- Tier 3: Customer intent
    tier3_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
    -- Tier 4: Appliance type  {"value":"…","reason":"…"}
    tier4_data  JSONB NOT NULL DEFAULT '{"value":null,"reason":null}',
    -- Tier 5: Billing indicator  {"value":"…","reason":"…"}
    tier5_data  JSONB NOT NULL DEFAULT '{"value":null,"reason":null}',
    -- Tier 6: Customer demographics  {"values":[…],"reasons":{…}}
    tier6_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
    -- Tier 7: Buyer performance
    tier7_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
    -- Tier 8: Traffic quality
    tier8_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
    -- Tier 9: Special situations
    tier9_data  JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',
    -- Tier 10: Buyer operational issues
    tier10_data JSONB NOT NULL DEFAULT '{"values":[],"reasons":{}}',

    confidence_score              DECIMAL(3,2),
    dispute_recommendation        VARCHAR(20) NOT NULL DEFAULT 'NONE',
    dispute_recommendation_reason TEXT,
    call_summary                  TEXT NOT NULL DEFAULT '',
    extracted_customer_info       JSONB NOT NULL DEFAULT '{}',
    system_duplicate              BOOLEAN NOT NULL DEFAULT FALSE,
    current_revenue               DECIMAL(10,2),
    current_billed_status         BOOLEAN NOT NULL DEFAULT FALSE,
    processing_time_ms            INTEGER,
    model_used                    VARCHAR(100),
    processed_at                  TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_dispute_recommendation CHECK (dispute_recommendation IN ('NONE','REVIEW','STRONG')),
    CONSTRAINT chk_confidence_score CHECK (
        confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)
    )
);

-- Separate table for raw AI debug blobs — prevents bloating call_analysis_v2
CREATE TABLE IF NOT EXISTS call_analysis_v2_raw (
    ringba_row_id INTEGER PRIMARY KEY
        REFERENCES call_analysis_v2(ringba_row_id) ON DELETE CASCADE,
    raw_ai_response JSONB NOT NULL,
    stored_at TIMESTAMPTZ DEFAULT NOW()
);

-- call_transcriptions indexes
CREATE INDEX IF NOT EXISTS idx_transcriptions_processed ON call_transcriptions(processed);
CREATE INDEX IF NOT EXISTS idx_transcriptions_call_date ON call_transcriptions(call_date);

-- call_tags indexes (PK covers call_id + tag_id; keep single-column for FK lookups)
CREATE INDEX IF NOT EXISTS idx_call_tags_call_id ON call_tags(call_id);
CREATE INDEX IF NOT EXISTS idx_call_tags_tag_id  ON call_tags(tag_id);

-- call_analysis indexes
CREATE INDEX IF NOT EXISTS idx_call_analysis_call_id ON call_analysis(call_id);

-- call_analysis_v2 — functional indexes on JSON-extracted values (single-value tiers)
CREATE INDEX IF NOT EXISTS idx_v2_tier1          ON call_analysis_v2((tier1_data->>'value'));
CREATE INDEX IF NOT EXISTS idx_v2_tier4          ON call_analysis_v2((tier4_data->>'value'));
CREATE INDEX IF NOT EXISTS idx_v2_tier5          ON call_analysis_v2((tier5_data->>'value'));
CREATE INDEX IF NOT EXISTS idx_v2_dispute        ON call_analysis_v2(dispute_recommendation);
CREATE INDEX IF NOT EXISTS idx_v2_call_timestamp ON call_analysis_v2(call_timestamp);
-- GIN indexes for JSONB containment queries on all array tiers
CREATE INDEX IF NOT EXISTS idx_v2_tier2_gin  ON call_analysis_v2 USING GIN(tier2_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier3_gin  ON call_analysis_v2 USING GIN(tier3_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier6_gin  ON call_analysis_v2 USING GIN(tier6_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier7_gin  ON call_analysis_v2 USING GIN(tier7_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier8_gin  ON call_analysis_v2 USING GIN(tier8_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier9_gin  ON call_analysis_v2 USING GIN(tier9_data);
CREATE INDEX IF NOT EXISTS idx_v2_tier10_gin ON call_analysis_v2 USING GIN(tier10_data);

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

-- Full-text search on call summaries
CREATE INDEX IF NOT EXISTS idx_v2_summary_fts ON call_analysis_v2
    USING GIN(to_tsvector('english', COALESCE(call_summary, '')));

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_v2_processed_at ON call_analysis_v2(processed_at DESC);

-- Composite functional index for outcome + billing filter
CREATE INDEX IF NOT EXISTS idx_v2_tier1_tier5 ON call_analysis_v2
    ((tier1_data->>'value'), (tier5_data->>'value'));

-- Confidence score range filtering
CREATE INDEX IF NOT EXISTS idx_v2_confidence ON call_analysis_v2(confidence_score DESC);

-- Partial index for billing dispute detection
CREATE INDEX IF NOT EXISTS idx_v2_tier5_billed_not_billable
    ON call_analysis_v2((tier5_data->>'value'), current_billed_status)
    WHERE (tier5_data->>'value') = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true;

-- =====================================================================
-- HELPFUL VIEWS
-- =====================================================================

-- Summary view for quick analysis queries
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
FROM call_analysis_v2;

-- View for dispute candidates
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
   OR (tier5_data->>'value' = 'DEFINITELY_NOT_BILLABLE' AND current_billed_status = true);

-- View for billing discrepancies
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
   OR (tier5_data->>'value' = 'DEFINITELY_NOT_BILLABLE'  AND current_billed_status = true  AND current_revenue > 0);

-- =====================================================================
-- CAMPAIGN PROMPTS
-- Stores AI system prompts per campaign with version history.
-- No global default: only campaign-specific prompts (campaign_id IS NOT NULL).
-- =====================================================================
CREATE TABLE IF NOT EXISTS campaign_prompts (
    id              SERIAL PRIMARY KEY,
    campaign_id     VARCHAR REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    campaign_name   VARCHAR(200),
    prompt_version  VARCHAR(20)  NOT NULL DEFAULT 'V5',
    system_prompt   TEXT         NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);
-- One active prompt per campaign (campaign-specific rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_prompts_active_per_campaign
    ON campaign_prompts(campaign_id)
    WHERE is_active = TRUE AND campaign_id IS NOT NULL;
-- Only one active global default (campaign_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_prompts_global_default
    ON campaign_prompts((campaign_id IS NULL))
    WHERE campaign_id IS NULL AND is_active = TRUE;

-- View deriving detected_reason from call_analysis_v2 (eliminates duplicate storage in call_tags)
CREATE OR REPLACE VIEW v_call_tags_with_reasons AS
SELECT
    ct.call_id,
    ct.tag_id,
    td.tag_value,
    td.tag_name,
    td.tier_number,
    td.priority,
    ct.confidence,
    ct.created_at,
    CASE
        WHEN td.tier_number = 1  THEN v2.tier1_data->>'reason'
        WHEN td.tier_number = 2  THEN v2.tier2_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 3  THEN v2.tier3_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 4  THEN v2.tier4_data->>'reason'
        WHEN td.tier_number = 5  THEN v2.tier5_data->>'reason'
        WHEN td.tier_number = 6  THEN v2.tier6_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 7  THEN v2.tier7_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 8  THEN v2.tier8_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 9  THEN v2.tier9_data->'reasons'->>td.tag_value
        WHEN td.tier_number = 10 THEN v2.tier10_data->'reasons'->>td.tag_value
    END AS detected_reason
FROM call_tags ct
JOIN tag_definitions td ON ct.tag_id = td.id
JOIN call_analysis_v2 v2 ON ct.call_id = v2.ringba_row_id;
