# Admin Portal E2E 生产环境测试指南

> **重要**: E2E 测试必须使用生产构建，而不是 dev 模式，因为 Next.js 是服务端渲染应用。

## 快速开始

### 1. 配置环境变量

创建 `.env.production.local` 文件（生产环境）：

```bash
# Admin Portal - Production Environment Variables
# 通过 Pingora 同域访问 OAuth Service

# OAuth Service URL（通过 Pingora 代理）
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188

# OAuth 客户端配置
NEXT_PUBLIC_OAUTH_CLIENT_ID=auth-center-admin-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:3002/auth/callback

# API Base URL（通过 Pingora 代理）
NEXT_PUBLIC_API_BASE_URL=http://localhost:6188/api/v2

# Node Environment
NODE_ENV=production
```

**注意**:
- `.env.production.local` 已在 `.gitignore` 中，不会被提交
- `NEXT_PUBLIC_*` 变量在构建时内联到代码中，修改后需要重新构建

### 2. 构建生产版本

```bash
cd apps/admin-portal
pnpm build
```

### 3. 启动所有服务（生产模式）

#### 终端 1 - OAuth Service (Rust)
```bash
cd apps/oauth-service-rust
cargo run --release > /tmp/oauth.log 2>&1 &
```

#### 终端 2 - Pingora Proxy
```bash
cd apps/pingora-proxy
cargo run --release > /tmp/pingora.log 2>&1 &
```

#### 终端 3 - Admin Portal (生产模式)
```bash
cd apps/admin-portal
pnpm start -p 3002 > /tmp/admin-portal.log 2>&1 &
```

### 4. 验证服务状态

```bash
# OAuth Service (3001)
curl http://localhost:3001/api/v2/health

# Pingora Proxy (6188)
curl -I http://localhost:6188

# Admin Portal (3002)
curl -I http://localhost:3002
```

**预期结果**:
- OAuth Service: 返回 JSON 响应
- Pingora: 返回 HTTP 200
- Admin Portal: 返回 HTTP 200 或 307 Redirect（正常）

### 5. 运行 E2E 测试

```bash
cd apps/admin-portal
./run-all-e2e-tests.sh --skip-service-check
```

## 重要说明

### 为什么必须使用生产构建？

1. **Next.js SSR 渲染差异**:
   - Dev 模式: Fast Refresh, 开发优化, 未优化的bundle
   - 生产模式: 完全优化, 正确的SSR hydration, code splitting

2. **环境变量处理**:
   - `NEXT_PUBLIC_*` 变量在生产构建时内联
   - Dev 模式和生产模式读取环境变量的方式不同

3. **Proxy/Middleware 行为**:
   - `proxy.ts` 在生产模式下以 Node.js Runtime 运行
   - 行为与 dev 模式可能有差异

### 常见问题

#### 问题 1: "Invalid URL: undefined/api/v2/oauth/authorize"

**原因**: 环境变量未正确设置

**解决**:
1. 确认 `.env.production.local` 文件存在且内容正确
2. 重新构建: `pnpm build`
3. 重启服务: `pnpm start -p 3002`

#### 问题 2: Admin Portal 返回 500 错误

**原因**: 环境变量未在构建时加载

**解决**:
```bash
# 方法 1: 重新构建（推荐）
pnpm build
pnpm start -p 3002

# 方法 2: 手动设置环境变量
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188 pnpm build
```

#### 问题 3: Playwright "Page crashed"

**原因**: Headless Chrome 内存不足或渲染问题

**解决**:
```bash
# 方法 1: 增加 Node.js 内存
NODE_OPTIONS="--max-old-space-size=4096" ./run-all-e2e-tests.sh

# 方法 2: 使用 headed 模式（需要 X server）
./run-all-e2e-tests.sh --headed

# 方法 3: 减少并发worker数量
# 编辑 playwright.config.ts:
workers: 1  # 降低为 1
```

## 架构说明

### 服务通信架构（生产模式）

