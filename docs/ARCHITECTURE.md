# 系统架构设计文档

> **版本**: 1.0
> **最后更新**: 2024-10-30
> **状态**: 生产就绪

## 文档概述

本文档提供 OAuth 2.1 认证中心的完整系统架构视图，包括核心组件、交互流程、技术选型和设计原则。

**目标读者**: 架构师、技术负责人、高级开发者

**相关文档**:
- [API 参考文档](./API_REFERENCE.md) - 完整的 API 端点规范
- [部署运维指南](./DEPLOYMENT.md) - 生产环境部署和运维
- [数据库设计](../DATABASE_DESIGN.md) - 数据模型和表结构
- [前端架构分析](../apps/admin-portal/FRONTEND_ARCHITECTURE_ANALYSIS.md) - Admin Portal 详细架构

---

## 目录

1. [系统概述](#系统概述)
2. [核心架构](#核心架构)
3. [技术栈](#技术栈)
4. [组件详解](#组件详解)
5. [业务流程](#业务流程)
6. [安全架构](#安全架构)
7. [性能与扩展性](#性能与扩展性)
8. [设计原则](#设计原则)
9. [部署架构](#部署架构)
10. [监控与可观测性](#监控与可观测性)

---

## 系统概述

### 系统定位

OAuth 2.1 认证中心是一个企业级的单点登录 (SSO) 和身份认证平台，为多个业务应用提供统一的认证和授权服务。

**核心功能**:
- ✅ OAuth 2.1 授权服务器（符合 RFC 标准）
- ✅ 基于角色的访问控制 (RBAC)
- ✅ 用户、角色、权限管理
- ✅ OAuth 客户端管理
- ✅ 审计日志和合规性
- ✅ 管理后台（Admin Portal）

### 业务价值

- **统一认证**: 一次登录，访问所有应用
- **权限集中管理**: 细粒度的权限控制
- **合规性**: 完整的审计日志和 GDPR 支持
- **可扩展性**: 支持第三方应用接入
- **安全性**: 行业标准的安全实践（OAuth 2.1 + PKCE）

### 系统边界

```
┌─────────────────────────────────────────────────────────────┐
│                    OAuth 2.1 认证中心                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Admin Portal │  │ OAuth Service│  │   Pingora    │     │
│  │  (Next.js)   │  │   (Rust)     │  │   Proxy      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                 │                  │              │
│         └─────────────────┴──────────────────┘              │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         ┌──────▼──────┐        ┌──────▼──────┐
         │ 第三方应用 1 │        │ 第三方应用 2 │
         │ (OAuth客户端)│        │ (OAuth客户端)│
         └─────────────┘        └─────────────┘
```

**内部组件**:
- Admin Portal: 管理后台和认证 UI
- OAuth Service: 核心授权服务（Rust 实现）
- Pingora Proxy: 统一网关和反向代理

**外部接口**:
- OAuth 2.1 标准端点（/authorize, /token, /userinfo 等）
- 管理 API（用户、角色、客户端管理）
- 审计日志查询接口

---

## 核心架构

### 整体架构图

```
                                    ┌──────────────────────────────────────┐
                                    │         用户 / 第三方应用             │
                                    └───────────────┬──────────────────────┘
                                                    │
                                    ┌───────────────▼──────────────────────┐
                                    │      Pingora Proxy (Port 6188)       │
                                    │   统一网关 / 反向代理 / 负载均衡      │
                                    └───────────┬──────────────┬───────────┘
                                                │              │
                        ┌───────────────────────┤              ├────────────────────────┐
                        │ /api/v2/*             │              │ /*                     │
                        │                       │              │                        │
          ┌─────────────▼─────────────┐         │    ┌─────────▼────────────┐          │
          │   OAuth Service (Rust)    │         │    │  Admin Portal (Next) │          │
          │      Port 3001            │         │    │      Port 3002       │          │
          │                           │         │    │                      │          │
          │  ┌─────────────────────┐ │         │    │  ┌────────────────┐ │          │
          │  │  Middleware Chain   │ │         │    │  │  proxy.ts      │ │          │
          │  │  ┌───────────────┐  │ │         │    │  │  (OAuth Flow)  │ │          │
          │  │  │ Rate Limiting │  │ │         │    │  └────────────────┘ │          │
          │  │  └───────┬───────┘  │ │         │    │                      │          │
          │  │  ┌───────▼───────┐  │ │         │    │  ┌────────────────┐ │          │
          │  │  │ Authentication│  │ │         │    │  │  React App     │ │          │
          │  │  └───────┬───────┘  │ │         │    │  │  (DDD Layout)  │ │          │
          │  │  ┌───────▼───────┐  │ │         │    │  └────────────────┘ │          │
          │  │  │  Permission   │  │ │         │    └──────────────────────┘          │
          │  │  └───────┬───────┘  │ │         │                                       │
          │  │  ┌───────▼───────┐  │ │         │                                       │
          │  │  │ Audit Logging │  │ │         │                                       │
          │  │  └───────────────┘  │ │         │                                       │
          │  └─────────────────────┘ │         │                                       │
          │                           │         │                                       │
          │  ┌─────────────────────┐ │         │                                       │
          │  │   Route Handlers    │ │         │                                       │
          │  │  ┌───────────────┐  │ │         │                                       │
          │  │  │ OAuth Routes  │  │ │         │                                       │
          │  │  │ Admin Routes  │  │ │         │                                       │
          │  │  │ Auth Routes   │  │ │         │                                       │
          │  │  └───────────────┘  │ │         │                                       │
          │  └─────────────────────┘ │         │                                       │
          │                           │         │                                       │
          │  ┌─────────────────────┐ │         │                                       │
          │  │   Service Layer     │ │         │                                       │
          │  │  ┌───────────────┐  │ │         │                                       │
          │  │  │ UserService   │  │ │         │                                       │
          │  │  │ TokenService  │  │ │         │                                       │
          │  │  │ ClientService │  │ │         │
          │  │  │ RBACService   │  │ │         │
          │  │  └───────────────┘  │ │         │
          │  └──────────┬──────────┘ │         │
          │             │             │         │
          └─────────────┼─────────────┘         │
                        │                       │
          ┌─────────────▼─────────────┐         │
          │   SQLx (Database ORM)     │         │
          │                           │         │
          │  ┌─────────────────────┐ │         │
          │  │  Connection Pool   │ │         │
          │  │  (Max 10 conns)    │ │         │
          │  └──────────┬──────────┘ │         │
          │             │             │         │
          └─────────────┼─────────────┘         │
                        │                       │
          ┌─────────────▼─────────────┐         │
          │   Database (SQLite/PG)    │         │
          │                           │         │
          │  ┌─────────────────────┐ │         │
          │  │  30 Tables          │ │         │
          │  │  - users            │ │         │
          │  │  - oauth_clients    │ │         │
          │  │  - access_tokens    │ │         │
          │  │  - refresh_tokens   │ │         │
          │  │  - roles/permissions│ │         │
          │  │  - audit_logs       │ │         │
          │  │  - ...              │ │         │
          │  └─────────────────────┘ │         │
          └───────────────────────────┘         │
```

### 架构分层

| 层级 | 组件 | 职责 | 技术 |
|------|------|------|------|
| **网关层** | Pingora Proxy | 路由、负载均衡、SSL终止 | Rust + Pingora |
| **表示层** | Admin Portal | UI展示、OAuth前端流程 | Next.js 16 + React 19 |
| **应用层** | OAuth Service Routes | API端点、请求处理 | Axum (Rust) |
| **业务层** | Service Layer | 业务逻辑、OAuth流程 | Rust + Async |
| **数据层** | SQLx + Database | 数据持久化、事务管理 | SQLx + SQLite/PostgreSQL |

### 核心设计模式

1. **三层架构**: 网关 → 应用 → 数据
2. **微服务架构**: 独立部署、独立扩展
3. **领域驱动设计 (DDD)**: 前端 features/ 目录结构
4. **中间件管道**: 请求处理链（Rate Limit → Auth → Permission → Audit）
5. **Repository 模式**: 数据访问抽象（UserRepository, TokenRepository 等）
6. **Service 模式**: 业务逻辑封装（UserService, TokenService 等）

---

## 技术栈

### 后端技术栈 (OAuth Service)

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **语言** | Rust | 1.88.0 | 高性能、内存安全 |
| **Web框架** | Axum | 0.7 | 异步 Web 框架 |
| **异步运行时** | Tokio | 1.x | 异步任务调度 |
| **数据库ORM** | SQLx | 0.7 | 类型安全的 SQL 查询 |
| **数据库** | SQLite / PostgreSQL | - | 开发/生产环境 |
| **JWT** | jsonwebtoken | 9.x | JWT 签名和验证 |
| **密码哈希** | argon2 | 0.5 | 密码安全存储 |
| **序列化** | serde + serde_json | 1.x | JSON 序列化 |
| **HTTP客户端** | reqwest | 0.11 | 外部 API 调用 |
| **日志** | tracing + tracing-subscriber | 0.1 | 结构化日志 |
| **错误处理** | anyhow + thiserror | 1.x | 错误传播和定义 |

### 前端技术栈 (Admin Portal)

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **框架** | Next.js | 16.0.0 | React 全栈框架 |
| **UI库** | React | 19.2.0 | 用户界面 |
| **语言** | TypeScript | 5.9 | 类型安全 |
| **样式** | TailwindCSS | 3.x | 原子化 CSS |
| **状态管理** | React Query + Context API | 5.x | 服务端/客户端状态 |
| **表单** | React Hook Form | 7.x | 表单验证 |
| **HTTP客户端** | Fetch API | - | API 请求 |
| **构建工具** | Turbopack | - | 快速构建 |

### 基础设施技术栈

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **反向代理** | Pingora | latest | 统一网关 |
| **Monorepo** | Turborepo | 2.x | 多包管理 |
| **包管理** | pnpm | 9.x | 依赖管理 |
| **容器化** | Docker + Docker Compose | - | 容器部署 |
| **进程管理** | Systemd | - | 生产环境进程管理 |
| **SSL/TLS** | Let's Encrypt + Certbot | - | HTTPS 证书 |
| **监控** | Prometheus + Grafana | - | 指标收集和可视化 |
| **日志** | Loki + Promtail | - | 日志聚合 |

### 技术选型理由

**为什么选择 Rust (OAuth Service)**:
- ✅ **性能**: 接近 C/C++ 的性能，低延迟响应
- ✅ **内存安全**: 编译时保证内存安全，无 GC 暂停
- ✅ **并发**: Async/Await 模型，高并发处理能力
- ✅ **类型安全**: 强类型系统，减少运行时错误
- ✅ **生态成熟**: Axum + Tokio + SQLx 生态完善

**为什么选择 Next.js 16 (Admin Portal)**:
- ✅ **React 19**: 最新的 React 特性（React Compiler、Server Actions）
- ✅ **Turbopack**: 比 Webpack 快 10 倍的构建速度
- ✅ **App Router**: 现代化的路由系统
- ✅ **TypeScript**: 类型安全的前端开发
- ✅ **开发体验**: 热更新、错误提示、开发工具

**为什么选择 SQLx (数据库)**:
- ✅ **编译时检查**: SQL 语句在编译时验证
- ✅ **类型安全**: 查询结果自动映射到 Rust 类型
- ✅ **异步**: 原生支持 Tokio 异步运行时
- ✅ **多数据库**: 支持 SQLite、PostgreSQL、MySQL
- ✅ **无 ORM 开销**: 直接执行 SQL，性能优异

**为什么选择 Pingora (网关)**:
- ✅ **性能**: Cloudflare 开源的高性能代理
- ✅ **Rust 实现**: 内存安全，无缓冲区溢出
- ✅ **灵活配置**: YAML 配置，支持热重载
- ✅ **现代化**: 原生支持 HTTP/2、TLS 1.3

---

## 组件详解

### 1. Pingora Proxy (统一网关)

**核心职责**:
- 统一入口点（端口 6188）
- 同域 Cookie 共享（localhost 域下）
- 路由转发（基于路径前缀）
- 负载均衡（Round Robin）
- SSL/TLS 终止
- 健康检查

**路由规则** (优先级从高到低):

```yaml
routes:
  # OAuth 2.1 标准端点 → oauth-service-rust (3001)
  - path: /api/v2/oauth/*
    backend: oauth-service-rust

  # 认证相关 API → oauth-service-rust (3001)
  - path: /api/v2/auth/*
    backend: oauth-service-rust

  # 管理 API → oauth-service-rust (3001)
  - path: /api/v2/admin/*
    backend: oauth-service-rust

  # 登录页面 → admin-portal (3002)
  - path: /login
    backend: admin-portal

  # OAuth 回调 → admin-portal (3002)
  - path: /auth/*
    backend: admin-portal

  # 授权确认页 → admin-portal (3002)
  - path: /oauth/consent
    backend: admin-portal

  # 默认路由 → admin-portal (3002)
  - path: /*
    backend: admin-portal
```

**配置文件**: `apps/pingora-proxy/config/default.yaml`

**健康检查**:
- 检查间隔: 5 秒
- 超时时间: 2 秒
- 失败阈值: 3 次连续失败后标记为不健康

**启动命令**:
```bash
cd apps/pingora-proxy && cargo run
```

---

### 2. OAuth Service (Rust 核心服务)

**核心职责**:
- OAuth 2.1 授权服务器
- 用户认证和会话管理
- JWT Token 签发和验证
- RBAC 权限控制
- 审计日志记录
- 管理 API 提供

**架构组成**:

```
oauth-service-rust/
├── src/
│   ├── app.rs              # 主应用入口和路由配置
│   ├── routes/             # API 路由处理
│   │   ├── oauth.rs        # OAuth 2.1 端点
│   │   ├── admin.rs        # 管理 API
│   │   └── auth.rs         # 认证端点
│   ├── services/           # 业务逻辑层
│   │   ├── user_service.rs
│   │   ├── token_service.rs
│   │   ├── client_service.rs
│   │   ├── rbac_service.rs
│   │   └── ...
│   ├── models/             # 数据模型
│   │   ├── user.rs
│   │   ├── token.rs
│   │   ├── client.rs
│   │   └── ...
│   ├── middleware/         # 中间件
│   │   ├── auth.rs         # JWT 验证
│   │   ├── permission.rs   # 权限检查
│   │   ├── rate_limit.rs   # 限流
│   │   └── audit.rs        # 审计日志
│   ├── utils/              # 工具函数
│   │   ├── jwt.rs
│   │   ├── crypto.rs
│   │   └── pkce.rs
│   └── db.rs               # 数据库连接池
├── migrations/             # 数据库迁移脚本
│   ├── 001_init.sql
│   ├── 002_seed_data.sql
│   └── 003_init_admin_portal_client.sql
└── Cargo.toml
```

**中间件执行顺序** (从外到内):

```
请求进入
  ↓
1. Rate Limiting (限流)
  ↓
2. Authentication (JWT 验证)
  ↓
3. Permission (权限检查)
  ↓
4. Audit Logging (审计记录)
  ↓
5. CORS (跨域处理)
  ↓
Route Handler (路由处理器)
  ↓
响应返回
```

**主要服务**:

| 服务 | 职责 | 主要方法 |
|------|------|----------|
| **UserService** | 用户管理 | create_user, get_user, update_user, delete_user, authenticate |
| **TokenService** | Token 管理 | generate_token, verify_token, refresh_token, revoke_token |
| **ClientService** | OAuth 客户端管理 | create_client, get_client, validate_redirect_uri |
| **RBACService** | 权限控制 | check_permission, get_user_roles, assign_role |
| **AuthorizationCodeService** | 授权码管理 | generate_code, verify_code, exchange_code |
| **PKCEService** | PKCE 验证 | verify_code_challenge |
| **AuditService** | 审计日志 | log_action, query_logs |

**数据库连接池配置**:
```rust
SqlitePool::builder()
    .max_connections(10)
    .min_connections(2)
    .acquire_timeout(Duration::from_secs(5))
    .idle_timeout(Duration::from_secs(600))
    .build(&database_url)
```

**JWT 配置**:
- **算法**: RS256 (生产) / HS256 (开发)
- **Access Token**: 1 小时有效期
- **Refresh Token**: 7 天有效期
- **密钥路径**: 环境变量 `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`

**启动命令**:
```bash
cd apps/oauth-service-rust && cargo run
```

---

### 3. Admin Portal (Next.js 前端应用)

**核心职责**:
- 管理后台 UI
- 用户登录界面
- OAuth 授权确认页面
- 用户、角色、客户端管理界面
- OAuth 客户端角色（第三方应用）

**架构组成**:

```
admin-portal/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 认证相关页面（布局分组）
│   │   ├── login/         # 登录页面
│   │   └── oauth/consent/ # 授权确认页
│   ├── auth/              # OAuth 回调处理
│   │   └── callback/      # /auth/callback
│   ├── admin/             # 管理后台页面
│   │   ├── users/
│   │   ├── roles/
│   │   ├── clients/
│   │   └── ...
│   └── api/               # API Routes (健康检查等)
├── features/              # DDD 业务模块
│   ├── user-management/
│   ├── role-management/
│   ├── client-management/
│   └── ...
├── components/            # 共享组件
│   ├── auth/              # 认证组件
│   ├── admin/             # 管理组件
│   └── ui/                # UI 基础组件
├── lib/                   # 工具函数
│   ├── api-client.ts      # API 客户端
│   ├── auth-utils.ts      # 认证工具
│   └── ...
├── types/                 # TypeScript 类型定义
│   └── auth.ts            # 认证相关类型
├── proxy.ts               # OAuth 流程中间件 (Node.js Runtime)
└── next.config.js
```

**DDD 分层架构**:

```
features/user-management/
├── domain/                # 领域层
│   ├── types.ts          # 领域类型
│   ├── validation.ts     # 领域验证
│   └── constants.ts      # 领域常量
├── infrastructure/        # 基础设施层
│   ├── api.ts            # API 调用
│   └── repository.ts     # 数据仓储
├── application/           # 应用层
│   ├── hooks.ts          # React Hooks
│   └── services.ts       # 应用服务
└── components/            # 表现层
    ├── UserList.tsx
    ├── UserForm.tsx
    └── UserDetail.tsx
```

**proxy.ts (OAuth 流程中间件)**:

```typescript
// 关键功能：
// 1. 检测受保护路由的认证状态
// 2. 自动生成 PKCE 参数 (state, code_verifier, code_challenge)
// 3. 重定向到 OAuth Service 的 /authorize 端点
// 4. 存储 PKCE 参数到 httpOnly cookies

export async function middleware(request: NextRequest) {
  // 检查是否为受保护路由
  if (isProtectedRoute(request.nextUrl.pathname)) {
    const token = request.cookies.get('access_token');

    if (!token) {
      // 未认证，启动 OAuth 流程
      return initiateOAuthFlow(request, request.nextUrl.pathname);
    }
  }

  return NextResponse.next();
}
```

**状态管理策略**:
- **服务端状态**: React Query (查询、缓存、重新验证)
- **客户端状态**: Context API (UI 状态、表单状态)
- **表单状态**: React Hook Form (表单验证、提交)
- **URL 状态**: Next.js Router (路由参数、查询字符串)

**启动命令**:
```bash
# 开发环境
cd apps/admin-portal && pnpm dev

# 生产环境
cd apps/admin-portal && pnpm build && pnpm start
```

---

## 业务流程

### OAuth 2.1 授权码流程 (完整流程)

```
┌─────────┐                                  ┌─────────────┐                 ┌──────────────┐
│  用户   │                                  │Admin Portal │                 │OAuth Service │
└────┬────┘                                  └──────┬──────┘                 └──────┬───────┘
     │                                              │                                │
     │ 1. 访问受保护页面                             │                                │
     │    GET /admin/users                          │                                │
     ├─────────────────────────────────────────────>│                                │
     │                                              │                                │
     │                                              │ 2. proxy.ts 检测无 token       │
     │                                              │    生成 PKCE 参数:             │
     │                                              │    - state (32字符)            │
     │                                              │    - code_verifier (128字符)   │
     │                                              │    - code_challenge (SHA256)   │
     │                                              │                                │
     │ 3. 重定向到 OAuth authorize                   │                                │
     │<─────────────────────────────────────────────┤                                │
     │ Location: /api/v2/oauth/authorize?           │                                │
     │   client_id=admin-portal-client&             │                                │
     │   redirect_uri=http://localhost:6188/auth/callback&                          │
     │   response_type=code&                        │                                │
     │   scope=openid+profile+email&                │                                │
     │   state=<state>&                             │                                │
     │   code_challenge=<challenge>&                │                                │
     │   code_challenge_method=S256                 │                                │
     │                                              │                                │
     │ 4. GET /api/v2/oauth/authorize               │                                │
     ├──────────────────────────────────────────────┼───────────────────────────────>│
     │                                              │                                │
     │                                              │ 5. 检查 session_token (无)     │
     │                                              │    存储授权请求到数据库         │
     │                                              │                                │
     │ 6. 重定向到登录页                             │                                │
     │<─────────────────────────────────────────────┼────────────────────────────────┤
     │ Location: /login?redirect=<authorize_url>    │                                │
     │                                              │                                │
     │ 7. GET /login?redirect=...                   │                                │
     ├─────────────────────────────────────────────>│                                │
     │                                              │                                │
     │ 8. 显示登录表单                               │                                │
     │<─────────────────────────────────────────────┤                                │
     │                                              │                                │
     │ 9. 提交用户名/密码                            │                                │
     │    POST /api/v2/auth/login                   │                                │
     ├──────────────────────────────────────────────┼───────────────────────────────>│
     │    { username, password }                    │                                │
     │                                              │                                │
     │                                              │ 10. 验证凭证 (Argon2)          │
     │                                              │     生成 session_token         │
     │                                              │     设置 httpOnly cookie       │
     │                                              │                                │
     │ 11. 200 OK + Set-Cookie: session_token       │                                │
     │<─────────────────────────────────────────────┼────────────────────────────────┤
     │                                              │                                │
     │ 12. 前端重定向到 redirect URL                 │                                │
     │     (原始 authorize URL)                     │                                │
     ├──────────────────────────────────────────────┼───────────────────────────────>│
     │ GET /api/v2/oauth/authorize?...              │                                │
     │ Cookie: session_token                        │                                │
     │                                              │                                │
     │                                              │ 13. 验证 session_token         │
     │                                              │     检查 client_id             │
     │                                              │     验证 redirect_uri          │
     │                                              │     生成 authorization_code    │
     │                                              │     存储 PKCE code_challenge   │
     │                                              │                                │
     │ 14. 重定向到回调 URL                          │                                │
     │<─────────────────────────────────────────────┼────────────────────────────────┤
     │ Location: /auth/callback?code=<code>&state=<state>                           │
     │                                              │                                │
     │ 15. GET /auth/callback?code=...&state=...    │                                │
     ├─────────────────────────────────────────────>│                                │
     │                                              │                                │
     │                                              │ 16. 验证 state 参数            │
     │                                              │     从 cookie 提取 code_verifier│
     │                                              │                                │
     │                                              │ 17. 交换 code 为 token         │
     │                                              │     POST /api/v2/oauth/token   │
     │                                              ├───────────────────────────────>│
     │                                              │ {                              │
     │                                              │   grant_type: "authorization_code",│
     │                                              │   code: "<code>",              │
     │                                              │   code_verifier: "<verifier>", │
     │                                              │   client_id: "...",            │
     │                                              │   redirect_uri: "..."          │
     │                                              │ }                              │
     │                                              │                                │
     │                                              │ 18. 验证 code                  │
     │                                              │     验证 code_verifier (PKCE)  │
     │                                              │     生成 JWT access_token      │
     │                                              │     生成 refresh_token         │
     │                                              │     存储 tokens 到数据库       │
     │                                              │                                │
     │                                              │ 19. 返回 tokens                │
     │                                              │<───────────────────────────────┤
     │                                              │ {                              │
     │                                              │   access_token: "<jwt>",       │
     │                                              │   token_type: "Bearer",        │
     │                                              │   expires_in: 3600,            │
     │                                              │   refresh_token: "<token>",    │
     │                                              │   scope: "openid profile email"│
     │                                              │ }                              │
     │                                              │                                │
     │                                              │ 20. 存储 tokens 到 cookie      │
     │                                              │     重定向到原始路径           │
     │                                              │                                │
     │ 21. 重定向到原始路径                          │                                │
     │<─────────────────────────────────────────────┤                                │
     │ Location: /admin/users                       │                                │
     │ Set-Cookie: access_token, refresh_token      │                                │
     │                                              │                                │
     │ 22. GET /admin/users                         │                                │
     │     Cookie: access_token                     │                                │
     ├─────────────────────────────────────────────>│                                │
     │                                              │                                │
     │                                              │ 23. proxy.ts 检测到 token      │
     │                                              │     允许请求继续               │
     │                                              │                                │
     │                                              │ 24. 调用 Admin API             │
     │                                              │     GET /api/v2/admin/users    │
     │                                              │     Authorization: Bearer <jwt>│
     │                                              ├───────────────────────────────>│
     │                                              │                                │
     │                                              │ 25. JWT 验证 (auth middleware) │
     │                                              │     权限检查 (permission middleware)│
     │                                              │     查询用户列表               │
     │                                              │     记录审计日志               │
     │                                              │                                │
     │                                              │ 26. 返回用户数据               │
     │                                              │<───────────────────────────────┤
     │                                              │ {                              │
     │                                              │   users: [...]                 │
     │                                              │ }                              │
     │                                              │                                │
     │ 27. 显示用户列表页面                          │                                │
     │<─────────────────────────────────────────────┤                                │
     │                                              │                                │
```

**关键步骤说明**:

1. **步骤 1-3**: proxy.ts 检测未认证用户，自动生成 PKCE 参数并重定向到 OAuth authorize
2. **步骤 4-6**: OAuth Service 检查 session_token，未登录则重定向到 /login
3. **步骤 7-11**: 用户登录，OAuth Service 验证凭证并设置 session_token cookie
4. **步骤 12-14**: 用户重新发起 authorize 请求，OAuth Service 验证会话并生成 authorization_code
5. **步骤 15-20**: Admin Portal 的 /auth/callback 处理授权码，交换为 access_token 和 refresh_token
6. **步骤 21-27**: 用户访问受保护资源，携带 access_token，OAuth Service 验证 JWT 并返回数据

### Token 刷新流程

```
┌─────────┐                  ┌─────────────┐                 ┌──────────────┐
│  用户   │                  │Admin Portal │                 │OAuth Service │
└────┬────┘                  └──────┬──────┘                 └──────┬───────┘
     │                              │                                │
     │ 1. API 请求 (token 过期)      │                                │
     ├─────────────────────────────>│                                │
     │                              │                                │
     │                              │ 2. 401 Unauthorized            │
     │                              │<───────────────────────────────┤
     │                              │                                │
     │                              │ 3. 检测到 401 错误             │
     │                              │    从 cookie 获取 refresh_token│
     │                              │                                │
     │                              │ 4. POST /api/v2/oauth/token    │
     │                              │    grant_type=refresh_token    │
     │                              ├───────────────────────────────>│
     │                              │                                │
     │                              │ 5. 验证 refresh_token          │
     │                              │    检查是否被撤销              │
     │                              │    检查是否过期                │
     │                              │    生成新 access_token         │
     │                              │    生成新 refresh_token        │
     │                              │    撤销旧 refresh_token        │
     │                              │                                │
     │                              │ 6. 返回新 tokens               │
     │                              │<───────────────────────────────┤
     │                              │                                │
     │                              │ 7. 更新 cookies                │
     │                              │    重试原始请求                │
     │                              │                                │
     │ 8. 返回数据                   │                                │
     │<─────────────────────────────┤                                │
     │                              │                                │
```

**Token 旋转 (Rotation) 安全机制**:
- 每次刷新时，旧的 refresh_token 被标记为已使用
- 如果已使用的 refresh_token 再次被使用，所有相关 tokens 被撤销（检测到 token 泄露）
- 新的 refresh_token 有新的过期时间（7 天）

### RBAC 权限检查流程

```
用户请求 API
  ↓
JWT 验证 (auth middleware)
  ↓ 提取 user_id
  ↓
权限检查 (permission middleware)
  ↓
查询用户角色 (user_roles 表)
  ↓
查询角色权限 (role_permissions 表)
  ↓
检查是否有所需权限
  ↓
┌──────────────┬──────────────┐
│ 有权限       │ 无权限       │
│ 继续处理     │ 403 Forbidden│
└──────────────┴──────────────┘
```

**权限命名约定**:
```
resource:action

示例:
- users:read       # 读取用户
- users:create     # 创建用户
- users:update     # 更新用户
- users:delete     # 删除用户
- roles:*          # 角色的所有操作
- *:*              # 超级管理员（所有权限）
```

**预设角色**:
- **super_admin**: 所有权限 (*:*)
- **admin**: 用户、角色、客户端管理
- **user_manager**: 仅用户管理
- **viewer**: 只读权限

---

## 安全架构

### 安全层次防护

```
┌────────────────────────────────────────────────────────┐
│ 1. 网络层安全                                          │
│    - TLS 1.3                                          │
│    - 强加密套件 (ECDHE-RSA-AES256-GCM-SHA384)         │
│    - HSTS (Strict-Transport-Security)                 │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 2. 网关层安全 (Pingora)                               │
│    - Rate Limiting (基于 IP)                          │
│    - DDoS 防护                                        │
│    - 恶意请求过滤                                      │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 3. 应用层安全 (OAuth Service Middleware)               │
│    - Rate Limiting (基于用户)                         │
│    - JWT 验证 (RS256 签名)                            │
│    - RBAC 权限检查                                    │
│    - CSRF 防护 (state 参数)                           │
│    - PKCE 强制验证 (S256 方法)                        │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 4. 业务逻辑安全 (Service Layer)                        │
│    - 输入验证和清理                                    │
│    - SQL 注入防护 (参数化查询)                         │
│    - XSS 防护 (输出转义)                              │
│    - 密码强度验证                                      │
│    - 登录失败限制 (5次后锁定15分钟)                    │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 5. 数据层安全 (Database)                              │
│    - 密码哈希 (Argon2id, 内存成本 19MB)               │
│    - Token 加密存储                                    │
│    - 敏感数据字段加密                                  │
│    - 数据库连接加密                                    │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 6. 审计和监控                                          │
│    - 所有操作记录审计日志                              │
│    - 异常行为检测和告警                                │
│    - Token 使用追踪                                    │
└────────────────────────────────────────────────────────┘
```

### 关键安全机制

#### 1. OAuth 2.1 安全增强

| 安全特性 | 实现 | 目的 |
|---------|------|------|
| **PKCE** | 强制 S256 方法 | 防止授权码拦截攻击 |
| **State 参数** | 随机 32 字符 | CSRF 防护 |
| **Redirect URI 严格匹配** | 完整 URL 匹配 | 防止开放重定向 |
| **授权码一次性** | 使用后立即删除 | 防止重放攻击 |
| **授权码短期有效** | 10 分钟有效期 | 减小攻击窗口 |
| **Refresh Token 旋转** | 使用后撤销旧 token | 检测 token 泄露 |

#### 2. JWT 安全配置

```rust
// JWT 签发配置
let claims = Claims {
    sub: user.id.to_string(),           // 用户 ID
    exp: now + 3600,                     // 1 小时过期
    iat: now,                            // 签发时间
    nbf: now,                            // 生效时间
    jti: generate_jti(),                 // JWT ID (唯一标识)
    aud: "admin-portal".to_string(),     // 受众
    iss: "oauth-service".to_string(),    // 签发者
    // 自定义声明
    permissions: user_permissions,       // 用户权限列表
    roles: user_roles,                   // 用户角色列表
};

// RS256 签名
let token = encode(
    &Header::new(Algorithm::RS256),
    &claims,
    &EncodingKey::from_rsa_pem(&private_key)?
)?;
```

**JWT 验证步骤**:
1. 验证签名 (RS256 公钥)
2. 验证过期时间 (exp)
3. 验证生效时间 (nbf)
4. 验证受众 (aud)
5. 验证签发者 (iss)
6. 检查 JTI 是否在黑名单中（已撤销的 token）

#### 3. 密码安全策略

```rust
// Argon2id 配置
let config = Config {
    variant: Variant::Argon2id,
    version: Version::Version13,
    mem_cost: 19456,      // 19 MB 内存成本
    time_cost: 2,         // 2 次迭代
    lanes: 1,             // 并行度
    secret: &[],
    ad: &[],
    hash_length: 32       // 32 字节输出
};

// 密码哈希
let hash = argon2::hash_encoded(
    password.as_bytes(),
    &salt,
    &config
)?;

// 密码验证
let matches = argon2::verify_encoded(&hash, password.as_bytes())?;
```

**密码要求**:
- 最小长度: 8 字符
- 必须包含: 大写字母、小写字母、数字
- 可选: 特殊符号
- 密码历史: 不能重复最近 5 次使用的密码

#### 4. Rate Limiting 策略

**全局限流** (Pingora 网关层):
```
- 每 IP: 1000 请求/分钟
- 每 IP: 10000 请求/小时
```

**用户限流** (OAuth Service 中间件):
```
- 登录端点: 5 次失败后锁定 15 分钟
- Token 端点: 10 请求/分钟/用户
- 管理 API: 100 请求/分钟/用户
```

**实现**:
```rust
// 基于 Redis 的滑动窗口限流
async fn check_rate_limit(
    redis: &RedisPool,
    key: &str,
    limit: u32,
    window: u64
) -> Result<bool> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let window_start = now - window;

    // 移除过期的计数
    redis.zremrangebyscore(key, 0, window_start).await?;

    // 获取当前计数
    let count: u32 = redis.zcard(key).await?;

    if count >= limit {
        return Ok(false); // 超出限制
    }

    // 记录当前请求
    redis.zadd(key, now, now).await?;
    redis.expire(key, window).await?;

    Ok(true)
}
```

#### 5. 审计日志

**记录内容**:
```rust
struct AuditLog {
    id: i64,
    user_id: Option<i64>,        // 操作用户（可能为空，如登录失败）
    action: String,              // 操作类型 (LOGIN, CREATE_USER, etc.)
    resource_type: String,       // 资源类型 (user, role, client, etc.)
    resource_id: Option<String>, // 资源 ID
    ip_address: String,          // 客户端 IP
    user_agent: String,          // User-Agent
    request_data: Option<Value>, // 请求数据（敏感字段已脱敏）
    response_status: i32,        // HTTP 状态码
    error_message: Option<String>, // 错误信息
    created_at: DateTime<Utc>,   // 操作时间
}
```

**关键操作审计**:
- ✅ 用户登录/登出
- ✅ 用户创建/更新/删除
- ✅ 角色和权限变更
- ✅ OAuth 客户端创建/更新
- ✅ Token 签发和撤销
- ✅ 敏感配置修改
- ✅ API 调用失败（401, 403, 500 等）

**日志保留策略**:
- 审计日志: 永久保留（或按合规要求）
- 访问日志: 90 天
- 错误日志: 180 天

#### 6. Cookie 安全配置

```typescript
// Admin Portal cookies
const cookieOptions = {
  httpOnly: true,              // 防止 XSS 攻击
  secure: true,                // 仅 HTTPS 传输（生产环境）
  sameSite: 'lax' as const,   // CSRF 防护
  path: '/',
  maxAge: 3600,                // 1 小时（access_token）
  // maxAge: 604800,           // 7 天（refresh_token）
};
```

```rust
// OAuth Service session_token cookie
Cookie::build("session_token", session_token)
    .http_only(true)
    .secure(true)              // 生产环境
    .same_site(SameSite::Lax)
    .path("/")
    .max_age(Duration::hours(24))
    .finish()
```

---

## 性能与扩展性

### 性能指标目标

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| **API 响应时间 (P50)** | < 50ms | Prometheus + Grafana |
| **API 响应时间 (P99)** | < 200ms | Prometheus + Grafana |
| **Token 签发延迟** | < 100ms | 专用指标 |
| **并发用户数** | 10,000+ | 负载测试 |
| **吞吐量** | 5,000 RPS | 压力测试 |
| **数据库查询时间** | < 20ms (P99) | SQLx instrumentation |
| **内存使用** | < 512MB (单实例) | 进程监控 |

### 性能优化策略

#### 1. 数据库优化

**索引策略**:
```sql
-- 用户查询优化
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status_created ON users(status, created_at DESC);

-- Token 查询优化
CREATE INDEX idx_access_tokens_token ON access_tokens(token);
CREATE INDEX idx_access_tokens_user_expires ON access_tokens(user_id, expires_at);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- 审计日志查询优化
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_created ON audit_logs(action, created_at DESC);

-- RBAC 查询优化
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
```

**连接池配置**:
```rust
SqlitePool::builder()
    .max_connections(10)       // 最大连接数
    .min_connections(2)        // 最小连接数
    .acquire_timeout(Duration::from_secs(5))  // 获取连接超时
    .idle_timeout(Duration::from_secs(600))   // 空闲连接超时
    .max_lifetime(Duration::from_secs(1800))  // 连接最大生命周期
    .build(&database_url)
```

**查询优化**:
- ✅ 使用编译时验证的 SQL 查询（SQLx 宏）
- ✅ 批量操作使用事务
- ✅ 避免 N+1 查询（JOIN 或批量加载）
- ✅ 分页查询（LIMIT + OFFSET 或游标）

#### 2. 缓存策略

**多层缓存**:

```
┌─────────────────────────────────────────┐
│ L1: 进程内缓存 (HashMap + LRU)          │
│  - JWT 公钥 (永久)                      │
│  - OAuth 客户端配置 (5分钟 TTL)         │
│  - 用户权限 (1分钟 TTL)                 │
└─────────────────┬───────────────────────┘
                  │ Miss
┌─────────────────▼───────────────────────┐
│ L2: Redis 缓存                          │
│  - 用户会话 (24小时 TTL)                │
│  - 授权码 (10分钟 TTL)                  │
│  - Rate Limit 计数器 (滑动窗口)         │
│  - Token 黑名单 (直到过期)              │
└─────────────────┬───────────────────────┘
                  │ Miss
┌─────────────────▼───────────────────────┐
│ L3: 数据库 (SQLite/PostgreSQL)          │
│  - 用户数据                             │
│  - Tokens                               │
│  - 审计日志                             │
└─────────────────────────────────────────┘
```

**缓存失效策略**:
- **主动失效**: 数据更新时立即失效相关缓存
- **被动失效**: TTL 过期自动清除
- **缓存预热**: 应用启动时加载热数据（OAuth 客户端等）

#### 3. 异步处理

**Tokio 异步运行时**:
```rust
#[tokio::main]
async fn main() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)           // 4 个工作线程
        .thread_name("oauth-worker")
        .enable_all()
        .build()
        .unwrap();

    runtime.block_on(async {
        // 应用启动
    });
}
```

**异步操作**:
- ✅ 所有数据库查询（SQLx async）
- ✅ 所有 HTTP 请求（reqwest async）
- ✅ 审计日志写入（异步任务）
- ✅ Token 过期清理（定时任务）

**后台任务**:
```rust
// Token 清理任务 (每小时执行一次)
tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(3600));
    loop {
        interval.tick().await;
        cleanup_expired_tokens(&db).await;
    }
});

// 审计日志归档 (每天执行一次)
tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(86400));
    loop {
        interval.tick().await;
        archive_old_audit_logs(&db).await;
    }
});
```

#### 4. 水平扩展架构

**无状态设计**:
- ✅ JWT 自包含认证信息（无需会话存储）
- ✅ 所有状态存储在数据库或 Redis
- ✅ 应用实例完全无状态

**负载均衡配置** (Pingora):
```yaml
upstreams:
  oauth-service-rust:
    servers:
      - address: 127.0.0.1:3001
        weight: 1
      - address: 127.0.0.1:3011  # 第二个实例
        weight: 1
      - address: 127.0.0.1:3021  # 第三个实例
        weight: 1
    load_balancing:
      algorithm: round_robin      # 轮询
      health_check:
        interval: 5s
        timeout: 2s
        healthy_threshold: 2
        unhealthy_threshold: 3
```

**扩展策略**:

| 组件 | 扩展方式 | 瓶颈指标 |
|------|----------|----------|
| **OAuth Service** | 水平扩展 (多实例) | CPU > 70%, 响应时间 > 200ms |
| **Admin Portal** | 水平扩展 (多实例) | 并发连接数 > 5000 |
| **Pingora Proxy** | 主从 + VIP (高可用) | 网络带宽 > 80% |
| **PostgreSQL** | 主从复制 + 读写分离 | QPS > 10000, 连接数 > 80 |
| **Redis** | 哨兵模式 / 集群模式 | 内存 > 80%, QPS > 50000 |

#### 5. 资源限制和隔离

**进程资源限制** (Systemd):
```ini
[Service]
# CPU 限制 (2 个核心)
CPUQuota=200%

# 内存限制 (1GB)
MemoryMax=1G
MemoryHigh=800M

# 文件描述符限制
LimitNOFILE=10000

# 进程数限制
LimitNPROC=100
```

**数据库资源隔离**:
```sql
-- PostgreSQL 资源组
CREATE ROLE oauth_app;
ALTER ROLE oauth_app SET statement_timeout = '30s';
ALTER ROLE oauth_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE oauth_app CONNECTION LIMIT 50;
```

---

## 设计原则

### 1. SOLID 原则

| 原则 | 实现 | 示例 |
|------|------|------|
| **单一职责 (SRP)** | 每个 Service 负责单一业务领域 | UserService 只处理用户相关逻辑 |
| **开闭原则 (OCP)** | 通过 trait 扩展功能 | Repository trait 可多种实现 |
| **里氏替换 (LSP)** | 所有 Repository 实现可互换 | SQLite/PostgreSQL 透明切换 |
| **接口隔离 (ISP)** | 细粒度的 Service 方法 | 不强迫客户端依赖不需要的方法 |
| **依赖倒置 (DIP)** | 依赖抽象而非实现 | Service 依赖 trait 而非具体类型 |

### 2. 安全优先

- **默认安全**: 所有端点默认需要认证
- **最小权限**: 用户只有必要的最小权限
- **深度防御**: 多层安全控制（网络、应用、数据）
- **审计一切**: 所有关键操作记录审计日志
- **安全编码**: 输入验证、输出转义、参数化查询

### 3. 性能优先

- **异步优先**: 所有 I/O 操作异步化
- **缓存优先**: 热数据缓存，减少数据库访问
- **批量优先**: 批量操作使用事务和批量查询
- **索引优先**: 所有查询条件字段建立索引
- **资源限制**: 连接池、并发限制、超时控制

### 4. 可观测性

- **日志完整**: 结构化日志，包含请求 ID、用户 ID、操作类型
- **指标全面**: CPU、内存、响应时间、错误率、QPS
- **追踪详细**: 分布式追踪，查看请求完整链路
- **告警及时**: 关键指标异常立即告警

### 5. 可维护性

- **代码清晰**: 命名规范、注释完整、结构清晰
- **测试覆盖**: 单元测试、集成测试、E2E 测试
- **文档完善**: 架构文档、API 文档、部署文档
- **版本管理**: 语义化版本、数据库迁移版本控制

---

## 部署架构

### 单服务器部署

```
┌────────────────────────────────────────────────────────┐
│                   单台服务器                            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Pingora Proxy (6188)                             │ │
│  │  - SSL 终止                                      │ │
│  │  - 反向代理                                      │ │
│  └─────────┬─────────────────┬──────────────────────┘ │
│            │                 │                         │
│  ┌─────────▼────────┐  ┌────▼──────────────────────┐ │
│  │ OAuth Service    │  │ Admin Portal              │ │
│  │ (Port 3001)      │  │ (Port 3002)               │ │
│  │ - Systemd 管理   │  │ - Systemd 管理            │ │
│  └─────────┬────────┘  └───────────────────────────┘ │
│            │                                           │
│  ┌─────────▼────────────────────────────────────────┐ │
│  │ PostgreSQL (Port 5432)                           │ │
│  │  - 本地数据库                                    │ │
│  │  - 自动备份                                      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Redis (Port 6379)                                │ │
│  │  - 会话存储                                      │ │
│  │  - Rate Limiting                                 │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
└────────────────────────────────────────────────────────┘
```

**适用场景**: 开发/测试环境，小规模部署（< 1000 用户）

### 高可用集群部署

```
                    ┌──────────────┐
                    │ Load Balancer│
                    │   (Keepalived│
                    │    + HAProxy)│
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼────────┐
│  Server 1       │ │  Server 2   │ │  Server 3      │
│                 │ │              │ │                │
│ Pingora Proxy   │ │ Pingora Proxy│ │ Pingora Proxy  │
│ OAuth Service   │ │ OAuth Service│ │ OAuth Service  │
│ Admin Portal    │ │ Admin Portal │ │ Admin Portal   │
└────────┬────────┘ └──────┬───────┘ └───────┬────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼────────┐
│ PostgreSQL      │ │ PostgreSQL  │ │ PostgreSQL     │
│ Primary         │ │ Standby     │ │ Standby        │
│ (Read/Write)    │ │ (Read Only) │ │ (Read Only)    │
└─────────────────┘ └─────────────┘ └────────────────┘

┌──────────────────────────────────────────────────────┐
│ Redis Sentinel Cluster                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│  │ Master  │  │ Slave 1 │  │ Slave 2 │             │
│  └─────────┘  └─────────┘  └─────────┘             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│  │Sentinel1│  │Sentinel2│  │Sentinel3│             │
│  └─────────┘  └─────────┘  └─────────┘             │
└──────────────────────────────────────────────────────┘
```

**适用场景**: 生产环境，高可用要求（> 10000 用户）

**关键特性**:
- ✅ 无单点故障
- ✅ 自动故障转移
- ✅ 读写分离
- ✅ 水平扩展能力

### Docker 容器化部署

详见 [部署运维指南 - Docker 部署](./DEPLOYMENT.md#docker-部署架构)

---

## 监控与可观测性

### 监控架构

```
┌──────────────────────────────────────────────────────────┐
│                   应用层 (Metrics Export)                 │
│                                                           │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ OAuth Service │  │ Admin Portal  │  │ Pingora Proxy│ │
│  │ /metrics      │  │ /api/metrics  │  │ /metrics     │ │
│  └───────┬───────┘  └───────┬───────┘  └──────┬───────┘ │
└──────────┼──────────────────┼──────────────────┼─────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Prometheus      │
                    │ (指标收集和存储)   │
                    └─────────┬─────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
  ┌────────▼────────┐ ┌───────▼──────┐ ┌────────▼────────┐
  │    Grafana      │ │ AlertManager │ │  Prometheus     │
  │  (可视化看板)    │ │  (告警管理)   │ │   (查询)        │
  └─────────────────┘ └───────┬──────┘ └─────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ 通知渠道           │
                    │ - Email           │
                    │ - Slack           │
                    │ - PagerDuty       │
                    └───────────────────┘
```

### 关键指标

#### 1. 应用指标

**OAuth Service**:
```
# HTTP 请求指标
oauth_http_requests_total{method, path, status}       # 请求总数
oauth_http_request_duration_seconds{method, path}     # 请求延迟分布

# Token 指标
oauth_tokens_issued_total{token_type}                 # 签发的 token 数量
oauth_tokens_revoked_total{token_type}                # 撤销的 token 数量
oauth_token_validation_duration_seconds               # Token 验证延迟

# 认证指标
oauth_login_attempts_total{status}                    # 登录尝试次数
oauth_login_failures_total{reason}                    # 登录失败次数
oauth_active_sessions                                 # 活跃会话数

# 数据库指标
oauth_db_connections_active                           # 活跃数据库连接
oauth_db_connections_idle                             # 空闲数据库连接
oauth_db_query_duration_seconds{query}                # 查询延迟

# 缓存指标
oauth_cache_hits_total{cache_name}                    # 缓存命中次数
oauth_cache_misses_total{cache_name}                  # 缓存未命中次数
oauth_cache_size_bytes{cache_name}                    # 缓存大小
```

**Admin Portal**:
```
admin_http_requests_total{method, path, status}
admin_http_request_duration_seconds{method, path}
admin_page_load_time_seconds{page}
admin_api_errors_total{endpoint, error_type}
```

**Pingora Proxy**:
```
pingora_requests_total{backend, status}
pingora_request_duration_seconds{backend}
pingora_backend_connections_active{backend}
pingora_backend_health_status{backend}
```

#### 2. 系统指标

```
# CPU
node_cpu_seconds_total{mode}
process_cpu_seconds_total

# 内存
node_memory_MemTotal_bytes
node_memory_MemAvailable_bytes
process_resident_memory_bytes

# 磁盘
node_disk_io_time_seconds_total
node_filesystem_avail_bytes

# 网络
node_network_receive_bytes_total
node_network_transmit_bytes_total
```

### 日志架构

```
┌──────────────────────────────────────────────────────────┐
│                   应用层 (Logs)                          │
│                                                           │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐ │
│  │ OAuth Service │  │ Admin Portal  │  │ Pingora Proxy│ │
│  │ (STDOUT)      │  │ (STDOUT)      │  │ (STDOUT)     │ │
│  └───────┬───────┘  └───────┬───────┘  └──────┬───────┘ │
└──────────┼──────────────────┼──────────────────┼─────────┘
           │                  │                  │
  ┌────────▼──────────────────▼──────────────────▼────────┐
  │                    Promtail                            │
  │            (日志采集和标签化)                           │
  └────────────────────────┬───────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │      Loki       │
                  │   (日志存储)     │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │    Grafana      │
                  │ (日志查询和展示) │
                  └─────────────────┘
```

**日志级别**:
- **ERROR**: 错误事件（需要立即关注）
- **WARN**: 警告事件（可能的问题）
- **INFO**: 常规信息事件（业务流程）
- **DEBUG**: 详细调试信息（仅开发/调试）
- **TRACE**: 最详细的追踪信息（性能分析）

**结构化日志格式** (JSON):
```json
{
  "timestamp": "2024-10-30T10:30:45.123Z",
  "level": "INFO",
  "target": "oauth_service::routes::oauth",
  "message": "User logged in successfully",
  "request_id": "req_abc123",
  "user_id": 42,
  "ip_address": "192.168.1.100",
  "duration_ms": 45
}
```

### 告警规则

**关键告警**:

```yaml
# OAuth Service 高错误率
- alert: OAuthServiceHighErrorRate
  expr: rate(oauth_http_requests_total{status=~"5.."}[5m]) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "OAuth Service 错误率过高"
    description: "OAuth Service 5xx 错误率超过 5%，持续 5 分钟"

# OAuth Service 高延迟
- alert: OAuthServiceHighLatency
  expr: histogram_quantile(0.99, oauth_http_request_duration_seconds) > 1.0
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "OAuth Service 响应延迟过高"
    description: "P99 响应时间超过 1 秒，持续 10 分钟"

# 数据库连接池耗尽
- alert: DatabaseConnectionPoolExhausted
  expr: oauth_db_connections_active / oauth_db_connections_max > 0.9
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "数据库连接池接近耗尽"
    description: "数据库连接使用率超过 90%"

# 磁盘空间不足
- alert: DiskSpaceLow
  expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "磁盘空间不足"
    description: "可用磁盘空间低于 10%"

# 内存使用过高
- alert: HighMemoryUsage
  expr: process_resident_memory_bytes / node_memory_MemTotal_bytes > 0.8
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "内存使用过高"
    description: "进程内存使用超过 80%"

# 登录失败率过高
- alert: HighLoginFailureRate
  expr: rate(oauth_login_failures_total[5m]) > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "登录失败率异常"
    description: "可能存在暴力破解攻击"
```

### Grafana 看板

**推荐看板**:

1. **OAuth Service 概览**
   - 请求总量和错误率
   - 响应时间分布 (P50, P95, P99)
   - Token 签发和撤销趋势
   - 登录成功/失败率
   - 数据库连接池状态

2. **系统资源**
   - CPU 使用率（所有核心）
   - 内存使用率（RSS, Heap）
   - 磁盘 I/O
   - 网络流量

3. **数据库性能**
   - QPS (Queries Per Second)
   - 查询延迟分布
   - 慢查询日志
   - 连接数趋势

4. **安全审计**
   - 登录失败尝试（按 IP 分组）
   - Token 撤销事件
   - 权限拒绝事件
   - 可疑活动检测

---

## 总结

### 核心优势

✅ **标准合规**: 100% 符合 OAuth 2.1 规范，兼容主流 OAuth 客户端
✅ **高性能**: Rust + 异步 + 多层缓存，毫秒级响应
✅ **安全可靠**: 多层安全防护，PKCE + JWT + RBAC
✅ **易扩展**: 无状态设计，水平扩展能力强
✅ **可观测**: 完整的监控、日志、追踪体系
✅ **易维护**: 清晰的架构、完善的文档、自动化部署

### 技术亮点

- **Rust 高性能后端**: 内存安全 + 零成本抽象 + 异步并发
- **Next.js 16 现代前端**: React 19 + Turbopack + App Router
- **Pingora 统一网关**: Cloudflare 开源，生产验证
- **SQLx 类型安全 ORM**: 编译时 SQL 验证，无运行时开销
- **完整的 OAuth 2.1**: PKCE + Token 旋转 + Refresh Token
- **企业级 RBAC**: 灵活的角色权限模型
- **生产级监控**: Prometheus + Grafana + Loki

### 适用场景

✅ **企业内部 SSO**: 统一认证入口，多应用单点登录
✅ **SaaS 平台**: 为第三方应用提供 OAuth 授权
✅ **API 网关**: 集中化的 API 认证和授权
✅ **微服务架构**: 作为认证中心，服务间认证
✅ **移动应用后端**: 原生支持 PKCE，安全移动认证

### 后续优化方向

- [ ] 实现 OAuth 2.0 Device Flow（设备授权流程）
- [ ] 支持 OpenID Connect (OIDC) 协议
- [ ] 集成 WebAuthn (无密码认证)
- [ ] 支持多因素认证 (MFA/2FA)
- [ ] 实现动态客户端注册 (RFC 7591)
- [ ] 支持 JWT-secured Authorization Request (JAR)
- [ ] 集成外部身份提供商 (Google, GitHub, etc.)
- [ ] 实现基于属性的访问控制 (ABAC)
- [ ] GraphQL API 支持
- [ ] gRPC 服务间通信

---

## 附录

### 相关文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| **项目说明** | `/README.md` | 项目概览和快速开始 |
| **技术指南** | `/CLAUDE.md` | 开发规范和技术栈说明 |
| **API 参考** | `/docs/API_REFERENCE.md` | 完整的 API 端点文档 |
| **部署指南** | `/docs/DEPLOYMENT.md` | 生产环境部署和运维 |
| **数据库设计** | `/DATABASE_DESIGN.md` | 数据模型和表结构 |
| **前端架构** | `/apps/admin-portal/FRONTEND_ARCHITECTURE_ANALYSIS.md` | Admin Portal 详细架构 |

### 术语表

| 术语 | 全称 | 说明 |
|------|------|------|
| **OAuth 2.1** | OAuth 2.1 Authorization Framework | 开放授权标准（2.0 的简化和安全增强版本） |
| **PKCE** | Proof Key for Code Exchange | 授权码交换的证明密钥 |
| **JWT** | JSON Web Token | 基于 JSON 的安全令牌 |
| **RBAC** | Role-Based Access Control | 基于角色的访问控制 |
| **SSO** | Single Sign-On | 单点登录 |
| **OIDC** | OpenID Connect | 基于 OAuth 2.0 的身份层 |
| **CORS** | Cross-Origin Resource Sharing | 跨域资源共享 |
| **CSRF** | Cross-Site Request Forgery | 跨站请求伪造 |
| **XSS** | Cross-Site Scripting | 跨站脚本攻击 |
| **DDoS** | Distributed Denial of Service | 分布式拒绝服务攻击 |
| **HSTS** | HTTP Strict Transport Security | HTTP 严格传输安全 |
| **ORM** | Object-Relational Mapping | 对象关系映射 |
| **DDD** | Domain-Driven Design | 领域驱动设计 |

---

**文档维护**: 本文档应随系统架构变更保持更新。
**版本历史**: 参见 Git 提交历史。
**联系方式**: 技术支持请提交 Issue 到项目仓库。
