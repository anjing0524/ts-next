#!/bin/bash

#
# E2E 测试运行脚本
# 运行所有 Admin Portal 的端到端测试
#
# 用法:
#   ./run-all-e2e-tests.sh           # 默认 headless 模式
#   ./run-all-e2e-tests.sh --ui      # UI 模式
#   ./run-all-e2e-tests.sh --headed  # Headed 模式（可见浏览器）
#   ./run-all-e2e-tests.sh --debug   # Debug 模式
#

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认值
HEADED_MODE=""
DEBUG_MODE=""
UI_MODE=""
SKIP_SERVICE_CHECK=false

# 解析命令行参数
for arg in "$@"
do
  case $arg in
    --headed)
      HEADED_MODE="--headed"
      shift
      ;;
    --debug)
      DEBUG_MODE="--debug"
      shift
      ;;
    --ui)
      UI_MODE="--ui"
      shift
      ;;
    --skip-service-check)
      SKIP_SERVICE_CHECK=true
      shift
      ;;
    *)
      # 未知参数
      ;;
  esac
done

echo "========================================="
echo "Admin Portal E2E 测试套件"
echo "========================================="
echo ""

# 检查必需的服务是否运行
if [ "$SKIP_SERVICE_CHECK" = false ]; then
  echo "检查必需的服务..."
  echo ""

  SERVICES_OK=true

  # 检查 Pingora (6188)
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:6188 | grep -q "200\|302\|401"; then
    echo -e "${GREEN}✓${NC} Pingora Proxy (6188) - 运行中"
  else
    echo -e "${RED}✗${NC} Pingora Proxy (6188) - 未运行"
    SERVICES_OK=false
  fi

  # 检查 Admin Portal (3002) 或通过 Pingora
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 | grep -q "200\|302\|401"; then
    echo -e "${GREEN}✓${NC} Admin Portal (3002) - 运行中"
  else
    echo -e "${YELLOW}⚠${NC} Admin Portal (3002) - 未直接访问（可能通过 Pingora）"
  fi

  # 检查 OAuth Service (3001) 或通过 Pingora
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v2/health | grep -q "200"; then
    echo -e "${GREEN}✓${NC} OAuth Service Rust (3001) - 运行中"
  else
    echo -e "${YELLOW}⚠${NC} OAuth Service Rust (3001) - 未直接访问（可能通过 Pingora）"
  fi

  echo ""

  if [ "$SERVICES_OK" = false ]; then
    echo -e "${RED}错误: 部分必需服务未运行${NC}"
    echo ""
    echo "请先启动所有服务:"
    echo ""
    echo "  终端 1 - 启动 OAuth Service (Rust):"
    echo "    cd apps/oauth-service-rust"
    echo "    cargo run"
    echo ""
    echo "  终端 2 - 启动 Admin Portal:"
    echo "    pnpm --filter=admin-portal dev"
    echo ""
    echo "  终端 3 - 启动 Pingora Proxy:"
    echo "    cd apps/pingora-proxy"
    echo "    cargo run"
    echo ""
    echo "或者使用 --skip-service-check 跳过此检查"
    echo ""
    exit 1
  fi
else
  echo -e "${YELLOW}⚠${NC} 跳过服务检查（--skip-service-check）"
  echo ""
fi

# 检查 Playwright 浏览器是否已安装
echo "检查 Playwright 浏览器..."
if [ ! -d "$HOME/.cache/ms-playwright/chromium-"* ]; then
  echo -e "${YELLOW}⚠${NC} Playwright 浏览器未安装"
  echo "正在安装 Chromium..."
  pnpm --filter=admin-portal playwright install chromium
  echo -e "${GREEN}✓${NC} Chromium 安装完成"
else
  echo -e "${GREEN}✓${NC} Playwright 浏览器已安装"
fi
echo ""

# 构建测试命令
TEST_CMD="playwright test"

if [ -n "$UI_MODE" ]; then
  TEST_CMD="$TEST_CMD $UI_MODE"
elif [ -n "$DEBUG_MODE" ]; then
  TEST_CMD="$TEST_CMD $DEBUG_MODE"
elif [ -n "$HEADED_MODE" ]; then
  TEST_CMD="$TEST_CMD $HEADED_MODE"
fi

# 运行测试
echo "========================================="
echo "运行 E2E 测试"
echo "========================================="
echo ""
echo "测试模式: ${HEADED_MODE:-headless}${UI_MODE}${DEBUG_MODE}"
echo "测试目录: tests/e2e/"
echo ""
echo "测试文件:"
echo "  - auth-flow.spec.ts (6 个测试)"
echo "  - user-management.spec.ts (10 个测试)"
echo "  - role-permission-management.spec.ts (12 个测试)"
echo "  - error-scenarios.spec.ts (12 个测试)"
echo ""
echo "总计: 40 个测试用例"
echo ""
echo "开始测试..."
echo "========================================="
echo ""

# 执行测试
cd "$(dirname "$0")"
eval $TEST_CMD

# 测试完成
TEST_EXIT_CODE=$?

echo ""
echo "========================================="
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✓ 所有测试通过！${NC}"
  echo ""
  echo "查看详细报告:"
  echo "  pnpm test:e2e:report"
else
  echo -e "${RED}✗ 部分测试失败${NC}"
  echo ""
  echo "查看失败详情:"
  echo "  pnpm test:e2e:report"
  echo ""
  echo "查看截图和视频:"
  echo "  ls -la test-results/"
fi
echo "========================================="
echo ""

exit $TEST_EXIT_CODE
