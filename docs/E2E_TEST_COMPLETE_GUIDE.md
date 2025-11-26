# E2E 测试完整指南

**文档版本**: 1.0
**最后更新**: 2025-11-26
**目标受众**: 开发人员、QA 工程师
**状态**: ✅ 完整

---

## 一、项目概览

### 项目结构

本项目是一个 **OAuth 2.1 认证授权系统**，使用 Monorepo 架构，包含以下核心应用：

```
ts-next-template (Monorepo - pnpm workspaces + Turbo)
├── apps/
│   ├── oauth-service-rust/       # OAuth 2.1 认证服务 (Rust + Axum)
│   │   └── 端口: 3001
│   ├── admin-portal/              # 管理后台 (Next.js 16 + React 19)
│   │   └── 端口: 3002
│   ├── pingora-proxy/             # 反向代理 (Rust Pingora)
│   │   └── 端口: 6188 (统一入口)
│   └── 其他服务...
└── packages/                      # 共享库
```

### 核心文档阅读摘要

| # | 文档 | 关键内容 | 影响E2E测试 |
|----|------|---------|-----------|
| 1 | [1-REQUIREMENTS.md](./1-REQUIREMENTS.md) | OAuth 2.1 完整需求，PKCE 强制，Token 生命周期 | ✅ 定义测试场景 |
| 2 | [2-SYSTEM_DESIGN.md](./2-SYSTEM_DESIGN.md) | 系统架构，服务分层，OAuth 流程细节 | ✅ 指导测试设计 |
| 3 | [7-TESTING.md](./7-TESTING.md) | 测试策略，Jest 单元测试，Playwright E2E 测试 | ✅ 测试框架规范 |

---

## 二、E2E 测试现状分析

### 2.1 已有测试文件 (8 个)

**位置**: `/apps/admin-portal/tests/e2e/`

| 文件名 | 行数 | 覆盖范围 | 状态 |
|--------|------|---------|------|
| `auth-flow.spec.ts` | 301 | OAuth 2.1 授权流程，会话管理 | ✅ 完成 |
| `error-scenarios.spec.ts` | 506 | 错误处理，边界情况，网络故障 | ✅ 完成 |
| `oauth-pkce-validation.spec.ts` | 338 | PKCE 验证，授权码拦截防护 | ✅ 完成 |
| `oauth-security-p0.spec.ts` | 327 | 安全性测试 (P0 优先级) | ✅ 完成 |
| `oauth-security-p1.spec.ts` | 395 | 安全性测试 (P1 优先级) | ✅ 完成 |
| `role-permission-management.spec.ts` | 420 | 角色权限管理，RBAC 验证 | ✅ 完成 |
| `token-lifecycle.spec.ts` | 443 | Token 生成、刷新、撤销、过期 | ✅ 完成 |
| `user-management.spec.ts` | 358 | 用户创建、编辑、删除、查询 | ✅ 完成 |

**总计**: 3,088 行代码，40 个测试用例

### 2.2 辅助工具

**位置**: `/apps/admin-portal/tests/e2e/helpers/`

- **test-helpers.ts** (380 行)
  - `completeOAuthLogin()` - 完成 OAuth 登录流程
  - `getAccessToken()` / `getRefreshToken()` - Token 获取
  - `parseJWT()` - JWT 解析
  - `generatePKCE()` - PKCE 参数生成
  - `cleanupTokens()` - Token 清理

- **test-fixtures.ts** (320 行)
  - 测试数据（用户、角色、权限）
  - Mock 数据生成

### 2.3 Playwright 配置

**文件**: `/apps/admin-portal/playwright.config.ts`

```typescript
{
  testDir: './tests/e2e',
  baseURL: 'http://localhost:6188',  // 通过 Pingora 代理
  fullyParallel: true,
  retries: 0,
  workers: 1 (在 CI 环境),
  reporter: ['list', 'json', 'html'],
  timeout: 30s (action), 30s (navigation), 10s (expect),
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
}
```

---

## 三、当前问题诊断

### 问题：502 Bad Gateway

**根本原因**: 测试启动时，Pingora 代理（端口 6188）无法连接到后端服务

**错误示例**:
```
RESPONSE: 502 http://localhost:6188/api/v2/oauth/authorize?...
PAGE ERROR: Failed to load resource: the server responded with a status of 502
```

