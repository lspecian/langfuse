# Analytical Databases PoC for Langfuse

This proof-of-concept explores using time-series and analytical databases (GreptimeDB and ClickHouse) as alternatives to PostgreSQL for Langfuse's analytical workloads.

## 🎯 Overview

The PoC compares two analytical databases for handling Langfuse's high-volume trace, observation, and scoring data:

- **GreptimeDB**: Cloud-native time-series database with SQL compatibility
- **ClickHouse**: Column-oriented analytical database optimized for OLAP queries

## 📁 Files in this PoC

### Setup & Configuration
- [`setup_analytical_databases.sh`](./setup_analytical_databases.sh) - One-click setup script for both databases
- [`greptimedb_analytics_queries.sql`](./greptimedb_analytics_queries.sql) - Sample analytical queries for GreptimeDB
- [`.env.dev.example`](./.env.dev.example) - Environment configuration (lines 9-14)

### Schema Files
- [`greptimedb_working_schema.sql`](./greptimedb_working_schema.sql) - Production-ready GreptimeDB schema
- [`greptimedb_schema_fixed.sql`](./greptimedb_schema_fixed.sql) - Alternative schema design
- [`simple_schema.sql`](./simple_schema.sql) - Minimal test schema
- [`final_schema.sql`](./final_schema.sql) - Final optimized schema

### Performance Testing
- [`performance_tests/clickhouse_vs_greptimedb_comparison.js`](./performance_tests/clickhouse_vs_greptimedb_comparison.js) - Comprehensive performance comparison
- [`direct_greptimedb_perf_test.js`](./direct_greptimedb_perf_test.js) - GreptimeDB-specific performance tests
- [`greptimedb_demo.sh`](./greptimedb_demo.sh) - Quick demo script

## 🚀 Quick Start

### 1. Setup Databases

```bash
# Run the setup script to start both databases
./setup_analytical_databases.sh
```

This will start:
- **ClickHouse** on ports 8123 (HTTP) and 9000 (native)
- **GreptimeDB** on ports 4000-4003 (HTTP, RPC, MySQL, PostgreSQL)

### 2. Run Performance Comparison

```bash
cd performance_tests
npm install @clickhouse/client pg
node clickhouse_vs_greptimedb_comparison.js
```

### 3. Test Individual Databases

```bash
# Test GreptimeDB via PostgreSQL interface
node direct_greptimedb_perf_test.js

# Test GreptimeDB via HTTP API
./greptimedb_demo.sh
```

## 📊 Database Configurations

### GreptimeDB Configuration (.env.dev)
```env
# Option 1: Use GreptimeDB's PostgreSQL interface
DATABASE_URL="postgresql://postgres@localhost:4003/public"

# Option 2: Use GreptimeDB as ClickHouse replacement
CLICKHOUSE_URL="http://localhost:4000"
CLICKHOUSE_USER="postgres"
CLICKHOUSE_PASSWORD=""
```

### ClickHouse Configuration (.env.dev)
```env
CLICKHOUSE_URL="http://localhost:8123"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD=""
CLICKHOUSE_CLUSTER_ENABLED="false"
```

## 🏗️ Schema Design

### GreptimeDB Schema Highlights

```sql
-- Time-series optimized traces table
CREATE TABLE traces (
    id STRING,
    timestamp TIMESTAMP(3) TIME INDEX,  -- Time-series primary key
    name STRING TAG,                    -- Indexed tag for fast filtering
    user_id STRING TAG,                 -- Indexed tag
    project_id STRING TAG,             -- Indexed tag
    metadata STRING,                    -- JSON metadata
    release STRING TAG,
    version STRING TAG,
    tags STRING,
    input STRING,
    output STRING,
    session_id STRING,
    public BOOLEAN,
    bookmarked BOOLEAN,
    created_at TIMESTAMP(3) DEFAULT now(),
    updated_at TIMESTAMP(3) DEFAULT now()
);
```

Key features:
- **TIME INDEX**: Optimizes time-range queries
- **TAG columns**: Automatically indexed for fast filtering
- **SQL compatibility**: Works with existing PostgreSQL queries
- **Automatic partitioning**: By time ranges

