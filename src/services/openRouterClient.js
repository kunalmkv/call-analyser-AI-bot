import { getOpenRouterConfig, config as appConfig } from '../config/index.js';

const config = getOpenRouterConfig();

// JSON Schema for structured output (used with response_format.json_schema)
const RESPONSE_SCHEMA = {
    type: 'object',
    required: [
        'ringbaCallerId', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5',
        'tier6', 'tier7', 'tier8', 'tier9',
        'confidence_score', 'dispute_recommendation', 'call_summary',
        'extracted_customer_info', 'system_duplicate', 'current_revenue',
        'current_billed_status'
    ],
    additionalProperties: false,
    properties: {
        ringbaCallerId: { type: 'string' },
        tier1: {
            type: 'object',
            required: ['value', 'reason'],
            additionalProperties: false,
            properties: {
                value: {
                    type: 'string',
                    enum: [
                        'QUALIFIED_APPOINTMENT_SET', 'SOFT_LEAD_INTERESTED',
                        'INFORMATION_ONLY_CALL', 'BUYER_EARLY_HANGUP',
                        'USER_EARLY_HANGUP', 'NO_BUYER_INTEREST'
                    ]
                },
                reason: { type: 'string' }
            }
        },
        tier2: {
            type: 'object',
            required: ['values', 'reasons'],
            additionalProperties: false,
            properties: {
                values: {
                    type: 'array',
                    items: { type: 'string' }
                },
                reasons: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            }
        },
        tier3: {
            type: 'object',
            required: ['values', 'reasons'],
            additionalProperties: false,
            properties: {
                values: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: [
                            'URGENT_REPAIR_NEEDED', 'PREVENTIVE_MAINTENANCE',
                            'WARRANTY_CLAIM_ATTEMPT', 'PRICE_COMPARISON_SHOPPING',
                            'CONSIDERING_NEW_PURCHASE', 'PARTS_INQUIRY'
                        ]
                    }
                },
                reasons: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            }
        },
        tier4: {
            type: 'object',
            required: ['value', 'reason'],
            additionalProperties: false,
            properties: {
                value: { type: 'string' },
                reason: { type: 'string' }
            }
        },
        tier5: {
            type: 'object',
            required: ['value', 'reason'],
            additionalProperties: false,
            properties: {
                value: {
                    type: 'string',
                    enum: ['LIKELY_BILLABLE', 'QUESTIONABLE_BILLING', 'DEFINITELY_NOT_BILLABLE']
                },
                reason: { type: 'string' }
            }
        },
        tier6: {
            type: 'object',
            required: ['values', 'reasons'],
            additionalProperties: false,
            properties: {
                values: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: [
                            'ELDERLY_CUSTOMER', 'RENTAL_PROPERTY_OWNER',
                            'FIRST_TIME_HOMEOWNER', 'MULTILINGUAL_CUSTOMER',
                            'COMMERCIAL_PROPERTY'
                        ]
                    }
                },
                reasons: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            }
        },
        tier7: {
            type: 'object',
            required: ['values', 'reasons'],
            additionalProperties: false,
            properties: {
                values: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: [
                            'EXCELLENT_BUYER_SERVICE', 'POOR_BUYER_SERVICE',
                            'BUYER_MISSED_OPPORTUNITY'
                        ]
                    }
                },
                reasons: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            }
        },
        tier8: {
            type: 'object',
            required: ['values', 'reasons'],
            additionalProperties: false,
            properties: {
                values: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: [
                            'HIGH_INTENT_TRAFFIC', 'BRAND_CONFUSION_TRAFFIC',
                            'CONSUMER_SHOPPING_MULTIPLE'
                        ]
                    }
                },
                reasons: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            }
        },
        tier9: {
            type: 'object',
            required: ['values', 'reasons'],
            additionalProperties: false,
            properties: {
                values: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['DIY_ATTEMPT_FAILED', 'INSURANCE_CLAIM_RELATED']
                    }
                },
                reasons: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            }
        },
        confidence_score: { type: 'number' },
        dispute_recommendation: {
            type: 'string',
            enum: ['NONE', 'REVIEW', 'STRONG']
        },
        dispute_recommendation_reason: { type: 'string' },
        call_summary: { type: 'string' },
        extracted_customer_info: {
            type: 'object',
            additionalProperties: { type: ['string', 'null'] }
        },
        system_duplicate: { type: 'boolean' },
        current_revenue: { type: 'number' },
        current_billed_status: { type: 'boolean' }
    }
};

