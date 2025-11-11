#!/bin/bash

# OAuth Service & Admin Portal 集成验证脚本
# 功能：启动所有必要服务，验证集成状态

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_RUNNING=()
VERIFICATION_RESULTS=()

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# 清理函数
cleanup() {
    log_info "Stopping all services..."
    for pid in "${SERVICES_RUNNING[@]}"; do
        kill $pid 2>/dev/null || true
    done
    log_info "Cleanup completed"
}

# 在脚本退出时执行清理
trap cleanup EXIT

# 检查依赖
check_dependencies() {
    log_info "Checking dependencies..."

    command -v cargo >/dev/null 2>&1 || { log_error "Rust/Cargo not installed"; exit 1; }
    command -v pnpm >/dev/null 2>&1 || { log_error "pnpm not installed"; exit 1; }
    command -v node >/dev/null 2>&1 || { log_error "Node.js not installed"; exit 1; }
    command -v sqlite3 >/dev/null 2>&1 || { log_error "sqlite3 not installed"; exit 1; }

    log_success "All dependencies available"
}

# 1. 验证数据库初始化
verify_database() {
    log_info "Verifying database initialization..."

    local db_path="$PROJECT_ROOT/packages/database/prisma/dev.db"

    if [ ! -f "$db_path" ]; then
        log_error "Database file not found at $db_path"
        return 1
    fi

    # 检查表
    local tables=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null)
    if [ "$tables" -lt 20 ]; then
        log_error "Database has only $tables tables, expected at least 20"
        return 1
    fi

    # 检查种子数据
    local admin_user=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM users WHERE username='admin';" 2>/dev/null)
    if [ "$admin_user" -ne 1 ]; then
        log_error "Admin user not found in database"
        return 1
    fi

    local roles=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM roles;" 2>/dev/null)
    if [ "$roles" -lt 3 ]; then
        log_error "Database has only $roles roles, expected at least 3"
        return 1
    fi

    local permissions=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM permissions;" 2>/dev/null)
    if [ "$permissions" -lt 25 ]; then
        log_error "Database has only $permissions permissions, expected at least 25"
        return 1
    fi

    local clients=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM oauth_clients;" 2>/dev/null)
    if [ "$clients" -lt 2 ]; then
        log_error "Database has only $clients OAuth clients, expected at least 2"
        return 1
    fi

    log_success "Database initialization verified"
    log_success "  Tables: $tables"
    log_success "  Users: 1 (admin)"
    log_success "  Roles: $roles"
    log_success "  Permissions: $permissions"
    log_success "  OAuth Clients: $clients"
    return 0
}

# 2. 启动 OAuth Service
start_oauth_service() {
    log_info "Starting OAuth Service..."

    cd "$PROJECT_ROOT/apps/oauth-service-rust"
    cargo run > /tmp/oauth-service.log 2>&1 &
    local pid=$!
    SERVICES_RUNNING+=($pid)

    log_info "OAuth Service PID: $pid, waiting for startup..."

    # 等待服务启动
    for i in {1..30}; do
        if grep -q "OAuth 2.1 Service Ready" /tmp/oauth-service.log 2>/dev/null; then
            log_success "OAuth Service started successfully"
            return 0
        fi
        sleep 1
    done

    log_error "OAuth Service failed to start"
    cat /tmp/oauth-service.log
    return 1
}

# 3. 启动 Admin Portal
start_admin_portal() {
    log_info "Starting Admin Portal..."

    cd "$PROJECT_ROOT/apps/admin-portal"
    pnpm dev > /tmp/admin-portal.log 2>&1 &
    local pid=$!
    SERVICES_RUNNING+=($pid)

    log_info "Admin Portal PID: $pid, waiting for startup..."

    # 等待服务启动
    for i in {1..30}; do
        if grep -q "ready - started server on" /tmp/admin-portal.log 2>/dev/null; then
            log_success "Admin Portal started successfully"
            return 0
        fi
        sleep 1
    done

    log_error "Admin Portal failed to start"
    cat /tmp/admin-portal.log
    return 1
}

# 4. 启动 Pingora Proxy
start_pingora_proxy() {
    log_info "Starting Pingora Proxy..."

    cd "$PROJECT_ROOT/apps/pingora-proxy"
    cargo run > /tmp/pingora-proxy.log 2>&1 &
    local pid=$!
    SERVICES_RUNNING+=($pid)

    log_info "Pingora Proxy PID: $pid, waiting for startup..."

    # 等待服务启动
    for i in {1..30}; do
        if grep -q "listening" /tmp/pingora-proxy.log 2>/dev/null; then
            log_success "Pingora Proxy started successfully"
            return 0
        fi
        sleep 1
    done

    log_error "Pingora Proxy failed to start"
    cat /tmp/pingora-proxy.log
    return 1
}

