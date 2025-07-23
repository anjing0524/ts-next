# Admin Portal - 管理员门户服务指南

## 服务概述

Admin Portal 是一个基于 Next.js 的管理员门户服务，提供以下核心功能：
- **管理员认证界面**：OAuth 2.1 认证流程的 UI 层
- **系统管理后台**：用户、角色、权限、客户端和系统配置的全面管理
- **审计日志**：完整的系统操作审计追踪
- **响应式设计**：支持桌面端和移动端的管理界面

## 技术栈

| 技术类别 | 技术栈 |
|----------|--------|
| 前端框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| UI 框架 | React 19 |
| 状态管理 | @tanstack/react-query |
| 表单处理 | react-hook-form + zod |
| 样式 | Tailwind CSS |
| 组件库 | @repo/ui (共享组件库) |
| HTTP 客户端 | Fetch API |
| 测试框架 | Playwright (E2E) + Jest (单元测试) |
| 代码质量 | ESLint + Prettier |

## 架构设计

### 领域驱动设计 (DDD)

项目采用 **领域驱动设计** 架构，按功能模块组织代码：

```
features/
├── [domain]/
│   ├── domain/          # 核心业务实体和类型
│   ├── application/     # 应用服务层
│   ├── infrastructure/  # 数据访问层
│   ├── components/      # React 组件
│   ├── hooks/          # 自定义 hooks
│   └── queries.ts      # React Query 查询定义
```

### 核心模块

| 模块 | 功能 | 关键文件 |
|------|------|----------|
| **auth** | 认证授权 | `lib/auth-service.ts`, `middleware.ts` |
| **users** | 用户管理 | `features/users/` |
| **roles** | 角色管理 | `features/roles/` |
| **permissions** | 权限管理 | `features/permissions/` |
| **clients** | OAuth 客户端管理 | `features/clients/` |
| **audits** | 审计日志 | `features/audit/` |
| **system-config** | 系统配置 | `features/system-config/` |
| **dashboard** | 仪表盘 | `features/dashboard/` |

## 目录结构

```
admin-portal/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 认证相关页面
│   │   ├── login/                # 登录页面
│   │   └── callback/             # OAuth 回调处理
│   ├── (dashboard)/              # 管理后台
│   │   ├── admin/                # 主要管理界面
│   │   │   ├── users/            # 用户管理
│   │   │   ├── system/           # 系统管理
│   │   │   └── config/           # 系统配置
│   │   ├── profile/              # 个人资料
│   │   └── oauth/consent/        # OAuth 授权同意页面
│   ├── api/                      # API 路由
│   ├── globals.css               # 全局样式
│   └── layout.tsx                # 根布局
├── components/                   # 共享组件
│   ├── admin/                    # 管理专用组件
│   ├── auth/                     # 认证组件
│   ├── common/                   # 通用组件
│   └── layout/                   # 布局组件
├── features/                     # 功能模块 (DDD)
├── lib/                          # 工具库
│   ├── api.ts                    # API 客户端
│   ├── auth-service.ts           # 认证服务
│   └── auth/                     # 认证相关工具
├── providers/                    # React 上下文提供者
├── tests/                        # 测试文件
│   ├── e2e/                      # 端到端测试
│   └── helpers/                  # 测试辅助工具
├── types/                        # TypeScript 类型定义
└── middleware.ts                 # Next.js 中间件
```

## 开发环境配置

### 环境变量

创建 `.env.local` 文件：

```bash
# 服务配置
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_ADMIN_PORTAL_URL=http://localhost:3002

# 数据库配置
DATABASE_URL=file:../../packages/database/prisma/dev.db

# OAuth 客户端配置
NEXT_PUBLIC_OAUTH_CLIENT_ID=auth-center-admin-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:3002/auth/callback

# 安全配置
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3002

# 开发环境
NODE_ENV=development
NEXT_PUBLIC_APP_ENV=development
LOG_LEVEL=debug
```

