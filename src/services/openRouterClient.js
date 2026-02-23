import { getOpenRouterConfig, config as appConfig } from '../config/index.js';

const config = getOpenRouterConfig();

// JSON Schema for structured output (used with response_format.json_schema)
const RESPONSE_SCHEMA = {
    type: 'object',
    required: [
        'ringbaCallerId', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5',
        'tier6', 'tier7', 'tier8', 'tier9', 'tier10',
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
                        enum: ['DIY_ATTEMPT_FAILED', 'INSURANCE_CLAIM_RELATED', 'PARTS_INQUIRY', 'CONSIDERING_NEW_PURCHASE']
                    }
                },
                reasons: {
                    type: 'object',
                    additionalProperties: { type: 'string' }
                }
            }
        },
        tier10: {
            type: 'object',
            required: ['values', 'reasons'],
            additionalProperties: false,
            properties: {
                values: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['BUYER_AVAILABILITY_ISSUE', 'BUYER_ROUTING_FAILURE']
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

// Build the user prompt with all call data as JSON
const createUserPrompt = (callData) => {
    return `Analyze this call:\n\n${JSON.stringify(callData)}`;
};

// Build call data object from raw DB row for the prompt.
// Must match SECTION 2 (INPUT DATA SPECIFICATION) in CALL_TAGGING_SYSTEM_PROMPT_V5.md.
export const buildCallData = (row) => {
    const callData = {
        // Required - copy exactly to output
        ringbaCallerId: row.ringba_caller_id || row.inboundCallId || `ROW_${row.id}`,
        // Consumer phone number
        callerId: row.caller_phone ?? row.callerId ?? null,
        transcript: row.transcription || row.transcript || '',
        callLengthInSeconds: parseInt(row.duration || row.callLengthInSeconds || 0, 10),
        revenue: parseFloat(row.revenue || 0),
        billed: row.billed !== undefined ? Boolean(row.billed) : (parseFloat(row.revenue || 0) > 0),
        hung_up: row.hung_up || 'Unknown',
        duplicate: row.isDuplicate === true || row.isDuplicate === 'true',
        // Customer info (may be null)
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        address: row.address ?? null,
        street_number: row.street_number ?? null,
        street_name: row.street_name ?? null,
        street_type: row.street_type ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        g_zip: row.g_zip ?? null,
        // Metadata (prompt expects these for context)
        targetName: row.targetName ?? null,
        publisherName: row.publisherName ?? null
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

// Build system message with prompt caching support.
// systemPrompt is sourced from the campaign_prompts DB table at runtime.
const buildSystemMessage = (systemPrompt) => {
    return {
        role: 'system',
        content: [
            {
                type: 'text',
                text: systemPrompt,
                cache_control: { type: 'ephemeral' }
            }
        ]
    };
};

// Make API request to OpenRouter
const makeOpenRouterRequest = async (userPrompt, systemPrompt) => {
    const requestBody = {
        model: config.model,
        messages: [
            buildSystemMessage(systemPrompt),
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
            return makeOpenRouterRequestFallback(userPrompt, systemPrompt);
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
const makeOpenRouterRequestFallback = async (userPrompt, systemPrompt) => {
    const requestBody = {
        model: config.model,
        messages: [
            buildSystemMessage(systemPrompt),
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
    for (const tier of ['tier2', 'tier3', 'tier6', 'tier7', 'tier8', 'tier9', 'tier10']) {
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

// Main analysis function - analyzes a single call.
// systemPrompt is loaded from campaign_prompts at runtime (passed by processor.js).
export const analyzeCall = async (callData, systemPrompt) => {
    if (!systemPrompt) throw new Error('analyzeCall: systemPrompt is required');
    const userPrompt = createUserPrompt(callData);
    const makeRequest = () => makeOpenRouterRequest(userPrompt, systemPrompt);

    const result = await retryWithBackoff(
        makeRequest,
        appConfig.MAX_RETRIES || 3,
        appConfig.RETRY_DELAY_MS || 1000
    );

    return validateAIResponse(result);
};

// Process a batch of calls — all rows in a batch share the same systemPrompt.
// The processor groups by campaign and calls this once per unique prompt.
export const processBatch = async (rows, systemPrompt) => {
    if (!systemPrompt) throw new Error('processBatch: systemPrompt is required');
    const results = await Promise.allSettled(
        rows.map(async (row) => {
            const startTime = Date.now();

            try {
                const callData = buildCallData(row);
                const aiResponse = await analyzeCall(callData, systemPrompt);

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
