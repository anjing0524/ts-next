#!/bin/bash

set -e

PROJECT_ROOT="/Users/liushuo/code/ts-next-template"
TIMEOUT=120  # 等待服务启动的超时时间（秒）

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 清理函数
cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping all services...${NC}"

  # 获取后台进程并杀死它们
  local pids=$(jobs -p)
  if [ ! -z "$pids" ]; then
    kill $pids 2>/dev/null || true
  fi

  # 额外杀死特定的进程
  pkill -f "oauth-service-rust" || true
  pkill -f "pnpm start" || true
  pkill -f "pingora-proxy" || true

  wait 2>/dev/null || true

  echo -e "${GREEN}Services stopped.${NC}"
}

trap cleanup EXIT

# 检查端口是否在线
is_port_open() {
  local host=$1
  local port=$2
  nc -z "$host" "$port" 2>/dev/null
  return $?
}

# 等待端口开放
wait_for_port() {
  local host=$1
  local port=$2
  local service=$3
  local elapsed=0

  echo -ne "${BLUE}Waiting for $service on $host:$port...${NC}"
  while ! is_port_open "$host" "$port"; do
    if [ $elapsed -ge $TIMEOUT ]; then
      echo -e " ${RED}TIMEOUT${NC}"
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
    echo -ne "."
  done
  echo -e " ${GREEN}OK${NC}"
  return 0
}

echo -e "${BLUE}=============================================="
echo "Integration Test Suite"
echo "==============================================${NC}"

cd "$PROJECT_ROOT"

# 清理日志文件
rm -f oauth-service.log admin-portal.log pingora-proxy.log

echo ""
echo -e "${BLUE}[1/4] Starting OAuth Service Rust (Port 3001)...${NC}"
cd "$PROJECT_ROOT/apps/oauth-service-rust"
./target/release/oauth-service-rust > "$PROJECT_ROOT/oauth-service.log" 2>&1 &
OAUTH_PID=$!
echo "      PID: $OAUTH_PID"

echo -e "${BLUE}[2/4] Starting Admin Portal (Port 3002)...${NC}"
cd "$PROJECT_ROOT/apps/admin-portal"
pnpm start > "$PROJECT_ROOT/admin-portal.log" 2>&1 &
ADMIN_PID=$!
echo "      PID: $ADMIN_PID"

echo -e "${BLUE}[3/4] Starting Pingora Proxy (Port 6188)...${NC}"
cd "$PROJECT_ROOT/apps/pingora-proxy"
cargo run 2>&1 | tee "$PROJECT_ROOT/pingora-proxy.log" &
PINGORA_PID=$!
echo "      PID: $PINGORA_PID"

echo ""
echo -e "${BLUE}[4/4] Waiting for services to be ready...${NC}"

# 等待所有服务就绪
wait_for_port "127.0.0.1" "3001" "OAuth Service" || {
  echo -e "${RED}OAuth Service failed to start${NC}"
  echo "OAuth Service log:"
  tail -50 "$PROJECT_ROOT/oauth-service.log"
  exit 1
}

wait_for_port "127.0.0.1" "3002" "Admin Portal" || {
  echo -e "${RED}Admin Portal failed to start${NC}"
  echo "Admin Portal log:"
  tail -50 "$PROJECT_ROOT/admin-portal.log"
  exit 1
}

wait_for_port "127.0.0.1" "6188" "Pingora Proxy" || {
  echo -e "${RED}Pingora Proxy failed to start${NC}"
  echo "Pingora Proxy log:"
  tail -50 "$PROJECT_ROOT/pingora-proxy.log"
  exit 1
}

echo ""
echo -e "${GREEN}=============================================="
echo "All services started successfully!"
echo "==============================================${NC}"
echo ""
echo "Service Endpoints:"
echo "  - OAuth Service Rust: http://localhost:3001"
echo "  - Admin Portal: http://localhost:3002"
echo "  - Pingora Proxy (Main): http://localhost:6188"
echo ""
echo "Running E2E Tests..."
echo ""

# 运行 E2E 测试
cd "$PROJECT_ROOT/apps/admin-portal"

# 设置测试环境变量
export PLAYWRIGHT_TEST_BASE_URL="http://localhost:6188"
export TEST_ADMIN_USERNAME="admin"
export TEST_ADMIN_PASSWORD="admin123"

# 运行测试
if pnpm test:e2e 2>&1; then
  echo ""
  echo -e "${GREEN}=============================================="
  echo "✓ E2E Tests PASSED"
  echo "==============================================${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}=============================================="
  echo "✗ E2E Tests FAILED"
  echo "==============================================${NC}"
  echo ""
  echo "Checking service logs for errors..."
  echo ""
  echo "OAuth Service Log:"
  tail -30 "$PROJECT_ROOT/oauth-service.log"
  echo ""
  echo "Admin Portal Log:"
  tail -30 "$PROJECT_ROOT/admin-portal.log"
  echo ""
  echo "Pingora Proxy Log:"
  tail -30 "$PROJECT_ROOT/pingora-proxy.log"
  exit 1
fi
