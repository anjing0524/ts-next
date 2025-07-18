# OAuth2.1 认证授权系统

## 项目概述

本项目是一个基于 Next.js 15 的 OAuth2.1 认证授权系统，采用 monorepo 架构，包含以下核心组件：

- **oauth-service**: OAuth2.1 认证授权服务
- **admin-portal**: 管理后台，作为 OAuth 客户端
- **共享库**: 工具函数和 UI 组件

## 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   admin-portal  │    │  oauth-service  │    │   shared libs   │
│   (OAuth Client)│◄──►│  (OAuth Server) │◄──►│   (@repo/*)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
pnpm install

# 生成 Prisma 客户端
pnpm db:generate

# 推送数据库架构
pnpm db:push
```

### 2. 系统初始化

**重要**: 系统使用 Prisma seed 脚本进行初始化，这是正确的数据管理方式。请按照以下步骤操作：

```bash
# 完整系统初始化（推荐）
pnpm db:seed

# 或者使用别名命令
pnpm oauth:setup
```

**初始化说明**:
- 系统使用 `packages/database/prisma/seed.ts` 管理初始数据，符合最佳实践
- 配置修改应通过管理页面操作，而不是代码中硬编码
- oauth-service 专注于 OAuth2.1 核心功能，不处理初始化
- seed 脚本会创建所有必要的角色、权限、用户和 OAuth 客户端

**初始化内容包括**:
- 默认角色：SYSTEM_ADMIN、USER_ADMIN、PERMISSION_ADMIN 等
- 默认权限：完整的 RBAC 权限体系
- 默认用户：admin（管理员）、testuser（测试用户）等
- OAuth 客户端：admin-portal-client、auth-center-admin-client 等

### 3. 启动服务

```bash
# 启动所有服务
pnpm dev

# 或者分别启动
pnpm dev:oauth    # OAuth 服务 (http://localhost:3002)
pnpm dev:admin    # 管理后台 (http://localhost:3001)
```

### 4. 访问系统

- **管理后台**: http://localhost:3001
- **OAuth 服务**: http://localhost:3002
- **默认管理员**: admin / admin123

## 核心功能

### OAuth2.1 授权码流程

系统实现了完整的 OAuth2.1 授权码流程，包括：

- **PKCE 支持**: 强制使用 PKCE (Proof Key for Code Exchange)
- **State 参数**: 防止 CSRF 攻击
- **令牌刷新**: 自动刷新访问令牌
- **权限验证**: 基于 JWT 的权限控制

### 权限管理

- **RBAC 模型**: 基于角色的访问控制
- **细粒度权限**: 支持 API 级别的权限控制
- **权限继承**: 角色权限继承机制

### 安全特性

- **JWT 令牌**: 安全的令牌机制
- **HTTPS 支持**: 生产环境强制 HTTPS
- **审计日志**: 完整的操作审计
- **IP 白名单**: 客户端 IP 限制

## 开发指南

### 项目结构

```
├── apps/
│   ├── oauth-service/     # OAuth2.1 服务
│   └── admin-portal/      # 管理后台
├── packages/
│   ├── lib/              # 共享工具库
│   └── ui/               # 共享 UI 组件
├── scripts/              # 初始化脚本
└── docs/                 # 项目文档
```

### 开发命令

```bash
# 开发模式
pnpm dev

# 测试
pnpm test

# 类型检查
pnpm type-check

# 代码格式化
pnpm format

# 数据库操作
pnpm db:studio    # 打开 Prisma Studio
pnpm db:push      # 推送数据库变更
pnpm db:generate  # 生成 Prisma 客户端
```

### 初始化脚本

系统提供了完整的初始化脚本：

- `scripts/setup-oauth-system.js`: 完整系统初始化
- `scripts/setup-admin-portal-client.js`: admin-portal 客户端创建
- `scripts/create-admin-user.js`: 管理员用户创建

**使用建议**:
- 首次部署时使用 `pnpm oauth:setup`
- 开发环境可以使用分步初始化
- 生产环境请修改默认密码和密钥

## 部署说明

### 环境变量

```bash
# 数据库配置
DATABASE_URL="sqlite:./oauth.db"

# JWT 密钥
JWT_SECRET="your-jwt-secret"

# OAuth 配置
OAUTH_ISSUER="http://localhost:3002"
```

### 生产环境

1. **修改默认配置**:
   - 更改默认管理员密码
   - 修改客户端密钥
   - 配置 HTTPS

2. **数据库迁移**:
   ```bash
   pnpm prisma:migrate
   pnpm oauth:setup
   ```

3. **启动服务**:
   ```bash
   pnpm build
   pnpm start
   ```

## 技术栈

- **前端**: Next.js 15, React 18, TypeScript
- **UI 组件**: shadcn/ui, TailwindCSS 4
- **后端**: Next.js API Routes, Prisma ORM
- **数据库**: SQLite (开发), PostgreSQL (生产)
- **认证**: OAuth2.1, JWT
- **测试**: Jest, Playwright

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

---

**注意**: 本系统使用 seed 脚本进行初始化，符合软件工程最佳实践。请勿在代码中实现自动初始化逻辑，而应使用提供的 setup 脚本。
