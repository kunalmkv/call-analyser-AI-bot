# Call Tagging Service - Implementation Summary

## Overview
A production-ready Node.js service built with functional programming principles for analyzing call transcriptions and automatically assigning priority-based tags using AI.

## Key Features Implemented

### 1. **Functional Programming Architecture**
- **Pure Functions**: All data transformations are side-effect free
- **Immutability**: Configuration and state management using immutable data structures
- **Composition**: Complex operations built from simple, composable functions
- **Currying**: Extensive use of partial application with Ramda.js
- **No Classes**: Purely functional approach without OOP patterns

### 2. **AI-Powered Analysis**
- Integration with OpenRouter API for intelligent call analysis
- Configurable AI models (default: Claude 3.5 Sonnet)
- Automatic tag detection based on call content
- Confidence scoring for each detected tag
- Sentiment analysis (positive/neutral/negative)
- Call summarization

### 3. **Priority-Based Tagging System**
Implemented all tags from your screenshot with proper priority levels:
- **Highest (Critical)**: Revenue loss, compliance issues
- **High**: Quality concerns, routing problems
- **Medium**: Intent indicators, inquiries
- **Lower**: Sentiment, competitive intelligence

### 4. **Database Architecture**
```sql
Tables:
- call_transcriptions: Raw call data
- tag_definitions: 22 predefined tags from your screenshot
- call_analysis: AI-generated summaries
- call_tags: Many-to-many relationship with confidence scores
```

### 5. **Processing Pipeline**
```javascript
// Functional pipeline example
const processCall = pipe(
    fetchTranscription,
    analyzeWithAI,
    validateResponse,
    mapTagsToIds,
    saveToDatabase,
    markAsProcessed
);
```

### 6. **REST API Endpoints**
- `POST /api/process` - Manual processing
- `GET /api/analytics` - Analytics reports
- `GET /api/high-priority` - Critical calls
- `GET /api/calls/:id` - Individual call details
- `POST /api/transcriptions/bulk` - Bulk import
- `GET /api/tags/stats` - Tag statistics

### 7. **Batch Processing**
- Configurable batch sizes
- Automatic retry with exponential backoff
- Parallel processing with Promise.allSettled
- Graceful error handling

### 8. **Production Features**
- Docker support with docker-compose
- Comprehensive logging with Winston
- Health checks
- Database migrations
- Environment-based configuration
- Graceful shutdown handling

## File Structure
```
call-tagging-service/
├── src/
│   ├── api/
│   │   └── server.js          # REST API (functional handlers)
│   ├── config/
│   │   └── index.js           # Immutable configuration
│   ├── database/
│   │   ├── connection.js      # Database operations (curried functions)
│   │   ├── migrate.js         # Migration runner
│   │   └── schema.sql         # Database schema with all tags
│   ├── services/
│   │   ├── processor.js       # Main processing logic (functional composition)
│   │   └── openRouterClient.js # AI integration (pure functions)
│   ├── utils/
│   │   ├── logger.js          # Logging utility
│   │   ├── dataExporter.js    # Export utilities
│   │   └── sampleDataLoader.js # Test data generator
│   └── index.js               # Entry point
├── test/
│   └── test.functional.js     # Functional programming tests
├── package.json
├── Dockerfile
├── docker-compose.yml
├── quick-start.sh
└── README.md
```

## Functional Programming Highlights

### 1. Currying Example
```javascript
export const query = curry(async (queryText, params = []) => {
    const result = await pool.query(queryText, params);
    return result.rows;
});

// Partial application
const getUnprocessed = query('SELECT * FROM call_transcriptions WHERE processed = false');
```

### 2. Pure Function Example
```javascript
const mapTagsToIds = curry((tagDefinitions, aiTags) => {
    const tagMap = new Map(tagDefinitions.map(t => [t.tag_name.toLowerCase(), t.id]));
    
    return aiTags
        .map(aiTag => ({
            tagId: tagMap.get(aiTag.tagName.toLowerCase()),
            confidence: aiTag.confidence,
            reason: aiTag.reason
        }))
        .filter(tag => tag.tagId !== null);
});
```

### 3. Composition Example
```javascript
const processBatch = pipe(
    fetchUnprocessedTranscriptions,
    map(analyzeTranscription),
    Promise.all,
    partition(prop('success')),
    saveResults
);
```

## Quick Start

1. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your OpenRouter API key and database credentials
   ```

2. **Using Docker (Recommended)**
   ```bash
   docker-compose up
   ```

3. **Local Installation**
   ```bash
   npm install
   npm run migrate
   npm start
   ```

4. **Load Sample Data**
   ```bash
   node src/utils/sampleDataLoader.js
   ```

## Testing

The service includes:
- 10 sample call transcriptions covering all tag scenarios
- Functional programming unit tests
- Data export utilities for reporting

## OpenRouter API Integration

The service is configured to work with OpenRouter API:
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Default Model: `anthropic/claude-3.5-sonnet`
- Structured JSON responses for consistent parsing
- Automatic retry logic with exponential backoff

## Tag Detection Logic

Each tag has specific detection criteria matching your screenshot:
- **High-Quality Unbilled**: Duration ≥90s, Revenue = 0, Valid ZIP
- **Chargeback Risk**: Repeat calls, warranty queries, wrong service
- **Duplicate Call**: Multiple calls from same ID
- **Compliance Issue**: Profanity, DNC violations, extreme negativity
- And 18 more tags with specific detection rules

## Performance Optimizations

- Database connection pooling
- Batch processing to reduce API calls
- Indexed database columns for fast queries
- Parallel processing of transcriptions
- Caching of tag definitions

## Monitoring & Analytics

- Real-time processing statistics
- Tag frequency analysis
- Sentiment distribution reports
- High-priority call alerts
- Daily/weekly/monthly summaries

## Data Export Capabilities

```bash
# Export call analysis to CSV
node src/utils/dataExporter.js analysis 2024-01-01 2024-01-31

# Export tag statistics
node src/utils/dataExporter.js tags 2024-01-01 2024-01-31

# Export high-priority calls
node src/utils/dataExporter.js priority 100
```

## Next Steps

1. Add your OpenRouter API key to `.env`
2. Configure database connection
3. Run migrations to create tables
4. Load sample data for testing
5. Start the service
6. Monitor logs in `./logs` directory

The service is production-ready with comprehensive error handling, logging, and monitoring capabilities.
