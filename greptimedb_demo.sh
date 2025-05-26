#!/bin/bash
set -e

echo "🚀 GreptimeDB PoC Demo Script"
echo "=============================="

# Set environment variables
export GREPTIMEDB_HOST=localhost
export GREPTIMEDB_DATABASE=public
export GREPTIMEDB_PORT_PGSQL=4003
export GREPTIMEDB_USER=postgres
export GREPTIMEDB_PASSWORD=
export GREPTIMEDB_ENABLE_SSL=false
export PROJECT_ID=test-project-123

echo "✅ Environment variables set"

# Insert test data into scores table
echo "📊 Inserting test scores data..."
psql -h localhost -p 4003 -d public -U postgres -c "
INSERT INTO scores (id, \"timestamp\", project_id, trace_id, \"name\", \"value\", \"source\", data_type) VALUES 
('score-1', '2024-01-01 10:05:00', 'test-project-123', 'trace-1', 'quality', 0.85, 'human', 'NUMERIC'),
('score-2', '2024-01-01 10:06:00', 'test-project-123', 'trace-1', 'relevance', 0.92, 'human', 'NUMERIC'),
('score-3', '2024-01-01 11:05:00', 'test-project-123', 'trace-2', 'quality', 0.78, 'human', 'NUMERIC'),
('score-4', '2024-01-01 12:05:00', 'test-project-123', 'trace-3', 'quality', 0.91, 'human', 'NUMERIC'),
('score-5', '2024-01-01 13:05:00', 'test-project-123', 'trace-2', 'helpfulness', 0.87, 'human', 'NUMERIC');
" > /dev/null 2>&1

echo "✅ Test data inserted"

# Run analytics queries
echo "📈 Running analytics queries on GreptimeDB..."
echo

echo "1. Score Analysis by Name:"
psql -h localhost -p 4003 -d public -U postgres -c "
SELECT 
    \"name\" as score_name,
    COUNT(*) as score_count,
    AVG(\"value\") as avg_score,
    MIN(\"value\") as min_score,
    MAX(\"value\") as max_score
FROM scores 
WHERE project_id = 'test-project-123'
GROUP BY \"name\"
ORDER BY avg_score DESC;
"

echo
echo "2. Daily Score Trends:"
psql -h localhost -p 4003 -d public -U postgres -c "
SELECT 
    DATE_TRUNC('hour', \"timestamp\") as hour,
    COUNT(*) as score_count,
    AVG(\"value\") as avg_score
FROM scores 
WHERE project_id = 'test-project-123'
    AND \"timestamp\" >= '2024-01-01'::timestamp
    AND \"timestamp\" < '2024-01-02'::timestamp
GROUP BY DATE_TRUNC('hour', \"timestamp\")
ORDER BY hour;
"

echo
echo "3. Trace Summary:"
psql -h localhost -p 4003 -d public -U postgres -c "
SELECT 
    COUNT(*) as total_traces,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT project_id) as unique_projects
FROM traces;
"

echo
echo "4. Observation Summary:"
psql -h localhost -p 4003 -d public -U postgres -c "
SELECT 
    \"type\" as observation_type,
    COUNT(*) as count,
    AVG(total_cost) as avg_cost
FROM observations 
GROUP BY \"type\"
ORDER BY count DESC;
"

echo
echo "🎯 Testing Data Generator (generates 10 traces, 1-3 observations each, with scores):"
ts-node performance_tests/data_generator.ts 10 1 3 true | head -50

echo
echo "✅ GreptimeDB PoC Demo Complete!"
echo
echo "Summary:"
echo "- GreptimeDB is running on ports 4000-4003"
echo "- Database schema created with traces, observations, scores tables"
echo "- Analytics queries demonstrate time-series capabilities"
echo "- Data generator creates realistic test data"
echo "- Performance tests available but require Langfuse web server"
echo
echo "Next steps:"
echo "1. Start Langfuse web server: 'npm run dev' in web/ directory"
echo "2. Run query latency tests: 'ts-node performance_tests/query_latency_test.ts --db greptimedb'"
echo "3. Run ingestion tests: 'ts-node performance_tests/ingestion_test.ts --traceCount 100'"