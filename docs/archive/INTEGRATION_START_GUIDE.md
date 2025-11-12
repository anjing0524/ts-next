# Admin Portal & OAuth Service Rust 集成启动指南

**日期**: 2025-11-03
**目标**: 完整启动和验证 OAuth 2.1 集成

## 📋 前置检查清单

### 环境验证
- ✅ Node.js 18+ (当前: v22.16.0)
- ✅ Rust/Cargo (当前: 1.88.0)
- ✅ pnpm (当前: 10.6.2)
- ✅ SQLite (内置)

### 项目结构验证
```bash
# 检查所有必要的服务目录
ls -d apps/{oauth-service-rust,admin-portal,pingora-proxy,kline-service}
```

---

## 🚀 Step 1: 初始化数据库 (首次启动)

**约需时间**: 2-3 分钟

```bash
cd /Users/liushuo/code/ts-next-template

# 生成 Prisma 客户端
pnpm db:generate

# 应用 Schema 到数据库
pnpm db:push

# 加载测试数据
pnpm db:seed

echo "✅ 数据库初始化完成"

# 验证
ls -lh packages/database/prisma/dev.db
```

**预期输出**:
```
✅ Database reset.
✅ Existing schema cleared.
✅ Data model(s) created.
✅ Generated Prisma Client

Database has been successfully created at packages/database/prisma/dev.db
```

---

## 🚀 Step 2: 启动所有服务 (需要 3 个终端)

### 终端 1: OAuth Service (Rust)

```bash
cd apps/oauth-service-rust

# 首次构建需要时间 (2-5 分钟)
cargo run

# 预期日志
# Starting OAuth Service...
# ✅ Server running on 0.0.0.0:3001
```

**验证服务健康**:
```bash
# 在另一个终端
curl http://localhost:3001/health
# 预期: {"status":"ok"}
```

### 终端 2: Admin Portal (Next.js)

```bash
cd apps/admin-portal

# 首次启动需要时间 (1-2 分钟)
pnpm dev

# 预期日志
# ▲ Next.js 16.0.0
# Local:        http://localhost:3002
# Environments: .env.local
#
# ✓ Ready in 1.5s
```

**验证服务健康**:
```bash
# 在另一个终端
curl http://localhost:3002/health
# 预期: JSON 响应
```

### 终端 3: Pingora Proxy (Rust)

```bash
cd apps/pingora-proxy

# 首次构建 (1-2 分钟)
cargo run

# 预期日志
# Starting Pingora proxy...
# ✅ Listening on 0.0.0.0:6188
```

**验证代理健康**:
```bash
# 在另一个终端
curl http://localhost:6188/health
# 预期: 成功响应或重定向
```

---

## ✅ Step 3: 完整的 OAuth 流程验证

### 验证点 1: 无认证访问受保护路由

```bash
# 应该被重定向到登录页面
curl -v http://localhost:6188/admin

# 预期状态码: 307 (临时重定向)
# 预期头部: Location: http://localhost:6188/api/v2/oauth/authorize?...
```

### 验证点 2: 登录流程 (使用浏览器)

1. **打开浏览器访问**: http://localhost:6188/admin
2. **观察**:
   - ✅ 被重定向到登录页面
   - ✅ 看到演示账户提示: `admin / admin123`
   - ✅ URL 中有 `redirect` 参数指向 OAuth authorize 端点

3. **输入凭证**:
   - 用户名: `admin`
   - 密码: `admin123`
   - 点击 "登录" 按钮

4. **观察流程**:
   - ✅ 提交请求到 OAuth Service
   - ✅ OAuth Service 验证凭证
   - ✅ 设置 session_token cookie
   - ✅ 重定向回授权页面
   - ✅ 重定向到回调页面
   - ✅ 交换 code 为 token
   - ✅ 重定向到管理后台 (/admin)

5. **最终验证**:
   - ✅ 看到管理后台仪表盘
   - ✅ URL: http://localhost:6188/admin
   - ✅ 用户信息已加载

### 验证点 3: 用户菜单和权限

```bash
# 在管理后台右上角查看用户菜单
# 应显示:
# - 用户名: Admin User (或相似)
# - 个人资料链接
# - 登出链接
```

### 验证点 4: Pingora 路由验证

在浏览器开发者工具中检查网络请求:

1. **打开**: F12 → Network 标签
2. **访问**: http://localhost:6188/admin
3. **检查所有请求**:
   - ✅ 所有请求都来自 `localhost:6188`
   - ✅ 没有直接的 `localhost:3001` 或 `localhost:3002` 请求
   - ✅ Cookie 在所有请求中都包含 (Set-Cookie headers)

### 验证点 5: Cookie 验证

打开浏览器开发者工具 → Application → Cookies:

应看到以下 cookies:
- ✅ `oauth_state` - 来自授权流程
- ✅ `oauth_code_verifier` - PKCE 验证器
- ✅ `access_token` - JWT 访问令牌
- ✅ `refresh_token` - 刷新令牌

所有包含敏感数据的 cookies 应该是:
- ✅ `HttpOnly` = 是
- ✅ `Secure` = (开发环境: 否, 生产: 是)
- ✅ `SameSite` = Lax

---

