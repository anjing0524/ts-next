# Admin Portal

管理后台与认证中心 UI，基于 Next.js 15 和 shadcn/ui 构建的现代化管理界面，提供用户管理、OAuth 客户端管理、系统配置等功能。

## 🎯 功能特性

- **用户管理** - 完整的用户生命周期管理
- **OAuth 客户端管理** - 客户端注册、配置和监控
- **权限管理** - 基于角色的访问控制 (RBAC)
- **系统配置** - 全局系统设置和参数配置
- **审计日志** - 完整的操作日志和审计追踪
- **仪表板** - 系统状态和关键指标可视化
- **主题切换** - 支持明暗主题和自定义主题
- **响应式设计** - 完美适配桌面和移动设备

## 🏗️ 技术栈

- **框架**: Next.js 15.3.2 + React 19
- **UI 库**: shadcn/ui + Tailwind CSS 4
- **状态管理**: React Query + Zustand
- **表单**: React Hook Form + Zod
- **图表**: Recharts
- **图标**: Lucide React
- **日期**: date-fns
- **测试**: Jest + Playwright (E2E)
- **类型**: TypeScript 5

## 🚀 快速开始

### 1. 环境配置

```bash
# 复制环境变量模板
cp .env.example .env.local

# 必需的环境变量
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3002
NEXTAUTH_SECRET=your_nextauth_secret
DATABASE_URL="file:./dev.db"
```

### 2. 安装依赖

```bash
# 安装所有依赖
pnpm install

# 安装 Playwright 浏览器 (用于 E2E 测试)
pnpm playwright:install
```

### 3. 启动开发服务

```bash
# 启动管理后台 (端口 3002)
pnpm dev

# 或者使用项目根目录命令
pnpm --filter=admin-portal dev

# 与 OAuth 服务并行启动
pnpm start:e2e
```

### 4. 访问系统

- **管理后台**: http://localhost:3002
- **默认管理员**: admin@example.com / admin123
- **默认用户**: user@example.com / user123

## 📍 主要页面

### 1. 认证相关
- **登录页面** (`/auth/login`) - OAuth 2.1 登录流程
- **注册页面** (`/auth/register`) - 新用户注册
- **回调处理** (`/auth/callback`) - OAuth 回调处理

### 2. 管理面板
- **仪表板** (`/dashboard`) - 系统概览和关键指标
- **用户管理** (`/users`) - 用户列表、创建、编辑、删除
- **客户端管理** (`/clients`) - OAuth 客户端管理
- **权限管理** (`/permissions`) - 角色和权限配置
- **系统设置** (`/settings`) - 全局配置参数
- **审计日志** (`/audit`) - 操作日志查看

### 3. 个人中心
- **个人资料** (`/profile`) - 用户信息编辑
- **安全设置** (`/security`) - 密码修改、双因子认证
- **应用授权** (`/authorized-apps`) - 已授权应用管理

## 🧪 测试

### 单元测试

```bash
# 运行所有单元测试
pnpm test

# 运行测试并监视更改
pnpm test:watch

# 运行测试覆盖率
pnpm test:coverage
```

### E2E 测试

```bash
# 运行完整的 OAuth 2.1 流程测试
pnpm test:e2e:integration

# 运行所有 E2E 测试
pnpm test:e2e

# 运行 E2E 测试 UI 模式
pnpm test:e2e:ui

# 调试模式运行
pnpm test:e2e:debug
```

### 手动测试

1. **OAuth 登录测试**:
   ```
   http://localhost:3002/auth/login
   ```

2. **用户管理测试**:
   ```
   http://localhost:3002/users
   ```

3. **客户端管理测试**:
   ```
   http://localhost:3002/clients
   ```

## 📁 项目结构

