import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { pipe, map, filter, prop, curry, compose } from 'ramda';
import { validateAIResponse, mapTagsToIds } from '../src/services/openRouterClient.js';

describe('Functional Programming Tests', () => {
    
    describe('AI Response Validation', () => {
        it('should validate correct AI response structure', () => {
            const validResponse = {
                summary: 'Customer called about refrigerator repair',
                sentiment: 'neutral',
                overallConfidence: 0.85,
                detectedTags: [
                    {
                        tagName: 'Booking Intent',
                        confidence: 0.9,
                        reason: 'Customer scheduled appointment'
                    }
                ]
            };
            
            const result = validateAIResponse(validResponse);
            assert.deepStrictEqual(result, validResponse);
        });
        
        it('should throw error for invalid sentiment', () => {
            const invalidResponse = {
                summary: 'Test summary',
                sentiment: 'invalid',
                overallConfidence: 0.5,
                detectedTags: []
            };
            
            assert.throws(() => validateAIResponse(invalidResponse), /Invalid sentiment value/);
        });
        
        it('should throw error for missing fields', () => {
            const incompleteResponse = {
                summary: 'Test summary',
                sentiment: 'positive'
            };
            
            assert.throws(() => validateAIResponse(incompleteResponse), /missing fields/);
        });
    });
    
    describe('Tag Mapping Functions', () => {
        const mockTagDefinitions = [
            { id: 1, tag_name: 'Booking Intent' },
            { id: 2, tag_name: 'Positive Sentiment' },
            { id: 3, tag_name: 'Technical Terms Used' }
        ];
        
        it('should map AI tags to database IDs', () => {
            const aiTags = [
                { tagName: 'Booking Intent', confidence: 0.9, reason: 'Scheduled appointment' },
                { tagName: 'Positive Sentiment', confidence: 0.8, reason: 'Happy customer' }
            ];
            
            const result = mapTagsToIds(mockTagDefinitions, aiTags);
            
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].tagId, 1);
            assert.strictEqual(result[0].confidence, 0.9);
            assert.strictEqual(result[1].tagId, 2);
        });
        
        it('should filter out unknown tags', () => {
            const aiTags = [
                { tagName: 'Unknown Tag', confidence: 0.9, reason: 'Test' },
                { tagName: 'Booking Intent', confidence: 0.8, reason: 'Valid tag' }
            ];
            
            const result = mapTagsToIds(mockTagDefinitions, aiTags);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].tagId, 1);
        });
    });
    
    describe('Functional Composition', () => {
        it('should compose data transformations', () => {
            const data = [
                { id: 1, value: 10, active: true },
                { id: 2, value: 20, active: false },
                { id: 3, value: 30, active: true },
                { id: 4, value: 40, active: true }
            ];
            
            // Compose a pipeline: filter active, extract values, double them, sum
            const pipeline = pipe(
                filter(prop('active')),
                map(prop('value')),
                map(x => x * 2),
                (values) => values.reduce((a, b) => a + b, 0)
            );
            
            const result = pipeline(data);
            assert.strictEqual(result, 160); // (10 + 30 + 40) * 2
        });
        
        it('should use currying for partial application', () => {
            const multiply = curry((x, y) => x * y);
            const double = multiply(2);
            const triple = multiply(3);
            
            assert.strictEqual(double(5), 10);
            assert.strictEqual(triple(5), 15);
        });
    });
    
    describe('Pure Functions', () => {
        it('should not mutate input data', () => {
            const original = { tags: ['test'], confidence: 0.5 };
            const transform = (obj) => ({
                ...obj,
                tags: [...obj.tags, 'new'],
                confidence: obj.confidence + 0.1
            });
            
            const result = transform(original);
            
            // Original should be unchanged
            assert.deepStrictEqual(original, { tags: ['test'], confidence: 0.5 });
            // Result should have new values
            assert.deepStrictEqual(result, { tags: ['test', 'new'], confidence: 0.6 });
        });
        
        it('should produce consistent results', () => {
            const processTag = (tag) => ({
                ...tag,
                normalized: tag.name.toLowerCase().replace(/\s+/g, '_')
            });
            
            const input = { name: 'Booking Intent', confidence: 0.9 };
            const result1 = processTag(input);
            const result2 = processTag(input);
            
            assert.deepStrictEqual(result1, result2);
        });
    });
});

// Run tests if called directly
if (process.argv[1].endsWith('test.functional.js')) {
    console.log('Running functional programming tests...');
}
