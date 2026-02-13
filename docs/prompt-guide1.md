# COMPLETE TAGGING SYSTEM DOCUMENTATION V3
# All Tags Across 10 Tiers - Affiliate Lead Generation Model

## Overview

This document contains the complete list of all possible tags across 10 tiers for analyzing appliance repair affiliate lead generation calls.

**Total Tags**: 50+ tags organized into 10 tiers
**Business Model**: Affiliate lead generation (multiple calls from same consumer = good)
**Output Format**: Nested JSON by tier (Option B)

---

## TIER 1: PRIMARY CALL OUTCOME
**Type**: Single value (exactly one per call)
**JSON Key**: `tier1.value`

### Tag List:

1. **QUALIFIED_APPOINTMENT_SET** 💰💰💰
   - **Definition**: Firm appointment scheduled with specific date/time confirmed
   - **Revenue Impact**: Highest ($24-$58 typical)
   - **Indicators**: 
     - "I'll schedule you for Wednesday at 2pm"
     - Technician arrival time confirmed
     - Address collected and confirmed
     - Customer provides callback number
   - **Billing**: Always LIKELY_BILLABLE if >45s

2. **SOFT_LEAD_INTERESTED** 💰💰
   - **Definition**: Customer interested but didn't book immediately
   - **Revenue Impact**: Medium ($9-$27 typical)
   - **Indicators**:
     - "Let me check with my wife"
     - "Can I call you back?"
     - Asked about pricing/service details
     - Gave contact info but no firm appointment
   - **Billing**: Usually LIKELY_BILLABLE if >90s with engagement

3. **INFORMATION_ONLY_CALL** 💰
   - **Definition**: Customer got info but likely won't convert
   - **Revenue Impact**: Low (Often $0)
   - **Indicators**:
     - Warranty questions only
     - "Just checking prices"
     - Called wrong company and acknowledged quickly
     - No service need expressed
   - **Billing**: QUESTIONABLE_BILLING or DEFINITELY_NOT_BILLABLE

4. **BUYER_EARLY_HANGUP** ⚠️
   - **Definition**: Buyer/agent disconnected call prematurely
   - **Revenue Impact**: Usually $0
   - **Indicators**:
     - Buyer ends call abruptly
     - `hung_up` field = "Target"
     - Buyer technical issues
     - "I can't help you" then disconnect
   - **Billing**: Usually DEFINITELY_NOT_BILLABLE if <30s

5. **USER_EARLY_HANGUP** ⚠️
   - **Definition**: Consumer/caller disconnected prematurely
   - **Revenue Impact**: Usually $0
   - **Indicators**:
     - Consumer ends call abruptly
     - `hung_up` field = "Caller"
     - Duration <30s
     - Consumer realized wrong number
   - **Billing**: Usually DEFINITELY_NOT_BILLABLE if <30s

6. **NO_BUYER_INTEREST** ❌
   - **Definition**: Buyer explicitly refused to provide service
   - **Revenue Impact**: $0 (Should not be billed)
   - **Indicators**:
     - "We can't help you" then ends call
     - Buyer refuses to continue conversation
     - Buyer provides no service information
   - **Billing**: DEFINITELY_NOT_BILLABLE

---

## TIER 2: QUALITY/DISPUTE FLAGS
**Type**: Array (can have multiple, or be empty)
**JSON Key**: `tier2.values`

### Tag List:

1. **WRONG_NUMBER** 📊
   - **Definition**: Consumer intended to reach different company/brand
   - **Revenue Impact**: Variable - NOT always $0
   - **Indicators**:
     - "Is this Samsung customer service?"
     - "I was trying to reach LG"
     - "I thought this was Whirlpool warranty"
   - **CRITICAL**: Expected in brand bidding campaigns
   - **Action**: Track as DATA POINT, NOT auto-dispute
   - **Billing**: Can still be billable if buyer helps and appointment booked

