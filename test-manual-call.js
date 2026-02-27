import { processBatch } from './src/services/openRouterClient.js';
import logger from './src/utils/logger.js';
import db from './src/database/connection.js';

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
    transcript: `00:00 A - This call may be recorded for quality assurance purposes. Please hold to be connected.,
00:13 B - Prayer for Spiritual Healing,
00:16 A - hello. Oh, here on the,
00:18 B - Our first prayer is Sometimes we awaken in tremendous consolation. Our hearts are so lifted up with joy and we look and we desire God's love. He places it there. Grace without previous cause. We're just enlightened and want to be sanctified. We want to grow in His. It's his inspiration where he has come and set our hearts on fire with his own. I am going to reveal to you the secret of sanctity and happiness.,
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

    try {
        await db.initDatabase();

        console.log('Fetching active system prompt from database...');
        const prompts = await db.getActivePrompts();
        if (!prompts || prompts.length === 0) {
            throw new Error('No active campaign prompts found in the database. Please add one first.');
        }
        const systemPrompt = prompts[0].system_prompt;
        console.log(`Using prompt version for campaign: ${prompts[0].campaign_name || prompts[0].campaign_id || 'Global'}`);

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

        // Add transcription field (auto-convert A/B to Agent/Customer)
        const processedCall = {
            ...callToTest,
            transcription: callToTest.transcript
                .replace(/^A\s*-\s*/gm, 'Agent: ')
                .replace(/^B\s*-\s*/gm, 'Customer: ')
        };

        console.log('\nSending to AI for 10-tier tagging...\n');

        const startTime = Date.now();
        const { successful, failed } = await processBatch([processedCall], systemPrompt);
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

            console.log(`Model Used: ${result.modelUsed || 'Unknown'}`);

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

    await db.closeDatabase();
    process.exit(0);
}

// Run the test
testManualCall().catch(async error => {
    console.error('Fatal error:', error);
    await db.closeDatabase().catch(() => { });
    process.exit(1);
});