## 🧪 Step 4: E2E 测试验证

**前置条件**: 所有 3 个服务已运行

### 运行完整 E2E 测试套件

```bash
cd apps/admin-portal

# 方法 1: 标准运行 (推荐)
pnpm test:e2e

# 方法 2: 交互式 UI 模式
pnpm test:e2e:ui

# 方法 3: 调试模式 (带详细日志)
pnpm test:e2e:debug

# 方法 4: 有头浏览器 (观看执行过程)
pnpm test:e2e:headed
```

### 预期测试覆盖

测试应验证以下场景:

1. ✅ **无认证访问** → 重定向到登录
2. ✅ **有效凭证登录** → 成功认证
3. ✅ **无效凭证** → 错误消息
4. ✅ **CSRF 保护** → 状态参数验证
5. ✅ **Token 交换** → 授权码交换为 token
6. ✅ **用户信息** → 获取当前用户数据
7. ✅ **权限检查** → 访问控制工作
8. ✅ **会话超时** → Token 过期处理

### 查看测试报告

```bash
# 生成并打开 HTML 报告
pnpm test:e2e:report

# 或在 admin-portal 目录查找
ls -la playwright-report/
```

---

## 🔍 Step 5: 故障排除和日志检查

### 查看 OAuth Service 日志

在 OAuth Service 终端查看:
```
✅ Route POST /api/v2/auth/login matched
✅ User 'admin' authenticated successfully
✅ session_token cookie set
```

### 查看 Admin Portal 日志

在 Admin Portal 终端查看:
```
✅ API request to /api/v2/oauth/token
✅ Token exchange successful
✅ User info fetched from /api/v2/users/me
```

### 浏览器控制台日志

打开浏览器 F12 Console 检查:
```javascript
// 应看到 debug 信息
"Sending login request to: http://localhost:6188/api/v2/auth/login"
"Login successful, response: {...}"
"Redirecting to authorize URL: http://localhost:6188/api/v2/oauth/authorize..."
```

### 常见错误及解决方案

#### ❌ "net::ERR_CONNECTION_REFUSED"

**原因**: 某个服务未运行
```bash
# 检查所有服务
curl http://localhost:3001/health  # OAuth Service
curl http://localhost:3002/health  # Admin Portal  
curl http://localhost:6188/health  # Pingora
```

**解决**: 启动缺失的服务

#### ❌ "invalid_redirect" 错误

**原因**: redirect URL 验证失败
```bash
# 检查 validateRedirectUrl() 函数
# 确保 redirect 参数格式正确
```

**解决**: 清除 cookies，重新开始流程

#### ❌ "session already exists" 或重复登录

**原因**: 旧的 session_token 仍在 cookie 中
```bash
# 清除所有 cookies 和本地存储
# 在浏览器开发者工具中或使用
document.cookie.split(";").forEach(c => {
  const eqPos = c.indexOf("=");
  const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;";
});
localStorage.clear();
sessionStorage.clear();
```

**解决**: 重新访问页面

#### ❌ PKCE 验证失败

**原因**: code_verifier 丢失或不匹配
```bash
# 检查浏览器 cookie 中是否有
# oauth_code_verifier (httpOnly 无法直接看)

# 在 Network 标签中查看 /oauth/token 请求
# 确保 code_verifier 参数存在
```

**解决**: 确保使用 HTTPS（生产）并检查 cookie 传递

---

## 📊 Performance Check (可选)

```bash
# 测量服务启动时间
time curl http://localhost:6188/admin

# 检查响应时间
curl -w "Total time: %{time_total}s\n" http://localhost:6188/admin

# 预期: < 500ms (开发环境)
```

---

## 📚 更多资源

| 文档 | 用途 |
|------|------|
| `INTEGRATION_COMPLETION_SESSION_9.md` | 完整的技术细节 |
| `notes.md` | 集成进度和决策 |
| `E2E_TESTING_GUIDE.md` | E2E 测试指南 |
| `CLAUDE.md` | 主项目文档 |
| `DUAL_ROLES_ANALYSIS.md` | 两重角色分析 |

---

## 🎯 验证检查清单

完成以下所有步骤后，标记为完成:

- [ ] 数据库初始化成功
- [ ] OAuth Service 运行在 3001 端口
- [ ] Admin Portal 运行在 3002 端口
- [ ] Pingora 运行在 6188 端口
- [ ] 无认证访问被重定向到登录
- [ ] 使用 admin/admin123 成功登录
- [ ] 看到管理后台仪表盘
- [ ] 浏览器 Cookie 中有正确的令牌
- [ ] 所有网络请求都通过 Pingora
- [ ] E2E 测试套件全部通过
- [ ] 没有浏览器控制台错误

---

## 🎉 下一步

集成验证通过后:

1. **进阶测试**:
   - 测试权限检查
   - 测试 Token 刷新
   - 测试会话超时
   - 测试注销流程

2. **生产准备**:
   - 配置 HTTPS 和正确的域名
   - 更新环境变量
   - 配置安全头部
   - 设置日志和监控

3. **文档和培训**:
   - 更新部署文档
   - 编写管理员手册
   - 培训开发团队

---

**文档完成日期**: 2025-11-03
**状态**: 准备好进行集成测试
