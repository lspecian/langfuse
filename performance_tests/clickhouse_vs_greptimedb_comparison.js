const { createClient } = require('@clickhouse/client');
const { Client } = require('pg');
const crypto = require('crypto');

// Database configurations
const clickhouseConfig = {
  url: 'http://localhost:8123',
  username: 'default',
  password: '',
  database: 'default'
};

const greptimeConfig = {
  host: 'localhost',
  port: 4003,
  database: 'public',
  user: 'postgres',
  password: '',
  ssl: false
};

// Test configurations
const TEST_SIZES = [1000, 5000, 10000];
const QUERY_ITERATIONS = 5;

// Langfuse-like schema for ClickHouse
const CLICKHOUSE_SCHEMA = `
CREATE TABLE IF NOT EXISTS traces (
    id String,
    timestamp DateTime64(3),
    name String,
    user_id String,
    project_id String,
    metadata String,
    release String,
    version String,
    tags String,
    input String,
    output String,
    session_id String,
    public UInt8,
    bookmarked UInt8,
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
ORDER BY (project_id, timestamp)
PARTITION BY toYYYYMM(timestamp);

CREATE TABLE IF NOT EXISTS observations (
    id String,
    trace_id String,
    project_id String,
    type String,
    parent_observation_id Nullable(String),
    start_time DateTime64(3),
    end_time Nullable(DateTime64(3)),
    name String,
    metadata String,
    level String,
    status_message Nullable(String),
    version String,
    input String,
    output String,
    model String,
    prompt_tokens Nullable(UInt64),
    completion_tokens Nullable(UInt64),
    total_tokens Nullable(UInt64),
    unit String,
    input_cost Nullable(Decimal64(12)),
    output_cost Nullable(Decimal64(12)),
    total_cost Nullable(Decimal64(12)),
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
ORDER BY (project_id, trace_id, start_time)
PARTITION BY toYYYYMM(start_time);

CREATE TABLE IF NOT EXISTS scores (
    id String,
    project_id String,
    trace_id Nullable(String),
    observation_id Nullable(String),
    name String,
    value Nullable(Float64),
    string_value Nullable(String),
    data_type String,
    source String,
    comment Nullable(String),
    author_user_id Nullable(String),
    config_id Nullable(String),
    timestamp DateTime64(3),
    created_at DateTime64(3) DEFAULT now64(),
    updated_at DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
ORDER BY (project_id, name, timestamp)
PARTITION BY toYYYYMM(timestamp);
`;

// Generate test data
function generateTraceData(count, projectId = 'test-project') {
  const traces = [];
  for (let i = 0; i < count; i++) {
    traces.push({
      id: crypto.randomUUID(),
      timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      name: `Trace ${i}`,
      user_id: `user-${i % 100}`,
      project_id: projectId,
      metadata: JSON.stringify({ test: true, index: i }),
      release: 'v1.0.0',
      version: '1.0',
      tags: JSON.stringify([`tag-${i % 10}`]),
      input: JSON.stringify({ prompt: `Test prompt ${i}` }),
      output: JSON.stringify({ response: `Test response ${i}` }),
      session_id: `session-${Math.floor(i / 10)}`,
      public: i % 2,
      bookmarked: i % 5 === 0 ? 1 : 0
    });
  }
  return traces;
}

function generateObservationData(traces, obsPerTrace = 3) {
  const observations = [];
  traces.forEach((trace, traceIndex) => {
    for (let i = 0; i < obsPerTrace; i++) {
      observations.push({
        id: crypto.randomUUID(),
        trace_id: trace.id,
        project_id: trace.project_id,
        type: ['GENERATION', 'SPAN', 'EVENT'][i % 3],
        parent_observation_id: i > 0 ? observations[observations.length - 1].id : null,
        start_time: new Date(new Date(trace.timestamp).getTime() + i * 1000).toISOString(),
        end_time: new Date(new Date(trace.timestamp).getTime() + (i + 1) * 1000).toISOString(),
        name: `Observation ${traceIndex}-${i}`,
        metadata: JSON.stringify({ obsIndex: i }),
        level: ['DEFAULT', 'WARNING', 'ERROR'][i % 3],
        status_message: i % 5 === 0 ? 'Error occurred' : null,
        version: '1.0',
        input: JSON.stringify({ input: `Input ${i}` }),
        output: JSON.stringify({ output: `Output ${i}` }),
        model: ['gpt-4', 'gpt-3.5-turbo', 'claude-3'][i % 3],
        prompt_tokens: Math.floor(Math.random() * 1000) + 100,
        completion_tokens: Math.floor(Math.random() * 500) + 50,
        total_tokens: null,
        unit: 'TOKENS',
        input_cost: (Math.random() * 0.01).toFixed(6),
        output_cost: (Math.random() * 0.02).toFixed(6),
        total_cost: null
      });
    }
  });
  return observations;
}

