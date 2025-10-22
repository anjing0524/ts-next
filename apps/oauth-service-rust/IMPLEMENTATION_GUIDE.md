# OAuth 2.1 Service - TDD改进实施指南

## 📊 当前状态总结

### 测试覆盖统计
```
✅ 总测试数: 134个 (58 unit + 76 integration)
✅ 测试通过率: 100%
⚠️ 代码覆盖率: 估计 60-70% (需提升到 85%+)
⚠️ 安全合规性: 70/100 (目标 90+)
```

### 功能覆盖评分
```
RBAC权限系统    ████████░ 85%  ✅ 最完整的模块
用户管理        ███████░░ 75%  ⚠️ 缺密码重置流程
客户端管理      ███████░░ 75%  ⚠️ 缺验证逻辑
OAuth流程       ███████░░ 70%  ⚠️ 缺端点验证
令牌系统        ██████░░░ 60%  ❌ 缺Token撤销
安全测试        ██████░░░ 60%  ❌ 缺关键安全检查
```

---

## 🎯 Phase 1: 紧急修复 (Week 1)

### 1.1 编译警告修复
**文件**: `src/state.rs`, `src/services/token_service.rs`

```bash
# 检查所有警告
cargo clippy --all-targets

# 修复项：
1. 移除未使用变量 (_encoding_key, _decoding_key, etc)
2. 移除硬编码的JWT密钥
3. 改进错误处理
```

**预期时间**: 1小时

### 1.2 OAuth 2.1 合规性测试框架
**文件**: `tests/oauth_2_1_compliance_tests.rs` ✅ **已创建**

该文件包含9个测试骨架，用于验证：
- ✅ PKCE code_verifier 验证
- ✅ 授权码单次使用防护
- ✅ Redirect URI 白名单验证
- ✅ 作用域权限强制
- ✅ PUBLIC 客户端强制PKCE
- ✅ 错误响应格式合规
- ✅ Token撤销端点
- ✅ 完整性检查清单

**现状**: 骨架已完成，需要实现底层验证逻辑

**预期时间**: 3-4小时

---

## 🔨 Phase 2: 功能实现 (Week 2)

### 2.1 Redirect URI 验证

**实现位置**: `src/routes/oauth.rs` 的 `authorize_endpoint`

```rust
/// 验证 redirect_uri 是否在客户端白名单中
fn validate_redirect_uri(
    uri: &str,
    allowed_uris: &[String],
    require_https: bool,
) -> Result<(), OAuthError> {
    // 1. 精确匹配检查（包括查询参数）
    // 2. 可选的HTTPS强制
    // 3. 可选的localhost允许
    // 4. 返回详细的错误消息
}

// 测试用例：
#[test]
fn test_redirect_uri_must_match_exactly() { ... }

#[test]
fn test_redirect_uri_https_requirement() { ... }

#[test]
fn test_redirect_uri_with_query_params_fails() { ... }
```

**涉及的文件**:
- `src/models/client.rs` - 添加URI验证方法
- `src/routes/oauth.rs` - 在authorize端点中调用验证
- `tests/oauth_2_1_compliance_tests.rs` - 添加完整的测试

**预期时间**: 2-3小时

### 2.2 授权码验证逻辑

**实现位置**: `src/routes/oauth.rs` 的 `token_endpoint`

```rust
/// Token交换端点中的授权码验证
async fn exchange_authorization_code(
    client_id: &str,
    code: &str,
    code_verifier: &str,  // 新增：PKCE验证
    redirect_uri: &str,
) -> Result<TokenPair, OAuthError> {
    // 1. 验证授权码存在且未过期
    // 2. 验证授权码与client_id匹配
    // 3. 验证redirect_uri与原始请求一致
    // 4. 验证code_verifier与code_challenge匹配
    // 5. 标记授权码为已使用（防重用）
    // 6. 发行令牌
}

// 关键：授权码表需要tracking
// 在 migrations/ 中需要：
// - used_at: 标记何时被使用
// - invalidated_at: 标记何时失效
```

**涉及的文件**:
- `src/routes/oauth.rs` - token_endpoint实现
- `src/services/auth_code_service.rs` - 改进验证逻辑
- `migrations/*.sql` - 添加授权码跟踪字段
- `tests/oauth_2_1_compliance_tests.rs` - 实现完整的验证测试

**预期时间**: 4-5小时

### 2.3 作用域强制

**实现位置**: `src/routes/oauth.rs` 和 `src/services/client_service.rs`

