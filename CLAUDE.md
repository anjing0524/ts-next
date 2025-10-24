# 项目技术指南

## 架构服务

| 服务             | 功能                   | 端口 | 访问方式 |
| ---------------- | ---------------------- | ---- | -------- |
| oauth-service    | OAuth 2.1服务          | 3001 | 通过 Pingora (6188) |
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
pnpm dev               # 启动所有服务
pnpm --filter=oauth-service dev  # 启动指定服务
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

- 前端: Next.js, React, TypeScript, TailwindCSS
- 后端: Node.js, Prisma, JWT
- 性能: Rust/WASM, Pingora代理, uWebSockets.js
- 数据序列化: FlatBuffers
- 测试: Jest, Playwright
- 工程: TurboRepo, pnpm

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

**核心原则** (2024-10-24 重构后)：
- **第三方客户端模式**：Admin Portal 作为标准的 OAuth 2.1 第三方客户端，不参与认证决策
- **中间件驱动 OAuth**：`middleware.ts` 在检测到受保护路由无 token 时，**直接启动 OAuth authorize 流程**
- **登录完全由 OAuth 驱动**：/login 页面仅通过 OAuth Service 的 authorize 端点重定向到达
- **安全验证**：/login 页面验证 redirect 参数必须指向合法的 OAuth /authorize 端点

**当前认证流程** (新的第三方客户端模式)：

```
标准 OAuth 2.1 授权码流程（带 PKCE）- 第三方客户端模式：

用户访问受保护页面 (e.g., /admin/users)
  ↓
middleware.ts 检测无有效 token
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
| `/api/v2/oauth/*` | oauth-service (3001) | OAuth 2.1 标准端点 |
| `/api/v2/auth/*` | oauth-service (3001) | 认证相关 API |
| `/api/v2/admin/*` | oauth-service (3001) | 管理 API |
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

## 开发注意事项

- 更新代码的时候记得实时更新Claude.md
- 保持中文对话
- OAuth SSO 集成相关修改：见 `OAUTH_2_1_SSO_IMPLEMENTATION_SUMMARY.md`
- 自动化测试：见 `OAUTH_2_1_E2E_TESTING.md`
- Login 页面实现：见 `LOGIN_PAGE_QUICK_REFERENCE.md` 和 `LOGIN_PAGE_IMPLEMENTATION_TASK.md`

## Login 页面实现

### 核心文件
- **Login 页面**：`apps/admin-portal/app/(auth)/login/page.tsx`
- **表单组件**：`apps/admin-portal/components/auth/username-password-form.tsx`

### 关键实现

**Login 页面**：
- 使用 `useSearchParams` 提取 `redirect` 参数
- 根据 `redirect` 参数显示不同的用户提示
- 传递所有参数给表单组件

**表单组件**：
- 使用 `HiddenFields` 组件自动传递所有 URL 参数（包括 redirect）
- 表单 action 指向 OAuth 服务的 `/api/v2/auth/login` 端点
- 使用标准 form submission 确保 cookie 正确传递

### OAuth Login 端点

**端点**：`POST /api/v2/auth/login`
**参数**：
- `username`: 用户名
- `password`: 密码
- `redirect`: 可选，登录成功后重定向的 URL（通常是原始的 authorize URL）

**响应**：
- 设置 `session_token` cookie
- 重定向回 `redirect` URL（如果提供）或首页

### 快速参考

详见：
- `LOGIN_PAGE_QUICK_REFERENCE.md` - OAuth 流程图、代码示例、测试场景
- `LOGIN_PAGE_IMPLEMENTATION_TASK.md` - 详细的实施任务和总结

- `rustc` version is `rustc 1.88.0