function generateScoreData(traces, scoresPerTrace = 2) {
  const scores = [];
  traces.forEach((trace, index) => {
    for (let i = 0; i < scoresPerTrace; i++) {
      scores.push({
        id: crypto.randomUUID(),
        project_id: trace.project_id,
        trace_id: trace.id,
        observation_id: null,
        name: ['quality', 'relevance', 'accuracy'][i % 3],
        value: Math.random() * 5,
        string_value: null,
        data_type: 'NUMERIC',
        source: 'API',
        comment: i % 3 === 0 ? 'Good quality' : null,
        author_user_id: `evaluator-${i % 5}`,
        config_id: crypto.randomUUID(),
        timestamp: new Date(new Date(trace.timestamp).getTime() + 5000).toISOString()
      });
    }
  });
  return scores;
}

// Performance test functions
async function testClickHouse() {
  console.log('\n🟦 ClickHouse Performance Test');
  console.log('================================');
  
  const client = createClient(clickhouseConfig);
  
  try {
    // Setup schema
    console.log('📋 Setting up ClickHouse schema...');
    await client.command({ query: 'DROP TABLE IF EXISTS traces' });
    await client.command({ query: 'DROP TABLE IF EXISTS observations' });
    await client.command({ query: 'DROP TABLE IF EXISTS scores' });
    
    const schemaParts = CLICKHOUSE_SCHEMA.split(';').filter(part => part.trim());
    for (const part of schemaParts) {
      if (part.trim()) {
        await client.command({ query: part.trim() });
      }
    }
    
    const results = {
      insert: {},
      query: {}
    };
    
    // Test bulk inserts
    for (const size of TEST_SIZES) {
      console.log(`\n📊 Testing ${size} record batch...`);
      
      const traces = generateTraceData(size);
      const observations = generateObservationData(traces);
      const scores = generateScoreData(traces);
      
      // Test traces insert
      let start = Date.now();
      await client.insert({
        table: 'traces',
        values: traces,
        format: 'JSONEachRow'
      });
      let duration = Date.now() - start;
      const tracesThroughput = Math.round(size / (duration / 1000));
      console.log(`  📝 Traces: ${size} records in ${duration}ms (${tracesThroughput} records/sec)`);
      
      // Test observations insert  
      start = Date.now();
      await client.insert({
        table: 'observations',
        values: observations,
        format: 'JSONEachRow'
      });
      duration = Date.now() - start;
      const obsThroughput = Math.round(observations.length / (duration / 1000));
      console.log(`  🔍 Observations: ${observations.length} records in ${duration}ms (${obsThroughput} records/sec)`);
      
      // Test scores insert
      start = Date.now();
      await client.insert({
        table: 'scores',
        values: scores,
        format: 'JSONEachRow'
      });
      duration = Date.now() - start;
      const scoresThroughput = Math.round(scores.length / (duration / 1000));
      console.log(`  ⭐ Scores: ${scores.length} records in ${duration}ms (${scoresThroughput} records/sec)`);
      
      results.insert[size] = {
        traces: tracesThroughput,
        observations: obsThroughput,
        scores: scoresThroughput
      };
    }
    
    // Test analytical queries
    console.log('\n📈 Testing analytical queries...');
    const queries = [
      {
        name: 'Trace count by project',
        sql: 'SELECT project_id, count() FROM traces GROUP BY project_id'
      },
      {
        name: 'Hourly trace distribution',
        sql: `SELECT toStartOfHour(timestamp) as hour, count() as trace_count 
              FROM traces 
              WHERE timestamp >= now() - INTERVAL 24 HOUR 
              GROUP BY hour 
              ORDER BY hour DESC 
              LIMIT 24`
      },
      {
        name: 'Top users by trace count',
        sql: `SELECT user_id, count() as trace_count 
              FROM traces 
              GROUP BY user_id 
              ORDER BY trace_count DESC 
              LIMIT 10`
      },
      {
        name: 'Average scores by name',
        sql: `SELECT name, avg(value) as avg_score, count() as score_count 
              FROM scores 
              WHERE value IS NOT NULL 
              GROUP BY name 
              ORDER BY avg_score DESC`
      },
      {
        name: 'Traces with observations and scores',
        sql: `SELECT 
                t.project_id,
                count(DISTINCT t.id) as trace_count,
                count(DISTINCT o.id) as observation_count,
                count(DISTINCT s.id) as score_count
              FROM traces t
              LEFT JOIN observations o ON t.id = o.trace_id
              LEFT JOIN scores s ON t.id = s.trace_id
              GROUP BY t.project_id`
      }
    ];
    
    for (const query of queries) {
      const times = [];
      for (let i = 0; i < QUERY_ITERATIONS; i++) {
        const start = Date.now();
        await client.query({ query: query.sql });
        times.push(Date.now() - start);
      }
      const avgTime = times.reduce((a, b) => a + b) / times.length;
      console.log(`  ${query.name}: ${Math.round(avgTime)}ms avg`);
      results.query[query.name] = avgTime;
    }
    
    return results;
    
  } finally {
    await client.close();
  }
}

