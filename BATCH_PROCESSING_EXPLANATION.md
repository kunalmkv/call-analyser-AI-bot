# Batch Processing Explanation

## Answer: **BATCH FETCHING + PARALLEL AI PROCESSING**

The service uses a **hybrid approach**:
1. **Database Fetch**: Fetches transcriptions in **BATCHES** (multiple at once)
2. **AI Processing**: Processes them in **PARALLEL** (all simultaneously)

---

## Detailed Flow

### 1. Database Fetch (BATCH)

**Location**: `src/services/processor.js:11`
```javascript
const transcriptions = await db.getUnprocessedTranscriptions(config.BATCH_SIZE);
```

**SQL Query** (from `src/database/connection.js:82-90`):
```sql
SELECT id, call_id, transcription, duration, caller_phone, receiver_phone, call_date
FROM call_transcriptions 
WHERE processed = false 
ORDER BY created_at ASC 
LIMIT $1  -- BATCH_SIZE (default: 10)
```

**What happens**:
- ✅ **Single database query** fetches multiple transcriptions at once
- ✅ Default batch size: **10 transcriptions**
- ✅ Configurable via `BATCH_SIZE` environment variable
- ✅ Fetches oldest unprocessed calls first (`ORDER BY created_at ASC`)

---

### 2. AI Processing (PARALLEL)

**Location**: `src/services/openRouterClient.js:185-226`
```javascript
export const processBatch = curry(async (tagDefinitions, transcriptions) => {
    const results = await Promise.allSettled(
        transcriptions.map(async (trans) => {
            // Each transcription processed in parallel
            const aiResponse = await analyzeTranscription(...);
            // ...
        })
    );
    // ...
});
```

**What happens**:
- ✅ **All transcriptions in the batch are sent to AI simultaneously**
- ✅ Uses `Promise.allSettled()` - processes all calls in parallel
- ✅ Not sequential - doesn't wait for one to finish before starting the next
- ✅ If batch size is 10, all 10 API calls happen at the same time

---

## Visual Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. DATABASE FETCH (BATCH)                                │
│    SELECT * FROM call_transcriptions                     │
│    WHERE processed = false                              │
│    LIMIT 10  ← Fetches 10 at once                       │
└─────────────────────────────────────────────────────────┘
                    ↓
        [10 transcriptions loaded]
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 2. PARALLEL AI PROCESSING                                │
│                                                          │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│    │ Call 1   │  │ Call 2   │  │ Call 3   │  ...      │
│    │ → AI API │  │ → AI API │  │ → AI API │           │
│    └──────────┘  └──────────┘  └──────────┘           │
│         ↓              ↓              ↓                 │
│    [All 10 API calls happen SIMULTANEOUSLY]             │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 3. SAVE RESULTS (PARALLEL)                               │
│    Promise.allSettled([...])                            │
│    All results saved to database in parallel            │
└─────────────────────────────────────────────────────────┘
```

---

## Example Timeline

### If processing 10 transcriptions:

**Sequential (NOT used)**:
```
Call 1: [========] 8s
Call 2:          [========] 8s
Call 3:                   [========] 8s
...
Total: ~80 seconds
```

**Parallel (ACTUALLY used)**:
```
Call 1: [========] 8s
Call 2: [========] 8s
Call 3: [========] 8s
Call 4: [========] 8s
...
All 10: [========] 8s (all at once)
Total: ~8 seconds
```

**Speed improvement**: ~10x faster! 🚀

---

## Configuration

### Batch Size
- **Default**: 10 transcriptions per batch
- **Configurable**: Set `BATCH_SIZE` in `.env` file
- **Example**: `BATCH_SIZE=20` to process 20 at a time

### Processing Interval
- **Default**: Every 5 minutes
- **Configurable**: Set `PROCESSING_INTERVAL_MINUTES` in `.env`
- **Example**: `PROCESSING_INTERVAL_MINUTES=1` to check every minute

---

## Code Locations

1. **Batch Fetch**: `src/services/processor.js:11`
   ```javascript
   const transcriptions = await db.getUnprocessedTranscriptions(config.BATCH_SIZE);
   ```

2. **Parallel Processing**: `src/services/openRouterClient.js:186`
   ```javascript
   const results = await Promise.allSettled(
       transcriptions.map(async (trans) => { ... })
   );
   ```

3. **Database Query**: `src/database/connection.js:82-90`
   ```sql
   SELECT ... LIMIT $1  -- BATCH_SIZE
   ```

---

## Benefits of This Approach

### ✅ **Efficiency**
- Single database query instead of 10 separate queries
- Parallel API calls instead of sequential
- Much faster overall processing

### ✅ **Scalability**
- Can handle large backlogs efficiently
- Configurable batch size for different workloads
- Doesn't overwhelm database with many queries

### ✅ **Resilience**
- `Promise.allSettled()` ensures one failure doesn't stop others
- Failed calls are tracked separately
- Successful calls still get saved

---

## Important Notes

### ⚠️ **API Rate Limits**
- Processing 10 calls in parallel = 10 simultaneous API requests
- Make sure your OpenRouter API key can handle this
- If you hit rate limits, reduce `BATCH_SIZE`

### ⚠️ **Database Connections**
- Uses connection pooling (max 20 connections)
- Parallel saves use transactions for safety
- Should handle batch size of 10-20 easily

### ⚠️ **Memory Usage**
- All transcriptions in batch loaded into memory
- For very large transcriptions, consider smaller batch size
- Default of 10 is safe for most cases

---

## Summary

| Aspect | Method | Details |
|--------|--------|---------|
| **Database Fetch** | **BATCH** | Single query with `LIMIT 10` (default) |
| **AI Processing** | **PARALLEL** | All calls sent to API simultaneously |
| **Result Saving** | **PARALLEL** | All results saved at once |
| **Batch Size** | Configurable | Default: 10, set via `BATCH_SIZE` |
| **Interval** | Configurable | Default: 5 minutes, set via `PROCESSING_INTERVAL_MINUTES` |

**Bottom Line**: The service fetches transcriptions in batches from the database, then processes all of them in parallel with the AI API for maximum efficiency! 🚀

