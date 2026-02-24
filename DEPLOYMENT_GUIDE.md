# Deployment Guide: Tag ID + Array Uniformity Migration

## Quick Start

### 1. Pre-Deployment Checklist

```bash
# ✅ 1. Create database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# ✅ 2. Verify tag_definitions is complete
psql $DATABASE_URL -c "
  SELECT COUNT(*) as total_tags,
         COUNT(*) FILTER (WHERE tag_value IS NOT NULL) as tags_with_value
  FROM tag_definitions
"
# Both numbers should match!

# ✅ 3. Check current table size
psql $DATABASE_URL -c "
  SELECT pg_size_pretty(pg_total_relation_size('call_analysis_v2')) as current_size
"
```

### 2. Deployment (Production)

```bash
# Step 1: Stop processing
pm2 stop all

# Step 2: Backup one more time
pg_dump $DATABASE_URL > backup_before_migration.sql

# Step 3: Run migration (takes ~5-10 minutes for 100K rows)
node scripts/migrate-to-tag-ids-and-array-uniformity.js

# Watch for:
# ✓ Backup created
# ✓ Conversion progress (shows every 500 rows)
# ✓ Indexes created
# ✓ Views updated
# ✓ Sample data validation

# Step 4: Replace connection.js with updated version
cp src/database/connection-updated.js src/database/connection.js

# Step 5: Restart application
pm2 start all

# Step 6: Monitor logs
pm2 logs --lines 100
```

### 3. Post-Deployment Validation

```bash
# Test 1: Check data format
psql $DATABASE_URL -c "
  SELECT
    ringba_row_id,
    tier1_data,
    tier2_data
  FROM call_analysis_v2
  LIMIT 3
"
# Should show: {\"value_ids\":[...],\"reasons\":{...}}

# Test 2: Test view queries
psql $DATABASE_URL -c "SELECT * FROM v_call_analysis_summary LIMIT 5"

# Test 3: Verify API endpoint
curl http://localhost:3000/api/high-priority

# Test 4: Process a test call (check logs for success)
# New call should be processed and stored correctly

# Test 5: Check storage savings
psql $DATABASE_URL -c "
  SELECT
    'Current' as version,
    pg_size_pretty(pg_total_relation_size('call_analysis_v2')) as size
  UNION ALL
  SELECT
    'Backup (old format)',
    pg_size_pretty(pg_total_relation_size('call_analysis_v2_backup_before_tag_id_migration'))
"
```

### 4. If Something Goes Wrong (Rollback)

```bash
# Stop application
pm2 stop all

# Run rollback
node scripts/rollback-tag-id-migration.js

# Restore old connection.js (if you have it backed up)
git checkout HEAD -- src/database/connection.js

# Restart
pm2 start all
```

## Staging Environment Test

**IMPORTANT**: Test on staging FIRST!

```bash
# 1. Copy production data to staging
pg_dump $PROD_DATABASE_URL | psql $STAGING_DATABASE_URL

# 2. Run migration on staging
node scripts/migrate-to-tag-ids-and-array-uniformity.js

# 3. Run full test suite
npm test

# 4. Manual testing:
# - Process test calls
# - Query analytics
# - Test all API endpoints
# - Verify dashboards work

# 5. If all tests pass → proceed to production
```

## Monitoring After Deployment

### First 24 Hours

```bash
# Check error logs every hour
pm2 logs --err | grep -i "error\|unknown tag"

# Monitor query performance
psql $DATABASE_URL -c "
  SELECT
    query,
    mean_exec_time,
    calls
  FROM pg_stat_statements
  WHERE query LIKE '%call_analysis_v2%'
  ORDER BY mean_exec_time DESC
  LIMIT 10
"

# Check processing stats
psql $DATABASE_URL -c "
  SELECT
    DATE_TRUNC('hour', processed_at) as hour,
    COUNT(*) as calls_processed
  FROM call_analysis_v2
  WHERE processed_at > NOW() - INTERVAL '24 hours'
  GROUP BY hour
  ORDER BY hour DESC
"
```

