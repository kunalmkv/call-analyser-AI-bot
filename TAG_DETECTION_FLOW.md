# Tag Detection Logic Flow - Complete Explanation

## Overview
**YES, ALL 22 TAG DEFINITIONS ARE SENT TO THE AI** along with each transcription. The AI analyzes the transcription and decides which tags apply.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SERVICE STARTUP                                               │
│    - Load ALL 22 tag definitions from database                   │
│    - Store in memory for reuse                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. FETCH UNPROCESSED TRANSCRIPTIONS                              │
│    - Query: SELECT * FROM call_transcriptions WHERE processed=false│
│    - Batch size: 10 (configurable)                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. FOR EACH TRANSCRIPTION:                                       │
│                                                                  │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │ 3a. CREATE SYSTEM PROMPT                                  │ │
│    │    - Include ALL 22 tag definitions                      │ │
│    │    - Format: "Tag Name (Priority): Description"          │ │
│    │    - Include detection rules for specific tags            │ │
│    │    - Request JSON response format                         │ │
│    └──────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │ 3b. CREATE USER PROMPT                                    │ │
│    │    - Transcription text                                   │ │
│    │    - Call duration                                        │ │
│    │    - Caller phone number                                  │ │
│    │    - Call date                                            │ │
│    └──────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │ 3c. SEND TO OPENROUTER API                                │ │
│    │    POST https://openrouter.ai/api/v1/chat/completions    │ │
│    │    {                                                      │ │
│    │      "model": "anthropic/claude-3.5-sonnet",             │ │
│    │      "messages": [                                        │ │
│    │        {                                                  │ │
│    │          "role": "system",                                │ │
│    │          "content": "<ALL 22 TAG DEFINITIONS>"            │ │
│    │        },                                                 │ │
│    │        {                                                  │ │
│    │          "role": "user",                                  │ │
│    │          "content": "<TRANSCRIPTION + METADATA>"          │ │
│    │        }                                                  │ │
│    │      ],                                                   │ │
│    │      "response_format": { "type": "json_object" }        │ │
│    │    }                                                      │ │
│    └──────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │ 3d. AI RESPONSE                                            │ │
│    │    {                                                      │ │
│    │      "summary": "...",                                    │ │
│    │      "sentiment": "positive|neutral|negative",            │ │
│    │      "overallConfidence": 0.9,                            │ │
│    │      "detectedTags": [                                    │ │
│    │        {                                                  │ │
│    │          "tagName": "Booking Intent",                     │ │
│    │          "confidence": 0.95,                               │ │
│    │          "reason": "Customer explicitly agreed..."        │ │
│    │        },                                                 │ │
│    │        {                                                  │ │
│    │          "tagName": "Technical Terms Used",               │ │
│    │          "confidence": 0.9,                               │ │
│    │          "reason": "Customer mentioned 'compressor'..."    │ │
│    │        }                                                  │ │
│    │      ]                                                    │ │
│    │    }                                                      │ │
│    └──────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │ 3e. VALIDATE RESPONSE                                     │ │
│    │    - Check required fields exist                          │ │
│    │    - Validate sentiment values                            │ │
│    │    - Validate confidence scores (0-1)                     │ │
│    │    - Validate tag structure                               │ │
│    └──────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │ 3f. MAP TAG NAMES TO DATABASE IDs                         │ │
│    │    - Create map: tag_name → tag_id                        │ │
│    │    - Match AI tag names to database IDs                   │ │
│    │    - Filter out unknown tags (warn if found)              │ │
│    └──────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│    ┌──────────────────────────────────────────────────────────┐ │
│    │ 3g. SAVE TO DATABASE                                      │ │
│    │    - Insert into call_analysis table                      │ │
│    │    - Insert into call_tags table (with confidence)         │ │
│    │    - Mark transcription as processed                       │ │
│    └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Points

### 1. **ALL Tags Are Sent to AI**
   - **Location**: `src/services/openRouterClient.js` - `createSystemPrompt()` function
   - **What's sent**: All 22 tag definitions from the database
   - **Format**: Each tag includes:
     - Tag name
     - Priority level (Highest/High/Medium/Lower)
     - Description
     - Detection rules (for specific tags)

### 2. **System Prompt Structure**
```javascript
// From openRouterClient.js lines 7-43
const createSystemPrompt = (tagDefinitions) => {
    // Build list of ALL tags
    const tagsList = tagDefinitions.map(tag => 
        `- ${tag.tag_name} (${tag.priority}): ${tag.description}`
    ).join('\n');
    
    return `You are an expert call center quality analyst...
    
    Tag Definitions:
    ${tagsList}  // <-- ALL 22 TAGS INCLUDED HERE
    
    IMPORTANT RULES:
    - For "High-Quality Unbilled": Call duration must be ≥90s...
    - For "Chargeback Risk": Look for repeat calls...
    ...
    `;
};
```

### 3. **What Gets Sent to OpenRouter API**
```json
{
  "model": "anthropic/claude-3.5-sonnet",
  "messages": [
    {
      "role": "system",
      "content": "You are an expert...\n\nTag Definitions:\n- High-Quality Unbilled (Highest): ...\n- Chargeback Risk (Highest): ...\n... [ALL 22 TAGS] ..."
    },
    {
      "role": "user",
      "content": "Analyze this call transcription:\n\nCall Duration: 180 seconds\nCaller Phone: +14155551234\nDate: 2024-11-14\n\nTranscription:\nAgent: Hello...\nCustomer: Hi, my refrigerator..."
    }
  ],
  "response_format": { "type": "json_object" }
}
```