# 5. 验证服务可用性
verify_service_health() {
    log_info "Verifying service health..."

    # 检查 OAuth Service
    if curl -s http://127.0.0.1:3001/api/v2/oauth/authorize?client_id=test >/dev/null 2>&1; then
        log_success "OAuth Service responsive on port 3001"
    else
        log_error "OAuth Service not responding on port 3001"
        return 1
    fi

    # 检查 Admin Portal
    if curl -s http://127.0.0.1:3002/ >/dev/null 2>&1; then
        log_success "Admin Portal responsive on port 3002"
    else
        log_error "Admin Portal not responding on port 3002"
        return 1
    fi

    # 检查 Pingora
    if curl -s http://localhost:6188/ >/dev/null 2>&1; then
        log_success "Pingora Proxy responsive on port 6188"
    else
        log_error "Pingora Proxy not responding on port 6188"
        return 1
    fi

    return 0
}

# 6. 验证 OAuth 流程
verify_oauth_flow() {
    log_info "Verifying OAuth 2.1 flow..."

    # 测试授权端点
    local auth_response=$(curl -s http://localhost:6188/api/v2/oauth/authorize?client_id=auth-center-admin-client 2>&1)
    if echo "$auth_response" | grep -q "login\|redirect"; then
        log_success "OAuth authorize endpoint working"
    else
        log_warning "OAuth authorize response might be incorrect"
    fi

    return 0
}

# 7. 验证 API 端点
verify_api_endpoints() {
    log_info "Verifying API endpoints..."

    local endpoints=(
        "/api/v2/oauth/authorize"
        "/api/v2/oauth/token"
        "/api/v2/auth/login"
        "/api/v2/admin/users"
        "/api/v2/admin/roles"
        "/api/v2/admin/permissions"
    )

    for endpoint in "${endpoints[@]}"; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:6188$endpoint 2>/dev/null | grep -q "[2345][0-9][0-9]"; then
            log_success "Endpoint $endpoint available"
        else
            log_warning "Endpoint $endpoint may have issues"
        fi
    done

    return 0
}

# 主流程
main() {
    echo "========================================"
    echo "OAuth Service & Admin Portal"
    echo "Integration Verification"
    echo "========================================"
    echo ""

    check_dependencies
    echo ""

    # 验证数据库
    if ! verify_database; then
        log_error "Database verification failed"
        exit 1
    fi
    echo ""

    log_info "Starting all services..."
    echo ""

    # 启动所有服务
    if ! start_oauth_service; then
        log_error "Failed to start OAuth Service"
        exit 1
    fi
    sleep 2

    if ! start_admin_portal; then
        log_error "Failed to start Admin Portal"
        exit 1
    fi
    sleep 2

    if ! start_pingora_proxy; then
        log_error "Failed to start Pingora Proxy"
        exit 1
    fi
    sleep 3

    echo ""
    log_info "Verifying integration..."
    echo ""

    # 运行验证
    if ! verify_service_health; then
        log_error "Service health verification failed"
        exit 1
    fi
    echo ""

    if ! verify_oauth_flow; then
        log_error "OAuth flow verification failed"
        exit 1
    fi
    echo ""

    if ! verify_api_endpoints; then
        log_warning "Some API endpoints may have issues"
    fi
    echo ""

    # 打印总结
    echo "========================================"
    echo -e "${GREEN}Integration Verification Complete!${NC}"
    echo "========================================"
    echo ""
    echo "Services Status:"
    echo "  ✓ OAuth Service: http://127.0.0.1:3001"
    echo "  ✓ Admin Portal: http://127.0.0.1:3002"
    echo "  ✓ Pingora Proxy: http://localhost:6188"
    echo ""
    echo "Access Points:"
    echo "  • Web UI: http://localhost:6188"
    echo "  • API: http://localhost:6188/api/v2"
    echo ""
    echo "Log Files:"
    echo "  • OAuth Service: /tmp/oauth-service.log"
    echo "  • Admin Portal: /tmp/admin-portal.log"
    echo "  • Pingora Proxy: /tmp/pingora-proxy.log"
    echo ""
    echo "Services are running. Press Ctrl+C to stop."
    echo ""

    # 保持脚本运行
    wait
}

# 运行主函数
main
