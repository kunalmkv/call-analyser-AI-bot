import { processBatch } from './src/services/openRouterClient.js';
import logger from './src/utils/logger.js';

// ============================================================
// MANUAL CALL TEST SCRIPT
// ============================================================
// This script allows you to test the 10-tier AI tagging system
// with manually entered call data.
// ============================================================

// EDIT THIS SECTION TO TEST DIFFERENT CALLS
const TEST_CALL = {
    id: 999,
    inboundCallId: 'TEST_CALL_001',
    ringba_caller_id: '+15551234567',

    // PASTE YOUR TRANSCRIPT HERE (A/B format will be auto-converted to Agent/Customer)
    transcript: `00:01 A - Please enter the zip code where you need appliance repair. Please hold to be connected.,
00:27 B - Thank you for calling Steers Home Services. To schedule your service. I am going to transfer your call to Samantha, our AI repair agent to ensure quality service. This call may be monitored or recorded by us or our vendors and by continuing you agree to our privacy policy and terms@searshomeservices.com let's get your service. I am connecting you now.,
00:59 A - Hi, I am Samantha, an AI virtual voice agent for Sears Home Services. How can I assist you today?,
01:09 B - I thought I was calling LG Customer Service.,
01:15 A - You have reached Sears Home Services. We do service LG Appliances. If you need repair or maintenance for your LG appliance, I can help schedule a technician visit. What type of LG appliance do you need help with and what issue are you experiencing?,
01:30 B - I got a recall on my stove I double oven stove and we had Home Depot put it in and they didn't put this tag where supposed to be where the model number the serial number was and they can't find nothing for that unit and that's the reason why I'm calling that. The model number is LDEL7324SE.,
02:11 A - Thank you for sharing the model number and the details about your double oven. Could you please describe the issue you are experiencing with your LG double oven?,
02:21 B - There has been a recall on the button on the stove.,
02:32 A - Thank you for letting me know about the recall on the button for your LG double oven. Since this is related to a recall, I want to make sure we handle it correctly. Have you already had a technician from Sears Home Services work on this oven for the recall or is this your first time reaching out for service on this issue?,
02:49 B - First time.,
03:01 A - Thank you for clarifying. I can help schedule a technician to inspect and address the recall issue on your LG double oven. Could you please provide the brand of your double oven? Just to confirm you mentioned lg but I want to be sure before proceeding.,
03:15 B - Yes, it's a LG. Model number is LDEL7324SE.,
03:31 A - Thank you for confirming the brand and model number. To move forward, I will need the address where the oven is located. Could you please provide the full street address? City and State.,
03:41 B - 51 Walker Court, Charles Tanner, West Virginia 2541.,
03:52 A - Thank you. Could you please. Thank you. Just give me a moment. The earliest available slot for a technician Visit is Monday, February 16, 7am to 6pm Would you like to reserve this slot?,
04:18 B - What are they going to be? Can you just tell me a little bit about the recall thing. Are they going to repair it or just come and look at it?,
04:37 A - For a recall issue, the technician will first inspect your LG double oven to confirm the recall concern. If the recall applies and the required parts or repairs are covered, they will perform the necessary repair during the visit or arrange for parts if needed. If it is not covered by the recall, the technician will explain the next steps and any costs before proceeding. Would you like to reserve the earliest available slot on Monday, February 16th between 7am and 6pm?,
05:08 B - Can you do. No, I can't. I can't do Monday.,
05:18 A - Understood. Here are two other available Monday, February 16 8am to 5pm Tuesday, February 17 7am to 6pm Would either of these work for you? If not, please let me know your preferred date and time within our appointment windows of 8am to 5pm.,
05:40 B - Can you do Thursday the 19th?,
05:55 A - I can offer you Thursday, February 19th with two available time windows. 7am to 6pm 8am to 5pm which time window would you prefer?,
06:07 B - 7Am.,
06:15 A - Just to confirm, you would like to reserve Thursday, February 19th from 7am to 6pm for your LG double oven recall visit. The diagnostic fee is $129. It covers the technician's visit and diagnosis. If you go ahead with the repair, the fee goes toward the total cost. Otherwise, it is just the diagnostic fee. Do you agree to this?,
06:36 B - How much is it?,
06:43 A - The diagnostic fee is $129. This covers the technician's visit and diagnosis. If you proceed with the repair, this fee will be applied toward the total cost. Otherwise, it is just the diagnostic fee. Would you like to proceed with this appointment now?,
06:59 B - I'm gonna. I'm. I'm gonna call lg. That's why I'm trying to get a hold of LG personally because they. Home Depot told me to call them direct to get. Tell them that you need a technician to come out. So if I need you all back. Okay, thank you.,
`,

    // Call metadata
    duration: 18, // seconds
    caller_phone: '+15551234567',
    revenue: 0,
    g_zip: '32801',
    is_duplicate: false,
    hung_up: "Buyer",
    firstName: 'John',
    lastName: 'Smith',
    address: '123 Main Street',
    street_number: '123',
    street_name: 'Main',
    street_type: 'Street',
    city: 'Orlando',
    state: 'FL',
    targetName: 'ABC Appliance Repair',
    publisherName: 'Google Ads',
    billed: true,
    call_date: new Date()
};

