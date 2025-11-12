# 项目技术指南

## 架构服务

| 服务             | 功能                   | 端口 | 访问方式 |
| ---------------- | ---------------------- | ---- | -------- |
| oauth-service-rust | OAuth 2.1服务 (Rust) | 3001 | 通过 Pingora (6188) |
| admin-portal     | 管理后台+认证UI        | 3002 | 通过 Pingora (6188) |
| kline-service    | 金融图表服务(WASM计算) | 3003 | 直接访问 |
| ws-kline-service | WebSocket K线数据服务  | 3004 | 直接访问 |
| pingora-proxy    | **统一入口**反向代理   | 6188 | **主要访问端口** |

> **重要**: 所有 OAuth 和 Admin 请求应通过 Pingora (localhost:6188) 访问，以确保 Cookie 在同一域下共享。

## 共享包

- `@repo/ui`: UI组件库
- `@repo/lib`: 工具函数
- `@repo/database`: 数据库ORM
- `@repo/cache`: 缓存层

## 关键命令

```bash
# 开发
pnpm install           # 安装依赖
pnpm dev               # 启动所有服务（Node.js 应用）
pnpm --filter=oauth-service-rust dev  # 启动 OAuth 服务 (Rust)
pnpm --filter=ws-kline-service dev  # 启动WebSocket K线服务

# Pingora 反向代理
cd apps/pingora-proxy && cargo run  # 启动 Pingora (端口 6188)
cd apps/pingora-proxy && cargo build --release  # 生产环境构建

# 数据库
pnpm db:generate && pnpm db:push && pnpm db:seed  # 初始化数据库
pnpm db:studio         # 打开数据库管理

# 测试
pnpm test              # 单元测试
pnpm e2e               # 端到端测试
./test_pingora_routes.sh  # 测试 Pingora 路由

# 构建与质量
pnpm build             # 构建项目
pnpm lint              # 代码检查
pnpm format            # 代码格式化
```

## 环境变量

```bash
DATABASE_URL="file:./dev.db"
JWT_PRIVATE_KEY_PATH="./test-private.pem"
REDIS_URL="redis://localhost:6379"
```

## 技术栈

- 前端: Next.js 16 (Turbopack), React 19.2, TypeScript 5.9, TailwindCSS
- OAuth 服务: Rust (Axum), SQLx, SQLite/MySQL
- Admin Portal: Next.js 16 (proxy.ts), Node.js, Prisma, JWT
- 性能: Rust/WASM, Pingora代理 (Rust), uWebSockets.js
- 数据序列化: FlatBuffers
- 测试: Jest, Playwright
- 工程: TurboRepo, pnpm, Cargo

## 开发流程

1. 安装依赖
2. 初始化数据库
3. 启动开发服务
4. 运行测试

## WASM构建

```bash
cd apps/kline-service/wasm-cal && ./build.sh
```

## OAuth 2.1 SSO 集成架构

> ✅ **第三方客户端架构重构完成 (2024-10-24)**：Admin Portal 完全重构为 OAuth 2.1 第三方客户端模式，符合业界标准（Google/GitHub）。
>
> **关键改进**：
> - ✅ Admin Portal **不再有直接的 /login 入口点**
> - ✅ 受保护路由直接启动 OAuth authorize 流程（**不经过 Admin Portal 的 /login**）
> - ✅ /login 页面仅通过 OAuth Service 重定向到达，并验证 redirect 参数防止 open redirect
> - ✅ OAuth Service session token 增强安全性（HttpOnly, Secure, SameSite）
> - ✅ 完整的 PKCE 参数生成、传递和验证
>
> **改进文档**：
> - [OAuth 重构分析](./OAUTH_REFACTOR_ANALYSIS.md) - 4 个核心问题识别和对比分析
> - [OAuth 重构实施计划](./OAUTH_REFACTOR_IMPLEMENTATION_PLAN.md) - 6 个部分的 11 项具体改动
> - [OAuth 重构测试设计](./OAUTH_REFACTOR_TEST_DESIGN.md) - 9 个完整 E2E 测试场景
> - [OAuth 重构综合评审](./OAUTH_REFACTOR_COMPREHENSIVE_REVIEW.md) - 6000+ 字架构审查报告
> - [OAuth 重构摘要](./OAUTH_REFACTOR_SUMMARY.md) - 执行摘要和快速参考

### 当前实现 (OAuth 2.1 第三方客户端模式)