// V5 Optimized System Prompt — output schema section removed (enforced via json_schema)
const SYSTEM_PROMPT = `You are a call analyst for an affiliate lead generation company selling appliance repair leads to buyers. Analyze call transcripts and tag them to optimize ad spend, manage buyer relationships, and support dispute resolution.

BUSINESS MODEL (affiliate lead gen):
- Multiple calls from same consumer to different buyers = GOOD (multiple revenue streams)
- Consumer shopping around / calling competitors = NORMAL, not a problem
- Brand bidding = consumer searching for brands is EXPECTED
- Only flag TRUE quality issues: unserviceable areas, technical failures, confirmed wrong service
- Disputes happen at BUYER level 7-14 days later, not proactively

BILLING RULES:
- Buyer engages + provides service + >60s = BILLABLE (even without appointment)
- Appointment booked = ALWAYS billable (even if <60s, as long as >45s)
- <40s with no value = NOT billable
- 40-60s unclear = QUESTIONABLE (unless appointment booked)

OUTPUT: Return ONLY valid JSON matching the provided schema. No markdown, no preamble.

=== TAG DEFINITIONS ===

TIER 1 - PRIMARY OUTCOME (exactly 1):
QUALIFIED_APPOINTMENT_SET: Firm appointment with date/time confirmed, address collected
SOFT_LEAD_INTERESTED: Interested but no commitment ("call back", "check with spouse", got pricing)
INFORMATION_ONLY_CALL: Got info, unlikely to convert (warranty Q only, price check, no follow-up)
BUYER_EARLY_HANGUP: Buyer disconnected prematurely (hung_up="Target", technical issues, "can't help")
USER_EARLY_HANGUP: Consumer disconnected prematurely (hung_up="Caller", <30s, wrong number)
NO_BUYER_INTEREST: Buyer explicitly refused service, ended without helping

TIER 2 - QUALITY FLAGS (array, all that apply):
WRONG_NUMBER: Wanted different company/brand. DATA POINT ONLY - expected in brand campaigns. NEVER auto-dispute. Can still be billable if buyer helps.
UNSERVICEABLE_GEOGRAPHY: Buyer can't service location. Dispute=STRONG.
UNSERVICEABLE_APPLIANCE_[TYPE]: Buyer doesn't service this appliance (specify: TV, COMMERCIAL, HVAC, POOL, OTHER). Dispute=STRONG.
BUYER_AVAILABILITY_ISSUE: No agents / closed during hours. Buyer's fault, not routing.
BUYER_ROUTING_FAILURE: Technical issue, IVR 60+ sec hold, transfer failed.
IMMEDIATE_DISCONNECT: <10 seconds, no conversation. Never billable. Dispute=STRONG.
POSSIBLE_DISPUTE: Soft flag for borderline cases. Review only IF buyer disputes.

TIER 3 - CUSTOMER INTENT (array, all that apply):
URGENT_REPAIR_NEEDED: "Not working", "need someone today", emergency
PREVENTIVE_MAINTENANCE: "Making noises", "want it checked", no urgency
WARRANTY_CLAIM_ATTEMPT: "Under warranty?", "bought 3 months ago" (intent, not outcome)
PRICE_COMPARISON_SHOPPING: "How much?", multiple cost questions, no urgency
CONSIDERING_NEW_PURCHASE: "Should I buy new?", "worth fixing?"
PARTS_INQUIRY: "Sell parts?", "need replacement motor", wants DIY

TIER 4 - APPLIANCE TYPE (exactly 1):
WASHER_REPAIR | DRYER_REPAIR | REFRIGERATOR_REPAIR | DISHWASHER_REPAIR | OVEN_STOVE_REPAIR | MICROWAVE_REPAIR | GARBAGE_DISPOSAL_REPAIR | MULTIPLE_APPLIANCES | UNKNOWN_APPLIANCE | UNSERVICED_APPLIANCE_[TYPE]

TIER 5 - BILLING INDICATOR (exactly 1):
LIKELY_BILLABLE: >60s meaningful conversation OR appointment booked (even if <60s, >45s) OR detailed qualification
QUESTIONABLE_BILLING: 40-60s, unclear outcome (EXCEPTION: appointment = LIKELY)
DEFINITELY_NOT_BILLABLE: <40s OR IMMEDIATE_DISCONNECT OR major quality flag OR NO_BUYER_INTEREST
CRITICAL: Reason MUST start with "Currently billed at $X (billed=true/false). Duration Xs..."

TIER 6 - CUSTOMER DEMOGRAPHICS (array, can be empty):
ELDERLY_CUSTOMER | RENTAL_PROPERTY_OWNER | FIRST_TIME_HOMEOWNER | MULTILINGUAL_CUSTOMER | COMMERCIAL_PROPERTY

TIER 7 - BUYER PERFORMANCE (array, can be empty):
EXCELLENT_BUYER_SERVICE: Professional, qualified well, attempted close
POOR_BUYER_SERVICE: Rude, unhelpful, unprofessional
BUYER_MISSED_OPPORTUNITY: Customer ready but buyer didn't close

TIER 8 - TRAFFIC QUALITY (array, can be empty):
HIGH_INTENT_TRAFFIC: Ready-to-buy signals, urgent need, decision-maker
BRAND_CONFUSION_TRAFFIC: Wanted manufacturer (expected in brand campaigns, NOT a problem)
CONSUMER_SHOPPING_MULTIPLE: Called other companies (NORMAL, NOT a problem)

TIER 9 - SPECIAL SITUATIONS (array, can be empty):
DIY_ATTEMPT_FAILED: Tried fixing themselves, may be more complex
INSURANCE_CLAIM_RELATED: Insurance involved, different timeline

=== DECISION RULES ===

Primary outcome:
- Appointment with date/time confirmed -> QUALIFIED_APPOINTMENT_SET
- Interested, no commitment -> SOFT_LEAD_INTERESTED
- <30s + hung_up="Target" -> BUYER_EARLY_HANGUP
- <30s + hung_up="Caller" -> USER_EARLY_HANGUP
- Buyer refused to help -> NO_BUYER_INTEREST
- Otherwise -> INFORMATION_ONLY_CALL

Brand name mentioned:
- Tag WRONG_NUMBER + BRAND_CONFUSION_TRAFFIC
- If buyer still helped -> assess billing normally. If not -> NO_BUYER_INTEREST
- Dispute: NONE (expected from brand campaigns)

"I called before":
- If BUYER recognizes and refuses -> NO_BUYER_INTEREST + POSSIBLE_DISPUTE
- Otherwise -> CONSUMER_SHOPPING_MULTIPLE, assess normally

=== CUSTOMER INFO EXTRACTION ===

Extract from transcript: firstName, lastName, address, street_number, street_name, street_type, city, state, g_zip
Output ONLY fields that differ from input OR were null/missing in input. If no differences, return empty object {}.

=== IMPORTANT RULES ===

- ringbaCallerId: copy exactly from input
- dispute_recommendation_reason: ONLY include if REVIEW or STRONG, use empty string for NONE
- Reasons must be SPECIFIC and CONTEXTUAL, not generic
- WRONG_NUMBER is NEVER a dispute trigger by itself

=== COMMON MISTAKES TO AVOID ===

- DO NOT auto-dispute WRONG_NUMBER
- DO NOT tag consumer shopping around as a problem
- DO NOT write generic reasons like "customer was interested" - cite specific transcript evidence
- DO NOT forget revenue context in tier5 reason
- DO NOT output customer info that matches input - only differences/nulls
- DO NOT treat short appointment calls as QUESTIONABLE - appointment = LIKELY_BILLABLE if >45s`;

