# ⚠️ 立即行动清单 - Cookie Domain 配置

**优先级**: 🔴 **P0 - 本周完成**
**风险**: 生产环境可能失败
**工作量**: 1 小时
**影响**: 系统稳定性

---

## 问题陈述

当前系统的 Cookie domain 依赖**浏览器推断**，没有显式配置。这在以下情况会失败：

1. ❌ 生产环境改变 Pingora 的 Host 头转发方式
2. ❌ 子域部署 (api.example.com vs example.com)
3. ❌ 内部网络地址变更 (oauth-service.internal)
4. ❌ 多个浏览器行为不一致 (Chrome vs Firefox vs Safari)

**结果**: 用户无法登录，没有任何错误消息。系统静默失败。

---

## 修复步骤

### Step 1: 修改 OAuth Service 代码

**文件**: `apps/oauth-service-rust/src/routes/oauth.rs:185-191`

**当前代码**:
```rust
let session_cookie = Cookie::build(("session_token", token_pair.access_token))
    .path("/")
    // ⚠️ 缺少 .domain()
    .http_only(true)
    .secure(is_production)
    .same_site(SameSite::Lax)
    .max_age(time::Duration::hours(1));
```

**改为**:
```rust
// 从环境变量读取 Cookie domain
let cookie_domain = std::env::var("COOKIE_DOMAIN")
    .unwrap_or_else(|_| {
        // 默认值：根据部署环境推断
        if is_production {
            ".example.com".to_string()  // 改成你的生产域名
        } else {
            ".localhost".to_string()
        }
    });

let session_cookie = Cookie::build(("session_token", token_pair.access_token))
    .domain(cookie_domain)  // ← 添加这行
    .path("/")
    .http_only(true)
    .secure(is_production)
    .same_site(SameSite::Strict)  // ← 改 Lax → Strict (更安全)
    .max_age(time::Duration::hours(1));
```

### Step 2: 添加环境变量

**文件**: `.env` (本地开发)

```bash
# Cookie 配置
COOKIE_DOMAIN=.localhost
```

**文件**: `docker-compose.yml` (开发容器)

```yaml
services:
  oauth-service-rust:
    environment:
      - COOKIE_DOMAIN=.localhost
```

**文件**: 生产环境变量 (例如 AWS Secrets Manager、Kubernetes ConfigMap)

```bash
# 生产环境
COOKIE_DOMAIN=.yourdomain.com

# 如果是子域
COOKIE_DOMAIN=.api.yourdomain.com
```

### Step 3: 验证修改

运行以下命令验证 Cookie 行为：

```bash
# 1. 启动所有服务
docker-compose up

# 2. 登录并检查 Cookie
curl -v http://localhost:6188/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","redirect":""}'

# 3. 查看响应头中的 Set-Cookie
# 应该看到:
# Set-Cookie: session_token=xxx; Domain=.localhost; Path=/; HttpOnly; Secure; SameSite=Strict

# 4. 使用浏览器测试登录流
# 打开 http://localhost:6188/login
# 输入凭证并提交
# 检查浏览器的 DevTools → Application → Cookies
# 应该看到 session_token with Domain: .localhost
```

### Step 4: 测试不同配置

```bash
# 测试场景 1: 子域
COOKIE_DOMAIN=.api.localhost ./run_tests.sh
# 验证 Cookie 仍然工作

# 测试场景 2: 生产域名
COOKIE_DOMAIN=.example.com ./run_tests.sh
# 在本地验证逻辑是否正确

# 测试场景 3: 无效配置 (应该使用默认值)
unset COOKIE_DOMAIN
./run_tests.sh
# 应该回退到 .localhost
```

---

## 验证清单

- [ ] 代码改动完成
- [ ] 编译成功（`cargo build`）
- [ ] 单元测试通过
- [ ] 本地集成测试通过 (登录流程)
- [ ] 浏览器 DevTools 中 Cookie domain 正确
- [ ] 在不同浏览器中验证 (Chrome, Firefox, Safari)
- [ ] 生产环境配置已准备
- [ ] 团队评审完成

---

## 关键要点

| 要点 | 解释 |
|------|------|
| **为什么要 .localhost？** | `.` 前缀允许 Cookie 在所有 localhost 子域中共享 |
| **为什么要 .yourdomain.com？** | 使 Cookie 在 yourdomain.com 的所有子域中有效 |
| **为什么改 SameSite=Lax 为 Strict？** | Lax 在跨站导航时发送 Cookie，Strict 更安全 |
| **如何验证生产环境？** | 在生产环境部署前，在本地用 COOKIE_DOMAIN=.yourdomain.com 测试 |

---

## 常见问题

**Q: 如果设置错了 COOKIE_DOMAIN 会怎样？**

A: Cookie 会被设置，但浏览器在不匹配的域名下不会发送。用户看到 401 Unauthorized。

```
例如:
COOKIE_DOMAIN=.example.com (但实际访问 localhost:6188)
→ Cookie 不会发送
→ OAuth Service 看不到 session_token
→ 返回 401
```

**Q: localhost:6188 和 localhost:3001 的区别是什么？**

A:
- localhost:6188 是 **Pingora 代理地址** (浏览器看到的)
- localhost:3001 是 **OAuth Service 内部地址** (浏览器不知道)

Cookie 应该配置为匹配浏览器看到的地址 (.localhost)。

**Q: 生产环境用什么值？**

A: 使用你的实际域名前缀：
```
example.com → .example.com
api.example.com → .api.example.com
api.example.com 和 example.com 都访问 → .example.com (包含两者)
```

**Q: 能在运行时改变吗？**

A: 不能。COOKIE_DOMAIN 应该在启动时通过环境变量设置。改变它需要重启 OAuth Service。

---

## 下一步

完成这个修改后：

1. ✅ **短期** (本周): Cookie domain 安全配置完成
2. 📅 **中期** (2-4周): 评估是否需要恢复 HTTP 代理层
3. 📅 **长期** (1-3月): 考虑将登录/同意 UI 迁移到 OAuth Service

---

**完成期限**: 2025-11-30
**标记**: #critical #cookie-domain #production-readiness