// ============================================================
// ADDITIONAL TEST CASES (uncomment to use)
// ============================================================

// TEST CASE 2: Short call - wrong number
const SHORT_WRONG_NUMBER = {
    id: 998,
    inboundCallId: 'TEST_CALL_002',
    ringba_caller_id: '+15559876543',
    transcript: `00:00 A - ABC Appliance Repair, how can I help you?
00:03 B - Is this Samsung customer service?
00:05 A - No, this is an independent repair service. We can help with Samsung appliances though.
00:08 B - Oh, I was looking for the warranty department. Never mind.
00:11 A - Okay, have a good day.`,
    duration: 11,
    caller_phone: '+15559876543',
    revenue: 15,
    g_zip: '33101',
    is_duplicate: false,
    hung_up: 'Caller',
    firstName: null,
    lastName: null,
    address: null,
    street_number: null,
    street_name: null,
    street_type: null,
    city: null,
    state: null,
    targetName: 'ABC Appliance Repair',
    publisherName: 'Brand Bidding Campaign',
    billed: true,
    call_date: new Date()
};

// TEST CASE 3: Soft lead - needs to call back
const SOFT_LEAD = {
    id: 997,
    inboundCallId: 'TEST_CALL_003',
    ringba_caller_id: '+15554445555',
    transcript: "00:00 A - Need dryer repair\n00:05 B - What's your address?\n00:10 A - 123 Main St, Austin TX 78701\n00:20 B - Can you do tomorrow 2-4pm?\n00:25 A - Yes perfect\n00:30 B - Great we'll call before we come"
    ,
    duration: 44,
    caller_phone: '+15554445555',
    revenue: 0,
    g_zip: '34747',
    is_duplicate: false,
    hung_up: 'Caller',
    firstName: null,
    lastName: null,
    address: null,
    street_number: null,
    street_name: null,
    street_type: null,
    city: null,
    state: null,
    targetName: 'ABC Appliance Repair',
    publisherName: 'Google Ads',
    billed: false,
    call_date: new Date()
};

// ============================================================
// MAIN TEST FUNCTION
// ============================================================