// Build the user prompt with all call data as JSON
const createUserPrompt = (callData) => {
    return `Analyze this call:\n\n${JSON.stringify(callData)}`;
};

// Build call data object from raw DB row for the prompt
export const buildCallData = (row) => {
    const callData = {
        ringbaCallerId: row.ringba_caller_id || row.inboundCallId || `ROW_${row.id}`,
        transcript: row.transcription || row.transcript || '',
        callLengthInSeconds: parseInt(row.duration || row.callLengthInSeconds || 0, 10),
        revenue: parseFloat(row.revenue || 0),
        billed: parseFloat(row.revenue || 0) > 0,
        hung_up: row.hung_up || 'Unknown',
        duplicate: row.isDuplicate === true || row.isDuplicate === 'true',
        firstName: row.firstName || null,
        lastName: row.lastName || null,
        address: row.address || null,
        street_number: row.street_number || null,
        street_name: row.street_name || null,
        street_type: row.street_type || null,
        city: row.city || null,
        state: row.state || null,
        g_zip: row.g_zip || null,
    };
    return callData;
};

// Build the response_format parameter based on config
const buildResponseFormat = () => {
    if (config.useSchema) {
        return {
            type: 'json_schema',
            json_schema: {
                name: 'call_analysis',
                strict: true,
                schema: RESPONSE_SCHEMA
            }
        };
    }
    return { type: 'json_object' };
};

// Build system message with prompt caching support
const buildSystemMessage = () => {
    return {
        role: 'system',
        content: [
            {
                type: 'text',
                text: SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' }
            }
        ]
    };
};