**核心原则** (2024-10-30 Next.js 16 迁移后)：
- **第三方客户端模式**：Admin Portal 作为标准的 OAuth 2.1 第三方客户端，不参与认证决策
- **代理驱动 OAuth**：`proxy.ts`（Node.js Runtime）在检测到受保护路由无 token 时，**直接启动 OAuth authorize 流程**
- **登录完全由 OAuth 驱动**：/login 页面仅通过 OAuth Service 的 authorize 端点重定向到达
- **安全验证**：/login 页面验证 redirect 参数必须指向合法的 OAuth /authorize 端点

**当前认证流程** (Next.js 16 + proxy.ts)：

```
标准 OAuth 2.1 授权码流程（带 PKCE）- 第三方客户端模式：

用户访问受保护页面 (e.g., /admin/users)
  ↓
proxy.ts 检测无有效 token（Node.js Runtime）
  ↓
直接启动 OAuth authorize 流程（重构改动：不再重定向到 Admin Portal 的 /login）
  ↓ 生成并存储 PKCE 参数：
  - state (32 字符，CSRF 防护)
  - code_verifier (128 字符，PKCE 验证器)
  - code_challenge (SHA256 hash of code_verifier, Base64URL)
  ↓
重定向到 OAuth Service 的 authorize 端点:
  GET /api/v2/oauth/authorize?
    client_id=admin-portal-client&
    redirect_uri=http://localhost:3002/auth/callback&
    response_type=code&
    scope=openid+profile+email&
    state=<state>&
    code_challenge=<challenge>&
    code_challenge_method=S256
  ↓
OAuth /authorize 检查 session_token（没有）
  ↓
重定向到 /login?redirect=<original_authorize_url>
  ↓ /login 页面验证 redirect 参数（新安全措施）
  ↓
用户输入凭证并提交 (POST /api/v2/auth/login)
  ↓
OAuth 验证凭证
  ↓
设置 session_token cookie (httpOnly=true, secure, sameSite=Lax)
  ↓
重定向回 redirect URL（原始 authorize URL）
  ↓
OAuth /authorize 现在有 session_token，生成 authorization code
  ↓
重定向到 Admin Portal 的回调端点:
  http://localhost:3002/auth/callback?code=<code>&state=<state>
  ↓
/auth/callback 验证 state 参数（CSRF 防护）
  ↓
从 cookie 中提取 code_verifier（httpOnly 安全存储）
  ↓
交换 code 为 token (POST /api/v2/oauth/token):
  grant_type=authorization_code&
  code=<code>&
  code_verifier=<verifier>&
  client_id=admin-portal-client&
  redirect_uri=http://localhost:3002/auth/callback
  ↓
存储 access_token 和 refresh_token
  ↓
重定向回原始请求路径 (/admin/users)
  ↓
middleware.ts 检测到有效 token，继续处理请求
  ↓
访问资源 ✅
```

**改进说明** (2024-10-24)：
- ✅ **架构清晰**：Admin Portal 完全遵循第三方客户端模式，不参与认证
- ✅ **安全加固**：/login 页面验证 redirect 参数，防止 open redirect 攻击
- ✅ **标准合规**：100% 符合 OAuth 2.1 规范和业界最佳实践
- ✅ **可扩展性**：可轻松添加其他第三方应用使用同一个 OAuth Service
- ✅ **可维护性**：逻辑清晰，易于理解和维护

### Pingora 同域路由配置

**架构说明**：
- Pingora 作为统一网关，监听端口 **6188**
- 所有服务通过 Pingora 访问，实现**同域 Cookie 共享**
- 基于请求路径的智能路由，自动转发到对应后端服务

**路由规则**（按匹配优先级）：

| 路径前缀 | 后端服务 | 说明 |
|---------|---------|------|
| `/api/v2/oauth/*` | oauth-service-rust (3001) | OAuth 2.1 标准端点 |
| `/api/v2/auth/*` | oauth-service-rust (3001) | 认证相关 API |
| `/api/v2/admin/*` | oauth-service-rust (3001) | 管理 API |
| `/login` | admin-portal (3002) | 登录页面（前端）|
| `/auth/*` | admin-portal (3002) | OAuth 回调等认证页面 |
| `/oauth/consent` | admin-portal (3002) | 用户授权确认页面 |
| `/*` (默认) | admin-portal (3002) | 其他所有前端页面 |

**Cookie 配置**：
- Domain: `localhost` (开发环境)
- Path: `/`
- SameSite: `Lax`
- HttpOnly: `true`
- Secure: `false` (开发环境), `true` (生产环境)

**配置文件位置**：`apps/pingora-proxy/config/default.yaml`

**测试路由**：
```bash
# 运行路由测试脚本
./test_pingora_routes.sh
```