async function testManualCall() {
    console.log('\n' + '='.repeat(70));
    console.log('MANUAL CALL TAGGING TEST');
    console.log('='.repeat(70));

    // Choose which test case to use (change this to test different scenarios)
    const callToTest = TEST_CALL; // Change to SHORT_WRONG_NUMBER or SOFT_LEAD to test those

    console.log('\nTest Call Details:');
    console.log(`  ID: ${callToTest.id}`);
    console.log(`  Caller: ${callToTest.caller_phone}`);
    console.log(`  Duration: ${callToTest.duration}s`);
    console.log(`  Revenue: $${callToTest.revenue}`);
    console.log(`  Billed: ${callToTest.billed}`);
    console.log(`  Transcript Length: ${callToTest.transcript.length} characters`);
    console.log('\n' + '-'.repeat(70));

    try {
        // Add transcription field (auto-convert A/B to Agent/Customer)
        const processedCall = {
            ...callToTest,
            transcription: callToTest.transcript
                .replace(/^A\s*-\s*/gm, 'Agent: ')
                .replace(/^B\s*-\s*/gm, 'Customer: ')
        };

        console.log('\nSending to AI for 10-tier tagging...\n');

        const startTime = Date.now();
        const { successful, failed } = await processBatch([processedCall]);
        const processingTime = Date.now() - startTime;

        console.log('\n' + '='.repeat(70));
        console.log('RESULTS');
        console.log('='.repeat(70));
        console.log(`Processing Time: ${processingTime}ms`);
        console.log(`Successful: ${successful.length}`);
        console.log(`Failed: ${failed.length}`);

        if (successful.length > 0) {
            const result = successful[0];
            const ai = result.aiResponse;

            console.log('\n' + '-'.repeat(70));
            console.log('AI TAGGING RESULTS');
            console.log('-'.repeat(70));

            // Tier 1: Primary Outcome
            console.log('\n📊 TIER 1: PRIMARY OUTCOME');
            console.log(`  Value: ${ai.tier1?.value || 'N/A'}`);
            console.log(`  Reason: ${ai.tier1?.reason || 'N/A'}`);

            // Tier 2: Quality Flags
            console.log('\n⚠️  TIER 2: QUALITY FLAGS');
            if (ai.tier2?.values && ai.tier2.values.length > 0) {
                ai.tier2.values.forEach(flag => {
                    console.log(`  - ${flag}`);
                    if (ai.tier2.reasons && ai.tier2.reasons[flag]) {
                        console.log(`    Reason: ${ai.tier2.reasons[flag]}`);
                    }
                });
            } else {
                console.log('  (None)');
            }

            // Tier 3: Customer Intent
            console.log('\n🎯 TIER 3: CUSTOMER INTENT');
            if (ai.tier3?.values && ai.tier3.values.length > 0) {
                ai.tier3.values.forEach(intent => {
                    console.log(`  - ${intent}`);
                    if (ai.tier3.reasons && ai.tier3.reasons[intent]) {
                        console.log(`    Reason: ${ai.tier3.reasons[intent]}`);
                    }
                });
            } else {
                console.log('  (None)');
            }

            // Tier 4: Appliance Type
            console.log('\n🔧 TIER 4: APPLIANCE TYPE');
            console.log(`  Value: ${ai.tier4?.value || 'N/A'}`);
            console.log(`  Reason: ${ai.tier4?.reason || 'N/A'}`);

            // Tier 5: Billing Indicator
            console.log('\n💰 TIER 5: BILLING INDICATOR');
            console.log(`  Value: ${ai.tier5?.value || 'N/A'}`);
            console.log(`  Reason: ${ai.tier5?.reason || 'N/A'}`);

            // Tier 6: Customer Demographics
            console.log('\n👥 TIER 6: CUSTOMER DEMOGRAPHICS');
            if (ai.tier6?.values && ai.tier6.values.length > 0) {
                ai.tier6.values.forEach(demo => {
                    console.log(`  - ${demo}`);
                    if (ai.tier6.reasons && ai.tier6.reasons[demo]) {
                        console.log(`    Reason: ${ai.tier6.reasons[demo]}`);
                    }
                });
            } else {
                console.log('  (None)');
            }

            // Tier 7: Buyer Performance
            console.log('\n⭐ TIER 7: BUYER PERFORMANCE');
            if (ai.tier7?.values && ai.tier7.values.length > 0) {
                ai.tier7.values.forEach(perf => {
                    console.log(`  - ${perf}`);
                    if (ai.tier7.reasons && ai.tier7.reasons[perf]) {
                        console.log(`    Reason: ${ai.tier7.reasons[perf]}`);
                    }
                });
            } else {
                console.log('  (None)');
            }

            // Tier 8: Traffic Quality
            console.log('\n🚦 TIER 8: TRAFFIC QUALITY');
            if (ai.tier8?.values && ai.tier8.values.length > 0) {
                ai.tier8.values.forEach(traffic => {
                    console.log(`  - ${traffic}`);
                    if (ai.tier8.reasons && ai.tier8.reasons[traffic]) {
                        console.log(`    Reason: ${ai.tier8.reasons[traffic]}`);
                    }
                });
            } else {
                console.log('  (None)');
            }

            // Tier 9: Special Situations
            console.log('\n🔔 TIER 9: SPECIAL SITUATIONS');
            if (ai.tier9?.values && ai.tier9.values.length > 0) {
                ai.tier9.values.forEach(situation => {
                    console.log(`  - ${situation}`);
                    if (ai.tier9.reasons && ai.tier9.reasons[situation]) {
                        console.log(`    Reason: ${ai.tier9.reasons[situation]}`);
                    }
                });
            } else {
                console.log('  (None)');
            }

            // Overall Assessment
            console.log('\n' + '-'.repeat(70));
            console.log('OVERALL ASSESSMENT');
            console.log('-'.repeat(70));
            console.log(`Confidence Score: ${ai.confidence_score || 'N/A'}`);
            console.log(`Dispute Recommendation: ${ai.dispute_recommendation || 'N/A'}`);
            if (ai.dispute_recommendation_reason) {
                console.log(`Dispute Reason: ${ai.dispute_recommendation_reason}`);
            }
            console.log(`\nCall Summary:\n${ai.call_summary || 'N/A'}`);

            // Extracted Customer Info
            if (ai.extracted_customer_info && Object.keys(ai.extracted_customer_info).length > 0) {
                console.log('\n' + '-'.repeat(70));
                console.log('EXTRACTED CUSTOMER INFO');
                console.log('-'.repeat(70));
                console.log(JSON.stringify(ai.extracted_customer_info, null, 2));
            }

            // Full JSON Response
            console.log('\n' + '-'.repeat(70));
            console.log('FULL JSON RESPONSE');
            console.log('-'.repeat(70));
            console.log(JSON.stringify(ai, null, 2));

        } else if (failed.length > 0) {
            console.log('\n❌ PROCESSING FAILED');
            console.log('\nError Details:');
            failed.forEach((failure, index) => {
                console.log(`\nFailure ${index + 1}:`);
                console.log(`  Row ID: ${failure.rowId}`);
                console.log(`  Error: ${failure.error}`);
            });
        }

    } catch (error) {
        console.error('\n❌ TEST FAILED');
        console.error('Error:', error.message);
        console.error('\nStack Trace:');
        console.error(error.stack);
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST COMPLETE');
    console.log('='.repeat(70) + '\n');

    process.exit(0);
}

// Run the test
testManualCall().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
