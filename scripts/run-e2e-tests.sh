#\!/bin/bash

# E2E集成测试执行脚本
set -e

echo "🚀 开始执行E2E集成测试..."
echo "=================================="

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 运行测试
run_tests() {
    echo -e "${GREEN}🧪 开始执行E2E测试...${NC}"
    
    cd apps/admin-portal
    
    # 运行测试
    echo -e "${GREEN}📋 运行完整E2E测试套件...${NC}"
    pnpm test:e2e || {
        echo -e "${RED}❌ E2E测试失败${NC}"
        return 1
    }
    
    cd ../..
    
    echo -e "${GREEN}✅ E2E测试执行完成${NC}"
}

# 主执行流程
main() {
    echo -e "${GREEN}🎯 E2E集成测试开始${NC}"
    
    run_tests
    
    echo -e "${GREEN}🎉 所有测试完成！${NC}"
}

main
EOF < /dev/null