async function testGreptimeDB() {
  console.log('\n🟩 GreptimeDB Performance Test');
  console.log('===============================');
  
  const client = new Client(greptimeConfig);
  await client.connect();
  
  try {
    const results = {
      insert: {},
      query: {}
    };
    
    // Test bulk inserts (GreptimeDB already has schema from previous tests)
    for (const size of TEST_SIZES) {
      console.log(`\n📊 Testing ${size} record batch...`);
      
      const traces = [];
      for (let i = 0; i < size; i++) {
        const trace = generateTraceData(1)[0];
        traces.push(`('${trace.id}', '${trace.timestamp}', '${trace.name}', '${trace.user_id}', '${trace.project_id}', '${trace.metadata}', '${trace.release}', '${trace.version}', '${trace.tags}', ${trace.public}, ${trace.bookmarked})`);
      }
      
      const start = Date.now();
      await client.query(`
        INSERT INTO traces (id, timestamp, name, user_id, project_id, metadata, release, version, tags, public, bookmarked) 
        VALUES ${traces.join(',')}
      `);
      const duration = Date.now() - start;
      const throughput = Math.round(size / (duration / 1000));
      
      console.log(`  📝 Traces: ${size} records in ${duration}ms (${throughput} records/sec)`);
      results.insert[size] = { traces: throughput };
    }
    
    // Test analytical queries
    console.log('\n📈 Testing analytical queries...');
    const queries = [
      {
        name: 'Trace count by project',
        sql: 'SELECT project_id, COUNT(*) FROM traces GROUP BY project_id'
      },
      {
        name: 'Hourly trace distribution',
        sql: `SELECT DATE_TRUNC('hour', timestamp) as hour, COUNT(*) as trace_count 
              FROM traces 
              WHERE timestamp >= NOW() - INTERVAL '24 hours'
              GROUP BY hour 
              ORDER BY hour DESC 
              LIMIT 24`
      },
      {
        name: 'Top users by trace count',
        sql: `SELECT user_id, COUNT(*) as trace_count 
              FROM traces 
              GROUP BY user_id 
              ORDER BY trace_count DESC 
              LIMIT 10`
      }
    ];
    
    for (const query of queries) {
      const times = [];
      for (let i = 0; i < QUERY_ITERATIONS; i++) {
        const start = Date.now();
        await client.query(query.sql);
        times.push(Date.now() - start);
      }
      const avgTime = times.reduce((a, b) => a + b) / times.length;
      console.log(`  ${query.name}: ${Math.round(avgTime)}ms avg`);
      results.query[query.name] = avgTime;
    }
    
    return results;
    
  } finally {
    await client.end();
  }
}