```rust
/// 验证请求的作用域是否在允许列表内
fn validate_scopes(
    requested_scopes: &str,
    allowed_scopes: &[String],
) -> Result<Vec<String>, OAuthError> {
    // 1. 解析requested_scopes （空格分隔）
    // 2. 验证每个scope在allowed_scopes中
    // 3. 返回有效的scopes或错误
}

// 注意：某些情况下应该缩减scope而非拒绝
// OAuth 2.0 Section 3.3: server may issue subset of requested scopes
```

**预期时间**: 2小时

---

## 🔐 Phase 3: 安全加固 (Week 3)

### 3.1 Token撤销端点

**规范**: RFC 7009

```rust
// 新增路由：POST /api/v2/oauth/revoke
pub async fn revoke_endpoint(
    State(state): State<Arc<AppState>>,
    Form(request): Form<RevokeRequest>,
) -> Result<StatusCode, AppError> {
    // 1. 验证客户端身份
    // 2. 获取令牌（access或refresh）
    // 3. 将令牌加入黑名单
    // 4. 返回200 (即使令牌无效也返回200)
}

// 需要实现令牌黑名单：
// - 内存缓存 (快速检查)
// - 数据库持久化 (持久性)
// - TTL管理 (自动清理过期记录)
```

**涉及的文件**:
- `src/routes/oauth.rs` - 新增revoke_endpoint
- `src/services/token_service.rs` - 新增revoke方法
- `src/models/refresh_token.rs` - 添加revoked_at字段
- `src/cache/token_revocation_cache.rs` - 新文件

**预期时间**: 3-4小时

### 3.2 输入验证层

**实现位置**: `src/validators.rs` (新文件)

```rust
// 创建统一的验证模块
pub mod validators {
    /// 验证 OAuth client_id 格式
    pub fn validate_client_id(id: &str) -> Result<(), ValidationError>

    /// 验证 redirect_uri 格式
    pub fn validate_redirect_uri(uri: &str) -> Result<(), ValidationError>

    /// 验证 scope 格式
    pub fn validate_scope(scope: &str) -> Result<(), ValidationError>

    /// 验证 username 格式
    pub fn validate_username(username: &str) -> Result<(), ValidationError>

    /// 验证 email 格式
    pub fn validate_email(email: &str) -> Result<(), ValidationError>
}

// 在所有路由中使用这些验证函数
```

**预期时间**: 2-3小时

---

## ✅ Phase 4: 测试完成 (Week 4)

### 4.1 完整的集成测试

```rust
// 扩展 tests/api_integration_tests.rs

#[tokio::test]
async fn test_full_authorization_code_flow_e2e() {
    // 1. 创建客户端
    // 2. 发起授权请求 (GET /authorize)
    // 3. 用户登录和同意
    // 4. 获得授权码
    // 5. 用授权码交换令牌
    // 6. 使用令牌访问受保护资源
    // 7. 刷新令牌
    // 8. 撤销令牌
}

#[tokio::test]
async fn test_error_scenarios() {
    // 测试所有错误路径
    // invalid_client, invalid_grant, invalid_scope, 等
}

#[tokio::test]
async fn test_security_boundaries() {
    // 跨域测试
    // 并发竞态条件
    // 时序攻击防护
}
```

**预期时间**: 3-4小时

### 4.2 性能基准测试

```rust
// 使用 criterion crate
#[bench]
fn bench_permission_lookup(b: &mut Bencher) {
    b.iter(|| rbac_service.has_permission("user", "permission"))
}

#[bench]
fn bench_token_generation(b: &mut Bencher) {
    b.iter(|| token_service.issue_tokens(...))
}
```

**预期时间**: 2小时

---

## 📋 具体改进清单

### 🚀 立即行动 (今天)

- [ ] 修复所有编译警告
  ```bash
  cargo clippy --all-targets -- -D warnings
  ```

- [ ] 验证 oauth_2_1_compliance_tests.rs 编译通过
  ```bash
  cargo test --test oauth_2_1_compliance_tests
  ```

- [ ] 标记所有 TODO 位置
  ```bash
  grep -r "TODO" tests/oauth_2_1_compliance_tests.rs
  ```

### 📍 第1周任务

**Day 1-2: Redirect URI验证**
- [ ] 实现 `validate_redirect_uri` 函数
- [ ] 添加10个测试用例
- [ ] 更新 `authorize_endpoint` 使用验证

**Day 3-4: 授权码验证**
- [ ] 修改数据库迁移添加 used_at/invalidated_at
- [ ] 实现 `exchange_authorization_code` 验证
- [ ] 添加防重用检查
- [ ] 添加6个测试用例