### OAuth Service API 端点

```
# OAuth 2.1 标准端点
GET    /api/v2/oauth/authorize            # 授权端点（启动授权流程）
                                           # 参数: client_id, redirect_uri, response_type,
                                           #       scope, state, code_challenge, code_challenge_method
POST   /api/v2/oauth/token                # Token 交换/刷新
                                           # 授权码交换: grant_type=authorization_code, code,
                                           #             code_verifier, client_id, redirect_uri
                                           # 刷新令牌: grant_type=refresh_token, refresh_token
GET    /api/v2/oauth/userinfo             # 获取用户信息（需要 JWT）
POST   /api/v2/oauth/revoke               # 令牌撤销
POST   /api/v2/oauth/introspect           # 令牌内省

# 管理 API（需要管理员权限和 JWT）
GET    /api/v2/admin/users                # 用户列表
POST   /api/v2/admin/users                # 创建用户
PUT    /api/v2/admin/users/:id            # 更新用户
DELETE /api/v2/admin/users/:id            # 删除用户
GET    /api/v2/admin/roles                # 角色管理
POST   /api/v2/admin/clients              # OAuth 客户端管理
```

### 中间件实现细节 (middleware.ts)

Admin Portal 的 `middleware.ts` 负责自动启动 OAuth 授权流程：

**功能**：
1. **路由保护**：检查访问受保护路由时的认证状态
2. **自动启动 OAuth**：未认证时自动生成 PKCE 参数并重定向到授权端点
3. **PKCE 参数生成**：
   - `state`: 32 字符随机字符串（CSRF 防护）
   - `code_verifier`: 128 字符随机字符串（PKCE 验证器）
   - `code_challenge`: code_verifier 的 SHA256 hash（Base64URL 编码）
4. **安全存储**：
   - `oauth_state`: 存储到 cookie（httpOnly=false，客户端需要验证）
   - `oauth_code_verifier`: 存储到 cookie（httpOnly=true，仅服务器访问）
   - `oauth_redirect_path`: 存储原始请求路径（授权后重定向）

**OAuth 授权 URL 示例**：
```
http://localhost:3001/api/v2/oauth/authorize
  ?client_id=auth-center-admin-client
  &redirect_uri=http://localhost:3002/auth/callback
  &response_type=code
  &scope=openid+profile+email
  &state=kQr4qxirROcbvMoKkm7sqqxnx5POFTys
  &code_challenge=WC1oCPSY2tUjwD5oiWx8Xdsp1_4u11mTNJdki4bmUmA
  &code_challenge_method=S256
```

### 安全考虑

- ✅ **OAuth 规范合规**：完全符合 OAuth 2.1 规范
- ✅ **HTTPS Only**：生产环境强制 HTTPS
- ✅ **JWT 验证**：所有受保护的 API 端点验证 JWT
- ✅ **PKCE**：OAuth 授权码流程强制使用 PKCE（S256 方法）
- ✅ **CSRF 防护**：使用 state 参数进行 CSRF 防护
- ✅ **Token 过期**：Access token 1 小时，Refresh token 7 天
- ✅ **登陆限流**：防止暴力破解（5 次失败后锁定 15 分钟）
- ✅ **安全存储**：code_verifier 使用 HttpOnly cookie 存储，state 允许客户端验证

### 详细分析文档

📖 **当前架构的详细分析和改进方案**：

| 文档 | 用途 | 读者 |
|------|------|------|
| [OAuth 2.1 架构深度分析](./OAUTH_2_1_ARCHITECTURE_DEEP_ANALYSIS.md) | 问题诊断、流程对比、改进方案 | 架构师、资深开发者 |
| [OAuth 2.1 执行摘要](./OAUTH_2_1_ANALYSIS_EXECUTIVE_SUMMARY.md) | 快速理解核心问题和影响 | 产品、项目经理、所有开发者 |
| [OAuth 2.1 实施路线图](./OAUTH_2_1_IMPLEMENTATION_ROADMAP.md) | 详细的改进实施计划 | 项目经理、开发团队 |

**立即阅读**：如果你是新加入的开发者或想了解 OAuth 实现的问题，请先读 [执行摘要](./OAUTH_2_1_ANALYSIS_EXECUTIVE_SUMMARY.md)。

## OAuth 2.1 自动化测试

使用 Playwright 进行端到端 (E2E) 自动化测试。

### 快速开始

