const { Client } = require('pg');
const crypto = require('crypto');

// GreptimeDB connection
const client = new Client({
  host: 'localhost',
  port: 4003,
  database: 'public',
  user: 'postgres',
  password: '',
  ssl: false
});

async function generateTestData(count) {
  console.log(`📊 Generating ${count} test records...`);
  
  const traces = [];
  const observations = [];
  const scores = [];
  
  for (let i = 0; i < count; i++) {
    const traceId = crypto.randomUUID();
    const projectId = `proj-${crypto.randomBytes(4).toString('hex')}`;
    const userId = `user-${crypto.randomBytes(4).toString('hex')}`;
    
    // Generate trace
    traces.push({
      id: traceId,
      timestamp: new Date(Date.now() - Math.random() * 86400000), // Last 24 hours
      name: `Trace ${i + 1}`,
      user_id: userId,
      project_id: projectId,
      metadata: JSON.stringify({ test: true, batch: i }),
      release: `v1.${Math.floor(Math.random() * 10)}.0`,
      version: String(Math.floor(Math.random() * 5) + 1),
      tags: JSON.stringify([`tag-${i}`, `batch-test`]),
      public: Math.random() > 0.5,
      bookmarked: Math.random() > 0.8
    });
    
    // Generate 1-3 observations per trace
    const obsCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < obsCount; j++) {
      const obsId = crypto.randomUUID();
      const startTime = new Date(Date.now() - Math.random() * 3600000);
      const endTime = new Date(startTime.getTime() + Math.random() * 5000);
      
      observations.push({
        id: obsId,
        trace_id: traceId,
        project_id: projectId,
        type: Math.random() > 0.5 ? 'GENERATION' : 'SPAN',
        start_time: startTime,
        end_time: endTime,
        name: `${Math.random() > 0.5 ? 'LLM Call' : 'DB Query'} ${j + 1}`,
        metadata: JSON.stringify({ obsIndex: j }),
        level: 'DEFAULT',
        provided_model_name: Math.random() > 0.5 ? 'gpt-4' : 'gpt-3.5-turbo',
        total_cost: Math.random() * 0.1,
        usage_details: JSON.stringify({ tokens: Math.floor(Math.random() * 1000) })
      });
      
      // Generate score for some observations
      if (Math.random() > 0.7) {
        scores.push({
          id: crypto.randomUUID(),
          timestamp: endTime,
          project_id: projectId,
          trace_id: traceId,
          observation_id: obsId,
          name: Math.random() > 0.5 ? 'quality' : 'relevance',
          value: Math.random() * 5,
          source: 'automated',
          data_type: 'NUMERIC'
        });
      }
    }
  }
  
  return { traces, observations, scores };
}

async function insertBatch(table, records, batchSize = 100) {
  console.log(`📥 Inserting ${records.length} ${table} records...`);
  
  const startTime = Date.now();
  let inserted = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    
    if (table === 'traces') {
      const values = batch.map(r => 
        `('${r.id}', '${r.timestamp.toISOString()}', '${r.name}', '${r.user_id}', '${r.project_id}', '${r.metadata}', '${r.release}', '${r.version}', '${r.tags}', ${r.public}, ${r.bookmarked})`
      ).join(',');
      
      await client.query(`
        INSERT INTO traces (id, "timestamp", "name", user_id, project_id, "metadata", "release", "version", tags, "public", bookmarked) 
        VALUES ${values}
      `);
    } else if (table === 'observations') {
      const values = batch.map(r => 
        `('${r.id}', '${r.trace_id}', '${r.project_id}', '${r.type}', '${r.start_time.toISOString()}', '${r.end_time.toISOString()}', '${r.name}', '${r.metadata}', '${r.level}', '${r.provided_model_name}', ${r.total_cost}, '${r.usage_details}')`
      ).join(',');
      
      await client.query(`
        INSERT INTO observations (id, trace_id, project_id, "type", start_time, end_time, "name", "metadata", "level", provided_model_name, total_cost, usage_details) 
        VALUES ${values}
      `);
    } else if (table === 'scores') {
      const values = batch.map(r => 
        `('${r.id}', '${r.timestamp.toISOString()}', '${r.project_id}', '${r.trace_id}', '${r.observation_id}', '${r.name}', ${r.value}, '${r.source}', '${r.data_type}')`
      ).join(',');
      
      await client.query(`
        INSERT INTO scores (id, "timestamp", project_id, trace_id, observation_id, "name", "value", "source", data_type) 
        VALUES ${values}
      `);
    }
    
    inserted += batch.length;
    if (inserted % 1000 === 0) {
      console.log(`  ✓ Inserted ${inserted}/${records.length} records`);
    }
  }
  
  const duration = Date.now() - startTime;
  console.log(`✅ Inserted ${inserted} ${table} records in ${duration}ms (${Math.round(inserted / (duration / 1000))} records/sec)`);
  
  return { count: inserted, duration, throughput: Math.round(inserted / (duration / 1000)) };
}