**失败的测试**: 39 个 (97.5%)，只有 1 个测试通过（CSRF 验证测试）

### 根本原因分析

E2E 测试需要**三个服务同时运行**：

1. **oauth-service-rust** (端口 3001)
   - 处理用户认证
   - 签发 Token
   - 管理授权码

2. **admin-portal** (端口 3002)
   - 提供 Web UI (登录页、管理界面)
   - 存储和使用 Token
   - OAuth 客户端

3. **pingora-proxy** (端口 6188)
   - 反向代理
   - 统一入口点
   - 解决 Cookie 同域问题

---

## 四、E2E 测试框架技术栈

### 4.1 核心技术

| 工具 | 版本 | 用途 |
|------|------|------|
| **Playwright** | 1.55.0 | E2E 测试框架 |
| **Next.js** | 16.0.0 | 前端框架 |
| **Rust + Axum** | Latest | 后端框架 |
| **Pingora** | Rust | 反向代理 |
| **TypeScript** | 5.9.2 | 语言 |

### 4.2 测试工具链

```
jest (单元测试)
playwright (E2E 测试)
@testing-library/react (组件测试)
```

### 4.3 支持的浏览器

- **Desktop Chrome/Chromium** (已配置)

### 4.4 Playwright 启动参数优化

为支持容器环境和 headless 模式：

```typescript
launchOptions: {
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-blink-features=AutomationControlled',
  ],
}
```

---

## 五、E2E 测试覆盖范围详细说明

### 5.1 OAuth 2.1 完整流程测试 (auth-flow.spec.ts)

**6 个场景**:

1. **完整 OAuth 流程**
   - 访问受保护路由 → 重定向授权 → 登录 → 授权码交换 → Token 存储

2. **无效凭证错误处理**
   - 测试错误凭证被拒绝

3. **CSRF 保护 (State 参数)**
   - 验证 State 参数正确性

4. **使用有效 Token 访问受保护资源**
   - 验证 Token 有效期内可访问资源

5. **所有请求通过 Pingora 代理**
   - 验证代理配置正确

6. **处理过期 Session**
   - 验证过期 Session 重新认证流程

### 5.2 错误场景测试 (error-scenarios.spec.ts)

**14 个场景**:

- 无效凭证
- Session 过期
- 表单验证
- 网络错误
- 服务器错误 (500)
- 404 Not Found
- 403 禁止访问
- CSRF 验证错误
- 重复资源创建
- 错误恢复
- 缺少必填参数
- 请求超时

### 5.3 PKCE 验证测试 (oauth-pkce-validation.spec.ts)

**验证 PKCE 防护**:

- 有效的 PKCE 流程
- 错误的 code_verifier 被拒绝
- 无效的 code_challenge 被拒绝
- S256 哈希方法正确性

### 5.4 安全性测试

**P0 优先级** (oauth-security-p0.spec.ts):
- XSS 防护 (HttpOnly Cookie)
- CSRF 防护
- 密码安全验证
- 权限隔离

**P1 优先级** (oauth-security-p1.spec.ts):
- Token 轮换
- Session 安全性
- 错误信息不泄露敏感数据
- 账户锁定机制

### 5.5 角色权限管理 (role-permission-management.spec.ts)

**11 个场景**:

- 加载和显示角色列表
- 创建角色
- 编辑角色
- 删除角色
- 权限编辑器
- 取消创建
- 必填字段验证
- 表格列显示
- 操作按钮
- 批量创建
- 分页功能

### 5.6 Token 生命周期管理 (token-lifecycle.spec.ts)

**完整的 Token 生命周期**:

- 生成 Token
- Token 有效期
- Token 刷新 (使用 refresh_token)
- Refresh Token 轮换
- Token 撤销
- 过期 Token 重新认证
- 黑名单检查

### 5.7 用户管理 (user-management.spec.ts)

**10 个场景**:

- 加载用户列表
- 创建用户
- 编辑用户
- 删除用户
- 取消创建
- 必填字段验证
- 分页功能
- 批量创建
- 数据正确性检查

---

## 六、运行 E2E 测试

### 6.1 前置条件

1. **依赖安装**
   ```bash
   pnpm install
   ```