### Week 1

- [ ] Daily error log review
- [ ] Monitor storage trends
- [ ] Verify billing calculations
- [ ] Check analytics reports
- [ ] User acceptance testing

### Week 2-4

- [ ] Weekly error log review
- [ ] Monitor query performance trends
- [ ] Verify backup restoration works
- [ ] Plan backup table cleanup

### After 30 Days

```sql
-- Safe to drop backup table
DROP TABLE call_analysis_v2_backup_before_tag_id_migration;
```

## Common Issues & Solutions

### Issue: "Unknown tag_value" warnings in logs

**Cause**: AI returned a tag_value not in tag_definitions

**Solution**:
```sql
-- Add missing tag
INSERT INTO tag_definitions (tag_name, tag_value, priority, description, tier_number)
VALUES ('Missing Tag', 'MISSING_TAG_VALUE', 'Medium', 'Description', 2);
```

### Issue: Views return NULL for tag values

**Cause**: tag_definitions missing entries for some tag IDs

**Solution**:
```sql
-- Find orphaned tag IDs
SELECT DISTINCT (tier1_data->'value_ids'->>0)::int AS tag_id
FROM call_analysis_v2
WHERE (tier1_data->'value_ids'->>0)::int NOT IN (
    SELECT id FROM tag_definitions
);

-- Add missing definitions
```

### Issue: Slow queries after migration

**Cause**: Statistics not updated

**Solution**:
```sql
ANALYZE call_analysis_v2;
REINDEX TABLE call_analysis_v2;
```

### Issue: Migration fails midway

**Cause**: Various (constraint violations, disk space, etc.)

**Solution**:
```bash
# Check error message in migration output
# Migration creates backup automatically

# Restore from backup
psql $DATABASE_URL -c "
  DROP TABLE call_analysis_v2 CASCADE;
  ALTER TABLE call_analysis_v2_backup_before_tag_id_migration
  RENAME TO call_analysis_v2;
"

# Recreate indexes and views
# (See rollback script for details)

# Debug issue and retry
```

## Performance Tuning

### If Queries Are Slow

```sql
-- Option 1: Create additional indexes for common queries
CREATE INDEX idx_v2_tier1_first_id ON call_analysis_v2 ((tier1_data->'value_ids'->>0)::int);

-- Option 2: Materialize frequent JOINs in a view
CREATE MATERIALIZED VIEW mv_call_analysis_with_tags AS
SELECT
    v2.*,
    td1.tag_value AS tier1_value,
    td4.tag_value AS tier4_value,
    td5.tag_value AS tier5_value
FROM call_analysis_v2 v2
LEFT JOIN tag_definitions td1 ON td1.id = (v2.tier1_data->'value_ids'->>0)::int
LEFT JOIN tag_definitions td4 ON td4.id = (v2.tier4_data->'value_ids'->>0)::int
LEFT JOIN tag_definitions td5 ON td5.id = (v2.tier5_data->'value_ids'->>0)::int;

-- Refresh periodically
REFRESH MATERIALIZED VIEW mv_call_analysis_with_tags;
```

## Success Criteria

✅ **Migration Successful** when:
- [ ] No errors in migration output
- [ ] All data converted (sample check)
- [ ] Views return correct data
- [ ] API endpoints work
- [ ] New calls process correctly
- [ ] Storage savings confirmed

✅ **System Stable** when:
- [ ] No increase in error rate
- [ ] Query performance acceptable
- [ ] All integrations working
- [ ] Users report no issues

## Contact & Support

- **Migration Issues**: Check logs in migration output
- **Query Issues**: Check query performance with EXPLAIN ANALYZE
- **Data Issues**: Verify tag_definitions completeness
- **Rollback**: Use rollback script immediately

---

**Remember**: Test on staging first! 🚀
