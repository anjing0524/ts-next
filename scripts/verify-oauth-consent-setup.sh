#!/bin/bash

# OAuth 同意流程验证脚本
# 用途: 验证 P0 关键修复的数据库和代码配置
# 执行: bash scripts/verify-oauth-consent-setup.sh

set -e

DB_PATH="apps/oauth-service-rust/oauth.db"
RESULT_FILE="OAUTH_CONSENT_VERIFICATION_RESULTS.txt"

echo "=========================================="
echo "OAuth Consent Setup 验证报告"
echo "=========================================="
echo "生成时间: $(date)"
echo ""

{
  echo "=========================================="
  echo "1. 权限配置验证"
  echo "=========================================="
  echo ""

  # 检查 oauth:consent 权限是否存在
  echo "✓ 检查 oauth:consent 权限..."
  OAUTH_PERM=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM permissions WHERE name = 'oauth:consent';")

  if [ "$OAUTH_PERM" -eq 1 ]; then
    echo "   ✅ oauth:consent 权限已创建"
    PERM_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM permissions WHERE name = 'oauth:consent';")
    echo "   权限 ID: $PERM_ID"
  else
    echo "   ❌ oauth:consent 权限未找到"
    exit 1
  fi
  echo ""

  # 检查角色权限关联
  echo "✓ 检查角色权限关联..."
  SUPER_ADMIN=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*) FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    WHERE r.name = 'super_admin' AND rp.permission_id = (SELECT id FROM permissions WHERE name = 'oauth:consent');
  ")

  ADMIN=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*) FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    WHERE r.name = 'admin' AND rp.permission_id = (SELECT id FROM permissions WHERE name = 'oauth:consent');
  ")

  USER=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*) FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    WHERE r.name = 'user' AND rp.permission_id = (SELECT id FROM permissions WHERE name = 'oauth:consent');
  ")

  echo "   super_admin 角色: $([ "$SUPER_ADMIN" -eq 1 ] && echo '✅ 有权限' || echo '❌ 无权限')"
  echo "   admin 角色: $([ "$ADMIN" -eq 1 ] && echo '✅ 有权限' || echo '❌ 无权限')"
  echo "   user 角色: $([ "$USER" -eq 1 ] && echo '✅ 有权限' || echo '❌ 无权限')"
  echo ""

  # 检查用户权限
  echo "✓ 检查演示用户权限..."
  ADMIN_USER_PERM=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*) FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    JOIN role_permissions rp ON r.id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE u.username = 'admin' AND p.name = 'oauth:consent';
  ")

  DEMO_USER_PERM=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(*) FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    JOIN role_permissions rp ON r.id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE u.username = 'demo' AND p.name = 'oauth:consent';
  ")

  echo "   admin 用户: $([ "$ADMIN_USER_PERM" -eq 1 ] && echo '✅ 有权限' || echo '❌ 无权限')"
  echo "   demo 用户: $([ "$DEMO_USER_PERM" -eq 1 ] && echo '✅ 有权限' || echo '❌ 无权限')"
  echo ""

  echo "=========================================="
  echo "2. OAuth 客户端配置验证"
  echo "=========================================="
  echo ""

  # Admin Portal 客户端检查
  echo "✓ 检查 Admin Portal 客户端..."
  ADMIN_PORTAL=$(sqlite3 "$DB_PATH" "
    SELECT require_consent FROM oauth_clients WHERE client_id = 'auth-center-admin-client';
  ")

  echo "   require_consent: $([ "$ADMIN_PORTAL" -eq 1 ] && echo '✅ true (需要同意)' || echo '❌ false')"

  # Test Client 检查
  echo "✓ 检查 Test Client..."
  TEST_CLIENT=$(sqlite3 "$DB_PATH" "
    SELECT require_consent FROM oauth_clients WHERE client_id = 'test-client';
  ")

  echo "   require_consent: $([ "$TEST_CLIENT" -eq 0 ] && echo '✅ false (跳过同意)' || echo '❌ true')"
  echo ""

  echo "=========================================="
  echo "3. 文件修改验证"
  echo "=========================================="
  echo ""

  # 检查 consent.rs 修改
  echo "✓ 检查 consent.rs 权限检查..."
  CONSENT_RS="apps/oauth-service-rust/src/routes/consent.rs"

  if grep -q "oauth:consent" "$CONSENT_RS"; then
    echo "   ✅ consent.rs 包含 oauth:consent 权限检查"
  else
    echo "   ❌ consent.rs 缺少权限检查"
  fi

  if grep -q "has_permission" "$CONSENT_RS"; then
    echo "   ✅ consent.rs 调用了 has_permission 方法"
  else
    echo "   ❌ consent.rs 未调用权限检查"
  fi

  if grep -q "rbac_service" "$CONSENT_RS"; then
    echo "   ✅ consent.rs 使用了 rbac_service"
  else
    echo "   ❌ consent.rs 未使用 rbac_service"
  fi
  echo ""

  # 检查 API index.ts 修改
  echo "✓ 检查 API 路径修复..."
  API_INDEX="apps/admin-portal/lib/api/index.ts"

  if grep -q "'/oauth/consent/submit'" "$API_INDEX"; then
    echo "   ✅ API 路径已修复（无双重前缀）"
  else
    echo "   ❌ API 路径未正确修复"
  fi

  if ! grep -q "'/api/v2/oauth/consent/submit'" "$API_INDEX"; then
    echo "   ✅ 已移除错误的路径"
  else
    echo "   ❌ 仍然包含错误的路径"
  fi
  echo ""

  echo "=========================================="
  echo "4. 数据库完整性检查"
  echo "=========================================="
  echo ""

  # 权限总数
  PERM_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM permissions;")
  echo "✓ 权限总数: $PERM_COUNT"

  # 角色总数
  ROLE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM roles;")
  echo "✓ 角色总数: $ROLE_COUNT"

  # 用户总数
  USER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;")
  echo "✓ 用户总数: $USER_COUNT"

  # OAuth 客户端总数
  CLIENT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM oauth_clients;")
  echo "✓ OAuth 客户端总数: $CLIENT_COUNT"
  echo ""

  echo "=========================================="
  echo "5. 最终结果"
  echo "=========================================="
  echo ""

  # 统计检查结果
  PASS=0
  FAIL=0

  [ "$OAUTH_PERM" -eq 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  [ "$SUPER_ADMIN" -eq 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  [ "$ADMIN" -eq 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  [ "$USER" -eq 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  [ "$ADMIN_USER_PERM" -eq 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  [ "$DEMO_USER_PERM" -eq 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  [ "$ADMIN_PORTAL" -eq 1 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  [ "$TEST_CLIENT" -eq 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

  echo "✅ 通过: $PASS 项"
  echo "❌ 失败: $FAIL 项"
  echo ""

  if [ $FAIL -eq 0 ]; then
    echo "🎉 所有检查都通过了！系统已准备好进行集成测试。"
    echo ""
    echo "后续步骤:"
    echo "1. 启动 OAuth 服务"
    echo "2. 启动 Admin Portal"
    echo "3. 运行 VERIFICATION_TESTS.md 中的测试场景"
  else
    echo "⚠️  存在 $FAIL 项检查未通过，请检查上述输出。"
  fi
  echo ""

} | tee "$RESULT_FILE"

echo ""
echo "验证结果已保存到: $RESULT_FILE"