2. **UNSERVICEABLE_GEOGRAPHY** 🗺️
   - **Definition**: Buyer cannot service customer's location
   - **Revenue Impact**: $0 (Should not be billed)
   - **Indicators**:
     - "We don't service your area"
     - "Outside our territory"
     - "Not available in your zip code"
   - **Action**: Add zip to exclusion list (if 5+ calls)
   - **Billing**: DEFINITELY_NOT_BILLABLE
   - **Dispute**: STRONG

3. **UNSERVICEABLE_APPLIANCE_[TYPE]** 🔧
   - **Definition**: Buyer does not service this appliance type
   - **Revenue Impact**: $0 (Should not be billed)
   - **Format**: Always specify the appliance type
   - **Examples**:
     - UNSERVICEABLE_APPLIANCE_TV
     - UNSERVICEABLE_APPLIANCE_COMMERCIAL
     - UNSERVICEABLE_APPLIANCE_POOL_EQUIPMENT
     - UNSERVICEABLE_APPLIANCE_HVAC
   - **Indicators**: "We don't work on TVs", "We only do appliances"
   - **Billing**: DEFINITELY_NOT_BILLABLE
   - **Dispute**: STRONG

4. **BUYER_AVAILABILITY_ISSUE** 🕐
   - **Definition**: No agents available / buyer closed during stated hours
   - **Revenue Impact**: Variable (buyer's fault)
   - **Indicators**:
     - "No agents available right now"
     - "We're closed" (during supposed business hours)
     - Staffing problem
   - **Action**: Flag to buyer about availability/staffing issue
   - **Note**: Campaign configured per buyer's schedule - this is buyer's problem
   - **Billing**: QUESTIONABLE_BILLING or DEFINITELY_NOT_BILLABLE
   - **Dispute**: REVIEW or STRONG depending on value provided

5. **BUYER_ROUTING_FAILURE** 🔌
   - **Definition**: Technical problem on buyer's end
   - **Revenue Impact**: Variable (buyer's fault)
   - **Indicators**:
     - Call quality issues from buyer
     - System is down
     - Transfer failed
     - Consumer stuck in IVR 60+ seconds then disconnect
   - **Billing**: Usually DEFINITELY_NOT_BILLABLE
   - **Dispute**: STRONG if no value provided

6. **IMMEDIATE_DISCONNECT** ⚡
   - **Definition**: Call ended <10 seconds
   - **Revenue Impact**: $0 (Never billable)
   - **Indicators**:
     - Duration <10 seconds
     - No meaningful conversation
     - Instant hang-up
   - **Billing**: DEFINITELY_NOT_BILLABLE
   - **Dispute**: STRONG

7. **POSSIBLE_DISPUTE** ⚠️
   - **Definition**: ANY situation that MIGHT result in buyer dispute
   - **Revenue Impact**: Variable (soft flag)
   - **Indicators**:
     - Buyer recognizes customer from prior contact
     - 30-60s calls with unclear value
     - Borderline quality issues
     - Anything "feels" dispute-worthy
   - **IMPORTANT**: Soft flag - only review IF buyer actually disputes
   - **Action**: Flag for review, don't auto-dispute
   - **Billing**: Variable
   - **Dispute**: REVIEW

---

## TIER 3: CUSTOMER INTENT
**Type**: Array (can have multiple, or be empty)
**JSON Key**: `tier3.values`

### Tag List:

1. **URGENT_REPAIR_NEEDED** 🚨
   - **Definition**: Emergency situation, immediate need
   - **Conversion Probability**: Highest
   - **Indicators**:
     - "Not working at all"
     - "Need someone today"
     - "Leaking everywhere"
     - "Completely broken"
   - **Action**: High priority leads
   - **Note**: Often paired with appointment booking

2. **PREVENTIVE_MAINTENANCE** 🔍
   - **Definition**: No emergency, appliance still working
   - **Conversion Probability**: Lower urgency
   - **Indicators**:
     - "Making weird noises"
     - "Want someone to look at it"
     - "Running but seems off"
     - "Just maintenance"
   - **Action**: May take longer to convert

3. **WARRANTY_CLAIM_ATTEMPT** 📄
   - **Definition**: Customer believes appliance is under warranty
   - **Conversion Probability**: 50/50 (depends if actually under warranty)
   - **Indicators**:
     - "Still under warranty?"
     - "I bought it 3 months ago"
     - "Lowe's said first year is covered"
     - Any mention of warranty
   - **Note**: This is INTENT - outcome might be paid repair
   - **Action**: Can convert to paid repair if out of warranty

4. **PRICE_COMPARISON_SHOPPING** 💲
   - **Definition**: Getting quotes, not ready to book
   - **Conversion Probability**: Medium
   - **Indicators**:
     - "How much do you charge?"
     - "What's your service fee?"
     - Multiple questions about cost
     - No urgency indicated
   - **Note**: NORMAL in affiliate lead gen

5. **CONSIDERING_NEW_PURCHASE** 🆕
   - **Definition**: Weighing repair vs. replacement
   - **Conversion Probability**: 50/50
   - **Indicators**:
     - "Should I just buy new?"
     - "How much for repair vs. new one?"
     - "Is it worth fixing?"
     - "Maybe I'll replace it"
   - **Action**: Track which appliances/ages get this

6. **PARTS_INQUIRY** 🔧
   - **Definition**: Consumer looking to purchase parts, not service
   - **Conversion Probability**: Low (wrong intent)
   - **Indicators**:
     - "Do you sell parts?"
     - "I need a replacement motor"
     - "Can I buy just the heating element?"
     - "I want to fix it myself"
   - **Billing**: Usually not billable unless buyer sells parts
   - **Note**: Wrong type of lead for repair services

---

## TIER 4: APPLIANCE TYPE
**Type**: Single value (exactly one per call)
**JSON Key**: `tier4.value`

### Tag List:

1. **WASHER_REPAIR**
   - **Common Issues**: Unbalanced, won't spin, leaking, shaking, loud noises
   - **Conversion Rate**: High (necessary appliance)
   - **Keywords**: washing machine, washer, front loader, top loader

2. **DRYER_REPAIR**
   - **Common Issues**: Not heating, not turning, takes too long, loud noises
   - **Conversion Rate**: High (necessary appliance)
   - **Keywords**: dryer, clothes dryer, gas dryer, electric dryer

3. **REFRIGERATOR_REPAIR**
   - **Common Issues**: Not cooling, ice maker, water dispenser, compressor
   - **Conversion Rate**: HIGHEST (emergency - food spoilage)
   - **Keywords**: refrigerator, fridge, freezer, ice maker

4. **DISHWASHER_REPAIR**
   - **Common Issues**: Not cleaning, not draining, door latch, not starting
   - **Conversion Rate**: Medium (less critical)
   - **Keywords**: dishwasher

5. **OVEN_STOVE_REPAIR**
   - **Common Issues**: Not heating, burner problems, igniter, temperature control
   - **Conversion Rate**: Medium-High
   - **Keywords**: oven, stove, range, cooktop, burner

6. **MICROWAVE_REPAIR**
   - **Common Issues**: Not heating, turntable, door latch, sparking
   - **Conversion Rate**: Low (cheap to replace)
   - **Keywords**: microwave

7. **GARBAGE_DISPOSAL_REPAIR**
   - **Common Issues**: Jammed, leaking, not turning, loud grinding
   - **Conversion Rate**: Medium
   - **Keywords**: garbage disposal, disposal

8. **MULTIPLE_APPLIANCES**
   - **Definition**: Customer mentions 2+ appliances
   - **Revenue Impact**: Could be higher ticket
   - **Keywords**: "both my washer and dryer", "all my appliances"

9. **UNKNOWN_APPLIANCE**
   - **Definition**: Cannot determine from transcript
   - **Action**: Review transcript manually

10. **UNSERVICED_APPLIANCE_[TYPE]**
    - **Definition**: Appliance type that buyer doesn't service
    - **Format**: Always specify the type
    - **Examples**: UNSERVICED_APPLIANCE_TV, UNSERVICED_APPLIANCE_HVAC
    - **Billing**: DEFINITELY_NOT_BILLABLE

---

## TIER 5: BILLING INDICATOR
**Type**: Single value (exactly one per call)
**JSON Key**: `tier5.value`

### Tag List:

1. **LIKELY_BILLABLE** ✅
   - **Definition**: Call warrants current billing
   - **Criteria**:
     - Duration >60s with meaningful conversation, OR
     - Appointment scheduled (regardless of duration if >45s), OR
     - Detailed qualification occurred, OR
     - Buyer provided substantial service information
   - **Examples**:
     - 2-minute conversation about repair options
     - Appointment booked in 70 seconds
     - Pricing discussed, service explained, customer qualified
   - **Revenue Range**: $9-$58
   - **Action**: Approve billing

2. **QUESTIONABLE_BILLING** ⚠️
   - **Definition**: Unclear if billing is appropriate
   - **Criteria**:
     - Duration 40-60s with some conversation
     - Unclear outcome
     - Partial qualification
   - **EXCEPTION**: If appointment booked → LIKELY_BILLABLE
   - **Revenue Range**: $0-$27
   - **Action**: Review if disputed

3. **DEFINITELY_NOT_BILLABLE** ❌
   - **Definition**: Call should NOT be billed
   - **Criteria**:
     - Duration <40s, OR
     - IMMEDIATE_DISCONNECT flag, OR
     - Major quality flag (unserviceable), OR
     - NO_BUYER_INTEREST outcome, OR
     - BUYER_EARLY_HANGUP with <30s
   - **Revenue**: $0 (should be)
   - **Action**: Dispute if billed

---

## TIER 6: CUSTOMER DEMOGRAPHICS
**Type**: Array (can have multiple, or be empty)
**JSON Key**: `tier6.values`

### Tag List:

1. **ELDERLY_CUSTOMER** 👴
   - **Definition**: Customer mentions age 65+ or needs assistance
   - **Indicators**:
     - Mentions age ("I'm 80 years old")
     - Needs help moving appliance
     - Physical limitations mentioned
   - **Conversion Impact**: Higher conversion but need accessible service
   - **Action**: Track if certain buyers handle these better

2. **RENTAL_PROPERTY_OWNER** 🏘️
   - **Definition**: Landlord/property manager with investment property
   - **Indicators**:
     - "Rental property"
     - "Tenant called me"
     - Multiple properties mentioned
     - "Investment property"
   - **Value**: High lifetime value, repeat business potential
   - **Action**: High-value lead, prioritize

3. **FIRST_TIME_HOMEOWNER** 🏠
   - **Definition**: Inexperienced with appliance repairs
   - **Indicators**:
     - Uncertain about appliance issues
     - Lots of basic questions
     - Not familiar with repair process
     - "First time dealing with this"
   - **Conversion Impact**: Need more hand-holding
   - **Action**: May require patient service

4. **MULTILINGUAL_CUSTOMER** 🌐
   - **Definition**: Language barriers evident
   - **Indicators**:
     - ESL (English as Second Language) patterns
     - Communication challenges
     - Requests translator
     - Heavy accent with comprehension issues
   - **Action**: Track if certain buyers handle these better

5. **COMMERCIAL_PROPERTY** 🏢
   - **Definition**: Business location (restaurant, hotel, laundromat, etc.)
   - **Indicators**:
     - Business name mentioned
     - Multiple units
     - Commercial-grade equipment
     - "Restaurant equipment", "hotel laundry"
   - **Value**: Higher ticket, specialized needs
   - **Action**: May need specialized buyer

---

## TIER 7: BUYER PERFORMANCE
**Type**: Array (can have multiple, or be empty)
**JSON Key**: `tier7.values`

### Tag List:

1. **EXCELLENT_BUYER_SERVICE** ⭐⭐⭐⭐⭐
   - **Definition**: Buyer handled call exceptionally well
   - **Indicators**:
     - Professional greeting
     - Asked all qualifying questions
     - Clear communication
     - Attempted to close effectively
     - Polite and helpful
   - **Action**: Route more calls to high performers
   - **Revenue Impact**: Positive correlation with conversion

2. **POOR_BUYER_SERVICE** ⭐
   - **Definition**: Buyer mishandled the call
   - **Indicators**:
     - Rude or dismissive
     - Unprofessional
     - Didn't attempt to help
     - Confused customer
     - Bad customer experience
   - **Action**: Review with buyer or reduce allocation
   - **Revenue Impact**: Negative correlation with conversion

3. **BUYER_MISSED_OPPORTUNITY** 📉
   - **Definition**: Could have closed but didn't try
   - **Indicators**:
     - Customer was ready to book
     - Buyer didn't ask for appointment
     - Gave up too easily on objections
     - Failed to close when opportunity existed
   - **Action**: Training opportunity or switch buyers
   - **Revenue Impact**: Lost potential revenue

---

## TIER 8: TRAFFIC QUALITY
**Type**: Array (can have multiple, or be empty)
**JSON Key**: `tier8.values`

### Tag List:

1. **HIGH_INTENT_TRAFFIC** 🎯
   - **Definition**: Clear in-market, ready-to-buy signals
   - **Indicators**:
     - Clear ready-to-buy signals
     - Urgent need expressed
     - Decision-maker on call
     - Has budget/authority
     - Knows exactly what they need
   - **Action**: These are your best traffic sources, optimize for more
   - **Revenue Impact**: Highest conversion rate

2. **BRAND_CONFUSION_TRAFFIC** 🏷️
   - **Definition**: Thought they were calling manufacturer
   - **Indicators**:
     - Googled brand name
     - Looking for warranty service
     - Brand-specific expectations
     - "Is this Whirlpool?"
   - **IMPORTANT**: Expected from brand bidding campaigns - NOT a problem
   - **Action**: Track performance, measure brand campaign ROI
   - **Revenue Impact**: Can still convert well

3. **CONSUMER_SHOPPING_MULTIPLE** 🛍️
   - **Definition**: Consumer mentions calling other companies
   - **Indicators**:
     - "I called another company already"
     - "I have an appointment with someone else"
     - "I've been getting calls from multiple places"
     - Comparing multiple providers
   - **IMPORTANT**: NORMAL lead gen behavior - NOT a problem
   - **Action**: Track as data point only, not a quality issue
   - **Revenue Impact**: Still billable if buyer engages

---

## TIER 9: SPECIAL SITUATIONS
**Type**: Array (can have multiple, or be empty)
**JSON Key**: `tier9.values`

### Tag List:

1. **DIY_ATTEMPT_FAILED** 🔨
   - **Definition**: Customer tried fixing themselves
   - **Indicators**:
     - "I tried to fix it"
     - "Watched YouTube videos"
     - "Made it worse"
     - "I opened it up but..."
   - **Revenue Impact**: May be more complex repair (higher value)
   - **Conversion Impact**: Customer already invested effort

2. **INSURANCE_CLAIM_RELATED** 🛡️
   - **Definition**: Insurance is involved
   - **Indicators**:
     - Mentions insurance
     - Needs documentation for claim
     - Flood/fire/damage mentioned
     - "My insurance company said..."
   - **Action**: Different qualification needed
   - **Conversion Impact**: May have different timeline

3. **PARTS_INQUIRY** 🔧
   - **Definition**: Looking to purchase parts only
   - **Indicators**: Same as Tier 3 PARTS_INQUIRY
   - **Note**: Duplicate tag for easy filtering in Tier 9
   - **Billing**: Usually not billable
   - **Action**: Wrong type of lead for repair services

4. **CONSIDERING_NEW_PURCHASE** 🆕
   - **Definition**: Weighing repair vs replacement
   - **Indicators**: Same as Tier 3 CONSIDERING_NEW_PURCHASE
   - **Note**: Duplicate tag for easy filtering in Tier 9
   - **Action**: Track to optimize targeting

---

## TIER 10: BUYER OPERATIONAL ISSUES
**Type**: Array (can have multiple, or be empty)
**JSON Key**: `tier10.values`

### Tag List:

1. **BUYER_AVAILABILITY_ISSUE** 🕐
   - **Definition**: No agents available / staffing problem
   - **Indicators**:
     - "No agents available"
     - Closed during stated business hours
     - Long hold times
     - Understaffed
   - **IMPORTANT**: Campaign configured per buyer schedule - this is buyer's problem
   - **Action**: Flag to buyer, DO NOT adjust routing
   - **Revenue Impact**: Lost opportunity due to buyer issue

2. **BUYER_ROUTING_FAILURE** 🔌
   - **Definition**: Technical issue on buyer's end
   - **Indicators**:
     - Call drops
     - Transfer failures
     - IVR issues (60+ second holds)
     - System problems
     - "Our system is down"
   - **Action**: Flag to buyer about technical issues
   - **Revenue Impact**: Lost opportunity due to buyer issue

---

## ADDITIONAL OUTPUT FIELDS

### Confidence Score
- **Type**: Float (0.0 to 1.0)
- **Definition**: How confident the AI is in its tagging
- **Typical Range**: 0.85-0.98 for clear calls
- **Low Confidence (<0.80)**: Flag for manual review

### Dispute Recommendation
- **Type**: String (exactly one)
- **Possible Values**:
  - **NONE** - Call properly handled, no dispute needed
  - **REVIEW** - Borderline case, review if buyer disputes
  - **STRONG** - Clear quality issue, should not be billed
- **Note**: `dispute_recommendation_reason` only included if REVIEW or STRONG

### Extracted Customer Info
- **Type**: Object (can be empty)
- **Fields**:
  - firstName
  - lastName
  - address (full street address)
  - street_number
  - street_name
  - street_type
  - city
  - state
  - g_zip (5-digit zip code)
- **Logic**: Only includes fields that differ from input JSON or were null
- **Example**: If g_zip was null in input but "34761" in transcript → extract it

---

## COMPLETE TAG COUNT BY TIER

| Tier | Name | Tag Count | Type |
|------|------|-----------|------|
| 1 | Primary Outcome | 6 | Single value |
| 2 | Quality Flags | 7+ | Array |
| 3 | Customer Intent | 6 | Array |
| 4 | Appliance Type | 10+ | Single value |
| 5 | Billing Indicator | 3 | Single value |
| 6 | Customer Demographics | 5 | Array |
| 7 | Buyer Performance | 3 | Array |
| 8 | Traffic Quality | 3 | Array |
| 9 | Special Situations | 4 | Array |
| 10 | Buyer Operational Issues | 2 | Array |

**Total Base Tags**: 49
**Plus Dynamic Tags**: UNSERVICEABLE_APPLIANCE_[TYPE], UNSERVICED_APPLIANCE_[TYPE]
**Grand Total**: 50+ tags

---

## QUICK REFERENCE: ALL TAG NAMES

### Tier 1 (Primary Outcome)
- QUALIFIED_APPOINTMENT_SET
- SOFT_LEAD_INTERESTED
- INFORMATION_ONLY_CALL
- BUYER_EARLY_HANGUP
- USER_EARLY_HANGUP
- NO_BUYER_INTEREST

### Tier 2 (Quality Flags)
- WRONG_NUMBER
- UNSERVICEABLE_GEOGRAPHY
- UNSERVICEABLE_APPLIANCE_[TYPE]
- BUYER_AVAILABILITY_ISSUE
- BUYER_ROUTING_FAILURE
- IMMEDIATE_DISCONNECT
- POSSIBLE_DISPUTE

### Tier 3 (Customer Intent)
- URGENT_REPAIR_NEEDED
- PREVENTIVE_MAINTENANCE
- WARRANTY_CLAIM_ATTEMPT
- PRICE_COMPARISON_SHOPPING
- CONSIDERING_NEW_PURCHASE
- PARTS_INQUIRY

### Tier 4 (Appliance Type)
- WASHER_REPAIR
- DRYER_REPAIR
- REFRIGERATOR_REPAIR
- DISHWASHER_REPAIR
- OVEN_STOVE_REPAIR
- MICROWAVE_REPAIR
- GARBAGE_DISPOSAL_REPAIR
- MULTIPLE_APPLIANCES
- UNKNOWN_APPLIANCE
- UNSERVICED_APPLIANCE_[TYPE]

### Tier 5 (Billing Indicator)
- LIKELY_BILLABLE
- QUESTIONABLE_BILLING
- DEFINITELY_NOT_BILLABLE

### Tier 6 (Customer Demographics)
- ELDERLY_CUSTOMER
- RENTAL_PROPERTY_OWNER
- FIRST_TIME_HOMEOWNER
- MULTILINGUAL_CUSTOMER
- COMMERCIAL_PROPERTY

### Tier 7 (Buyer Performance)
- EXCELLENT_BUYER_SERVICE
- POOR_BUYER_SERVICE
- BUYER_MISSED_OPPORTUNITY

### Tier 8 (Traffic Quality)
- HIGH_INTENT_TRAFFIC
- BRAND_CONFUSION_TRAFFIC
- CONSUMER_SHOPPING_MULTIPLE

### Tier 9 (Special Situations)
- DIY_ATTEMPT_FAILED
- INSURANCE_CLAIM_RELATED
- PARTS_INQUIRY
- CONSIDERING_NEW_PURCHASE

### Tier 10 (Buyer Operational Issues)
- BUYER_AVAILABILITY_ISSUE
- BUYER_ROUTING_FAILURE

---

## DATABASE SCHEMA SUGGESTION

```sql
CREATE TABLE call_tags (
    id SERIAL PRIMARY KEY,
    ringba_caller_id VARCHAR(100) UNIQUE NOT NULL,
    call_timestamp TIMESTAMP NOT NULL,
    
    -- Tier 1: Primary Outcome (single value)
    tier1_value VARCHAR(50) NOT NULL,
    tier1_reason TEXT NOT NULL,
    
    -- Tier 2: Quality Flags (array)
    tier2_values TEXT[] DEFAULT '{}',
    tier2_reasons JSONB DEFAULT '{}',
    
    -- Tier 3: Customer Intent (array)
    tier3_values TEXT[] DEFAULT '{}',
    tier3_reasons JSONB DEFAULT '{}',
    
    -- Tier 4: Appliance Type (single value)
    tier4_value VARCHAR(50) NOT NULL,
    tier4_reason TEXT NOT NULL,
    
    -- Tier 5: Billing Indicator (single value)
    tier5_value VARCHAR(50) NOT NULL,
    tier5_reason TEXT NOT NULL,
    
    -- Tier 6: Customer Demographics (array)
    tier6_values TEXT[] DEFAULT '{}',
    tier6_reasons JSONB DEFAULT '{}',
    
    -- Tier 7: Buyer Performance (array)
    tier7_values TEXT[] DEFAULT '{}',
    tier7_reasons JSONB DEFAULT '{}',
    
    -- Tier 8: Traffic Quality (array)
    tier8_values TEXT[] DEFAULT '{}',
    tier8_reasons JSONB DEFAULT '{}',
    
    -- Tier 9: Special Situations (array)
    tier9_values TEXT[] DEFAULT '{}',
    tier9_reasons JSONB DEFAULT '{}',
    
    -- Tier 10: Buyer Operational Issues (array)
    tier10_values TEXT[] DEFAULT '{}',
    tier10_reasons JSONB DEFAULT '{}',
    
    -- Overall Assessment
    confidence_score DECIMAL(3,2) NOT NULL,
    dispute_recommendation VARCHAR(20) NOT NULL,
    dispute_recommendation_reason TEXT,
    reasoning TEXT NOT NULL,
    call_summary TEXT NOT NULL,
    
    -- Extracted Customer Info
    extracted_customer_info JSONB DEFAULT '{}',
    
    -- System Metadata
    system_duplicate BOOLEAN DEFAULT FALSE,
    current_revenue DECIMAL(10,2),
    current_billed_status BOOLEAN,
    
    -- AI Metadata
    ai_model VARCHAR(50),
    ai_tokens_used INTEGER,
    ai_cost DECIMAL(10,6),
    processed_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes for common queries
    CREATE INDEX idx_tier1_value ON call_tags(tier1_value);
    CREATE INDEX idx_tier2_values ON call_tags USING GIN(tier2_values);
    CREATE INDEX idx_tier5_value ON call_tags(tier5_value);
    CREATE INDEX idx_dispute ON call_tags(dispute_recommendation);
);
```

---

## USAGE EXAMPLES

### Query 1: Find all unserviceable zip codes
```sql
SELECT 
    DISTINCT c.g_zip,
    COUNT(*) as call_count,
    SUM(c.ad_cost) as wasted_spend
FROM calls c
JOIN call_tags t ON c.ringba_caller_id = t.ringba_caller_id
WHERE 'UNSERVICEABLE_GEOGRAPHY' = ANY(t.tier2_values)
GROUP BY c.g_zip
HAVING COUNT(*) >= 5
ORDER BY wasted_spend DESC;
```

### Query 2: Buyer performance scorecard
```sql
SELECT 
    c.target_name,
    COUNT(*) as total_calls,
    SUM(CASE WHEN 'EXCELLENT_BUYER_SERVICE' = ANY(t.tier7_values) THEN 1 ELSE 0 END) as excellent_count,
    SUM(CASE WHEN 'POOR_BUYER_SERVICE' = ANY(t.tier7_values) THEN 1 ELSE 0 END) as poor_count,
    AVG(c.revenue) as avg_revenue
FROM calls c
JOIN call_tags t ON c.ringba_caller_id = t.ringba_caller_id
GROUP BY c.target_name
ORDER BY avg_revenue DESC;
```

### Query 3: Dispute queue
```sql
SELECT 
    t.ringba_caller_id,
    c.first_name,
    c.last_name,
    c.revenue,
    t.tier1_value,
    t.tier2_values,
    t.dispute_recommendation,
    t.dispute_recommendation_reason
FROM call_tags t
JOIN calls c ON t.ringba_caller_id = c.ringba_caller_id
WHERE t.dispute_recommendation IN ('REVIEW', 'STRONG')
  AND c.billed = true
ORDER BY c.call_timestamp DESC;
```

---

## VERSION HISTORY

**V3.0** (Current)
- Implemented Option B structure (nested by tier)
- Added PARTS_INQUIRY tag
- Split CALL_ABANDONED_EARLY into BUYER_EARLY_HANGUP and USER_EARLY_HANGUP
- Removed DUPLICATE_CALLBACK (incorrect affiliate model understanding)
- Added CONSUMER_SHOPPING_MULTIPLE (informational tag)
- Renamed OUTSIDE_BUSINESS_HOURS to BUYER_AVAILABILITY_ISSUE
- Changed WRONG_NUMBER from dispute trigger to data point
- Added customer info extraction requirements
- Added ringbaCallerId requirement
- Added reasons for every tag
- All 10 tiers must be present in output

**V2.0**
- Initial comprehensive system

**V1.0**
- Original tag set

---

## SUPPORT

For questions or clarifications on tag usage, refer to:
- Master Prompt V3 (implementation details)
- Python Implementation V3 (code examples)
- This document (complete tag reference)