### 开发命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 启动生产服务器
pnpm start

# 运行端到端测试
pnpm test:e2e
pnpm test:e2e:ui          # 带 UI 的测试运行器
pnpm test:e2e:headed      # 有头浏览器测试
pnpm test:e2e:debug       # 调试模式

# 运行简单集成测试
pnpm test:e2e:integration

# 安装 Playwright 浏览器
pnpm playwright:install

# 代码质量检查
pnpm lint
pnpm format
```

## 认证与授权

### 认证流程

1. **OAuth 2.1 授权码流程**：使用 PKCE 增强安全性
2. **JWT Token**：访问令牌和刷新令牌机制
3. **权限验证**：基于角色的权限控制 (RBAC)

### 权限系统

权限采用 **资源:操作** 的命名约定：

- `users:list` - 查看用户列表
- `users:create` - 创建用户
- `users:update` - 更新用户
- `users:delete` - 删除用户
- `roles:*` - 角色管理所有权限
- `menu:system:user:view` - 菜单访问权限

### 路由保护

通过 `middleware.ts` 实现：
- **受保护路由**：需要认证和权限验证
- **公共路由**：健康检查、API 路由
- **认证路由**：登录页面，已登录用户重定向

## API 集成

### API 客户端

核心 API 客户端位于 `lib/api.ts`，提供：

```typescript
// 认证相关
authApi.login(credentials)
authApi.exchangeCodeForToken(code, verifier)
authApi.fetchUserProfile()

// 用户管理
adminApi.getUsers(params)
adminApi.createUser(userData)
adminApi.updateUser(userId, userData)
adminApi.deleteUser(userId)

// 角色管理
adminApi.getRoles(params)
adminApi.createRole(roleData)
adminApi.updateRole(roleId, roleData)
adminApi.deleteRole(roleId)

// 权限管理
adminApi.getPermissions(params)

// 客户端管理
adminApi.getClients(params)
adminApi.createClient(clientData)
adminApi.updateClient(clientId, clientData)
adminApi.deleteClient(clientId)
adminApi.rotateClientSecret(clientId)

// 审计日志
adminApi.getAuditLogs(params)

// 系统配置
adminApi.getSystemConfig()
adminApi.updateSystemConfig(configData)
```

### React Query 集成

每个功能模块都提供专门的 React Query hooks：

```typescript
// 用户管理
import { useUserManagement } from '@/features/users/hooks/use-user-management'

// 角色管理
import { useRoleManagement } from '@/features/roles/hooks/use-role-management'

