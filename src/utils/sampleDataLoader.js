import db from '../database/connection.js';
import logger from './logger.js';

// Sample transcriptions for different scenarios
const sampleTranscriptions = [
    {
        call_id: 'SAMPLE_001',
        transcription: `Agent: Hello, thank you for calling ABC Appliance Repair. How can I help you today?
        Customer: Hi, my refrigerator stopped working yesterday. The compressor seems to be making a strange noise.
        Agent: I understand. Can you provide your ZIP code so I can check if we service your area?
        Customer: Yes, it's 90210.
        Agent: Great, we do service that area. I can schedule a technician to come out tomorrow between 2-4 PM. Would that work for you?
        Customer: Yes, that would be perfect. How much will the service call cost?
        Agent: The diagnostic fee is $89, which will be waived if you proceed with the repair.
        Customer: Sounds good. Please book the appointment.
        Agent: Perfect! I've scheduled your appointment for tomorrow. You'll receive a confirmation text shortly. Is there anything else I can help you with?
        Customer: No, that's all. Thank you so much!`,
        duration: 180,
        caller_phone: '+14155551234',
        receiver_phone: '+18005551234',
        call_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        tags_expected: ['Booking Intent', 'Technical Terms Used', 'Positive Sentiment']
    },
    {
        call_id: 'SAMPLE_002',
        transcription: `Agent: Thank you for calling, how can I assist you?
        Customer: This is the third time I'm calling about my washer repair! Nobody showed up yesterday!
        Agent: I apologize for the inconvenience. Let me check your account.
        Customer: This is ridiculous. I want a refund for the service I paid for last week.
        Agent: I understand your frustration. I see there was a scheduling issue. I can either reschedule or process a refund.
        Customer: Just give me the refund. Your service is terrible compared to TechFix Solutions.
        Agent: I'll process that refund right away. It should appear in 3-5 business days.`,
        duration: 95,
        caller_phone: '+14155551235',
        receiver_phone: '+18005551234',
        call_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
        tags_expected: ['Chargeback Risk', 'Repeated Caller', 'Negative Sentiment', 'Competitor Mentioned', 'General Customer Service']
    },
    {
        call_id: 'SAMPLE_003',
        transcription: `Agent: Hello, how can I help you today?
        Customer: [silence]
        Agent: Hello? Can you hear me?
        Customer: [click - call ends]`,
        duration: 8,
        caller_phone: '+14155551236',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['Immediate Hangup (<10s)', 'Short Call (<90s)']
    },
    {
        call_id: 'SAMPLE_004',
        transcription: `Agent: Thank you for calling. How can I help?
        Customer: Yeah, I need someone to look at my dishwasher.
        Agent: I'd be happy to help. What's your ZIP code?
        Customer: 55555.
        Agent: I'm sorry, but we don't currently service that area. The nearest location we service is about 50 miles away.
        Customer: Oh, that's too far. Never mind then.
        Agent: I apologize we couldn't help. You might want to try searching for local appliance repair services in your area.`,
        duration: 65,
        caller_phone: '+14155551237',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['No Coverage (ZIP)', 'Short Call (<90s)']
    },
    {
        call_id: 'SAMPLE_005',
        transcription: `Agent: Hello, ABC Appliance Repair, how can I help you?
        Customer: Hi, I called yesterday about my refrigerator repair and booked an appointment.
        Agent: Let me check on that for you.
        Customer: Actually, I also called this morning. I need to know if the technician has the parts for a Sub-Zero refrigerant leak repair.
        Agent: Yes, I see your appointments here. The technician will have common parts but specialized Sub-Zero parts might need to be ordered.
        Customer: Okay, I've been calling because no one confirmed if you work on Sub-Zero models specifically.
        Agent: Yes, we do service Sub-Zero appliances. The technician will assess and advise on parts availability.`,
        duration: 120,
        caller_phone: '+14155551238',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['Duplicate Call', 'Repeated Caller', 'Warranty/Status Inquiry', 'Technical Terms Used']
    },
    {
        call_id: 'SAMPLE_006',
        transcription: `Agent: Good afternoon, how can I assist you?
        Customer: Listen, I'm on the DO NOT CALL list! Why are you people calling me?
        Agent: Sir, you called us. This is ABC Appliance Repair.
        Customer: Oh... I thought you were telemarketers. Sorry. My dryer isn't working.
        Agent: No problem. I can help with that. What issues are you experiencing?
        Customer: It's not heating up properly.`,
        duration: 92,
        caller_phone: '+14155551239',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['Compliance Issue', 'Negative Sentiment']
    },
    {
        call_id: 'SAMPLE_007',
        transcription: `Agent: Thank you for calling. How may I help you today?
        Customer: I need pest control for ants in my kitchen.
        Agent: I'm sorry, but we're an appliance repair service. We don't handle pest control.
        Customer: Oh, I must have clicked the wrong ad. I was looking for pest control.
        Agent: No worries. You'll want to search for pest control services specifically.
        Customer: Okay, thanks. Sorry about that.`,
        duration: 45,
        caller_phone: '+14155551240',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['Wrong Pest Control Category', 'Short Call (<90s)']
    },
    {
        call_id: 'SAMPLE_008',
        transcription: `Agent: Hello, ABC Appliance Repair. How can I help you?
        Customer: Hi there! I just wanted to call and say the technician who came yesterday was absolutely fantastic!
        Agent: That's wonderful to hear! I'm so glad you had a positive experience.
        Customer: Yes, he fixed my washer quickly and explained everything. I'll definitely recommend you to my friends.
        Agent: Thank you so much for the feedback! We really appreciate it. Is there anything else you need?
        Customer: No, just wanted to share the positive feedback. Have a great day!`,
        duration: 95,
        caller_phone: '+14155551241',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['Positive Sentiment', 'Repeat Customer']
    },
    {
        call_id: 'SAMPLE_009',
        transcription: `Agent: Good morning, how can I assist you?
        Customer: I need a quote for repairing a commercial freezer.
        Agent: I can help with that. What's the model and what issues are you experiencing?
        Customer: It's a True T-49F, and the refrigerant pressure is dropping. I think there's a leak in the evaporator coils.
        Agent: That sounds like it could be a significant repair. For commercial units, the service call is $150 and repairs typically range from $500-$1500 depending on the issue.
        Customer: That's within our budget. Can someone come today? This is affecting our restaurant operations.
        Agent: Let me check our emergency schedule. Yes, we can have someone there by 2 PM.
        Customer: Perfect, please book it.`,
        duration: 145,
        caller_phone: '+14155551242',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['Booking Intent', 'Inquiry / Pricing Call', 'Technical Terms Used', 'Positive Sentiment']
    },
    {
        call_id: 'SAMPLE_010',
        transcription: `Agent: Thank you for calling. How can I help?
        Customer: My oven was supposedly fixed last week but it's still not working. This is unacceptable!
        Agent: I sincerely apologize. Let me pull up your account.
        Customer: I paid $300 for nothing! The heating element still doesn't work properly!
        Agent: I see the service record here. Since it's within our warranty period, we'll send someone out at no charge.
        Customer: It better be fixed properly this time. This has been a nightmare.
        Agent: I understand your frustration. I'm scheduling our senior technician for tomorrow morning to ensure it's properly resolved.`,
        duration: 110,
        caller_phone: '+14155551243',
        receiver_phone: '+18005551234',
        call_date: new Date(),
        tags_expected: ['Chargeback Risk', 'Warranty/Status Inquiry', 'Negative Sentiment', 'Repeat Customer']
    }
];