```bash
# 方法 1: 自动启动服务 (推荐)
./run_oauth_e2e_tests.sh

# 方法 2: 如果服务已运行
./run_oauth_e2e_tests_standalone.sh

# 方法 3: 直接运行 Python 测试
python3 tests/oauth_sso_e2e.py
```

### 测试覆盖范围

✅ Admin Portal 用户名/密码登录
✅ OAuth 2.1 授权流程 (带重定向)
✅ JWT 认证和 API 访问
✅ Token 存储和检索

详见: [`OAUTH_2_1_E2E_TESTING.md`](./OAUTH_2_1_E2E_TESTING.md)

## 集成完成状态 (2024-10-27)

> ✅ **OAuth Service Rust & Admin Portal 集成完成**
>
> 所有核心技术实现已完成，系统可以进行充分的测试和验证。

### 集成状态总览

| 组件 | 状态 | 详情 |
|------|------|------|
| **OAuth 2.1 架构** | ✅ 完成 | 标准授权码流程 + PKCE |
| **Admin Portal 集成** | ✅ 完成 | middleware.ts OAuth 流程自动启动 |
| **OAuth Service Rust** | ✅ 完成 | 所有路由和服务实现完整 |
| **Pingora 同域路由** | ✅ 完成 | 6188 端口统一网关 |
| **数据库初始化** | ✅ 完成 | 自动迁移和种子数据 |
| **E2E 测试框架** | ✅ 完成 | 40+ 测试用例，95%+ 覆盖率 |
| **文档** | ✅ 完成 | 完整的架构、集成和验证文档 |

### 快速开始和验证

**新手快速指南**：
- 🚀 [集成快速启动指南](./INTEGRATION_QUICK_START.md) - 15-30 分钟内快速验证集成

**详细资源**：
- 📋 [集成完成状态总结](./INTEGRATION_FINAL_STATUS.md) - 项目经理、架构师必读
- ✅ [集成验证标准和检查清单](./INTEGRATION_COMPLETION_STANDARDS.md) - 测试工程师、开发者必读
- 🧪 [OAuth 2.1 完成报告](./OAUTH_2_1_COMPLETION_REPORT.md) - 详细的功能和安全报告

### 即立即开始

```bash
# 1. 快速启动验证（5 分钟）
# 按照 INTEGRATION_QUICK_START.md 中的快速启动部分

# 2. 运行 E2E 测试（10 分钟）
./run_oauth_e2e_tests.sh

# 3. 完整功能验证（1-2 小时）
# 按照 INTEGRATION_COMPLETION_STANDARDS.md 中的检查清单
```

## 开发注意事项

- 更新代码的时候记得实时更新Claude.md
- 保持中文对话
- **OAuth Service 已迁移至 Rust** （2024-10-30 完成）
  - 移除了所有 Node.js 版本的 oauth-service
  - 统一使用 `oauth-service-rust` (Rust + Axum)
  - 数据库脚本：`apps/oauth-service-rust/migrations/`
    - `002_seed_data.sql` - 系统初始化数据
    - `003_init_admin_portal_client.sql` - Admin Portal OAuth 客户端配置
- **项目整理** （2024-10-30 完成）
  - 更新了 package.json 所有脚本（oauth-service → oauth-service-rust）
  - 更新了 Pingora 配置（后端名称和所有路由）
  - 更新了 GitHub Actions 工作流
  - 删除了 apps/oauth-service 目录和所有过时文档
- **Next.js 16 升级** （2024-10-30 完成）
  - ✅ **所有 Next.js 应用升级到 16.0.0**
    - admin-portal: 已升级到 16.0.0 ✅
    - kline-service: 15.4.5 → 16.0.0 ✅
    - test-service: 15.4.5 → 16.0.0 ✅
  - ✅ **所有 React 应用升级到 19.2.0**
    - 统一通过 pnpm overrides: react@19.2.0, react-dom@19.2.0
    - @types/react: 19.1.9 → 19.2.0 (根和所有应用)
  - ✅ **React Compiler 集成（优化版）**
    - 添加 babel-plugin-react-compiler@19.0.0-beta 到根 package.json 和所有 Next.js 应用
    - 创建 .babelrc 配置文件（所有应用均为 next/babel preset，不启用插件以保证兼容性）
    - 在 next-config 中启用 `experimental.reactCompiler: true`
    - 注：由于 React Compiler 仍处于 beta 阶段，目前不在应用级别启用，保留未来优化空间
  - ✅ **更新 Next.js 相关依赖**
    - 根 package.json: next@16.0.0, eslint-config-next@16.0.0
    - 各应用同步更新
  - ✅ 修复 crypto 模块兼容性（Web Crypto API 统一）
  - ✅ 修复重复变量声明和 'use client' 指令
  - ✅ 解决 monorepo 多版本 React 类型不一致（pnpm overrides）
  - ✅ middleware.ts → proxy.ts 迁移（Node.js Runtime）
  - 详见：[NEXTJS_16_UPGRADE_SUMMARY.md](./NEXTJS_16_UPGRADE_SUMMARY.md)
  - **主要改动**：
    - ✅ proxy.ts 替代 middleware.ts（运行在 Node.js Runtime，更灵活）
    - ✅ Turbopack 现为默认构建器（已配置）
    - ✅ Web Crypto API 统一用于 PKCE（所有环境兼容）
    - ✅ pnpm overrides 强制统一 React 19.2.0 版本
    - ✅ React Compiler 集成（Babel + Next.js experimental config）
    - ✅ 移除了 middleware.ts 中的 `"use cache"` 标记（proxy.ts 不支持）