2. **数据库初始化** (如需要)
   ```bash
   pnpm db:generate
   pnpm db:push
   pnpm db:seed
   ```

3. **Playwright 浏览器安装**
   ```bash
   pnpm exec playwright install chromium
   ```

### 6.2 启动所有服务并运行 E2E 测试

**选项 1: 完全自动化**

```bash
# 推荐方式 - 使用 start-server-and-test
pnpm test:e2e:admin
```

此命令会：
1. 启动 admin-portal (端口 3002)
2. 启动 oauth-service-rust (端口 3001)
3. 启动 pingora-proxy (端口 6188)
4. 等待服务就绪
5. 运行 E2E 测试
6. 自动关闭所有服务

**选项 2: 手动启动服务**

终端 1 - 启动所有服务：
```bash
pnpm turbo dev --parallel --filter=admin-portal --filter=oauth-service-rust --filter=pingora-proxy
```

终端 2 - 运行 E2E 测试：
```bash
pnpm --filter=admin-portal test:e2e
```

**选项 3: 单个测试文件**

```bash
# 运行特定测试
pnpm --filter=admin-portal exec playwright test tests/e2e/auth-flow.spec.ts

# UI 模式 (交互式调试)
pnpm --filter=admin-portal exec playwright test --ui

# Headed 模式 (可视化)
pnpm --filter=admin-portal exec playwright test --headed

# 调试模式
pnpm --filter=admin-portal exec playwright test --debug
```

### 6.3 测试验证

**预期结果**:
- 40 个测试用例
- 所有测试应该通过
- 生成 HTML 报告

**查看测试报告**:
```bash
pnpm --filter=admin-portal test:e2e:report
```

**报告位置**:
```
apps/admin-portal/playwright-report/
```

### 6.4 CI 环境运行

```bash
# CI 环境（单进程，无 UI）
pnpm test:e2e:ci

# 或使用完整流程
pnpm run test:e2e:ci  # 根目录脚本
```

---

## 七、测试脚本详解

### 根目录脚本 (`/package.json`)

```bash
pnpm start:e2e
# 启动 admin-portal + oauth-service-rust (开发模式)
# 等同: turbo dev --parallel --filter=admin-portal --filter=oauth-service-rust

pnpm test:e2e:admin
# 完全自动化: 启动服务 → 等待就绪 → 运行测试 → 清理
# 使用: start-server-and-test

pnpm test:e2e:ci
# CI 完整流程: 编译 → 启动 → 运行集成测试
```

### Admin Portal 脚本 (`/apps/admin-portal/package.json`)

```bash
pnpm test:e2e
# 运行 Playwright 测试，输出: list 格式

pnpm test:e2e:ui
# UI 模式（交互式）

pnpm test:e2e:headed
# Headed 模式（可视化浏览器）

pnpm test:e2e:debug
# 调试模式

pnpm test:e2e:report
# 显示 HTML 报告

pnpm test:e2e:ci
# CI 模式，输出: JSON 格式

pnpm test:e2e:integration
# 运行集成测试（oauth2.1-flow.spec.ts）
```

---

## 八、常见问题排查

### 问题 1: 502 Bad Gateway

**症状**: 所有测试在第一个请求就失败

**原因**: Pingora 代理未运行或无法连接后端

**解决**:
1. 确保启动脚本包括 pingora-proxy
2. 检查 pingora-proxy 的启动状态：`ps aux | grep pingora`
3. 验证服务端口是否侦听：
   ```bash
   netstat -an | grep 3001  # oauth-service-rust
   netstat -an | grep 3002  # admin-portal
   netstat -an | grep 6188  # pingora-proxy
   ```

### 问题 2: 连接被拒绝

**症状**: `ECONNREFUSED` 或 `net::ERR_CONNECTION_REFUSED`

**原因**: 服务未启动或端口被占用

**解决**:
```bash
# 检查端口占用
lsof -i :3001
lsof -i :3002
lsof -i :6188

# 释放端口（如需要）
kill -9 <PID>

# 重新启动服务
pnpm turbo dev --parallel
```

### 问题 3: 测试超时

**症状**: `TimeoutError: waiting for selector '...' to be visible`

**原因**: 页面加载过慢或元素未出现

