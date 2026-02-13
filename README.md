# Call Tagging Service

An AI-powered Node.js service that analyzes call transcriptions, generates summaries, and automatically assigns priority-based tags using functional programming principles.

## Features

- **Automated Call Analysis**: Processes call transcriptions using OpenRouter AI API
- **Priority-Based Tagging**: Assigns tags based on predefined priority levels (Highest, High, Medium, Lower)
- **Functional Programming**: Built using pure functions and immutable data patterns
- **Batch Processing**: Efficiently processes transcriptions in configurable batches
- **REST API**: Provides endpoints for manual processing and analytics
- **PostgreSQL Integration**: Stores transcriptions, analysis, and tags in a relational database
- **Comprehensive Logging**: Winston-based logging with file rotation

## Tag Priority System

### Highest Priority (Critical - Red)
- **High-Quality Unbilled**: Revenue loss detection
- **Chargeback Risk**: Customer service issues
- **Duplicate Call**: Compliance risks
- **Compliance Issue**: Legal/regulatory concerns

### High Priority (Orange)
- **No Coverage (ZIP)**: Routing optimization
- **Wrong Category**: Ad targeting issues
- **Short Calls**: Quality concerns
- **Hangup Issues**: Service improvements

### Medium Priority (Yellow)
- **Booking Intent**: Positive indicators
- **Inquiries**: Future conversion potential
- **Customer Service**: Non-revenue calls

### Lower Priority (Green)
- **Sentiment Analysis**: Customer satisfaction
- **Technical Terms**: Keyword insights
- **Competitor Mentions**: Market intelligence

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd call-tagging-service
```

2. Install dependencies:
```bash
npm install
```

3. Set up PostgreSQL database and create a database named `call_center_db`

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Run database migrations:
```bash
npm run migrate
```

6. Start the service:
```bash
npm start
```

## Configuration

Edit the `.env` file with your settings:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=call_center_db
DB_USER=your_username
DB_PASSWORD=your_password

# OpenRouter API Configuration
OPENROUTER_API_KEY=your_api_key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Service Configuration
BATCH_SIZE=10
PROCESSING_INTERVAL_MINUTES=5
```

## API Endpoints

### Health Check
```http
GET /health
```

### Process Single Transcription
```http
POST /api/process
Content-Type: application/json

{
    "callId": "CALL123",
    "transcription": "Call transcript text...",
    "duration": 120,
    "callerPhone": "+1234567890",
    "callDate": "2024-01-15T10:30:00Z"
}
```

### Get Analytics Report
```http
GET /api/analytics?startDate=2024-01-01&endDate=2024-01-31
```

### Get High-Priority Calls
```http
GET /api/high-priority?limit=50
```

### Get Call Analysis by ID
```http
GET /api/calls/CALL123
```

### Bulk Insert Transcriptions
```http
POST /api/transcriptions/bulk
Content-Type: application/json

{
    "transcriptions": [
        {
            "callId": "CALL001",
            "transcription": "Text...",
            "duration": 95,
            "callerPhone": "+1234567890",
            "callDate": "2024-01-15T10:30:00Z"
        }
    ]
}
```

### Get Tag Statistics
```http
GET /api/tags/stats
```

## Database Schema

### Tables

1. **call_transcriptions**: Raw call data
2. **tag_definitions**: Predefined tag categories
3. **call_analysis**: AI-generated summaries and sentiment
4. **call_tags**: Assigned tags with confidence scores

## Architecture

```
src/
├── api/
│   └── server.js         # REST API endpoints
├── config/
│   └── index.js          # Configuration management
├── database/
│   ├── connection.js     # Database operations
│   ├── migrate.js        # Migration runner
│   └── schema.sql        # Database schema
├── services/
│   ├── processor.js      # Main processing logic
│   └── openRouterClient.js # AI API integration
├── utils/
│   └── logger.js         # Logging utilities
└── index.js              # Application entry point
```

## Functional Programming Principles

- **Pure Functions**: All data transformations are side-effect free
- **Immutability**: Configuration and data structures are immutable
- **Composition**: Complex operations built from simple functions
- **Currying**: Partial application for reusable functions
- **Ramda.js**: Functional utility library for data manipulation

## Testing

Create sample data:
```bash
node src/utils/sampleDataLoader.js
```

## Monitoring

Logs are stored in the `./logs` directory:
- `combined.log`: All application logs
- `error.log`: Error-level logs only

## Performance Considerations

- Batch processing reduces API calls
- Database indexes optimize query performance
- Connection pooling for database efficiency
- Exponential backoff for API retry logic
- Configurable processing intervals

## Error Handling

- Comprehensive error logging
- Graceful shutdown on SIGINT/SIGTERM
- Transaction rollback on failures
- Retry logic for API calls
- Validation of AI responses

## License

MIT

## Support

For issues or questions, please create an issue in the repository.
