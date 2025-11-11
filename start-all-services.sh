#!/bin/bash

set -e

PROJECT_ROOT="/Users/liushuo/code/ts-next-template"

echo "=============================================="
echo "Starting Integration Test Services"
echo "=============================================="

# Function to kill all background processes on exit
cleanup() {
  echo ""
  echo "Stopping all services..."
  jobs -p | xargs kill 2>/dev/null || true
  wait
}
trap cleanup EXIT

# Start OAuth Service Rust (Port 3001)
echo ""
echo "[1/3] Starting OAuth Service Rust (Port 3001)..."
cd "$PROJECT_ROOT/apps/oauth-service-rust"
./target/release/oauth-service-rust > "$PROJECT_ROOT/oauth-service.log" 2>&1 &
OAUTH_PID=$!
echo "      PID: $OAUTH_PID"
sleep 2

# Start Admin Portal (Port 3002)
echo ""
echo "[2/3] Starting Admin Portal (Port 3002)..."
cd "$PROJECT_ROOT/apps/admin-portal"
pnpm start > "$PROJECT_ROOT/admin-portal.log" 2>&1 &
ADMIN_PID=$!
echo "      PID: $ADMIN_PID"
sleep 3

# Start Pingora Proxy (Port 6188)
echo ""
echo "[3/3] Starting Pingora Proxy (Port 6188)..."
cd "$PROJECT_ROOT/apps/pingora-proxy"
cargo run > "$PROJECT_ROOT/pingora-proxy.log" 2>&1 &
PINGORA_PID=$!
echo "      PID: $PINGORA_PID"
sleep 2

echo ""
echo "=============================================="
echo "All services started!"
echo "=============================================="
echo ""
echo "Service Ports:"
echo "  - OAuth Service Rust: http://localhost:3001"
echo "  - Admin Portal: http://localhost:3002"
echo "  - Pingora Proxy: http://localhost:6188 (main entry)"
echo ""
echo "Log files:"
echo "  - oauth-service.log"
echo "  - admin-portal.log"
echo "  - pingora-proxy.log"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for all background processes
wait
