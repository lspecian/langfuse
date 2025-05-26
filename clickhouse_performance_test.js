const { createClient } = require('@clickhouse/client');
const crypto = require('crypto');

// ClickHouse configuration
const clickhouseConfig = {
  url: 'http://localhost:8123',
  username: 'default',
  password: '',
  database: 'default'
};

// ClickHouse schema for Langfuse
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
    const baseTimestamp = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    traces.push({
      id: crypto.randomUUID(),
      timestamp: baseTimestamp.toISOString().replace('T', ' ').replace('Z', ''),
      name: `Trace ${i}`,
      user_id: `user-${i % 100}`,
      project_id: projectId,
      metadata: `{"test":true,"index":${i}}`,
      release: 'v1.0.0',
      version: '1.0',
      tags: `["tag-${i % 10}"]`,
      input: `{"prompt":"Test prompt ${i}"}`,
      output: `{"response":"Test response ${i}"}`,
      session_id: `session-${Math.floor(i / 10)}`,
      public: i % 2,
      bookmarked: i % 5 === 0 ? 1 : 0
    });
  }
  return traces;
}

function generateObservationData(traces, obsPerTrace = 2) {
  const observations = [];
  traces.forEach((trace, traceIndex) => {
    const traceTime = new Date(trace.timestamp + ' UTC');
    for (let i = 0; i < obsPerTrace; i++) {
      const startTime = new Date(traceTime.getTime() + i * 1000);
      const endTime = new Date(traceTime.getTime() + (i + 1) * 1000);
      observations.push({
        id: crypto.randomUUID(),
        trace_id: trace.id,
        project_id: trace.project_id,
        type: ['GENERATION', 'SPAN', 'EVENT'][i % 3],
        parent_observation_id: i > 0 ? observations[observations.length - 1]?.id : '',
        start_time: startTime.toISOString().replace('T', ' ').replace('Z', ''),
        end_time: endTime.toISOString().replace('T', ' ').replace('Z', ''),
        name: `Observation ${traceIndex}-${i}`,
        metadata: `{"obsIndex":${i}}`,
        level: ['DEFAULT', 'WARNING', 'ERROR'][i % 3],
        status_message: i % 5 === 0 ? 'Error occurred' : '',
        version: '1.0',
        input: `{"input":"Input ${i}"}`,
        output: `{"output":"Output ${i}"}`,
        model: ['gpt-4', 'gpt-3.5-turbo', 'claude-3'][i % 3],
        prompt_tokens: Math.floor(Math.random() * 1000) + 100,
        completion_tokens: Math.floor(Math.random() * 500) + 50,
        total_tokens: 0,
        unit: 'TOKENS',
        input_cost: parseFloat((Math.random() * 0.01).toFixed(6)),
        output_cost: parseFloat((Math.random() * 0.02).toFixed(6)),
        total_cost: 0
      });
    }
  });
  return observations;
}

function generateScoreData(traces, scoresPerTrace = 1) {
  const scores = [];
  traces.forEach((trace, index) => {
    const traceTime = new Date(trace.timestamp + ' UTC');
    for (let i = 0; i < scoresPerTrace; i++) {
      const scoreTime = new Date(traceTime.getTime() + 5000);
      scores.push({
        id: crypto.randomUUID(),
        project_id: trace.project_id,
        trace_id: trace.id,
        observation_id: '',
        name: ['quality', 'relevance', 'accuracy'][i % 3],
        value: parseFloat((Math.random() * 5).toFixed(2)),
        string_value: '',
        data_type: 'NUMERIC',
        source: 'API',
        comment: i % 3 === 0 ? 'Good quality' : '',
        author_user_id: `evaluator-${i % 5}`,
        config_id: crypto.randomUUID(),
        timestamp: scoreTime.toISOString().replace('T', ' ').replace('Z', '')
      });
    }
  });
  return scores;
}