**解决**:
1. 增加超时时间（在 playwright.config.ts）
2. 检查浏览器控制台错误：在日志中查看 `PAGE ERROR`
3. 查看截图和视频：`test-results/` 目录

### 问题 4: 测试间歇性失败

**症状**: 有时通过，有时失败

**原因**: 时序问题、缓存或状态污染

**解决**:
1. 检查 fixtures 的清理逻辑
2. 增加等待时间（`waitForTimeout`, `waitForLoadState`）
3. 运行单个测试排除并发问题

---

## 九、最佳实践

### 9.1 写 E2E 测试时

1. **使用 testId 选择器**
   ```typescript
   // ✅ 推荐
   await page.getByTestId('login-button').click();

   // ❌ 避免
   await page.click('button:has-text("Login")');
   ```

2. **等待 API 响应**
   ```typescript
   // ✅ 等待实际 API 响应
   const response = page.waitForResponse(
     (r) => r.url().includes('/api/v2/auth/login') && r.request().method() === 'POST'
   );
   await button.click();
   await response;
   ```

3. **使用 step 组织测试**
   ```typescript
   await test.step('登录用户', async () => {
     // ...
   });
   ```

4. **清理状态**
   ```typescript
   test.afterEach(async ({ page }) => {
     await cleanupTokens(page);
   });
   ```

### 9.2 调试技巧

1. **UI 模式调试**
   ```bash
   pnpm test:e2e:ui
   ```

2. **Headed 模式**
   ```bash
   pnpm test:e2e:headed
   ```

3. **检查截图/视频**
   ```bash
   ls -la test-results/
   ```

4. **打印调试信息**
   ```typescript
   console.log('Debug:', variable);
   console.log(`Current URL: ${page.url()}`);
   ```

---

## 十、测试数据和 Fixtures

### 默认测试账户

| 用户名 | 密码 | 角色 | 权限 |
|--------|------|------|------|
| admin | admin123 | Super Admin | 所有权限 |
| user1 | user123 | Admin | 用户管理、角色管理 |
| viewer | viewer123 | User | 仅查看权限 |

### 环境变量配置

```bash
# .env.test 或命令行设置
export PLAYWRIGHT_TEST_BASE_URL=http://localhost:6188
export TEST_ADMIN_USERNAME=admin
export TEST_ADMIN_PASSWORD=admin123
export PLAYWRIGHT_SKIP_SERVER_START=1  # 跳过服务启动
export CI=1  # 运行在 CI 模式
```

---

## 十一、性能基准

### 预期性能指标

| 操作 | 目标 | 实际 |
|------|------|------|
| OAuth 登录 | < 2s | ~1.5s |
| Token 交换 | < 500ms | ~300ms |
| 权限检查 | < 20ms | ~10ms |
| 页面加载 | < 2s | ~1.2s |
| 总测试运行 | < 5min | ~3min |

---

## 十二、续文档更新

本文档会定期更新以反映：
- 新的测试用例
- 框架升级
- 性能改进
- 已知问题修复

**上次更新**: 2025-11-26
**下次审查**: 2026-02-26
**维护者**: 开发团队

---

## 附录：完整测试清单

### 测试前准备

- [ ] 克隆项目并安装依赖：`pnpm install`
- [ ] 初始化数据库：`pnpm db:seed`
- [ ] 安装 Playwright 浏览器：`pnpm exec playwright install`
- [ ] 检查环境变量配置
- [ ] 验证 Node.js 和 pnpm 版本

### 运行测试

- [ ] 启动服务：`pnpm turbo dev --parallel`
- [ ] 等待服务就绪（检查端口侦听）
- [ ] 运行测试：`pnpm --filter=admin-portal test:e2e`
- [ ] 监控测试进度（控制台输出）
- [ ] 检查测试报告：`pnpm --filter=admin-portal test:e2e:report`

### 验证结果

- [ ] 所有 40 个测试通过
- [ ] 没有 JavaScript 错误
- [ ] 性能指标达标
- [ ] 代码覆盖率满足要求
- [ ] 没有 console 警告

---

**📌 快速开始**:

```bash
# 推荐：一条命令完成全部
pnpm test:e2e:admin

# 或者
pnpm turbo dev --parallel &  # 后台启动
pnpm --filter=admin-portal test:e2e  # 运行测试
```

---