**Day 5: 作用域验证**
- [ ] 实现 `validate_scopes` 函数
- [ ] 集成到授权和令牌端点
- [ ] 添加5个测试用例

### 📍 第2周任务

**Day 1-2: Token撤销**
- [ ] 创建 `src/services/token_revocation_service.rs`
- [ ] 实现 `/oauth/revoke` 端点
- [ ] 添加令牌黑名单缓存
- [ ] 添加4个测试用例

**Day 3-4: 输入验证**
- [ ] 创建 `src/validators.rs` 模块
- [ ] 为所有输入字段添加验证
- [ ] 集成到所有路由

**Day 5: 集成测试**
- [ ] 编写完整的端到端测试
- [ ] 测试所有错误场景
- [ ] 性能基准测试

---

## 🛠️ 技术细节

### 数据库迁移

需要创建新的迁移文件来支持以下功能：

```sql
-- 添加到 oauth_authorization_codes 表
ALTER TABLE oauth_authorization_codes ADD COLUMN used_at DATETIME;
ALTER TABLE oauth_authorization_codes ADD COLUMN invalidated_at DATETIME;

-- 创建令牌黑名单表
CREATE TABLE token_revocations (
    id TEXT PRIMARY KEY,
    token_jti TEXT UNIQUE NOT NULL,  -- JWT ID
    client_id TEXT NOT NULL,
    revoked_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,  -- 何时可以删除此记录
    FOREIGN KEY (client_id) REFERENCES oauth_clients(id)
);
```

### 缓存策略

对于高性能，需要实现两层缓存：

```rust
// 层1: 内存缓存 (快)
let revoked_tokens: Arc<RwLock<HashSet<String>>>;

// 层2: 数据库 (持久)
// token_revocations 表

// 更新策略:
// 1. 撤销时立即更新缓存和数据库
// 2. 定期同步缓存与数据库 (防止不一致)
// 3. 旧记录自动清理 (TTL)
```

### 错误处理改进

```rust
// 标准 OAuth 错误响应格式
#[derive(Serialize)]
struct OAuthErrorResponse {
    error: String,  // invalid_request, invalid_client, etc
    error_description: Option<String>,
    error_uri: Option<String>,
    state: Option<String>,  // 如果原始请求包含
}

// 不要暴露内部错误：
// ❌ "Database connection failed"
// ✅ "server_error"
```

---

## 📊 成功指标

### 测试指标
```
当前: 134 tests, 100% pass rate, ~70% coverage
目标: 150+ tests, 100% pass rate, 85%+ coverage
```

### 覆盖率指标
```
Unit Tests:      58 → 80+
Integration:     76 → 100+
Compliance:      0 → 30+
Security:        10 → 25+
```

### 代码质量
```
Clippy warnings: 6 → 0
Unsafe code:     0 (保持)
Documentation:   50% → 80%
```

---

## 📚 参考资源

- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [RFC 7636 - PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 7009 - Token Revocation](https://tools.ietf.org/html/rfc7009)
- [RFC 6234 - US Secure Hash](https://tools.ietf.org/html/rfc6234)

---

## 🚦 执行检查清单

### 实施前
- [ ] 读过 TDD_EVALUATION_REPORT.md
- [ ] 理解 oauth_2_1_compliance_tests.rs 中的所有TODO
- [ ] 建立特性分支: `git checkout -b feature/oauth-2-1-compliance`

### 实施中
- [ ] 每个功能都有对应的测试
- [ ] 所有测试通过: `cargo test`
- [ ] 无clippy警告: `cargo clippy`
- [ ] 代码格式检查: `cargo fmt --check`
- [ ] 提交小的逻辑单元

### 实施后
- [ ] 测试覆盖率达到目标
- [ ] 文档已更新
- [ ] PR包含功能描述
- [ ] PR包含测试证据 (通过的测试)

---

## ❓ FAQ

**Q: 为什么要在week 1完成redirect_uri验证?**
A: 这是最常见的OAuth安全漏洞，应该首先修复。

**Q: Token撤销很复杂吗?**
A: 基础实现很简单(标记为已使用)，但要做好缓存和性能需要一些工作。

**Q: 为什么需要数据库迁移?**
A: 原始架构没有跟踪授权码的使用状态，无法实现防重用。

**Q: 修改后会影响现有API吗?**
A: 不会。所有改进都是添加验证，现有的合法请求仍然有效。

---

## 📞 支持

如有问题，请参考：
1. TDD_EVALUATION_REPORT.md - 详细的评估
2. 各个TODO注释 - 具体的实现细节
3. 测试文件 - 示例用法

祝编码愉快！🚀
