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
    transcript: `00:00 A - This call may be recorded for quality assurance purposes. Please hold to be connected. This call may be recorded for quality assurance purposes. I found someone else.,
00:16 B - Appliance repair. My name is Ann. How can I help?,
00:19 A - Yes, Ms. Ann, I'm calling because we have a washing machine, front door loading and we. It's leaking somewhere. My husband said it could be the seal or the drum. We don't know, but we need to get.,
00:45 B - Okay, sorry, your. The washer is licking water. Yes. Okay, well, I'm so sorry to hear you're dealing with your. What? You're dealing with your appliance. But I better ask, ma', am, is this residential or commercial?,
01:02 A - It's a residential.,
01:06 B - Okay. And what is the brand of your washer?,
01:10 A - What's the brand? It's an lg.,
01:15 B - Okay. And do you. Are you the homeowner, landlord or renter? I am.,
01:22 A - I'm the home. We're the homeowner man.,
01:26 B - Okay. All right. See? And is this stackable or side by side?,
01:32 A - It's a side by side, but they're sitting on. What are those called, Rick? They're called like petals. There's. Yeah, they're sitting on top of them and then they have a drawer that opens and closes.,
01:55 B - Okay, I see. Thank you. And can I get your complete name?,
01:59 A - Diana Maglion. M A G L I A N E. And I'm calling for a quote to see how much it's going to cost for them to come out here and.,
02:18 B - Yeah, can I get your zip code first?,
02:22 A - 97005.,
02:27 B - Okay, what's your complete address?,
02:32 A - 5850 Southwest Lee Avenue. It's right off the freeway.,
02:42 B - It's in Beaverton, right?,
02:44 A - Yes.,
02:47 B - Okay, let me just check very quick here, Diana. I just want to let you know that our service call fee is actually $115. And that fee will go towards your final bill if you proceed with a repair and I can schedule you. Oh, yeah, sorry.,
03:07 A - No, yeah, that's what I was going to ask. I was going to ask you if that. If we decide to use the doctor, then that would go to. Towards the bill.,
03:26 B - That's correct. Exactly.,
03:28 A - Okay, and how. How much does it usually cost to fix a washer?,
03:38 B - It really depends, ma'. Am. That's why our technician will proceed with the diagnosis for us to check it. And once it's determined, then that's the time.,
03:51 A - Yes, I'd like someone experience to come out. Not, you know, I mean, for paying money to fix this washing machine. I want to make sure I have an experienced person who knows what. Yes, ma'. Am.,
04:09 B - Don't worry. All our technicians are trained when it comes to this. And I can assure you, ma', am, that we always. Our technicians arrive fully equipped. So most repairs are completed on the first visit.,
04:25 A - Okay. And the other thing I wanted to ask you. Do you have discounts for military people or senior citizens?,
04:40 B - Let me just check that one, Diana. Okay.,
04:43 A - Okay.,
04:48 B - Hold on.,
04:51 A - I'm hoping you say yes.,
04:56 B - Give me one moment. For military. Yeah, it. It is for 10% as well as for seniors. 10%?,
05:19 A - Oh, that's great. That. That's great. 10% off.,
05:25 B - Yeah. But if it's a senior military, then we can give you a discount of a total of 15%.,
05:32 A - Yes, it is. He's. He's a senior veteran.,
05:39 B - Okay, then would you like me to schedule you today? We have available.,
05:43 A - Okay, I can't hear you with her talking. Can you please stop mumbling? And I'm talking to my husband. What?,
05:53 B - So I. Once again, Diana, I'm gonna write down her name.,
06:00 A - Name and their quote, their phone number. I'm calling AB. Oh, okay. Well, it's $115 for them to come out and check it out. But if we use their service, that goes towards the bill, right?,
06:20 B - That's.,
06:20 A - And then it's 15% off because we're both. Well, you are. You're the veteran and you're senior citizen. Is that what you're telling me? He has to be.,
06:42 B - Yeah, that's correct.,
06:44 A - Yes, he is both.,
06:46 B - Okay, perfect. So I can schedule you to the Ariana between 3 to 4pm in the afternoon. Will that be okay?,
06:56 A - She said she can schedule it today between 3 and 4pm you have her number and the name of the company. I need to get your number and the name of the company he's looking up. I mean, we're elderly and we're trying to get the best price that we can get because I have Ms. And he's my caretaker. And as you know, nurses and caretakers don't get paid a lot of money.,
07:42 B - Yeah. I can start with our company name.,
07:46 A - Okay. Can you spell it slowly?,
07:50 B - Yeah, it's. Yep. It's P for Papa.,
07:56 A - P as in Papa.,
07:59 B - R for Robert.,
08:02 A - R.,
08:06 B - O for Oscar.,
08:09 A - O for Oscar.,
08:13 B - And the second name is Solution. S for Sam.,
08:21 A - I got it.,
08:23 B - Okay. That is our company name. Proof. Solution.,
08:28 A - I don't know how to spell Solution.,
08:32 B - Oh, that is S for Sam.,
08:35 A - O for Oscar. Okay.,
08:40 B - L for Lima.,
08:42 A - Okay.,
08:47 B - U for Uniform.,
08:50 A - Okay.,
08:55 B - And T for Tom.,
09:01 A - Okay. Okay. Hello.,
09:13 B - And o for sorry. T. I for india.,
09:23 A - I. After t. Yes.,
09:26 B - And then after I, it's o again for oscar.,
09:31 A - O, n.,
09:34 B - Yep.,
09:35 A - Correct.,
09:39 B - And I have here our number.,
09:41 A - Okay, I'm ready. 503.,
09:52 B - Yep.,
09:53 A - That is 971-971-248248. Okay. 789-5895. And your name is again? I'm so sorry. I have Anna. Your name is Ann.,
10:40 B - Yep.,
10:41 A - Ann with an E. A N, N, E. That's right. That was my mother's name.,
10:53 B - Oh, what a coincidence.,
10:57 A - Yeah, she's no longer with us.,
11:04 B - So sorry to hear about that one, ma'. Am. But yeah. Diana, do you want me to proceed with your schedule today between 3 to.,
11:13 A - 4Pm can you wait and give me about a half an hour or so? Because I forgot to write the price down. Well, I'm sorry I forgot to write the estimate down for coming out. It's $110 or 115 at 1:15. And that's with the military discount and the senior citizens.,
11:48 B - Not yet. Not yet.,
11:51 A - Okay. Okay. Pro Solutions, are they a good company?,
12:09 B - Yes. You can also check, ma'. Am, we have. We receive good feedback with our dearest customers.,
12:17 A - Yeah. Because I always. If we have something fixed from somebody, I always make sure if the job's done right and everything is fine and they come out if there's a problem. You know, I always give the Better Business Bureau a great rating.,
12:42 B - Yeah. Don't worry, Diana. I will assure you that our technicians are fully equipped and they are fully trained when it comes fixing your appliance.,
12:52 A - Well, I appreciate that very much because we're older and we need. We need to get it. It's a good washing machine and dryer. We've never had any problems with it, but we just don't know if it's a seal or if it's the inside was. Yeah. Not the seals around the door, but the tank seal.,
13:35 B - I see. But will you proceed at the schedule today between 3 to 5 p. 3. 4 to 5pm or 3 to 4?,
13:46 A - Can you give me 30 minutes to an hour so that he wants to check one other place just to see if it's cheaper?,
13:59 B - I don't worry. I can schedule you with today 4 to 5pm instead.,
14:08 A - I'd like to wait until my husband says it's all right.,
14:14 B - Yeah, I can wait on the line. You can ask him.,
14:17 A - No, he's sitting right here. He knows what we're saying.,
14:22 B - Oh, okay. So.,
14:24 A - So it's not that we don't want you. He wants to check and see if it's cheaper somewhere else. The down payment pretty steep.,
14:39 B - Yeah. Don't worry. Ma', am, I can guarantee you the lowest service call fee since we will be giving you a discount.,
14:47 A - Yes, that discount, that's quite a bit of.15% off is a discount.,
14:55 B - Yeah.,
14:56 A - Okay, well, let me call you back in about 45 minutes so he can double check. He. That's the way my husband is. And you know, I'm sure if you're married, you know how it goes.,
15:18 B - Yes, I am, but yeah, I can. Instead of you calling us back, Diana, I'll be the one to call you back then. Okay?,
15:27 A - You have my number?,
15:30 B - Yeah, I have here the 503-267-2606.,
15:38 A - Is it 267 Rick? Yes. Yeah. Okay, then you have it. And that would be great. Make sure that your company logo comes up because if it doesn't, I won't answer the phone because we'll think it's one of those. And I know you get them too, the people who.,
16:07 B - Yeah, I'm not sure if it's showing the logo, but once there's a call after an hour, Diana, then that's me. I can also leave you a message, you know, effect. Okay.,
16:19 A - If I don't answer it, it's because. If I don't answer it, it's because we think it's one of those solicitors, you know, the people that call you 20, 45 times. We have another phone that we pay for every month, but we can't use it from morning till nighttime. All it is, people calling for junk, you know, trying to get us to buy something. And I'm sure you know what that's like. Exactly.,
17:02 B - It's kind of hassle and it's kind of annoying. Right.,
17:05 A - You know, you want me to tell you the secret of having them. Get them to stop. You tell them that they're being recorded and immediately they'll hang up. Just say you're on a recorded line, how can I help you? And they'll go click and they hang up.,
17:32 B - Yeah, I have.,
17:34 A - We have a lot of friends. So if they. If I do decide to go with you guys, I'll make sure that my friends. Because we've lived here at this address over 36 years. So I see. Oh, yeah. So we know. And I. The one thing I. That stood out to me in your ad is that it says that your workers have been. They're not. I don't know if they're bonded, but their criminal record has been looked at and that made me. That made me feel good. Because you don't get people who are very honest these days. Yeah, you Know. And the other question is what? After we. Let's say he comes in and he fixes it, and then three weeks later it springs a leak. Do I just call you and have you come back out?,
18:56 B - I'm sorry, what did. What is your question, Diana? Can you repeat that one for me?,
19:01 A - Yes. Let's say that we go with your company and they fix it. What? My husband wants to know what the warranty is. Like, let's say. Yeah, let's say in three weeks my machine starts leaking again. And so I call you. Do we have to pay more after you guys have fixed it already?,
19:40 B - Well, that is. I need to confirm. Give me one moment. Okay. Okay. Okay. Hold on, Hold on. Yes, ma'. Am. So we give six month warranty on the job, which is done.,
20:07 A - Okay. Okay, that sounds fair to me.,
20:13 B - All right, so I'll be calling you back by three, almost four to follow up.,
20:22 A - Yeah, about four. About four.,
20:25 B - Yeah. Yeah. Okay. That's no time.,
20:28 A - Okay. Can I ask, what nationality are you?,
20:33 B - I'm sorry?,
20:34 A - Can I ask you what nationality are you? You sound Filipino.,
20:40 B - Yes, I am. You got it right.,
20:43 A - Oh, my goodness. I knew it. We were in Air Force and we lived at Clark Air Force Base. And I missed the fact we adopted a little boy out there. He was three days old and the mother couldn't take care of him, and we adopted him and brought him to the United States when they closed the base down. But I. I still have friends out there. I call and text to people that I met out there that worked for us or took care of my kids. I'm always checking up on them to make sure that they're all right. Because if they're not all right, I want to get them visas and get them the hell out of there and that, you know, I love them very much. They're very special people to me.,
21:56 B - Oh, yes.,
21:57 A - I love the Philippines. I would give anything to go back there. And I want my son visit us back.,
22:09 B - Diana?,
22:11 A - Huh?,
22:13 B - Yeah, you can. Or you can go back to the Philippines.,
22:16 A - Oh, I miss it so much.,
22:20 B - But right now it's still raining here. We have. There's a typhoon.,
22:25 A - Oh, is there? Is it real bad?,
22:29 B - Yeah, but it's almost gone. I think it's already two days now.,
22:37 A - I hope everything is well with your family and you.,
22:42 B - Oh, thank you so much. Yeah, it's not so, you know, it's not really that strong. But it's raining though.,
22:50 A - Yeah. I just. I loved it there because I felt like a princess. I love the people who worked for us and. And I would always pay them a lot more than what other people did. And I would really was against Americans for not paying them for what they were doing. I mean, they come in, they clean your house, they take care of your kids, and you want to give them $20 for the week. That's BS. We have a bunch of furniture that we had made over there and I see. I mean, I just had so much. They taught me so much stuff like about how to treat your elders and about being a true friend, if that means you had to. Yes. I learned a lot from that country and the people that I loved that got on base because they lived. I'm still best friends with my house girl who helped me with my children in my house. She's the most specialist person to me. I never looked at her.,
24:28 B - Now.,
24:29 A - Huh?,
24:32 B - Where is your best friend now?,
24:34 A - She's in the Philippines.,
24:37 B - Are you still in contact with her?,
24:39 A - Oh, absolutely, absolutely. And when any. When I hear anything about the Philippines, I always text her or I'll try to call her and find out. And she loves me so much, she won't tell me. And I tell her I'll find out anyway. And you know, I ask her all the time if she needs help, but Filipinos are very prideful people, you know?,
25:14 B - Yeah. We always don't ask for help.,
25:18 A - No. Yeah, yeah. And I, I haven't got her address or otherwise I would help her out more because she works so hard. And her kids, I love her kids. They're good kids. They listen to mom and.,
25:42 B - Oh, where in the Philippines is your best friend?,
25:47 A - She is my best friend. Yes, she is.,
25:51 B - We're in the Philippines. Is it in Manila?,
25:55 A - No, she's. Wait, let me ask my husband. He'll remember because with my ms, I forget things. You know what that is, right? Dad, where is. I can't remember her name. She's my best friend. Zenny. Yeah. Where is she living? I forgot. Is she in the mountains or in Manila? Mountains. She's in the mountains in her Proverbs.,
26:41 B - So.,
26:41 A - And I mean, she. I haven't got her address to send her anything. I mean, I want to send her. I want to send her a care package with love, you know, she knows I love her and she loves me, but she's a very prideful woman. She's been living on her own since I can remember. She took care of her kids herself, you know? Yeah. And I would let her go on the weekends so she could see her kids, her family. And I even went with her on the jeep me to go and meet her family, because she talked a lot about me and my husband, and I just wanna. I have pictures of her, pictures of my kids with her. We bought one of those Nepa huts, you know, for my daughter. They look like a house. They're huge. But Americans used them for their kids. But I was the only one that had one on base. I had them deliver it on base for my daughter for Christmas. And I bought all the furniture. We made the curtains of Winnie the Pooh. And my kids had a blast in there. Yeah.,
28:31 B - Well, thanks for sharing your story, Diana. I really appreciate it.,
28:37 A - Well, I knew when you were talking to me, it was like I. I forgot how to say hello in Tugalo. And, I mean, I know Salama. And then there's Salama Post. Right?,
28:55 B - Yeah. Thank you.,
28:56 A - Yeah.,
28:57 B - Yes.,
28:58 A - Yeah. And I didn't want to offend you by saying it if I didn't know for sure, but I just always. When I'm talking to someone, I always seem to recall the voice, the talk, you know? And I always seem to know when it's a Filipino woman or a man, you know? But I like talking to the women.,
29:37 B - They're good women. I will. Just got a. Is it okay? I just. I just need to answer another call, but I will be calling you back after an hour as what you said.,
29:52 A - Okay, I appreciate that.,
29:59 B - I really appreciate.,
30:01 A - You're welcome.,
30:02 B - Thank you, too. Yes. Bye for now, Diana. Stay safe.,
30:07 A - Okay.,
30:10 B - All right. Bye. Bye.,
`,

    // Call metadata
    duration: 18, // seconds
    caller_phone: '+15551234567',
    revenue: 24,
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