async function runBenchmark(iterations = 10) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
    const time = Date.now() - start;
    times.push(time);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return { avg, min, max, times };
}

// Performance test functions
async function testClickHouse() {
  console.log('\n🟦 ClickHouse Performance Test');
  console.log('================================');
  
  const client = createClient(clickhouseConfig);
  
  try {
    // Test connection
    console.log('🔌 Testing ClickHouse connection...');
    await client.ping();
    console.log('✅ Connected successfully');
    
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
    const TEST_SIZES = [1000, 5000];
    
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
    console.log('\n📈 Running Query Performance Benchmark...');
    const queries = [
      {
        name: 'Simple Count Query',
        sql: 'SELECT count() FROM traces'
      },
      {
        name: 'Time Range Filter',
        sql: `SELECT count() FROM traces WHERE timestamp >= now() - INTERVAL 24 HOUR`
      },
      {
        name: 'Complex Aggregation',
        sql: `SELECT user_id, count() as trace_count, avg(length(input)) as avg_input_len 
              FROM traces 
              GROUP BY user_id 
              ORDER BY trace_count DESC 
              LIMIT 10`
      },
      {
        name: 'Score Analytics',
        sql: `SELECT name, avg(value) as avg_score, count() as score_count 
              FROM scores 
              WHERE value IS NOT NULL 
              GROUP BY name 
              ORDER BY avg_score DESC`
      }
    ];
    
    for (const query of queries) {
      console.log(`\n📊 Testing: ${query.name}`);
      const times = [];
      
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        const result = await client.query({ query: query.sql });
        const rows = await result.json();
        const duration = Date.now() - start;
        times.push(duration);
        console.log(`  Run ${i + 1}: ${duration}ms (${rows.data ? rows.data.length : 0} rows)`);
      }
      
      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      console.log(`  ✅ Average: ${Math.round(avgTime)}ms | Min: ${minTime}ms | Max: ${maxTime}ms`);
      results.query[query.name] = avgTime;
    }
    
    // Final stats
    console.log('\n📊 Final Database Stats:');
    const tracesCount = await client.query({ query: 'SELECT count() FROM traces' });
    const obsCount = await client.query({ query: 'SELECT count() FROM observations' });
    const scoresCount = await client.query({ query: 'SELECT count() FROM scores' });
    
    const tracesData = await tracesCount.json();
    const obsData = await obsCount.json();
    const scoresData = await scoresCount.json();
    
    console.log(`  traces: ${tracesData.data[0]['count()']} total records`);
    console.log(`  observations: ${obsData.data[0]['count()']} total records`);
    console.log(`  scores: ${scoresData.data[0]['count()']} total records`);
    
    return results;
    
  } finally {
    await client.close();
  }
}

// Main function
async function main() {
  console.log('🏁 CLICKHOUSE PERFORMANCE TEST');
  console.log('===============================');
  console.log('Testing ClickHouse for Langfuse analytical workloads\n');
  
  try {
    // Wait for ClickHouse to be ready
    console.log('⏳ Waiting for ClickHouse to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const results = await testClickHouse();
    
    // Generate summary report
    console.log('\n============================================================');
    console.log('📈 CLICKHOUSE PERFORMANCE TEST RESULTS');
    console.log('============================================================');
    
    console.log('\n📥 INGESTION PERFORMANCE:');
    for (const [size, perf] of Object.entries(results.insert)) {
      console.log(`  ${size} RECORDS:`);
      console.log(`    TRACES: ${perf.traces} records/sec`);
      console.log(`    OBSERVATIONS: ${perf.observations} records/sec`);
      console.log(`    SCORES: ${perf.scores} records/sec`);
    }
    
    console.log('\n⚡ QUERY PERFORMANCE:');
    for (const [queryName, avgTime] of Object.entries(results.query)) {
      console.log(`  ${queryName}: ${Math.round(avgTime)}ms avg`);
    }
    
    console.log('\n🏁 Performance test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testClickHouse };