const loadSampleData = async () => {
    try {
        logger.info('Starting sample data loader...');
        
        await db.initDatabase();
        
        logger.info('Inserting sample transcriptions...');
        
        for (const sample of sampleTranscriptions) {
            try {
                const result = await db.queryOne(
                    `INSERT INTO call_transcriptions 
                     (call_id, transcription, duration, caller_phone, receiver_phone, call_date)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (call_id) DO UPDATE 
                     SET transcription = EXCLUDED.transcription,
                         processed = false
                     RETURNING call_id`,
                    [
                        sample.call_id,
                        sample.transcription,
                        sample.duration,
                        sample.caller_phone,
                        sample.receiver_phone,
                        sample.call_date
                    ]
                );
                
                if (result) {
                    logger.info(`Inserted/Updated: ${sample.call_id} - Expected tags: ${sample.tags_expected.join(', ')}`);
                }
            } catch (error) {
                logger.error(`Failed to insert ${sample.call_id}:`, error.message);
            }
        }
        
        // Get count of unprocessed transcriptions
        const count = await db.queryOne('SELECT COUNT(*) as count FROM call_transcriptions WHERE processed = false');
        logger.info(`Total unprocessed transcriptions: ${count.count}`);
        
        logger.info('Sample data loaded successfully!');
        logger.info('Run "npm start" to process these transcriptions');
        
    } catch (error) {
        logger.error('Sample data loader error:', error);
    } finally {
        await db.closeDatabase();
    }
};

// Run if called directly
if (process.argv[1].endsWith('sampleDataLoader.js')) {
    loadSampleData()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

export default loadSampleData;