async function runQueryBenchmark() {
  console.log('\n🚀 Running Query Performance Benchmark...');
  
  const queries = [
    {
      name: 'Simple Count Query',
      sql: 'SELECT COUNT(*) FROM traces'
    },
    {
      name: 'Time Range Filter',
      sql: `SELECT COUNT(*) FROM traces WHERE "timestamp" >= NOW() - INTERVAL '1 hour'`
    },
    {
      name: 'Complex Aggregation',
      sql: `
        SELECT 
          DATE_TRUNC('hour', t."timestamp") as hour,
          COUNT(*) as trace_count,
          COUNT(DISTINCT t.user_id) as unique_users,
          AVG(o.total_cost) as avg_cost
        FROM traces t
        LEFT JOIN observations o ON t.id = o.trace_id
        WHERE t."timestamp" >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', t."timestamp")
        ORDER BY hour DESC
        LIMIT 10
      `
    },
    {
      name: 'Score Analytics',
      sql: `
        SELECT 
          s."name" as score_name,
          COUNT(*) as count,
          AVG(s."value") as avg_score,
          MIN(s."value") as min_score,
          MAX(s."value") as max_score
        FROM scores s
        WHERE s."timestamp" >= NOW() - INTERVAL '24 hours'
        GROUP BY s."name"
        ORDER BY avg_score DESC
      `
    }
  ];
  
  const results = [];
  
  for (const query of queries) {
    console.log(`\n📊 Testing: ${query.name}`);
    
    const times = [];
    const repetitions = 10;
    
    for (let i = 0; i < repetitions; i++) {
      const start = Date.now();
      try {
        const result = await client.query(query.sql);
        const duration = Date.now() - start;
        times.push(duration);
        console.log(`  Run ${i + 1}: ${duration}ms (${result.rows.length} rows)`);
      } catch (error) {
        console.log(`  Run ${i + 1}: ERROR - ${error.message}`);
        times.push(null);
      }
    }
    
    const validTimes = times.filter(t => t !== null);
    if (validTimes.length > 0) {
      const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
      const minTime = Math.min(...validTimes);
      const maxTime = Math.max(...validTimes);
      
      results.push({
        query: query.name,
        avgLatency: Math.round(avgTime),
        minLatency: minTime,
        maxLatency: maxTime,
        successRate: `${validTimes.length}/${repetitions}`
      });
      
      console.log(`  ✅ Average: ${Math.round(avgTime)}ms | Min: ${minTime}ms | Max: ${maxTime}ms`);
    } else {
      console.log(`  ❌ All queries failed`);
    }
  }
  
  return results;
}

async function main() {
  try {
    console.log('🔌 Connecting to GreptimeDB...');
    await client.connect();
    console.log('✅ Connected successfully');
    
    // Generate and insert test data
    const testData = await generateTestData(1000);
    
    const insertResults = {};
    insertResults.traces = await insertBatch('traces', testData.traces);
    insertResults.observations = await insertBatch('observations', testData.observations);
    insertResults.scores = await insertBatch('scores', testData.scores);
    
    // Run query benchmarks
    const queryResults = await runQueryBenchmark();
    
    // Print final results
    console.log('\n' + '='.repeat(60));
    console.log('📈 GREPTIMEDB PERFORMANCE TEST RESULTS');
    console.log('='.repeat(60));
    
    console.log('\n📥 INGESTION PERFORMANCE:');
    Object.entries(insertResults).forEach(([table, result]) => {
      console.log(`  ${table.toUpperCase()}: ${result.count} records in ${result.duration}ms (${result.throughput} records/sec)`);
    });
    
    console.log('\n⚡ QUERY PERFORMANCE:');
    queryResults.forEach(result => {
      console.log(`  ${result.query}: ${result.avgLatency}ms avg (${result.minLatency}-${result.maxLatency}ms range) - ${result.successRate} success`);
    });
    
    // Get final database stats
    const stats = await client.query(`
      SELECT 
        'traces' as table_name, COUNT(*) as row_count FROM traces
      UNION ALL
      SELECT 
        'observations' as table_name, COUNT(*) as row_count FROM observations
      UNION ALL
      SELECT 
        'scores' as table_name, COUNT(*) as row_count FROM scores
    `);
    
    console.log('\n📊 FINAL DATABASE STATS:');
    stats.rows.forEach(row => {
      console.log(`  ${row.table_name}: ${row.row_count} total records`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🏁 Performance test completed');
  }
}

main();