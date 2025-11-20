# OAuth 2.1 系统 - 文档索引

> **最后更新**: 2025-11-20  
> **项目版本**: 1.0.0  
> **项目状态**: ✅ 生产就绪 (Production Ready)

---

## 📚 文档分类导航

### 🏗️ 架构设计

| 文档 | 描述 | 路径 |
|------|------|------|
| **系统架构设计** | 完整的系统架构、组件设计、数据流、安全架构 | [architecture/design.md](./architecture/design.md) |
| **OAuth 2.1 业务流程** | 授权码流程、Token 刷新、PKCE、完整请求链路 | [architecture/business_flows.md](./architecture/business_flows.md) |
| **Admin Portal 前端架构分析** | DDD 架构、状态管理、OAuth 集成 | [architecture/analysis/admin_portal_frontend.md](./architecture/analysis/admin_portal_frontend.md) |
| **Admin Portal 双角色分析** | 管理员和普通用户双角色设计 | [architecture/analysis/admin_portal_dual_roles.md](./architecture/analysis/admin_portal_dual_roles.md) |
| **OAuth Service 代码库分析** | Rust 服务架构、中间件、服务层 | [architecture/analysis/oauth_service_codebase.md](./architecture/analysis/oauth_service_codebase.md) |

### 🔌 API 文档

| 文档 | 描述 | 路径 |
|------|------|------|
| **API 参考文档** | 完整的 API 端点、请求/响应示例、错误处理 | [api/reference.md](./api/reference.md) |

### 🚀 部署运维

| 文档 | 描述 | 路径 |
|------|------|------|
| **部署和运维指南** | Kubernetes 部署、SQLite 配置、监控、备份 | [deployment/guide.md](./deployment/guide.md) |
| **生产环境配置指南** | 安全配置、性能优化、高可用、灾难恢复 | [deployment/configuration.md](./deployment/configuration.md) |

### 💻 开发指南

| 文档 | 描述 | 路径 |
|------|------|------|
| **I18N 实现指南** | 国际化实现方案 | [development/guides/i18n_implementation.md](./development/guides/i18n_implementation.md) |
| **E2E 测试策略** | 端到端测试策略和实现 | [development/testing/e2e_test_strategy.md](./development/testing/e2e_test_strategy.md) |
| **E2E 测试实施状态** | 测试实施进度和覆盖率 | [development/testing/e2e_test_status.md](./development/testing/e2e_test_status.md) |
| **Pingora 热重载任务** | Pingora 配置热重载功能实现 | [development/tasks/pingora_hot_reload.md](./development/tasks/pingora_hot_reload.md) |
| **Admin Portal Claude 笔记** | Admin Portal 开发笔记 | [development/notes/admin_portal_claude.md](./development/notes/admin_portal_claude.md) |
| **Pingora Claude 笔记** | Pingora 开发笔记 | [development/notes/pingora_claude.md](./development/notes/pingora_claude.md) |
| **通用 Claude 笔记** | 项目整体开发笔记 | [development/notes/general_claude.md](./development/notes/general_claude.md) |

### 📊 交付报告

| 文档 | 描述 | 路径 |
|------|------|------|
| **最终交付总结** | 项目交付内容清单、技术架构总结、核心功能 | [reports/delivery_summary.md](./reports/delivery_summary.md) |
| **生产就绪检查清单** | 100+ 检查项、安全、性能、可靠性评估 | [reports/readiness_checklist.md](./reports/readiness_checklist.md) |
| **OAuth Service 生产就绪总结** | OAuth Service 组件的生产就绪评估 | [reports/oauth_service_readiness.md](./reports/oauth_service_readiness.md) |
| **生产就绪修复总结** | 生产就绪问题修复记录 | [reports/production_readiness_fixes.md](./reports/production_readiness_fixes.md) |
| **数据库设置完成报告** | OAuth 数据库设置完成记录 | [reports/database_setup_completion.md](./reports/database_setup_completion.md) |

### 🧩 组件文档

| 文档 | 描述 | 路径 |
|------|------|------|
| **WebSocket K线服务** | K线实时数据推送服务 | [components/ws_kline_service.md](./components/ws_kline_service.md) |
| **Pingora 代理** | Pingora 反向代理配置和使用 | [components/pingora_proxy.md](./components/pingora_proxy.md) |

---

## 🎯 快速导航

### 新手入门
1. [项目 README](./README.md) - 项目概览和快速开始
2. [系统架构设计](./architecture/design.md) - 了解整体架构
3. [OAuth 2.1 业务流程](./architecture/business_flows.md) - 理解核心流程
4. [API 参考文档](./api/reference.md) - 熟悉 API 接口

### 部署上线
1. [部署和运维指南](./deployment/guide.md) - Kubernetes 部署流程
2. [生产环境配置指南](./deployment/configuration.md) - 生产配置优化
3. [生产就绪检查清单](./reports/readiness_checklist.md) - 上线前验证

### 开发维护
1. [I18N 实现指南](./development/guides/i18n_implementation.md) - 国际化开发
2. [E2E 测试策略](./development/testing/e2e_test_strategy.md) - 测试实践
3. [Admin Portal 前端架构](./architecture/analysis/admin_portal_frontend.md) - 前端架构理解

### 问题排查
1. [部署和运维指南 - Troubleshooting](./deployment/guide.md#troubleshooting) - 常见问题解决
2. [开发笔记](./development/notes/) - 历史问题和解决方案

---

## 🔑 核心技术栈

### 后端 (OAuth Service)
- **语言**: Rust 1.70+
- **框架**: Axum 0.7
- **数据库**: SQLite (Production) with SQLx
- **认证**: OAuth 2.1 + PKCE, JWT (RS256/HS256)
- **限流**: 内存实现 (Tower Governor)

### 前端 (Admin Portal)
- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript 5.x
- **UI**: React 19, Tailwind CSS 4, shadcn/ui
- **状态管理**: TanStack Query, Zustand
- **架构**: Domain-Driven Design (DDD)

### 基础设施
- **反向代理**: Pingora (Cloudflare)
- **编排**: Kubernetes (推荐)
- **监控**: Prometheus + Grafana
- **CI/CD**: GitHub Actions

---

## 📝 文档维护指南

### 文档组织原则
- **architecture/**: 架构设计、业务流程、组件分析
- **api/**: API 规范和参考文档
- **deployment/**: 部署指南、配置说明
- **development/**: 开发指南、测试文档、任务记录、开发笔记
- **reports/**: 项目交付报告、检查清单
- **components/**: 各组件的独立文档

### 更新规范
1. 所有新文档应放在相应的分类目录下
2. 更新文档时同步更新本索引文件
3. 删除过时文档时从索引中移除对应条目
4. 重大变更需更新顶部的"最后更新"日期

---

## 🚦 项目状态

| 类别 | 状态 | 说明 |
|------|------|------|
| **核心功能** | ✅ 完成 | OAuth 2.1 + PKCE, RBAC, 审计日志 |
| **数据库** | ✅ SQLite Production Ready | 持久化存储 (PVC) |
| **限流** | ✅ 内存实现 | Tower Governor |
| **部署** | ✅ Kubernetes | 推荐生产部署方式 |
| **监控** | ⚠️  部分完成 | Prometheus 就绪，告警待配置 |
| **Redis 集成** | ❌ 未来规划 | 分布式缓存和限流 |
| **MySQL 支持** | ❌ 未来规划 | 可选数据库后端 |

---

**文档版本**: 1.0.0  
**维护者**: 开发团队  
**更新频率**: 随项目迭代更新
