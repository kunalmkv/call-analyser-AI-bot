import { isValidTranscript } from './src/services/openRouterClient.js';

console.log('Testing transcript validation...\n');

const testCases = [
    // Valid transcripts
    { text: 'Agent: Hello, how can I help you?\nCustomer: I need appliance repair', expected: true },
    { text: 'A - This is a test call\nB - Yes I understand', expected: true },
    { text: 'Customer called about refrigerator repair service needed urgently', expected: true },

    // Invalid transcripts - placeholders
    { text: 'Transcription not available', expected: false },
    { text: 'transcript not available', expected: false },
    { text: 'TRANSCRIPTION NOT AVAILABLE', expected: false },
    { text: 'Not available', expected: false },
    { text: 'Unavailable', expected: false },
    { text: 'No transcript', expected: false },
    { text: 'N/A', expected: false },
    { text: 'None', expected: false },
    { text: 'null', expected: false },
    { text: 'undefined', expected: false },
    { text: 'Error processing transcript', expected: false },
    { text: 'Failed to transcribe', expected: false },
    { text: 'Transcription failed', expected: false },
    { text: 'Processing...', expected: false },
    { text: 'Pending', expected: false },

    // Invalid transcripts - empty/short
    { text: '', expected: false },
    { text: '   ', expected: false },
    { text: 'Hi', expected: false },
    { text: 'Test', expected: false },
    { text: null, expected: false },
    { text: undefined, expected: false },

    // Edge cases
    { text: 'This transcript contains the phrase transcription not available but has more text', expected: false },
    { text: 'Short but valid enough text here', expected: true },
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
    const result = isValidTranscript(testCase.text);
    const status = result === testCase.expected ? '✓ PASS' : '✗ FAIL';

    if (result === testCase.expected) {
        passed++;
    } else {
        failed++;
        console.log(`${status}: "${testCase.text}" - Expected: ${testCase.expected}, Got: ${result}`);
    }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed === 0) {
    console.log('✓ All tests passed!');
    process.exit(0);
} else {
    console.log(`✗ ${failed} test(s) failed`);
    process.exit(1);
}