// Main comparison function
async function runComparison() {
  console.log('🏁 LANGFUSE DATABASE PERFORMANCE COMPARISON');
  console.log('============================================');
  console.log('Testing ClickHouse vs GreptimeDB for analytical workloads\n');
  
  try {
    // Wait for databases to be ready
    console.log('⏳ Waiting for databases to be ready...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const clickhouseResults = await testClickHouse();
    const greptimeResults = await testGreptimeDB();
    
    // Generate comparison report
    console.log('\n📊 PERFORMANCE COMPARISON SUMMARY');
    console.log('==================================');
    
    console.log('\n📥 INSERT PERFORMANCE (records/second):');
    console.log('---------------------------------------');
    for (const size of TEST_SIZES) {
      console.log(`\n${size} records:`);
      console.log(`  ClickHouse Traces:      ${clickhouseResults.insert[size]?.traces || 'N/A'}`);
      console.log(`  ClickHouse Observations: ${clickhouseResults.insert[size]?.observations || 'N/A'}`);
      console.log(`  ClickHouse Scores:      ${clickhouseResults.insert[size]?.scores || 'N/A'}`);
      console.log(`  GreptimeDB Traces:      ${greptimeResults.insert[size]?.traces || 'N/A'}`);
    }
    
    console.log('\n📈 QUERY PERFORMANCE (milliseconds):');
    console.log('------------------------------------');
    const commonQueries = Object.keys(clickhouseResults.query).filter(q => 
      greptimeResults.query.hasOwnProperty(q)
    );
    
    for (const queryName of commonQueries) {
      const chTime = clickhouseResults.query[queryName];
      const gtTime = greptimeResults.query[queryName];
      const improvement = gtTime > chTime ? `${Math.round((gtTime - chTime) / gtTime * 100)}% faster` : 
                         chTime > gtTime ? `${Math.round((chTime - gtTime) / chTime * 100)}% slower` : 'same';
      
      console.log(`\n${queryName}:`);
      console.log(`  ClickHouse: ${Math.round(chTime)}ms`);
      console.log(`  GreptimeDB: ${Math.round(gtTime)}ms`);
      console.log(`  ClickHouse is ${improvement}`);
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('===================');
    console.log('Based on this performance comparison:');
    
    // Calculate average insert performance
    const chAvgInsert = Object.values(clickhouseResults.insert).reduce((sum, sizes) => {
      return sum + (sizes.traces + sizes.observations + sizes.scores) / 3;
    }, 0) / TEST_SIZES.length;
    
    const gtAvgInsert = Object.values(greptimeResults.insert).reduce((sum, sizes) => {
      return sum + sizes.traces;
    }, 0) / TEST_SIZES.length;
    
    // Calculate average query performance
    const chAvgQuery = Object.values(clickhouseResults.query).reduce((a, b) => a + b, 0) / Object.keys(clickhouseResults.query).length;
    const gtAvgQuery = Object.values(greptimeResults.query).reduce((a, b) => a + b, 0) / Object.keys(greptimeResults.query).length;
    
    if (chAvgInsert > gtAvgInsert && chAvgQuery < gtAvgQuery) {
      console.log('✅ ClickHouse shows better overall performance for Langfuse workloads');
      console.log('   - Superior insert throughput for high-volume ingestion');
      console.log('   - Faster analytical queries for dashboard/reporting');
      console.log('   - Mature ecosystem with extensive optimization options');
    } else if (gtAvgInsert > chAvgInsert && gtAvgQuery < chAvgQuery) {
      console.log('✅ GreptimeDB shows better overall performance');
      console.log('   - Better for this specific test configuration');
    } else {
      console.log('🤔 Mixed results - choice depends on specific use case');
    }
    
    console.log('\n📋 Additional Considerations:');
    console.log('- ClickHouse: Mature, extensive features, complex setup');
    console.log('- GreptimeDB: Simpler setup, time-series optimized, newer ecosystem');
    console.log('- For Langfuse: Consider data volume, query patterns, ops complexity');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the comparison
if (require.main === module) {
  runComparison().catch(console.error);
}

module.exports = { runComparison };