// Make API request to OpenRouter
const makeOpenRouterRequest = async (userPrompt) => {
    const requestBody = {
        model: config.model,
        messages: [
            buildSystemMessage(),
            { role: 'user', content: userPrompt }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: buildResponseFormat()
    };

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/adstia/call-tagging-service',
            'X-Title': 'Call Tagging Service V5'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.text();
        // If json_schema not supported, retry with json_object fallback
        if (config.useSchema && response.status === 400 && error.includes('json_schema')) {
            console.warn('Model does not support json_schema, falling back to json_object mode');
            return makeOpenRouterRequestFallback(userPrompt);
        }
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
        return JSON.parse(content);
    } catch (parseError) {
        throw new Error(`Failed to parse AI response as JSON: ${content.substring(0, 200)}`);
    }
};

// Fallback request using json_object mode (for models that don't support json_schema)
const makeOpenRouterRequestFallback = async (userPrompt) => {
    const requestBody = {
        model: config.model,
        messages: [
            buildSystemMessage(),
            { role: 'user', content: userPrompt }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: 'json_object' }
    };

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/adstia/call-tagging-service',
            'X-Title': 'Call Tagging Service V5'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
        return JSON.parse(content);
    } catch (parseError) {
        throw new Error(`Failed to parse AI response as JSON: ${content.substring(0, 200)}`);
    }
};

// Retry logic with exponential backoff
const retryWithBackoff = async (fn, maxRetries = 3, delayMs = 1000) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delay = delayMs * Math.pow(2, i);
                console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
};

// Validate the V5 tiered AI response
// With json_schema mode, structural validation is handled by the API.
// This function checks semantic validity and auto-fixes for json_object fallback mode.
export const validateAIResponse = (response) => {
    const errors = [];

    // Tier 1: required single value
    if (!response.tier1 || !response.tier1.value) {
        errors.push('Missing tier1.value');
    }

    // Tier 4: required single value
    if (!response.tier4 || !response.tier4.value) {
        response.tier4 = { value: 'UNKNOWN_APPLIANCE', reason: 'Could not determine from transcript' };
    }

    // Tier 5: required single value
    if (!response.tier5 || !response.tier5.value) {
        errors.push('Missing tier5.value (billing indicator)');
    }

    // Auto-fix array tiers (needed for json_object fallback)
    for (const tier of ['tier2', 'tier3', 'tier6', 'tier7', 'tier8', 'tier9']) {
        if (!response[tier]) {
            response[tier] = { values: [], reasons: {} };
        } else if (!Array.isArray(response[tier].values)) {
            if (typeof response[tier].values === 'string') {
                response[tier].values = [response[tier].values];
            } else {
                response[tier] = { values: [], reasons: {} };
            }
        }
        if (!response[tier].reasons || typeof response[tier].reasons !== 'object') {
            response[tier].reasons = {};
        }
    }

    // Defaults for optional fields
    if (typeof response.confidence_score !== 'number') {
        response.confidence_score = 0.5;
    }
    if (!['NONE', 'REVIEW', 'STRONG'].includes(response.dispute_recommendation)) {
        response.dispute_recommendation = 'NONE';
    }
    if (!response.call_summary) {
        response.call_summary = '';
    }
    if (!response.extracted_customer_info || typeof response.extracted_customer_info !== 'object') {
        response.extracted_customer_info = {};
    }

    if (errors.length > 0) {
        throw new Error(`Invalid AI response: ${errors.join(', ')}`);
    }

    return response;
};

// Main analysis function - analyzes a single call
export const analyzeCall = async (callData) => {
    const userPrompt = createUserPrompt(callData);
    const makeRequest = () => makeOpenRouterRequest(userPrompt);

    const result = await retryWithBackoff(
        makeRequest,
        appConfig.MAX_RETRIES || 3,
        appConfig.RETRY_DELAY_MS || 1000
    );

    return validateAIResponse(result);
};

// Process a batch of calls
export const processBatch = async (rows) => {
    console.log(config, "Openrouter config")
    const results = await Promise.allSettled(
        rows.map(async (row) => {
            const startTime = Date.now();

            try {
                const callData = buildCallData(row);
                const aiResponse = await analyzeCall(callData);

                return {
                    success: true,
                    rowId: row.id,
                    callData,
                    aiResponse,
                    processingTimeMs: Date.now() - startTime,
                    modelUsed: config.model
                };
            } catch (error) {
                console.error(`Failed to process row ${row.id}:`, error.message);
                return {
                    success: false,
                    rowId: row.id,
                    error: error.message
                };
            }
        })
    );

    const successful = results
        .filter(r => r.status === 'fulfilled' && r.value.success)
        .map(r => r.value);

    const failed = results
        .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))
        .map(r => r.value || { error: r.reason });

    return { successful, failed };
};

export { RESPONSE_SCHEMA };

export default {
    analyzeCall,
    validateAIResponse,
    buildCallData,
    processBatch,
    RESPONSE_SCHEMA
};