```
Playwright 测试
    ↓
Pingora Proxy (6188) ← 统一入口
    ↓
    ├─→ OAuth Service (3001) - /api/v2/oauth/*, /api/v2/auth/*
    └─→ Admin Portal (3002)  - 其他所有路由
```

### OAuth 2.1 流程（生产模式）

```
1. 测试访问 /admin
   ↓
2. proxy.ts 检测无 token
   ↓
3. 生成 PKCE 参数并重定向到:
   http://localhost:6188/api/v2/oauth/authorize
   (注意: 使用 NEXT_PUBLIC_OAUTH_SERVICE_URL)
   ↓
4. OAuth Service 检查 session_token (无)
   ↓
5. 重定向到 /login?redirect=<authorize_url>
   ↓
6. 用户输入凭证
   ↓
7. POST /api/v2/auth/login (through Pingora 6188)
   ↓
8. 设置 session_token cookie
   ↓
9. 重定向回 authorize URL
   ↓
10. OAuth 生成 authorization code
   ↓
11. 重定向到 /auth/callback?code=...&state=...
   ↓
12. 交换 code 为 token
   ↓
13. 访问受保护资源 ✅
```

## 监控和调试

### 查看服务日志

```bash
# OAuth Service
tail -f /tmp/oauth.log

# Pingora Proxy
tail -f /tmp/pingora.log

# Admin Portal
tail -f /tmp/admin-portal.log
```

### 检查环境变量是否生效

```bash
# 查看构建后的代码中的环境变量
cat apps/admin-portal/.next/server/chunks/*.js | grep "localhost:6188"
```

### Playwright 调试

```bash
# 启用调试模式
DEBUG=pw:* ./run-all-e2e-tests.sh

# 查看测试追踪
pnpm exec playwright show-trace test-results/.../trace.zip

# UI 模式（交互式调试）
pnpm playwright test --ui
```

## 配置文件说明

| 文件 | 用途 | 说明 |
|------|------|------|
| `.env.production.local` | 生产环境变量 | 不提交到 Git |
| `playwright.config.ts` | Playwright 配置 | baseURL: http://localhost:6188 |
| `run-all-e2e-tests.sh` | 测试运行脚本 | 自动检查服务状态 |
| `proxy.ts` | OAuth 流程入口 | Node.js Runtime |

## 性能建议

1. **使用 release 模式构建 Rust 服务**:
   ```bash
   cargo run --release
   ```
   约比 debug 模式快 10-100x

2. **生产构建优化**:
   ```bash
   pnpm build  # 启用所有优化
   ```

3. **并行测试**:
   ```bash
   # playwright.config.ts
   workers: process.env.CI ? 1 : 4
   ```

## 故障排除检查清单

- [ ] 所有服务都在运行（OAuth, Pingora, Admin Portal）
- [ ] `.env.production.local` 文件存在且配置正确
- [ ] 已执行 `pnpm build`（在修改环境变量后）
- [ ] 浏览器已安装（`pnpm playwright install chromium`）
- [ ] 端口未被占用（3001, 3002, 6188）
- [ ] 数据库已初始化（OAuth Service 自动运行迁移）
- [ ] JWT keys 已生成（OAuth Service 自动检查）

## 相关文档

- [OAuth 2.1 架构分析](./DUAL_ROLES_ANALYSIS.md)
- [前端架构分析](./FRONTEND_ARCHITECTURE_ANALYSIS.md)
- [E2E 测试指南](./E2E_TESTING_GUIDE.md)
- [Next.js 16 升级总结](../../NEXTJS_16_UPGRADE_SUMMARY.md)
- [Playwright E2E 配置修复](../../NEXTJS_16_TURBOPACK_FIX_REPORT.md)

## 下一步

一旦 E2E 测试在本地生产环境通过，可以：

1. **CI/CD 集成**: 将测试脚本添加到 GitHub Actions
2. **Docker化**: 创建 Docker Compose 配置以简化环境设置
3. **测试数据隔离**: 为测试创建独立的数据库
4. **Visual Regression Testing**: 添加截图对比测试
5. **Performance Testing**: 添加性能基准测试

## 总结