// 仪表盘
import { useDashboardStatsQuery } from '@/features/dashboard/queries'
```

## UI 组件系统

### 共享组件库

使用 `@repo/ui` 共享组件库，包含：

- **基础组件**：Button, Input, Card, Dialog 等
- **数据展示**：Table, Badge, Avatar
- **导航组件**：Tabs, Breadcrumb, Pagination
- **反馈组件**：Toast, Alert, Skeleton
- **表单组件**：Form, Select, Checkbox

### 页面布局

- **DashboardShell**：管理后台主布局
- **AuthLayout**：认证页面布局
- **响应式设计**：桌面端侧边栏 + 移动端抽屉菜单

## 测试策略

### 端到端测试 (E2E)

使用 Playwright 进行端到端测试：

```bash
# 测试目录结构
tests/e2e/
├── specs/                    # 测试用例
│   ├── auth.spec.ts         # 认证测试
│   ├── user-management.spec.ts  # 用户管理测试
│   ├── role-management.spec.ts  # 角色管理测试
│   └── dashboard.spec.ts    # 仪表盘测试
├── pages/                   # 页面对象模式
├── utils/                   # 测试工具函数
├── global-setup.ts          # 全局测试设置
└── global-teardown.ts       # 全局测试清理
```

### 测试环境

- **自动服务启动**：Playwright 自动启动 oauth-service 和 admin-portal
- **隔离测试数据**：使用独立测试数据库
- **并行执行**：支持并行测试执行
- **调试工具**：提供 UI 测试运行器和调试模式

### 关键测试场景

1. **认证流程测试**
   - 用户登录/登出
   - OAuth 授权流程
   - 权限验证

2. **管理功能测试**
   - 用户 CRUD 操作
   - 角色权限管理
   - 客户端注册和管理

3. **系统集成测试**
   - 与 oauth-service 的集成
   - 权限系统验证
   - 错误处理和用户体验

## 开发最佳实践

### 代码组织

1. **功能模块化**：每个功能独立成模块
2. **关注点分离**：UI、业务逻辑、数据访问分层
3. **类型安全**：完整的 TypeScript 类型定义
4. **错误处理**：统一的错误处理和用户反馈

### 命名规范

- **文件命名**：使用 kebab-case (如 `user-management.ts`)
- **组件命名**：使用 PascalCase (如 `UserManagementView`)
- **变量命名**：使用 camelCase (如 `userData`)
- **常量命名**：使用 UPPER_SNAKE_CASE (如 `API_BASE_URL`)

### 代码风格

- **ESLint 配置**：使用 `@repo/eslint-config`
- **Prettier 配置**：使用 `@repo/prettier-config`
- **Git hooks**：自动格式化和代码检查

### 性能优化

- **代码分割**：按路由自动代码分割
- **图片优化**：Next.js 内置图片优化
- **缓存策略**：React Query 数据缓存
- **懒加载**：组件和路由的懒加载

## 部署配置

### 构建输出

- **独立构建**：`output: 'standalone'` 配置
- **Docker 支持**：支持容器化部署
- **环境变量**：运行时环境变量注入

### 生产环境变量

```bash
# 生产环境配置
NEXT_PUBLIC_OAUTH_SERVICE_URL=https://oauth.yourdomain.com
NEXT_PUBLIC_ADMIN_PORTAL_URL=https://admin.yourdomain.com
NEXT_PUBLIC_OAUTH_CLIENT_ID=your-production-client-id
NEXT_PUBLIC_OAUTH_REDIRECT_URI=https://admin.yourdomain.com/auth/callback
```

## 故障排除

### 常见问题

1. **端口冲突**
   - 默认端口：3002
   - 修改：在 package.json 中调整 `-p` 参数

2. **认证失败**
   - 检查 oauth-service 是否运行
   - 验证客户端 ID 和密钥配置
   - 确认重定向 URI 设置

3. **权限问题**
   - 检查用户角色和权限分配
   - 验证 middleware.ts 中的权限映射
   - 查看 JWT token 中的权限声明

4. **测试失败**
   - 确保所有服务正在运行
   - 检查测试数据库状态
   - 查看 Playwright 报告

### 调试工具

- **React Query DevTools**：数据查询调试
- **Next.js DevTools**：开发时调试工具
- **Playwright Trace Viewer**：测试执行追踪
- **浏览器 DevTools**：前端调试

## 扩展开发

### 添加新功能模块

1. **创建功能目录**：在 `features/` 下创建新模块
2. **定义领域模型**：在 `domain/` 中定义类型和接口
3. **实现应用服务**：在 `application/` 中实现业务逻辑
4. **创建 UI 组件**：在 `components/` 中构建界面
5. **添加路由**：在 `app/` 中创建页面路由
6. **编写测试**：添加 E2E 和单元测试

### 集成新 API

1. **添加 API 端点**：在 `lib/api.ts` 中添加新函数
2. **创建 React Query hooks**：在功能模块中定义查询
3. **更新权限映射**：在 `middleware.ts` 中添加权限验证
4. **实现 UI 组件**：创建相应的用户界面

## 相关资源

- **OAuth 服务文档**：参见 `../oauth-service/CLAUDE.md`
- **共享组件库**：参见 `../../packages/ui/`
- **数据库模型**：参见 `../../packages/database/`
- **API 文档**：访问 `http://localhost:3001/docs` (开发环境)