# 项目文档库

**文档版本**: v3.1.0
**创建日期**: 2025-01-28
**最后更新**: 2025-07-08
**维护团队**: 开发团队
**状态**: 正式版 - 核心功能已完成

## 项目概述

本项目是基于 **Turborepo** 的 **OAuth2.1 认证授权中心和微服务平台**，采用现代化技术栈构建企业级身份认证和授权解决方案。

### 核心特性

- **高性能网关**: 基于 Rust 和 Pingora 的高性能反向代理。
- **标准 OAuth2.1 + OIDC**: 完全符合最新的 OAuth 2.1 和 OpenID Connect 规范。
- **强制 PKCE**: 增强公共客户端的安全性，有���防止授权码拦截攻击。
- **现代化技术栈**: Next.js 15, React 19, TypeScript 5, Prisma 6。
- **企业级 RBAC**: 支持灵活的基于角色的访问控制。
- **微服务架构**: 采用 Turborepo 管理的 Monorepo，实现服务间松耦合、高可扩展。
- **统一监控与可观测性**: 集成 Prometheus, Grafana, 和 Distributed Tracing (B3 Propagation)。
- **内网环境优化**: 专为企业内网环境设计，注重安全与性能。

### 技术栈概览

- **网关层**: Rust, Pingora
- **前端**: Next.js, React, TypeScript, TailwindCSS
- **后端**: Node.js, Next.js API Routes
- **数据库**: Prisma, SQLite (开发), MySQL (生产)
- **认证与安全**: OAuth2.1, OIDC, JWT (jose), bcrypt
- **构建与管理**: Turborepo, PNPM, Docker, Cargo
- **测试**: Jest, Playwright, Testing Library
- **日志与监控**: Winston, Prometheus, Grafana

## 微服务应用

| 服务名称 | 端口 | 描述 |
|---|---|---|
| `pingora-proxy` | `8080` | **高性能反向代理网关**，作为所有服务的统一入口，负责路由、负载均衡和监控。 |
| `oauth-service` | `3001` | **OAuth2.1 认证授权核心服务**，处理用户认证、令牌颁发、客户端管理和权限控制。 |
| `admin-portal` | `3002` | **系统管理后台**，提供用户、角色、权限和客户端的可视化管理���面。 |
| `kline-service` | `3003` | **K线图服务**，提供数据可视化功能，包括实时数据处理和图表渲染。 |
| `flow-service` | `3004` | **工作流服务**，支持业务流程的可视化设计、执行和状态管理。 |
| `test-service` | `3005` | 用于集成和功能测试的示例服务。 |

## 核心文档导航

| 文档名称 | 描述 | 状态 |
|---|---|---|
| [技术栈版本对照表](./技术栈版本对照表-2025-07-08.md) | 项目所有依赖的详细版本信息和标准化建议。 | ✅ 已更新 |
| [系统架构设计](./design/系统架构设计.md) | 基于 Turborepo 的微服务架构、服务间通信和数据流设计。 | ✅ 已更新 |
| [OAuth 服务 API 索引](./generated/oauth-service-api-index.md) | `oauth-service` 的完整 API 端点、请求/响应格式和安全说明。 | ✅ 已更新 |
| [API 设计规范](./guidelines/API设计规范.md) | 项目统一的 RESTful API 设计标准和最佳实践。 | ✅ 已更新 |
| [JWT 认证授权使用说明](./guidelines/JWT认证授权使用说明.md) | 关于如何与 OAuth2.1 流程集成以及如何处理 JWT 的开发者指南。 | ⚪️ 待审查 |
| [部署与运维文档](./ops/部署运维文档.md) | 关于如何使用 Docker 和 K8s 部署、配置和维护本系统的指南。 | ⏳ 待更新 |
| [测试策略文档](./tests/测试策略文档.md) | 项目的单元测试、集成测试和端到端（E2E）测试策略。 | ⚪️ 待审查 |
| [文档更新清单](./文档更新清单-2025-07-07.md) | 跟踪每日文档变更的清单。 | ✅ 已更新 |

## 快速入门

### 1. 环境准备
- 安装 [Node.js](https://nodejs.org/) (版本请参考 `.node-version` 文件)
- 安装 [pnpm](https://pnpm.io/) (版本请参考 `package.json` 中的 `packageManager` 字段)
- 安装 [Rust](https://www.rust-lang.org/tools/install) 和 `cargo`

### 2. 安装与启动
```bash
# 克隆项目
git clone <repository-url>
cd ts-next-template

# 安装所有依赖
pnpm install

# 首次启动或Schema变更后，同步数据库
pnpm db:push

# 启动所有微服务进行本地开发
pnpm dev
```

### 3. 运行测试
```bash
# 运行所有测试
pnpm test

# 运行特定工作区的测试
pnpm test --filter=@repo/lib
```

## 贡献指南

我们欢迎任何形式的贡献！请在提交代码或文档前，详细阅读我们的贡献指南。

- **代码风格**: 请遵循项目配置的 ESLint 和 Prettier 规则。
- **提交信息**: 请遵循 [Commitlint](https://commitlint.js.org/) 规范。
- **文档同步**: 任何代码变更若影响现有功能或新增功能，都必须同步更新相关文档。

---

**最后更新**: 2025-07-08 | **文档版本**: v3.2.0 | **项目状态**: 生产就绪