```
admin-portal/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          # 登录页面
│   │   ├── register/page.tsx       # 注册页面
│   │   └── callback/page.tsx       # OAuth 回调
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx      # 仪表板
│   │   ├── users/
│   │   │   ├── page.tsx            # 用户列表
│   │   │   ├── [id]/page.tsx       # 用户详情
│   │   │   └── new/page.tsx        # 创建用户
│   │   ├── clients/
│   │   │   ├── page.tsx            # 客户端列表
│   │   │   ├── [id]/page.tsx       # 客户端详情
│   │   │   └── new/page.tsx        # 创建客户端
│   │   ├── settings/page.tsx       # 系统设置
│   │   └── audit/page.tsx          # 审计日志
│   └── api/auth/
│       └── [...nextauth]/route.ts  # NextAuth 配置
├── components/
│   ├── ui/                         # shadcn/ui 组件
│   ├── layout/                     # 布局组件
│   ├── users/                      # 用户相关组件
│   ├── clients/                    # 客户端相关组件
│   └── charts/                     # 图表组件
├── lib/
│   ├── api/                        # API 调用封装
│   ├── auth/                       # 认证相关工具
│   ├── hooks/                      # 自定义 Hooks
│   └── utils/                      # 工具函数
├── types/                          # TypeScript 类型定义
└── tests/
    ├── e2e/
    │   ├── oauth2.1-flow.spec.ts   # OAuth 2.1 流程测试
    │   └── admin-actions.spec.ts   # 管理操作测试
    └── unit/
```

## 🔧 配置说明

### 环境变量

| 变量名 | 描述 | 示例 |
|--------|------|------|
| `NEXT_PUBLIC_OAUTH_SERVICE_URL` | OAuth 服务地址 | `http://localhost:3001` |
| `NEXTAUTH_URL` | NextAuth 服务地址 | `http://localhost:3002` |
| `NEXTAUTH_SECRET` | NextAuth 密钥 | `随机生成的密钥` |
| `DATABASE_URL` | 数据库连接字符串 | `file:./dev.db` |
| `REDIS_URL` | Redis 连接字符串 | `redis://localhost:6379` |

### OAuth 配置

在 `lib/auth/config.ts` 中配置 OAuth 客户端：