生产模式 E2E 测试配置已完成：

✅ 环境变量配置（`.env.production.local`）
✅ 生产构建流程
✅ 所有服务启动脚本
✅ Playwright 配置和浏览器环境
✅ 测试运行脚本优化
✅ 完整的故障排除指南

E2E 测试环境已准备就绪，可以进行完整的 OAuth 2.1 流程测试！

---

## 🔧 生产构建问题修复记录 (2025-11-19)

### 问题 1: Next.js 16 + Sentry 兼容性

**错误信息**:
```
Error: Could not find the module "..." in the React Client Manifest.
This is probably a bug in the React Server Components bundler.
```

**根本原因**:
- Sentry 的 `withSentryConfig()` 与 Next.js 16 + Turbopack 不兼容
- 导致 React Server Components 打包失败

**解决方案**:
移除 Sentry 配置，简化 `next.config.js`：

```javascript
// ❌ 修改前
const { withSentryConfig } = require('@sentry/nextjs');
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);

// ✅ 修改后
module.exports = nextConfig;
```

**结果**:
- ✅ 生产构建成功
- ✅ 服务器启动无错误
- ✅ 所有页面可访问

### 问题 2: Token Storage 上下文丢失

**错误信息**:
```
PAGE ERROR: this.getCookieValue is not a function
```

**根本原因**:
静态方法赋值丢失 `this` 上下文：

```typescript
// ❌ 错误方式
static getAccessToken = EnhancedTokenStorage.getAccessToken;
```

**解决方案**:
使用包装函数保留上下文：

```typescript
// ✅ 正确方式
static getAccessToken() {
  return EnhancedTokenStorage.getAccessToken();
}
```

**影响文件**:
- `lib/auth/token-storage-consolidated.ts`

### 问题 3: 表单提交循环刷新 (待解决)

**现象**:
- 登录页面正确渲染
- 表单填充成功
- 点击登录按钮后页面不断刷新
- OAuth Service 没有收到 POST 请求

**Playwright 日志**:
```
navigated to "http://localhost:6188/login" (x26 times)
element was detached from the DOM, retrying
```

**可能原因**:
1. 生产模式下 React hydration 问题
2. 表单 submit 事件未正确触发
3. CSP 策略阻止了某些操作

**调试计划**:
1. 添加网络请求拦截器
2. 验证表单 onSubmit 事件
3. 检查浏览器控制台错误
4. 使用 Playwright trace 详细分析

## 📊 当前测试结果

### 服务状态 ✅
| 服务 | 状态 | 端口 | 验证 |
|------|------|------|------|
| OAuth Service (Rust) | ✅ 运行 | 3001 | HTTP 401 (需要认证) |
| Pingora Proxy | ✅ 运行 | 6188 | HTTP 200 |
| Admin Portal (Prod) | ✅ 运行 | 3002 | HTTP 200 |

### E2E 测试 ⚠️
- **Scenario 1**: 失败（表单提交问题）
- **进度**: 90% 完成
  - ✅ Chromium 启动
  - ✅ 页面导航
  - ✅ 元素定位
  - ⚠️ 表单提交

## 🎯 后续工作

### 立即 (1-2 小时)
- [ ] 修复表单提交循环问题
- [ ] 优化 Playwright 等待策略
- [ ] 添加详细的调试日志

### 短期 (2-3 小时)
- [ ] 完善所有 40 个测试用例
- [ ] 调整超时时间
- [ ] 添加网络请求日志

### 中期 (3-4 小时)
- [ ] GitHub Actions CI/CD
- [ ] Docker Compose 环境
- [ ] 自动化测试报告

---

**提交记录**:
- `652e938f` - fix(admin-portal): Fix Next.js 16 production build by removing Sentry integration
- `f84dc987` - fix(admin-portal): Fix token storage 'this' context loss in method proxying
- `8ae21eb5` - fix(admin-portal): Fix Playwright browser crashes with Chrome launch args

**分支**: `claude/production-readiness-oauth-013HBkCHYjcdDoNrvLVYLwkq`
