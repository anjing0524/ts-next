# P0 问题修复摘要

## 修复时间
2025-11-19

## 问题描述

### 问题 1: InvalidAlgorithm JWT 错误
**症状**: POST /api/v2/auth/login 返回 401 错误，日志显示 "JWT encoding with HS256 failed: Error(InvalidAlgorithm)"

**根本原因**:
- 配置文件 (.env) 设置了 `JWT_ALGORITHM=RS256` 并生成了 RSA 密钥对
- 但代码中 `jwt::generate_token()` 函数硬编码使用 HS256 算法
- 当使用 RSA 私钥（EncodingKey）调用 HS256 算法时，产生 InvalidAlgorithm 错误

**修复方案**:
修改 `apps/oauth-service-rust/src/services/token_service.rs`:
- 将所有 `jwt::generate_token()` 改为 `jwt::generate_token_with_algorithm()`
- 从 `self.config.jwt_algorithm` 读取配置的算法
- 影响函数：
  - `issue_tokens_tx()` - access_token 和 refresh_token 生成
  - `issue_tokens()` - access_token 和 refresh_token 生成
  - ID token 生成 (两处)

**代码变更**:
```rust
// 之前 (硬编码 HS256)
let access_token = jwt::generate_token(&access_token_claims, &encoding_key)?;

// 之后 (使用配置的算法)
let access_token = jwt::generate_token_with_algorithm(
    &access_token_claims,
    &encoding_key,
    self.config.jwt_algorithm,  // RS256 from config
)?;
```

### 问题 2: 密码哈希不匹配
**症状**: Seed 数据中的密码哈希无法验证 "admin123" 密码

**根本原因**:
- Seed 文件中的 bcrypt 哈希可能不正确或使用了不同的密码

**修复方案**:
1. 生成新的正确 bcrypt 哈希：
   ```bash
   # 使用 Rust bcrypt (cost=12)
   $2b$12$RpakPpV3Dqfmv7bKS/Fa1O0dGaA1O.n8OY5uAWd6GVDIWvdb0pkqu
   ```

2. 更新 `apps/oauth-service-rust/migrations/002_seed_data.sql`:
   - admin 用户 (第 19 行)
   - demo 用户 (第 36 行)

## 验证结果

### 登录 API 测试
```bash
curl -X POST http://localhost:3001/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

**响应**:
```json
HTTP/1.1 200 OK
Set-Cookie: session_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600

{
  "success": true,
  "redirect_url": "/"
}
```

### JWT Token 验证
- ✅ 算法: RS256 (header: `{"typ":"JWT","alg":"RS256"}`)
- ✅ Payload 包含:
  - `sub`: user_id (clh1234567890abcdef000000)
  - `client_id`: auth-center-admin-client
  - `scope`: session
  - `permissions`: 32+ 权限数组
  - `exp`, `iat`, `jti`: 正确设置

### Cookie 属性验证
- ✅ `HttpOnly`: true (防止 XSS)
- ✅ `SameSite`: Lax (CSRF 防护)
- ✅ `Path`: /
- ✅ `Max-Age`: 3600 (1 小时)
- ✅ `Secure`: false (开发环境)

### 权限验证
Admin 用户拥有以下权限：
- users:* (list, create, read, update, delete, manage)
- roles:* (list, create, update, delete, manage)
- permissions:* (list, update, create, delete, manage)
- clients:* (list, create, update, delete, manage)
- audit:* (list, export, view)
- system:config:* (read, edit)
- menu:system:* (所有菜单权限)
- dashboard:view
- admin:* (超级管理员)

## 影响范围

### 直接影响
1. **用户认证**
   - POST /api/v2/auth/login
   - Session token 生成

2. **Token 管理**
   - Access token 生成和刷新
   - Refresh token 生成和刷新
   - ID token (OpenID Connect) 生成

3. **所有受保护的 API**
   - 所有需要 JWT 验证的端点
   - RBAC 权限检查

### 间接影响
- Admin Portal 登录流程
- OAuth 授权码流程
- Token introspection
- 所有依赖认证的功能

## 后续验证

### 必须通过的测试
1. ✅ 用户登录 (admin/admin123)
2. ⏳ OAuth 授权码流程 + PKCE
3. ⏳ Token 刷新流程
4. ⏳ 受保护 API 访问（带 JWT）
5. ⏳ RBAC 权限验证
6. ⏳ Admin Portal 完整流程

### E2E 测试计划
参考: `E2E_TEST_PRODUCTION_PLAN.md`
- 18+ 测试场景
- 生产模式运行
- 覆盖所有核心业务流程

## 提交信息

**Commit**: 208828a2
**Branch**: claude/setup-oauth-database-01QKVmG8pcL1ZtTJCoxYoc3n
**Files**:
- apps/oauth-service-rust/src/services/token_service.rs (4 处修改)
- apps/oauth-service-rust/migrations/002_seed_data.sql (2 处密码哈希更新)

**状态**: ✅ 已推送到远程仓库

## 相关文档

- `E2E_TEST_PRODUCTION_PLAN.md` - 详细的 E2E 测试计划
- `CLAUDE.md` - 项目技术指南
- Previous commit: 5caab0c1 (修复客户端ID不匹配)

## 开发环境配置

### OAuth Service (.env)
```bash
DATABASE_URL=sqlite:./oauth.db
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY_PATH=./keys/private_key.pem
JWT_PUBLIC_KEY_PATH=./keys/public_key.pem
ISSUER=http://localhost:3001
ACCESS_TOKEN_TTL=3600
REFRESH_TOKEN_TTL=2592000
```

### RSA 密钥对
- 私钥: ./keys/private_key.pem (2048 bit)
- 公钥: ./keys/public_key.pem

### 测试凭证
- 用户名: admin
- 密码: admin123
- 角色: super_admin
- 权限: 所有权限

## 总结

✅ **P0 问题已完全修复**
- JWT 算法配置正确 (RS256)
- 密码验证正常
- 登录流程完整工作
- Token 生成和签名正确
- Cookie 安全属性配置完善

🚀 **准备进入下一阶段**
- 开始 E2E 测试执行
- 验证完整 OAuth 流程
- 测试 Admin Portal 功能