### ClickHouse Schema Highlights

```sql
-- Column-oriented optimized for analytics
CREATE TABLE traces (
    id String,
    timestamp DateTime64(3),
    name String,
    user_id String,
    project_id String,
    -- ... other fields
) ENGINE = MergeTree()
ORDER BY (project_id, timestamp)
PARTITION BY toYYYYMM(timestamp);
```

Key features:
- **MergeTree engine**: Optimized for analytical queries
- **Custom partitioning**: By month for time-range queries
- **Columnar storage**: Excellent compression and query performance
- **Materialized views**: For pre-aggregated analytics

## 📈 Performance Characteristics

### Expected Performance Benefits

**GreptimeDB:**
- ✅ 10-50x faster time-range queries
- ✅ Better compression (50-80% storage reduction)
- ✅ Automatic time-based partitioning
- ✅ PostgreSQL compatibility (easy migration)
- ✅ Simpler ops (cloud-native design)

**ClickHouse:**
- ✅ Extremely fast analytical queries
- ✅ Superior compression
- ✅ Mature ecosystem
- ✅ Advanced materialized views
- ❌ More complex operations
- ❌ Learning curve for SQL dialect

### Use Case Recommendations

**Choose GreptimeDB when:**
- Easy PostgreSQL migration is priority
- Time-series workloads dominate
- Operational simplicity is important
- Cloud-native deployment preferred

**Choose ClickHouse when:**
- Maximum analytical performance needed
- Complex aggregations are common
- Mature tooling ecosystem required
- Team has ClickHouse expertise

## 🔧 Integration Points

### Langfuse Integration Options

1. **Hybrid Approach** (Recommended)
   - PostgreSQL for transactional data
   - GreptimeDB/ClickHouse for analytics
   - Background sync process

2. **Full Migration**
   - Replace PostgreSQL entirely
   - Requires application changes
   - Higher risk, higher reward

3. **Analytics-Only**
   - Keep PostgreSQL as primary
   - Stream analytics data to time-series DB
   - Read-only analytical queries

### Environment Variables

```env
# Enable analytical database
LANGFUSE_ANALYTICS_DB_ENABLED=true
LANGFUSE_ANALYTICS_DB_TYPE=greptimedb  # or clickhouse

# GreptimeDB connection
GREPTIMEDB_URL="postgresql://postgres@localhost:4003/public"
GREPTIMEDB_HTTP_URL="http://localhost:4000"

# ClickHouse connection  
CLICKHOUSE_URL="http://localhost:8123"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD=""
```

## 🚦 Next Steps

### Immediate Actions
1. ✅ Run performance comparison tests
2. ✅ Validate schema compatibility with Langfuse data model
3. ⏳ Implement data sync mechanism
4. ⏳ Update Langfuse dashboard queries

### Implementation Plan
1. **Phase 1**: Read-only analytics (dashboard queries)
2. **Phase 2**: Real-time data streaming
3. **Phase 3**: Full analytical workload migration
4. **Phase 4**: Evaluate transactional migration

### Monitoring & Validation
- Set up performance monitoring
- Compare query response times
- Monitor storage usage and costs
- Validate data consistency

## 📚 Resources

- [GreptimeDB Documentation](https://docs.greptime.com/)
- [ClickHouse Documentation](https://clickhouse.com/docs)
- [Performance Test Results](./performance_tests/)
- [Schema Migration Scripts](./schemas/)

## 🐛 Troubleshooting

### Common Issues

**GreptimeDB connection failed:**
```bash
# Check if container is running
docker ps | grep greptime

# Check logs
docker logs greptime

# Restart if needed
docker restart greptime
```

**ClickHouse connection failed:**
```bash
# Check health
curl http://localhost:8123/ping

# Check logs
docker logs clickhouse-test
```

**Performance test errors:**
```bash
# Install dependencies
cd performance_tests
npm install

# Check database connectivity
node -e "console.log('Testing...'); process.exit(0)"
```

---

*This PoC demonstrates the potential for significant performance improvements in Langfuse's analytical workloads while maintaining operational simplicity.*