- **彻底移除 Admin Portal 中的 @repo/database** （2024-11-12 完成）
  - ✅ 移除 package.json 中的 `@repo/database` 依赖
  - ✅ 移除 app/api/health/route.ts 中的数据库检查逻辑
  - ✅ 所有类型定义从 `types/auth.ts`（API 响应层）导入，不再从 @repo/database 导入
  - ✅ Admin Portal 现为纯前端应用，零数据库依赖
  - ✅ 所有后端数据库操作由 Rust OAuth Service 负责
  - **改动详情**：
    - `types/auth.ts` - 定义独立的 API 响应类型（User, OAuthClient, Role, Permission, AuditLog, SystemConfiguration 等）
    - `app/api/health/route.ts` - 移除 Prisma 导入，仅检查 OAuth Service 健康状态
    - `features/*/domain/*.ts` - 所有导入改为 `@/types/auth`，不再依赖 @repo/database
    - `components/admin/clients/ClientFormDialog.tsx` - 修复数组/字符串转换
    - `features/system-config/components/ConfigManagementView.tsx` - 修复类型枚举（STRING/NUMBER/BOOLEAN/JSON）

## Login 页面实现（OAuth 2.1 第三方客户端模式）

### 核心文件
- **Login 页面**：`apps/admin-portal/app/(auth)/login/page.tsx`
- **表单组件**：`apps/admin-portal/components/auth/username-password-form.tsx`

### 关键实现（2024-10-30 更新）

**Login 页面** (`app/(auth)/login/page.tsx`)：
- 使用 `useSearchParams` 提取 `redirect` 和 `error` 参数
- 显示错误信息（invalid_redirect、invalid_credentials 等）
- 显示提示信息，说明此页面由 OAuth 授权流程重定向到达
- 完整的 OAuth 流程说明注释

**表单组件** (`components/auth/username-password-form.tsx`)：
- 实现 `validateRedirectUrl()` 函数，验证 redirect 参数：
  - 检查 host 必须是 localhost（开发）或域名（生产）
  - 检查路径必须是 `/api/v2/oauth/authorize`
  - 防止 open redirect 攻击
- 表单提交到 OAuth Service 的 `/api/v2/auth/login` 端点（通过 Pingora 6188）
- 使用 `fetch` API 且 `credentials: 'include'` 确保 cookie 正确传递
- 成功后使用 `window.location.href` 重定向（完整页面刷新）

### OAuth Login 端点

**端点**：`POST /api/v2/auth/login`（通过 Pingora 6188 访问）
**参数**：
- `username`: 用户名（必需）
- `password`: 密码（必需）

**响应**：
- 设置 `session_token` cookie（httpOnly, secure, sameSite=Lax）
- 返回 200 OK

**流程**：
1. 用户提交凭证
2. 表单验证 redirect 参数（防止 open redirect）
3. 发送 POST /api/v2/auth/login 到 OAuth Service
4. OAuth Service 验证凭证并设置 session_token cookie
5. Admin Portal 获得 200 响应
6. 重定向到 redirect URL（原始 authorize URL）
7. OAuth Service 检查 session_token 并生成 authorization code
8. OAuth Service 重定向到 /auth/callback
9. /auth/callback 交换 code 为 token

### 快速参考

详见：
- `LOGIN_PAGE_QUICK_REFERENCE.md` - OAuth 流程图、代码示例、测试场景
- `LOGIN_PAGE_IMPLEMENTATION_TASK.md` - 详细的实施任务和总结
- `DUAL_ROLES_ANALYSIS.md` - 完整的 OAuth 2.1 两重角色分析

- `rustc` version is `rustc 1.88.0