```typescript
export const oauthConfig = {
  clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin_portal',
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  authorizationUrl: `${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/oauth/authorize`,
  tokenUrl: `${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/oauth/token`,
  userInfoUrl: `${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/oauth/userinfo`,
  redirectUri: `${process.env.NEXTAUTH_URL}/api/auth/callback/oauth-service`,
  scope: 'openid profile api:read api:write admin',
};
```

## 🎨 主题定制

### 修改主题颜色

在 `app/globals.css` 中修改 CSS 变量：

```css
@theme {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  /* ... 更多变量 */
}
```

### 添加新组件

使用 shadcn/ui CLI 添加新组件：

```bash
# 添加新组件
pnpm dlx shadcn@latest add [component-name]

# 示例：添加数据表格
pnpm dlx shadcn@latest add data-table
```

## 📊 仪表板组件

### 1. 用户统计卡片

- 总用户数
- 活跃用户 (24小时)
- 新注册用户 (7天)
- 用户增长率

### 2. 客户端统计卡片

- 注册客户端数
- 活跃客户端 (24小时)
- API 调用次数 (7天)
- 错误率统计

### 3. 系统状态卡片

- 服务健康状态
- 数据库连接状态
- 响应时间监控
- 错误日志统计

## 🔐 权限控制

### 角色定义

- **超级管理员** (`super_admin`) - 系统全部权限
- **管理员** (`admin`) - 用户和客户端管理权限
- **用户** (`user`) - 普通用户权限
- **访客** (`guest`) - 只读权限

### 权限矩阵

| 功能 | 超级管理员 | 管理员 | 用户 | 访客 |
|------|------------|--------|------|------|
| 用户管理 | ✅ | ✅ | ❌ | ❌ |
| 客户端管理 | ✅ | ✅ | ❌ | ❌ |
| 系统配置 | ✅ | ❌ | ❌ | ❌ |
| 查看审计日志 | ✅ | ✅ | ❌ | ❌ |
| 个人资料 | ✅ | ✅ | ✅ | ✅ |
| 查看仪表板 | ✅ | ✅ | ✅ | ✅ |

## 🧩 API 集成

### 用户管理 API

```typescript
// 获取用户列表
const users = await api.users.list({
  page: 1,
  limit: 10,
  search: 'keyword',
  role: 'admin'
});

// 创建用户
const newUser = await api.users.create({
  email: 'new@example.com',
  name: 'New User',
  role: 'user'
});

// 更新用户
const updatedUser = await api.users.update(userId, {
  name: 'Updated Name',
  role: 'admin'
});
```

### 客户端管理 API

```typescript
// 获取 OAuth 客户端列表
const clients = await api.clients.list();

// 创建 OAuth 客户端
const newClient = await api.clients.create({
  name: 'New App',
  redirectUris: ['http://localhost:3000/callback'],
  scopes: ['openid', 'profile', 'api:read']
});
```

## 📱 移动端支持

### 响应式设计

- **桌面端**: 完整功能支持
- **平板端**: 优化布局，保留核心功能
- **手机端**: 简化界面，主要功能可用

### PWA 配置

在 `app/manifest.ts` 中配置 PWA：

```typescript
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Admin Portal',
    short_name: 'Admin',
    description: 'OAuth 2.1 管理后台',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  };
}
```

## 🚨 安全注意事项

1. **输入验证** - 所有表单输入都经过 Zod 验证
2. **权限检查** - 每个 API 调用都验证用户权限
3. **CSRF 保护** - 使用 NextAuth.js 的内置 CSRF 保护
4. **XSS 防护** - 自动转义所有用户输入
5. **HTTPS 强制** - 生产环境强制使用 HTTPS
6. **安全头部** - 配置安全 HTTP 头部

## 🔍 调试与监控

### 开发调试

```bash
# 启用调试模式
DEBUG=admin-portal:* pnpm dev

# 查看网络请求
# 浏览器开发者工具 -> Network
```

### 错误处理

```typescript
// 全局错误边界
// app/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>出错了！</h2>
      <button onClick={reset}>重试</button>
    </div>
  );
}
```

### 性能监控

- **核心 Web Vitals**: LCP, FID, CLS
- **API 响应时间**: 所有 API 调用监控
- **错误率**: 前端错误和 API 错误统计
- **用户行为**: 页面访问和使用统计

## 📞 与其他服务集成

### OAuth 服务集成

- **认证流程**: 完整的 OAuth 2.1 + PKCE 流程
- **令牌管理**: 自动处理令牌刷新和撤销
- **用户信息**: 从 OAuth 服务获取用户详细信息

### API 服务集成

- **统一错误处理**: 所有 API 错误统一处理
- **加载状态**: 全局加载状态管理
- **缓存策略**: React Query 智能缓存

## 📝 开发指南

### 添加新页面

1. 在 `app/(dashboard)/` 下创建新目录
2. 创建 `page.tsx` 文件
3. 添加路由到导航菜单
4. 创建对应的 API 集成

### 添加新组件

1. 在 `components/` 下创建组件目录
2. 使用 TypeScript 和 Tailwind CSS
3. 添加 Storybook 故事 (可选)
4. 编写单元测试

### 添加新 API

1. 在 `lib/api/` 下创建 API 封装
2. 添加类型定义
3. 添加错误处理
4. 添加缓存配置

## 🤝 部署说明

### 构建生产版本

```bash
# 构建应用
pnpm build

# 启动生产服务
pnpm start
```

### Docker 部署

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3002
CMD ["pnpm", "start"]
```

## 📞 支持与联系

- **OAuth 服务**: http://localhost:3001
- **文档**: [JWT 认证授权使用说明](/docs/guidelines/JWT认证授权使用说明.md)
- **问题反馈**: 创建 GitHub Issue
- **技术支持**: 联系前端开发团队