### 4. **AI Decision Process**
The AI (Claude 3.5 Sonnet) receives:
- ✅ **All 22 tag definitions** (what tags exist and their criteria)
- ✅ **The full transcription** (what happened in the call)
- ✅ **Call metadata** (duration, phone, date)

The AI then:
1. Reads the transcription
2. Compares it against each tag's criteria
3. Decides which tags apply
4. Assigns confidence scores (0-1)
5. Provides reasoning for each tag

### 5. **Tag Mapping After AI Response**
```javascript
// From openRouterClient.js lines 165-182
export const mapTagsToIds = (tagDefinitions, aiTags) => {
    // Create lookup map: "booking intent" → 14
    const tagMap = new Map(
        tagDefinitions.map(t => [t.tag_name.toLowerCase(), t.id])
    );
    
    // Match AI tag names to database IDs
    return aiTags
        .map(aiTag => {
            const tagId = tagMap.get(aiTag.tagName.toLowerCase());
            if (!tagId) {
                console.warn(`Unknown tag name: ${aiTag.tagName}`);
                return null;
            }
            return {
                tagId,              // Database ID
                confidence: aiTag.confidence,  // AI confidence score
                reason: aiTag.reason           // AI's reasoning
            };
        })
        .filter(tag => tag !== null);
};
```

---

## Example: Real Processing Flow

### Input (from database):
```javascript
{
  call_id: "SAMPLE_001",
  transcription: "Agent: Hello... Customer: Hi, my refrigerator stopped working...",
  duration: 180,
  caller_phone: "+14155551234",
  call_date: "2024-11-14"
}
```

### System Prompt Sent to AI:
```
You are an expert call center quality analyst...

Tag Definitions:
- High-Quality Unbilled (Highest): Call duration ≥90s, Revenue = 0, Valid ZIP & Need Category Match
- Chargeback Risk (Highest): Call indicates repeat calls, customer service inquiry...
- Booking Intent (Medium): Caller explicitly requested service or appointment
- Technical Terms Used (Lower): Caller used specific appliance keywords...
... [all 22 tags] ...

IMPORTANT RULES:
- For "High-Quality Unbilled": Call duration must be ≥90s...
...
```

### User Prompt Sent to AI:
```
Analyze this call transcription:

Call Duration: 180 seconds
Caller Phone: +14155551234
Date: 2024-11-14

Transcription:
Agent: Hello, thank you for calling ABC Appliance Repair...
Customer: Hi, my refrigerator stopped working yesterday. The compressor seems to be making a strange noise.
...
```

### AI Response:
```json
{
  "summary": "Customer called about malfunctioning refrigerator...",
  "sentiment": "positive",
  "overallConfidence": 0.90,
  "detectedTags": [
    {
      "tagName": "High-Quality Unbilled",
      "confidence": 0.95,
      "reason": "Call duration 180s, valid ZIP provided, service category matches"
    },
    {
      "tagName": "Booking Intent",
      "confidence": 0.95,
      "reason": "Customer explicitly agreed to book appointment"
    },
    {
      "tagName": "Technical Terms Used",
      "confidence": 0.9,
      "reason": "Customer mentioned 'compressor' specifically"
    }
  ]
}
```

### After Processing:
- Tags mapped to database IDs: `[1, 14, 21]`
- Saved to `call_tags` table with confidence scores
- Summary and sentiment saved to `call_analysis` table

---

## Why This Approach?

### ✅ **Advantages:**
1. **Context-Aware**: AI sees all possible tags and can make informed decisions
2. **Flexible**: Can detect multiple tags per call
3. **Intelligent**: AI understands relationships between tags
4. **Consistent**: Same tag definitions used for all calls
5. **Explainable**: AI provides reasoning for each tag

### ⚠️ **Considerations:**
1. **Token Usage**: Sending all 22 tags uses more tokens (~500-800 tokens per request)
2. **Cost**: More tokens = higher API costs
3. **Latency**: Larger prompts take slightly longer to process

### 💡 **Alternative Approach (Not Used):**
- Could send only relevant tags based on pre-filtering
- But this would require rule-based logic, reducing AI flexibility
- Current approach lets AI make all decisions intelligently

---

## Code Locations

1. **Tag Loading**: `src/services/processor.js:209` - Loads all tags at startup
2. **System Prompt**: `src/services/openRouterClient.js:7-43` - Creates prompt with all tags
3. **API Call**: `src/services/openRouterClient.js:60-95` - Sends to OpenRouter
4. **Tag Mapping**: `src/services/openRouterClient.js:165-182` - Maps AI response to DB IDs
5. **Saving**: `src/services/processor.js:24-75` - Saves results to database

---

## Summary

**YES, all 22 tag definitions are sent to the AI with every transcription.**

The AI acts as an intelligent classifier that:
- Receives the complete "tag catalog" (all 22 definitions)
- Analyzes the transcription content
- Selects which tags apply based on the content
- Provides confidence scores and reasoning

This is a **context-rich approach** that gives the AI full information to make the best tagging decisions.

