#!/bin/bash

echo "🚀 Setting up Analytical Databases for Langfuse"
echo "================================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local check_command=$2
    local max_attempts=30
    local attempt=1
    
    echo "⏳ Waiting for $service_name to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if eval "$check_command" > /dev/null 2>&1; then
            echo "✅ $service_name is ready!"
            return 0
        fi
        echo "   Attempt $attempt/$max_attempts - waiting..."
        sleep 2
        ((attempt++))
    done
    
    echo "❌ $service_name failed to start after $max_attempts attempts"
    return 1
}

# Clean up existing containers
echo "🧹 Cleaning up existing containers..."
docker stop clickhouse-test greptime 2>/dev/null || true
docker rm clickhouse-test greptime 2>/dev/null || true

# Start ClickHouse
echo "🟦 Starting ClickHouse..."
docker run -d \
    --name clickhouse-test \
    -p 8123:8123 \
    -p 9000:9000 \
    -v clickhouse_data:/var/lib/clickhouse \
    clickhouse/clickhouse-server

# Start GreptimeDB
echo "🟩 Starting GreptimeDB..."
docker run -d \
    --name greptime \
    -p 4000-4003:4000-4003 \
    -v greptimedb_data:/tmp/greptimedb \
    greptime/greptimedb standalone start \
    --http-addr 0.0.0.0:4000 \
    --rpc-addr 0.0.0.0:4001 \
    --mysql-addr 0.0.0.0:4002 \
    --postgres-addr 0.0.0.0:4003

# Wait for services to be ready
wait_for_service "ClickHouse" "curl -s http://localhost:8123/ping"
wait_for_service "GreptimeDB" "curl -s http://localhost:4000/health"

echo ""
echo "🎉 SETUP COMPLETE!"
echo "=================="
echo ""
echo "📊 Database Endpoints:"
echo "   ClickHouse HTTP:    http://localhost:8123"
echo "   ClickHouse Native:  localhost:9000"
echo "   GreptimeDB HTTP:    http://localhost:4000"
echo "   GreptimeDB Postgres: localhost:4003"
echo "   GreptimeDB MySQL:   localhost:4002"
echo ""
echo "🔧 Configuration for .env.dev:"
echo "   # ClickHouse"
echo "   CLICKHOUSE_URL=\"http://localhost:8123\""
echo "   CLICKHOUSE_USER=\"default\""
echo "   CLICKHOUSE_PASSWORD=\"\""
echo ""
echo "   # GreptimeDB (as ClickHouse alternative)"
echo "   CLICKHOUSE_URL=\"http://localhost:4000\""
echo ""
echo "🚦 Quick Health Checks:"
echo "   ClickHouse: curl http://localhost:8123/ping"
echo "   GreptimeDB: curl http://localhost:4000/health"
echo ""
echo "📈 Run Performance Comparison:"
echo "   cd performance_tests && node clickhouse_vs_greptimedb_comparison.js"
echo ""
echo "🛑 To stop all services:"
echo "   docker stop clickhouse-test greptime"
echo ""