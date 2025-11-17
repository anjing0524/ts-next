# Admin Portal 前端架构深度分析

> **文档版本**: v1.0
> **最后更新**: 2025-11-13
> **适用版本**: Next.js 16.0.0, React 19.2.0

---

## 目录

1. [技术栈概览](#技术栈概览)
2. [目录结构与组织](#目录结构与组织)
3. [路由架构](#路由架构)
4. [组件系统](#组件系统)
5. [功能模块（领域驱动设计）](#功能模块领域驱动设计)
6. [OAuth 2.1 集成](#oauth-21-集成)
7. [状态管理策略](#状态管理策略)
8. [API 调用与数据获取](#api-调用与数据获取)
9. [中间件与路由保护](#中间件与路由保护)
10. [类型系统与数据流](#类型系统与数据流)
11. [性能优化策略](#性能优化策略)
12. [测试架构](#测试架构)
13. [安全实践](#安全实践)
14. [开发工作流](#开发工作流)

---

## 技术栈概览

### 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| **Next.js** | 16.0.0 | React 全栈框架，App Router 模式 |
| **React** | 19.2.0 | UI 渲染库 |
| **TypeScript** | 5.9 | 类型安全的 JavaScript |
| **Node.js Runtime** | - | proxy.ts 运行环境（替代 Edge Runtime） |

### UI 与样式

| 技术 | 用途 |
|------|------|
| **Tailwind CSS** | 实用优先的 CSS 框架 |
| **@repo/ui** | 共享组件库（shadcn/ui 基础） |
| **lucide-react** | 图标库 |
| **sonner** | Toast 通知系统 |

### 状态与数据

| 技术 | 用途 |
|------|------|
| **@tanstack/react-query** | 服务端状态管理和缓存 |
| **@tanstack/react-table** | 表格数据管理 |
| **React Context API** | 客户端全局状态（认证状态） |

### 表单与验证

| 技术 | 用途 |
|------|------|
| **react-hook-form** | 表单状态管理 |
| **zod** | Schema 验证库 |

### 开发工具

| 技术 | 用途 |
|------|------|
| **ESLint** | 代码质量检查 |
| **Prettier** | 代码格式化 |
| **Playwright** | E2E 测试 |
| **Jest** | 单元测试 |

---

## 目录结构与组织

### 顶层目录结构

```
admin-portal/
├── app/                    # Next.js App Router - 页面和路由定义
├── components/             # 共享 React 组件
├── features/               # 功能模块（DDD 架构）
├── lib/                    # 工具函数、API 客户端、配置
├── hooks/                  # 全局自定义 Hooks
├── providers/              # React Context Providers
├── types/                  # TypeScript 类型定义
├── tests/                  # E2E 测试
├── proxy.ts                # Next.js 16 代理处理器（Node.js Runtime）
├── next.config.js          # Next.js 配置
├── tailwind.config.ts      # Tailwind CSS 配置
└── tsconfig.json           # TypeScript 配置
```

### app/ 目录（App Router）

```
app/
├── (auth)/                    # 认证路由组（共享布局）
│   ├── login/                 # 登录页面
│   │   └── page.tsx
│   ├── callback/              # OAuth 回调处理
│   │   └── page.tsx
│   └── layout.tsx             # 认证页面布局
├── (dashboard)/               # 管理后台路由组
│   ├── admin/                 # 管理功能页面
│   │   ├── page.tsx           # 仪表盘首页
│   │   ├── users/             # 用户管理
│   │   │   └── page.tsx
│   │   ├── system/            # 系统管理
│   │   │   ├── roles/
│   │   │   ├── permissions/
│   │   │   ├── clients/
│   │   │   └── audits/
│   │   └── config/            # 系统配置
│   │       └── page.tsx
│   ├── profile/               # 个人资料
│   │   └── page.tsx
│   └── layout.tsx             # Dashboard 布局（带权限守卫）
├── oauth/                     # OAuth 相关页面
│   ├── consent/               # 授权同意页面
│   │   └── page.tsx
│   └── error/                 # OAuth 错误页面
│       └── page.tsx
├── api/                       # API 路由
│   ├── auth/                  # 认证相关 API
│   │   └── login-callback/    # 登录回调处理
│   │       └── route.ts
│   └── health/                # 健康检查
│       └── route.ts
├── health/                    # 健康检查页面
│   └── page.tsx
├── unauthorized/              # 权限不足页面
│   └── page.tsx
├── layout.tsx                 # 根布局
├── page.tsx                   # 首页（重定向到 /admin）
└── globals.css                # 全局样式
```

**路由组说明**：

- `(auth)`: 认证相关页面，不包含在路径中，共享简单布局
- `(dashboard)`: 管理后台页面，需要认证和权限验证，共享 DashboardShell 布局

### components/ 目录

```
components/
├── admin/                     # 管理功能专用组件
│   ├── header.tsx             # 管理后台头部
│   ├── sidebar.tsx            # 侧边栏导航
│   ├── users/                 # 用户管理组件
│   │   └── UserFormDialog.tsx
│   ├── roles/                 # 角色管理组件
│   │   ├── RoleFormDialog.tsx
│   │   └── RolePermissionsDialog.tsx
│   └── clients/               # 客户端管理组件
│       ├── ClientFormDialog.tsx
│       └── ClientSecretDialog.tsx
├── auth/                      # 认证组件
│   ├── auth-provider.tsx      # 认证上下文提供者
│   ├── auth-status-monitor.tsx # 认证状态监控
│   └── username-password-form.tsx # 登录表单
├── common/                    # 通用组件
│   ├── DeleteConfirmDialog.tsx # 删除确认对话框
│   ├── ErrorDisplay.tsx       # 错误显示
│   ├── SkeletonLoader.tsx     # 骨架屏加载
│   ├── Spinner.tsx            # 加载指示器
│   └── toast.tsx              # Toast 通知提供者
├── layout/                    # 布局组件
│   └── DashboardShell.tsx     # Dashboard 主布局
├── error/                     # 错误处理组件
│   └── global-error-handler.tsx # 全局错误处理器
├── permission/                # 权限控制组件
│   └── permission-guard.tsx   # 权限守卫
├── performance/               # 性能监控组件
│   └── performance-monitor.tsx
└── security/                  # 安全增强组件
    └── security-enhancer.tsx
```

**组件分类策略**：

- **admin/**: 业务特定组件，仅在管理功能中使用
- **auth/**: 认证流程组件
- **common/**: 可跨多个功能复用的通用组件
- **layout/**: 页面布局和结构组件
- **其他**: 横切关注点（错误处理、性能、安全等）

### features/ 目录（DDD 架构）

```
features/
├── users/                     # 用户管理功能
│   ├── domain/                # 领域层
│   │   ├── user.ts            # 用户实体、Schema 定义
│   │   └── user.repository.ts # 仓储接口定义
│   ├── application/           # 应用服务层
│   │   └── user.service.ts    # 用户业务逻辑
│   ├── infrastructure/        # 基础设施层
│   │   └── user.repository.ts # 仓储实现（API 调用）
│   ├── components/            # UI 组件
│   │   ├── UserManagementView.tsx # 主视图
│   │   ├── UserFormDialog.tsx     # 表单对话框
│   │   └── UserTableColumns.tsx   # 表格列定义
│   ├── hooks/                 # 自定义 Hooks
│   │   └── use-user-management.ts # 用户管理逻辑
│   └── queries.ts             # React Query 定义
├── roles/                     # 角色管理功能（结构同上）
├── permissions/               # 权限管理功能
├── clients/                   # OAuth 客户端管理
├── audit/                     # 审计日志
├── system-config/             # 系统配置
├── dashboard/                 # 仪表盘
│   ├── hooks/
│   │   └── useDashboardStatsQuery.ts
│   └── queries.ts
└── auth/                      # 认证功能
    ├── application/
    │   └── auth.service.ts
    ├── domain/
    │   └── auth.repository.ts
    └── infrastructure/
        └── auth.repository.ts
```

**DDD 分层说明**：

1. **domain/**: 核心业务实体、Schema 验证、接口定义
2. **application/**: 业务逻辑服务，协调领域对象和基础设施
3. **infrastructure/**: 外部依赖实现（API 调用、数据持久化）
4. **components/**: React UI 组件
5. **hooks/**: 封装业务逻辑和状态管理的自定义 Hooks
6. **queries.ts**: React Query 查询和变更定义

### lib/ 目录

```
lib/
├── api/                       # API 客户端
│   └── api-client.ts          # HTTP 请求封装
├── api.ts                     # 统一 API 导出（authApi, adminApi）
├── auth/                      # 认证工具
│   ├── token-storage.ts       # Token 存储管理
│   └── oauth-config.ts        # OAuth 配置
├── auth-service.ts            # 认证服务实现（@repo/ui 接口）
├── utils/                     # 工具函数
│   ├── browser.ts             # 浏览器工具（PKCE 生成等）
│   └── cn.ts                  # classnames 合并工具
├── permission/                # 权限工具
│   └── permission-checker.ts  # 权限检查逻辑
├── error/                     # 错误处理
│   └── error-handler.ts       # 统一错误处理
└── performance/               # 性能工具
    └── metrics.ts             # 性能指标收集
```

---

## 路由架构

### 路由类型分类

#### 1. **公共路由**（无需认证）

| 路径 | 文件 | 说明 |
|------|------|------|
| `/health` | `app/health/page.tsx` | 健康检查页面 |
| `/api/health` | `app/api/health/route.ts` | 健康检查 API |

#### 2. **认证路由**（认证流程专用）

| 路径 | 文件 | 说明 | OAuth 角色 |
|------|------|------|-----------|
| `/login` | `app/(auth)/login/page.tsx` | 登录页面 | 由 OAuth Service 重定向到达 |
| `/auth/callback` | `app/(auth)/callback/page.tsx` | OAuth 回调处理 | 交换 code 为 token |
| `/oauth/consent` | `app/oauth/consent/page.tsx` | 用户授权同意 | 第三方应用授权 |
| `/oauth/error` | `app/oauth/error/page.tsx` | OAuth 错误页面 | - |

#### 3. **受保护路由**（需要认证和权限）

| 路径 | 文件 | 所需权限 |
|------|------|---------|
| `/admin` | `app/(dashboard)/admin/page.tsx` | `dashboard:view` |
| `/admin/users` | `app/(dashboard)/admin/users/page.tsx` | `menu:system:user:view`, `users:list` |
| `/admin/system/roles` | `app/(dashboard)/admin/system/roles/page.tsx` | `menu:system:role:view`, `roles:list` |
| `/admin/system/permissions` | `app/(dashboard)/admin/system/permissions/page.tsx` | `menu:system:permission:view`, `permissions:list` |
| `/admin/system/clients` | `app/(dashboard)/admin/system/clients/page.tsx` | `menu:system:client:view`, `clients:list` |
| `/admin/system/audits` | `app/(dashboard)/admin/system/audits/page.tsx` | `menu:system:audit:view`, `audit:list` |
| `/admin/config` | `app/(dashboard)/admin/config/page.tsx` | `system:config:edit` |
| `/profile` | `app/(dashboard)/profile/page.tsx` | 认证即可（无特殊权限） |

#### 4. **特殊路由**

| 路径 | 文件 | 说明 |
|------|------|------|
| `/unauthorized` | `app/unauthorized/page.tsx` | 权限不足提示页面 |
| `/` | `app/page.tsx` | 首页（重定向到 `/admin`） |

### 路由保护机制

```
用户访问受保护路由 (/admin/users)
  ↓
proxy.ts 拦截请求
  ↓
检查 access_token cookie
  ├─ 不存在或已过期
  │   ↓
  │   生成 PKCE 参数（state, code_verifier, code_challenge）
  │   ↓
  │   存储到 cookies（oauth_state, oauth_code_verifier, oauth_redirect_path）
  │   ↓
  │   重定向到 OAuth Service /api/v2/oauth/authorize
  │   （第三方客户端模式：直接启动 OAuth 流程）
  └─ 存在且有效
      ↓
      解析 JWT payload，提取 permissions
      ↓
      检查路由所需权限（routePermissionMap）
      ├─ 权限不足
      │   ↓
      │   重定向到 /unauthorized
      └─ 权限充足
          ↓
          允许访问，继续处理请求
```

### 布局嵌套结构

```
RootLayout (app/layout.tsx)
  └─ AppProviders (全局 Providers)
      ├─ QueryClientProvider (React Query)
      ├─ BaseAuthProvider (@repo/ui)
      ├─ ToastProvider
      ├─ AuthProvider (本地认证状态)
      └─ 安全增强组件
          ├─ AuthStatusMonitor
          ├─ GlobalErrorHandler
          ├─ PerformanceMonitorToggle
          └─ SecurityEnhancer

(auth) 路由组 (app/(auth)/layout.tsx)
  └─ 简单布局（仅包装子组件）

(dashboard) 路由组 (app/(dashboard)/layout.tsx)
  └─ PermissionGuard (权限守卫)
      └─ DashboardShell (Dashboard 主布局)
          ├─ 侧边栏导航（桌面端固定，移动端抽屉）
          ├─ 顶部导航栏
          └─ 主内容区域
```

---

## 组件系统

### 组件分层架构

```
┌─────────────────────────────────────────────────┐
│         页面组件 (Page Components)              │
│   app/(dashboard)/admin/users/page.tsx          │
│   - 路由级别组件                                │
│   - 权限守卫包装                                │
│   - 渲染功能视图组件                            │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│      功能视图组件 (Feature Views)               │
│   features/users/components/UserManagementView  │
│   - 完整功能实现                                │
│   - 使用自定义 Hooks                            │
│   - 组合通用组件                                │
└───────────────┬─────────────────────────────────┘
                │
       ┌────────┴────────┐
       │                 │
┌──────▼──────┐   ┌─────▼────────┐
│ 业务组件     │   │ 通用组件      │
│ (Business)   │   │ (Common)      │
│              │   │               │
│ UserFormDlg  │   │ DataTable     │
│ ClientCard   │   │ Button        │
│ RoleManager  │   │ Dialog        │
└──────┬──────┘   └─────┬────────┘
       │                 │
       └────────┬────────┘
                │
┌───────────────▼─────────────────────────────────┐
│       基础组件 (@repo/ui)                       │
│   - shadcn/ui 组件                              │
│   - 高度可复用                                  │
│   - 无业务逻辑                                  │
└─────────────────────────────────────────────────┘
```

### 核心布局组件

#### DashboardShell (`components/layout/DashboardShell.tsx`)

**功能**：
- 管理后台主布局
- 响应式侧边栏（桌面固定，移动抽屉）
- 顶部导航栏
- 用户菜单（个人资料、退出登录）
- 基于权限的菜单过滤

**菜单配置**：

```typescript
const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    name: '仪表盘',
    path: '/admin',
    icon: 'Home',
    permissions: ['menu:dashboard:view'],
  },
  {
    id: 'users',
    name: '用户管理',
    path: '/admin/users',
    icon: 'Users',
    permissions: ['menu:system:user:view', 'users:list'],
  },
  // ... 其他菜单项
];
```

**权限过滤逻辑**：

```typescript
const filteredMenuItems = menuItems.filter(item =>
  item.permissions ? hasPermission(item.permissions) : true
);
```

### 认证组件

#### AuthProvider (`components/auth/auth-provider.tsx`)

**功能**：
- 管理认证状态（user, isLoading, isAuthenticated）
- 提供认证方法（login, logout, initiateLogin）
- 自动加载用户信息（从 TokenStorage）
- 与 OAuth Service 交互

**Context API**：

```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  initiateLogin: () => void;
}
```

#### UsernamePasswordForm (`components/auth/username-password-form.tsx`)

**功能**：
- 用户名/密码登录表单
- 验证 redirect 参数（防止 open redirect 攻击）
- 提交到 OAuth Service `/api/v2/auth/login`
- 成功后重定向到 redirect URL

**安全验证**：

```typescript
function validateRedirectUrl(redirect: string): boolean {
  const url = new URL(decodeURIComponent(redirect));
  const validHost = url.host.startsWith('localhost');
  const validPath = url.pathname === '/api/v2/oauth/authorize';
  return validHost && validPath;
}
```

### 通用组件

#### DataTable（来自 @repo/ui）

**功能**：
- TanStack Table 集成
- 分页、排序、筛选
- 行操作（编辑、删除）
- 加载状态、空状态

#### DeleteConfirmDialog

**功能**：
- 删除确认对话框
- 显示项目名称和类型
- 处理删除操作中的加载状态

#### ErrorDisplay

**功能**：
- 统一错误显示
- 支持不同错误级别（error, warning, info）
- 可关闭和重试

---

## 功能模块（领域驱动设计）

### 模块结构标准

每个功能模块遵循相同的 DDD 分层结构：

```
features/[module-name]/
├── domain/                    # 领域层（核心业务规则）
│   ├── [entity].ts            # 实体定义、Schema、类型
│   └── [entity].repository.ts # 仓储接口（抽象）
├── application/               # 应用服务层（业务逻辑）
│   └── [entity].service.ts    # 服务实现
├── infrastructure/            # 基础设施层（外部依赖）
│   └── [entity].repository.ts # 仓储实现（API 调用）
├── components/                # UI 组件层
│   ├── [Entity]ManagementView.tsx  # 主视图
│   ├── [Entity]FormDialog.tsx      # 表单对话框
│   └── [Entity]TableColumns.tsx    # 表格列定义
├── hooks/                     # 自定义 Hooks
│   └── use-[entity]-management.ts  # 状态管理和业务逻辑
└── queries.ts                 # React Query 定义
```

### 用户管理模块（users/）详解

#### 1. 领域层 (`domain/user.ts`)

```typescript
// 用户状态枚举
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

// 分页响应结构
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
}

// Zod Schema 定义
export const CreateUserSchema = z.object({
  username: z.string().min(3, '用户名至少需要3个字符'),
  password: z.string().min(8, '密码至少需要8个字符').optional(),
  displayName: z.string().min(1, '显示名称不能为空'),
  // ... 其他字段
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

**职责**：
- 定义核心实体类型（User）
- 定义业务规则（Schema 验证）
- 定义领域概念（状态枚举）
- 定义仓储接口（IUserRepository）

#### 2. 应用服务层 (`application/user.service.ts`)

```typescript
export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async getUsers(params?: UsersQueryVariables): Promise<PaginatedResponse<User>> {
    // 业务逻辑：参数转换、验证
    return this.userRepository.getUsers(params);
  }

  async createUser(userData: CreateUserInput): Promise<User> {
    // 业务逻辑：数据验证、转换
    CreateUserSchema.parse(userData);
    return this.userRepository.createUser(userData);
  }

  // ... 其他方法
}
```

**职责**：
- 编排业务逻辑
- 调用仓储获取/保存数据
- 数据验证和转换

#### 3. 基础设施层 (`infrastructure/user.repository.ts`)

```typescript
export class UserRepository implements IUserRepository {
  async getUsers(params?: any): Promise<PaginatedResponse<User>> {
    const res = await adminApi.getUsers(params);
    // 数据适配和转换
    return {
      ...res,
      meta: {
        ...res.meta,
        itemCount: res.meta.itemCount ?? res.meta.totalItems ?? 0,
      },
    };
  }

  async createUser(userData: any): Promise<User> {
    return adminApi.createUser(userData) as unknown as Promise<User>;
  }

  // ... 其他方法
}
```

**职责**：
- 实现仓储接口
- 调用 API 客户端
- 数据格式适配和转换

#### 4. React Query 集成 (`queries.ts`)

```typescript
// 查询键工厂（Query Key Factory）
export const userQueryKeys = {
  all: ['users'] as const,
  lists: () => [...userQueryKeys.all, 'list'] as const,
  list: (params: UsersQueryVariables) => [...userQueryKeys.lists(), params] as const,
  details: () => [...userQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...userQueryKeys.details(), id] as const,
  // ... 其他键
};

// 用户列表查询
export const useUsersQuery = (params: UsersQueryVariables = {}) => {
  return useQuery<PaginatedResponse<User>, Error>({
    queryKey: userQueryKeys.list(params),
    queryFn: () => userService.getUsers(params),
    placeholderData: (previousData) => previousData,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
};

// 创建用户变更
export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<User, Error, CreateUserInput>({
    mutationFn: (userData) => userService.createUser(userData),
    onSuccess: (newUser) => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });
      queryClient.setQueryData(userQueryKeys.detail(newUser.id), newUser);
    },
  });
};
```

**查询配置策略**：
- **staleTime**: 数据新鲜度时间（30秒）
- **refetchOnWindowFocus**: 禁用窗口聚焦时重新获取
- **placeholderData**: 在新数据到达前保留旧数据
- **invalidateQueries**: 操作成功后刷新相关查询
- **optimistic updates**: 立即更新缓存数据

#### 5. 自定义 Hook (`hooks/use-user-management.ts`)

```typescript
export const useUserManagement = () => {
  const queryClient = useQueryClient();

  // UI State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Table State
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  // Data fetching
  const { data, isLoading, error } = useUsersQuery({ offset: pageIndex * pageSize, limit: pageSize });

  // Mutations
  const { mutate: createUser, isPending: isCreatingUser } = useCreateUserMutation();
  const { mutate: updateUser, isPending: isUpdatingUser } = useUpdateUserMutation();
  const { mutate: deleteUser, isPending: isDeletingUser } = useDeleteUserMutation();

  // Methods
  const openCreateModal = () => { /* ... */ };
  const handleCreate = (data: CreateUserInput) => { /* ... */ };
  // ... 其他方法

  return {
    users: data?.data ?? [],
    usersMeta: data?.meta,
    areUsersLoading: isLoading,
    pagination: { pageIndex, pageSize },
    setPagination,
    sorting,
    setSorting,
    isModalOpen,
    selectedUser,
    openCreateModal,
    handleCreate,
    // ... 其他状态和方法
  };
};
```

**封装的逻辑**：
- UI 状态管理（模态框、选中项）
- 表格状态（分页、排序）
- 数据获取和变更
- 业务操作方法（创建、编辑、删除）

#### 6. UI 组件 (`components/UserManagementView.tsx`)

```typescript
export function UserManagementView() {
  const { hasPermission } = useAuth();
  const {
    users,
    usersMeta,
    areUsersLoading,
    pagination,
    setPagination,
    sorting,
    setSorting,
    isModalOpen,
    selectedUser,
    openCreateModal,
    openEditModal,
    closeModal,
    handleCreate,
    handleUpdate,
    openDeleteConfirm,
    closeDeleteConfirm,
    isDeleteConfirmOpen,
    handleDelete,
    isProcessing,
  } = useUserManagement();

  const columns = useMemo(
    () => getUserColumns({ onEdit: openEditModal, onDelete: openDeleteConfirm }),
    [openEditModal, openDeleteConfirm]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">用户管理</h2>
        {hasPermission('users:create') && (
          <Button onClick={openCreateModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> 添加用户
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={users}
        pageCount={usersMeta?.totalPages ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        isLoading={areUsersLoading}
      />

      <UserFormDialog
        isOpen={isModalOpen}
        onClose={closeModal}
        user={selectedUser}
        isProcessing={isProcessing}
        onSubmit={selectedUser ? handleUpdate : handleCreate}
      />

      <DeleteConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={closeDeleteConfirm}
        onConfirm={handleDelete}
        isProcessing={isProcessing}
        itemName={selectedUser?.username || '该用户'}
        itemType="用户"
      />
    </div>
  );
}
```

**组件职责**：
- 渲染 UI
- 使用自定义 Hook 获取状态和方法
- 基于权限显示/隐藏操作按钮
- 组合通用组件（DataTable, Dialog 等）

### 其他功能模块

所有功能模块遵循相同的架构模式：

- **roles/**: 角色管理
- **permissions/**: 权限管理
- **clients/**: OAuth 客户端管理
- **audit/**: 审计日志
- **system-config/**: 系统配置
- **dashboard/**: 仪表盘统计

---

## OAuth 2.1 集成

### 认证流程概览

```
┌─────────────────────────────────────────────────────────────────┐
│             OAuth 2.1 授权码流程（带 PKCE）                      │
│                第三方客户端模式                                   │
└─────────────────────────────────────────────────────────────────┘

1. 用户访问受保护页面 (e.g., /admin/users)
   │
   ▼
2. proxy.ts 检测无有效 access_token
   │
   ▼
3. 生成 PKCE 参数
   ├─ state (32 字符, CSRF 防护)
   ├─ code_verifier (128 字符, PKCE 验证器)
   └─ code_challenge (SHA256 hash of verifier, Base64URL)
   │
   ▼
4. 存储到 cookies
   ├─ oauth_state (httpOnly=false, 客户端验证)
   ├─ oauth_code_verifier (httpOnly=false, 服务器读取)
   └─ oauth_redirect_path (httpOnly=true, 原始路径)
   │
   ▼
5. 重定向到 OAuth Service
   GET /api/v2/oauth/authorize?
     client_id=admin-portal-client&
     redirect_uri=http://localhost:3002/auth/callback&
     response_type=code&
     scope=openid+profile+email&
     state=<state>&
     code_challenge=<challenge>&
     code_challenge_method=S256
   │
   ▼
6. OAuth Service 检查 session_token (没有)
   │
   ▼
7. 重定向到 /login?redirect=<authorize_url>
   │
   ▼
8. 用户输入凭证并提交
   POST /api/v2/auth/login
   Body: { username, password, redirect }
   │
   ▼
9. OAuth Service 验证凭证
   │
   ▼
10. 设置 session_token cookie (httpOnly, secure, sameSite=Lax)
    │
    ▼
11. 重定向回 redirect URL (原始 authorize URL)
    │
    ▼
12. OAuth Service 现在有 session_token
    ├─ 生成 authorization code
    └─ 重定向到 callback
    │
    ▼
13. Admin Portal /auth/callback 处理
    GET /auth/callback?code=<code>&state=<state>
    │
    ▼
14. 验证 state 参数 (CSRF 防护)
    │
    ▼
15. 从 cookie 提取 code_verifier
    │
    ▼
16. 交换 code 为 token
    POST /api/v2/oauth/token
    Body: {
      grant_type: authorization_code,
      code: <code>,
      code_verifier: <verifier>,
      client_id: admin-portal-client,
      redirect_uri: http://localhost:3002/auth/callback
    }
    │
    ▼
17. 获取 access_token 和 refresh_token
    │
    ▼
18. 存储 token
    ├─ 调用 /api/auth/login-callback 设置 cookies
    └─ TokenStorage.setTokens() 存储到 sessionStorage
    │
    ▼
19. 获取用户信息
    GET /api/v2/users/me
    Authorization: Bearer <access_token>
    │
    ▼
20. 更新认证状态 (AuthContext)
    │
    ▼
21. 从 cookie 读取 oauth_redirect_path
    │
    ▼
22. 重定向到原始请求路径 (/admin/users)
    │
    ▼
23. proxy.ts 检测到有效 token
    │
    ▼
24. 允许访问 ✅
```

### 关键集成点

#### 1. proxy.ts - 启动 OAuth 流程

**位置**: `/home/user/ts-next/apps/admin-portal/proxy.ts`

**核心函数**: `initiateOAuthFlow()`

```typescript
async function initiateOAuthFlow(request: NextRequest, redirectPath: string): Promise<NextResponse> {
  // 生成 PKCE 参数
  const state = generateRandomString(32);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // 构建授权端点 URL
  const authorizeUrl = new URL(
    `${process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL}/api/v2/oauth/authorize`
  );
  authorizeUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal-client');
  authorizeUrl.searchParams.set('redirect_uri', `${request.nextUrl.origin}/auth/callback`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid profile email');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  // 创建重定向响应
  const response = NextResponse.redirect(authorizeUrl);

  // 存储 OAuth 参数到 cookies
  response.cookies.set('oauth_state', state, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 分钟
    path: '/'
  });
  response.cookies.set('oauth_code_verifier', codeVerifier, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/'
  });
  response.cookies.set('oauth_redirect_path', redirectPath, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/'
  });

  return response;
}
```

**何时触发**：
- 用户访问受保护路由
- access_token 不存在或已过期

#### 2. Login 页面 - 用户认证

**位置**: `/home/user/ts-next/apps/admin-portal/app/(auth)/login/page.tsx`

**功能**：
- 显示登录表单
- 验证 redirect 参数（防止 open redirect）
- 提交凭证到 OAuth Service

**关键组件**: `UsernamePasswordForm`

```typescript
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  // 验证 redirect 参数
  if (redirect && !validateRedirectUrl(redirect)) {
    setError('invalid_redirect');
    return;
  }

  // 提交到 OAuth Service (通过 Pingora 6188)
  const pingora_url = `${window.location.protocol}//${window.location.hostname}:6188`;
  const loginUrl = new URL(`${pingora_url}/api/v2/auth/login`);

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, redirect }),
    credentials: 'include', // 关键：允许设置 cookies
  });

  if (response.ok) {
    const loginData = await response.json();
    // 重定向到 redirect_url (原始 authorize URL)
    window.location.href = loginData.redirect_url;
  }
};
```

**安全验证**：

```typescript
function validateRedirectUrl(redirect: string): boolean {
  const url = new URL(decodeURIComponent(redirect));
  const validHost = url.host.startsWith('localhost');
  const validPath = url.pathname === '/api/v2/oauth/authorize';
  return validHost && validPath;
}
```

#### 3. Callback 页面 - Token 交换

**位置**: `/home/user/ts-next/apps/admin-portal/app/(auth)/callback/page.tsx`

**功能**：
- 验证 state 参数（CSRF 防护）
- 从 cookie 提取 code_verifier
- 交换 authorization code 为 token
- 存储 token 到 cookies 和 sessionStorage
- 获取用户信息
- 重定向到原始请求路径

**核心逻辑**：

```typescript
const handleCallback = async () => {
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  // 从 cookies 提取
  const cookies = document.cookie;
  const codeVerifier = cookies.split(';').find(c => c.trim().startsWith('oauth_code_verifier='))?.split('=')[1];
  const storedState = cookies.split(';').find(c => c.trim().startsWith('oauth_state='))?.split('=')[1];

  // 验证 state
  if (storedState && state !== storedState) {
    setError('无效的请求，可能存在CSRF攻击');
    return;
  }

  // 交换 code 为 token
  const tokenResponse = await apiRequest('/api/v2/oauth/token', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${window.location.origin}/auth/callback`,
      client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  // 设置 cookies (proxy.ts 需要从 cookies 读取)
  await fetch('/api/auth/login-callback', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
    }),
  });

  // 存储到 TokenStorage (客户端使用)
  TokenStorage.setTokens({
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresIn: tokenResponse.expires_in
  });

  // 获取用户信息
  const userResponse = await fetch('/api/v2/users/me', {
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` },
  });
  const userData = await userResponse.json();

  // 更新认证状态
  login(userData);

  // 重定向到原始路径
  const redirectPath = cookies.split(';').find(c => c.trim().startsWith('oauth_redirect_path='))?.split('=')[1] || '/admin';
  router.push(decodeURIComponent(redirectPath));
};
```

#### 4. Token 存储管理

**位置**: `/home/user/ts-next/apps/admin-portal/lib/auth/token-storage.ts`

```typescript
export const TokenStorage = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('access_token');
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('refresh_token');
  },

  setTokens(tokens: { accessToken: string; refreshToken: string; expiresIn?: number }): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('access_token', tokens.accessToken);
    sessionStorage.setItem('refresh_token', tokens.refreshToken);
    if (tokens.expiresIn) {
      const expiresAt = Date.now() + tokens.expiresIn * 1000;
      sessionStorage.setItem('token_expires_at', expiresAt.toString());
    }
  },

  clearTokens(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('token_expires_at');
  },

  isTokenExpired(): boolean {
    if (typeof window === 'undefined') return true;
    const expiresAt = sessionStorage.getItem('token_expires_at');
    if (!expiresAt) return true;
    return Date.now() > parseInt(expiresAt);
  },
};
```

**存储策略**：
- **sessionStorage**: 客户端组件使用（API 调用时读取）
- **Cookies (httpOnly)**: proxy.ts 使用（服务器端路由保护）

#### 5. 认证状态管理

**位置**: `/home/user/ts-next/apps/admin-portal/components/auth/auth-provider.tsx`

```typescript
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化认证状态
  useEffect(() => {
    const initializeAuth = async () => {
      const accessToken = TokenStorage.getAccessToken();
      if (accessToken) {
        const userInfo = await fetchUserInfo(accessToken);
        if (userInfo) setUser(userInfo);
      }
      setIsLoading(false);
    };
    initializeAuth();
  }, []);

  const login = useCallback(async (accessToken: string, refreshToken: string) => {
    TokenStorage.setTokens({ accessToken, refreshToken });
    const userInfo = await fetchUserInfo(accessToken);
    if (userInfo) setUser(userInfo);
  }, []);

  const logout = useCallback(() => {
    // 撤销 refresh_token
    fetch(`${OAUTH_SERVICE_URL}/api/v2/oauth/revoke`, {
      method: 'POST',
      body: new URLSearchParams({
        token: TokenStorage.getRefreshToken(),
        client_id: OAUTH_CLIENT_ID,
        token_type_hint: 'refresh_token',
      }),
    }).catch(err => console.error('Failed to revoke token:', err));

    TokenStorage.clearTokens();
    setUser(null);
    router.push('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, initiateLogin }}>
      {children}
    </AuthContext.Provider>
  );
}
```

---

## 状态管理策略

### 多层状态管理架构

```
┌─────────────────────────────────────────────────────────────┐
│                    服务端状态                                │
│              (@tanstack/react-query)                        │
│   - API 数据缓存                                            │
│   - 自动重新获取                                            │
│   - 乐观更新                                                │
│   - 后台同步                                                │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                 全局客户端状态                               │
│                (React Context API)                          │
│   - 认证状态 (user, isLoading, isAuthenticated)            │
│   - Toast 通知                                              │
│   - 全局 UI 状态                                            │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                 组件本地状态                                 │
│                  (useState, useReducer)                     │
│   - 表单输入                                                │
│   - UI 交互状态（模态框、抽屉等）                            │
│   - 临时数据                                                │
└─────────────────────────────────────────────────────────────┘
```

### 1. 服务端状态 (React Query)

#### 查询键管理

**标准化查询键结构**：

```typescript
export const [entity]QueryKeys = {
  all: ['entity'] as const,
  lists: () => [...entityQueryKeys.all, 'list'] as const,
  list: (params: QueryParams) => [...entityQueryKeys.lists(), params] as const,
  details: () => [...entityQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...entityQueryKeys.details(), id] as const,
  stats: () => [...entityQueryKeys.all, 'stats'] as const,
};
```

**优势**：
- 类型安全
- 易于失效（invalidate）相关查询
- 支持部分匹配（invalidate all lists vs specific list）

#### 查询配置策略

```typescript
// 列表查询 - 短缓存时间，支持占位数据
export const useUsersQuery = (params: UsersQueryVariables = {}) => {
  return useQuery({
    queryKey: userQueryKeys.list(params),
    queryFn: () => userService.getUsers(params),
    placeholderData: (previousData) => previousData, // 保留旧数据直到新数据到达
    staleTime: 30 * 1000, // 30秒新鲜期
    refetchOnWindowFocus: false, // 禁用窗口聚焦重新获取
  });
};

// 详情查询 - 较长缓存时间
export const useUserQuery = (userId: string | null) => {
  return useQuery({
    queryKey: userQueryKeys.detail(userId!),
    queryFn: () => userService.getUserById(userId!),
    enabled: !!userId, // 条件启用
    staleTime: 60 * 1000, // 1分钟新鲜期
  });
};

// 统计查询 - 定期刷新
export const useUserStatsQuery = () => {
  return useQuery({
    queryKey: userQueryKeys.stats(),
    queryFn: () => adminApi.getStatsSummary(),
    staleTime: 5 * 60 * 1000, // 5分钟新鲜期
    refetchInterval: 5 * 60 * 1000, // 每5分钟自动刷新
  });
};
```

#### 变更（Mutation）处理

```typescript
export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<User, Error, CreateUserInput>({
    mutationFn: (userData) => userService.createUser(userData),
    onSuccess: (newUser) => {
      // 1. 失效所有列表查询（触发重新获取）
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });

      // 2. 失效统计查询
      queryClient.invalidateQueries({ queryKey: userQueryKeys.stats() });

      // 3. 直接设置新用户详情缓存（乐观更新）
      queryClient.setQueryData(userQueryKeys.detail(newUser.id), newUser);

      // 4. 触发成功通知
      console.log('用户创建成功:', newUser.username);
    },
    onError: (error) => {
      console.error('用户创建失败:', error);
    },
  });
};
```

### 2. 全局客户端状态 (Context API)

#### AuthContext

**位置**: `components/auth/auth-provider.tsx`

```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  initiateLogin: () => void;
}
```

**使用方式**：

```typescript
import { useAuth } from '@repo/ui/hooks';

function MyComponent() {
  const { user, isAuthenticated, hasPermission, logout } = useAuth();

  if (!isAuthenticated) return <div>请登录</div>;

  return (
    <div>
      <p>欢迎, {user?.username}</p>
      {hasPermission('users:create') && <CreateButton />}
      <button onClick={logout}>退出</button>
    </div>
  );
}
```

#### ToastContext

**位置**: `components/common/toast.tsx`

```typescript
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

// 使用 sonner 的 toast 函数
import { toast } from 'sonner';

toast.success('操作成功！');
toast.error('操作失败');
toast.info('提示信息');
```

### 3. 组件本地状态

#### 表单状态 (react-hook-form)

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateUserSchema } from '../domain/user';

function UserFormDialog() {
  const form = useForm({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: {
      username: '',
      displayName: '',
      isActive: true,
    },
  });

  const onSubmit = (data: CreateUserInput) => {
    createUser(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register('username')} />
      {form.formState.errors.username && <span>{form.formState.errors.username.message}</span>}
      <button type="submit">提交</button>
    </form>
  );
}
```

#### UI 交互状态

```typescript
function UserManagementView() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  // ...
}
```

---

## API 调用与数据获取

### API 客户端架构

#### 分层结构

```
┌─────────────────────────────────────────────────────────────┐
│              React Query Hooks (queries.ts)                  │
│   - useUsersQuery()                                         │
│   - useCreateUserMutation()                                 │
│   - 缓存管理、乐观更新                                       │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│           应用服务层 (application/service.ts)                │
│   - UserService.getUsers()                                  │
│   - 业务逻辑、数据验证                                       │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│         仓储层 (infrastructure/repository.ts)               │
│   - UserRepository.getUsers()                               │
│   - 调用 API 客户端、数据转换                                │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                API 客户端 (lib/api.ts)                      │
│   - authenticatedRequest()                                  │
│   - 统一 HTTP 调用、错误处理、认证头                         │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│              Fetch API (浏览器原生)                         │
│   - HTTP 请求                                               │
│   - OAuth Service (通过 Pingora 6188)                      │
└─────────────────────────────────────────────────────────────┘
```

### API 客户端实现

**位置**: `/home/user/ts-next/apps/admin-portal/lib/api.ts`

#### 基础请求函数

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:6188/api/v2';

// 基础请求
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// 带认证的请求
async function authenticatedRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { TokenStorage } = await import('./auth/token-storage');
  const accessToken = TokenStorage.getAccessToken();

  return apiRequest<T>(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
    },
  });
}
```

#### 认证 API (authApi)

```typescript
export const authApi = {
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthTokens> {
    return apiRequest('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'admin-portal-client',
        code: code,
        redirect_uri: process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'http://localhost:3002/auth/callback',
        code_verifier: codeVerifier,
      }),
    });
  },

  async logout() {
    const { TokenStorage } = await import('./auth/token-storage');
    TokenStorage.clearTokens();
  },

  async fetchUserProfile(): Promise<User> {
    return authenticatedRequest('/users/me');
  },
};
```

#### 管理 API (adminApi)

```typescript
export const adminApi = {
  // 用户管理
  async getUsers(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<User>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);

    const queryString = searchParams.toString();
    const endpoint = `/users${queryString ? `?${queryString}` : ''}`;
    return authenticatedRequest(endpoint);
  },

  async getUserById(userId: string): Promise<User | null> {
    return authenticatedRequest(`/users/${userId}`);
  },

  async createUser(userData: CreateUserInput): Promise<User> {
    return authenticatedRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async updateUser(userId: string, userData: UpdateUserInput): Promise<User> {
    return authenticatedRequest(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  async deleteUser(userId: string): Promise<void> {
    await authenticatedRequest(`/users/${userId}`, {
      method: 'DELETE',
    });
  },

  // 角色管理
  async getRoles(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<Role>> {
    // ... 类似实现
  },

  // OAuth 客户端管理
  async getClients(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<OAuthClient>> {
    // ... 类似实现
  },

  async rotateClientSecret(clientId: string): Promise<{ clientSecret: string }> {
    return authenticatedRequest(`/clients/${clientId}/secret`, {
      method: 'POST',
    });
  },

  // 审计日志
  async getAuditLogs(params?: AuditLogQueryParams): Promise<PaginatedResponse<AuditLog>> {
    // ... 类似实现
  },

  // 系统配置
  async getSystemConfig(): Promise<SystemConfiguration[]> {
    return authenticatedRequest('/system/config');
  },

  async updateSystemConfig(configData: SystemConfiguration[]): Promise<SystemConfiguration[]> {
    return authenticatedRequest('/system/config', {
      method: 'PUT',
      body: JSON.stringify(configData),
    });
  },
};
```

### 错误处理策略

#### API 层错误处理

```typescript
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // 根据状态码分类处理
      switch (response.status) {
        case 401:
          throw new Error('未授权，请重新登录');
        case 403:
          throw new Error('权限不足');
        case 404:
          throw new Error('资源不存在');
        case 500:
          throw new Error('服务器内部错误');
        default:
          throw new Error(errorData.message || `HTTP ${response.status}`);
      }
    }

    return response.json();
  } catch (error) {
    // 网络错误或其他异常
    if (error instanceof TypeError) {
      throw new Error('网络连接失败，请检查您的网络');
    }
    throw error;
  }
}
```

#### React Query 错误处理

```typescript
export const useUsersQuery = (params: UsersQueryVariables = {}) => {
  return useQuery({
    queryKey: userQueryKeys.list(params),
    queryFn: () => userService.getUsers(params),
    onError: (error: Error) => {
      toast.error(`获取用户列表失败: ${error.message}`);
    },
    retry: (failureCount, error) => {
      // 401/403 不重试，其他错误最多重试 2 次
      if (error.message.includes('未授权') || error.message.includes('权限不足')) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
```

#### 全局错误处理

**位置**: `components/error/global-error-handler.tsx`

```typescript
export function GlobalErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      toast.error('应用发生错误，请刷新页面重试');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      toast.error('操作失败，请稍后重试');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
```

---

## 中间件与路由保护

### proxy.ts 架构 (Next.js 16)

**位置**: `/home/user/ts-next/apps/admin-portal/proxy.ts`

**运行环境**: Node.js Runtime（不是 Edge Runtime）

#### 路由分类

```typescript
// 受保护路由（需要认证和权限）
const protectedRoutes = ['/admin', '/profile'];

// 认证路由（OAuth 流程）
const authRoutes = ['/auth/callback'];

// 公共路由（无需认证）
const publicRoutes = ['/health', '/api', '/login', '/oauth/consent'];

// 页面路径与所需权限静态映射表
const routePermissionMap: Record<string, string[]> = {
  '/admin': ['dashboard:view'],
  '/admin/users': ['menu:system:user:view', 'users:list'],
  '/admin/system/roles': ['menu:system:role:view', 'roles:list'],
  '/admin/system/permissions': ['menu:system:permission:view', 'permissions:list'],
  '/admin/system/clients': ['menu:system:client:view', 'clients:list'],
  '/admin/system/audits': ['menu:system:audit:view', 'audit:list'],
  '/admin/config': ['system:config:edit'],
};
```

#### 核心处理流程

```typescript
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 跳过静态资源
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/auth/secure')) {
    return NextResponse.next();
  }

  // 2. 处理 API 安全路由
  if (pathname.startsWith('/api/auth/')) {
    let response = NextResponse.next();
    response = setSecurityHeaders(response);
    return response;
  }

  // 3. 检查是否为受保护路由
  const isProtectedRoute = Object.keys(routePermissionMap).some((route) =>
    pathname.startsWith(route)
  );

  // 4. 获取令牌
  const accessToken = request.cookies.get('access_token')?.value;

  // 5. 受保护路由逻辑
  if (isProtectedRoute) {
    // 5.1 检查令牌
    if (!accessToken || isTokenExpired(accessToken)) {
      // 第三方客户端模式：直接启动 OAuth 授权流程
      return await initiateOAuthFlow(request, pathname);
    }

    // 5.2 解析 token，获取权限
    const payload = parseJwt(accessToken);
    const userPermissions: string[] = payload?.permissions || [];

    // 5.3 获取当前页面所需权限
    const requiredPermissions = Object.entries(routePermissionMap)
      .find(([route]) => pathname.startsWith(route))?.[1] || [];

    // 5.4 权限验证
    const hasPermission = requiredPermissions.length === 0 ||
      requiredPermissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      // 权限不足，重定向到 unauthorized
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
    }
  }

  // 6. OAuth 回调处理
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  if (isAuthRoute && accessToken && !isTokenExpired(accessToken)) {
    // 用户已登录且访问 /auth/callback，重定向回管理后台
    const adminUrl = new URL('/admin', request.url);
    return NextResponse.redirect(adminUrl);
  }

  // 7. 为所有响应添加安全头部
  let response = NextResponse.next();
  response = setSecurityHeaders(response);

  // 8. 为 GET 请求设置 CSRF 令牌
  if (request.method === 'GET') {
    const csrfToken = request.cookies.get('csrf_token')?.value;
    if (!csrfToken) {
      const newCSRFToken = generateCodeVerifier();
      response.cookies.set('csrf_token', newCSRFToken, {
        maxAge: 3600,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
  }

  return response;
}
```

#### 安全头部配置

```typescript
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

const contentSecurityPolicy = {
  dashboard: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
};

function setSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  response.headers.set('Content-Security-Policy', contentSecurityPolicy.dashboard);

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  return response;
}
```

#### JWT 解析和验证

```typescript
// 简单 JWT 解析（仅 Base64 解码，不校验签名）
function parseJwt(token: string): any {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// 检查令牌是否过期
function isTokenExpired(token: string): boolean {
  try {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
```

### 组件级权限守卫

#### PermissionGuard (`components/permission/permission-guard.tsx`)

```typescript
interface PermissionGuardProps {
  requiredPermission: string | string[];
  user: User | null;
  isLoading: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

export function PermissionGuard({
  requiredPermission,
  user,
  isLoading,
  children,
  fallback = <div>您没有权限访问此内容</div>,
  loadingFallback = <div>正在验证权限...</div>,
}: PermissionGuardProps) {
  if (isLoading) return <>{loadingFallback}</>;
  if (!user) return <>{fallback}</>;

  const permissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
  const hasPermission = permissions.some(p => user.permissions?.includes(p));

  if (!hasPermission) return <>{fallback}</>;

  return <>{children}</>;
}
```

**使用示例**：

```typescript
// 页面级权限守卫
export default function UsersPage() {
  const { user, isLoading } = useAuth();

  return (
    <PermissionGuard
      requiredPermission={['menu:system:user:view', 'users:list']}
      user={user}
      isLoading={isLoading}
      fallback={<div>您没有权限查看此页面</div>}
      loadingFallback={<div>正在验证权限...</div>}
    >
      <UserManagementView />
    </PermissionGuard>
  );
}

// 按钮级权限控制
function UserManagementView() {
  const { hasPermission } = useAuth();

  return (
    <div>
      {hasPermission('users:create') && (
        <Button onClick={openCreateModal}>添加用户</Button>
      )}
      {hasPermission('users:delete') && (
        <Button onClick={openDeleteConfirm}>删除用户</Button>
      )}
    </div>
  );
}
```

---

## 类型系统与数据流

### 类型定义架构

```
┌─────────────────────────────────────────────────────────────┐
│              types/auth.ts（应用层类型）                     │
│   - User (来自 API 响应)                                    │
│   - OAuthClient                                             │
│   - Role                                                    │
│   - Permission                                              │
│   - AuditLog                                                │
│   - SystemConfiguration                                     │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│         features/[module]/domain/*.ts                       │
│   - Schema 定义 (Zod)                                       │
│   - CreateUserInput (from Zod)                              │
│   - UpdateUserInput (from Zod)                              │
│   - PaginatedResponse<T>                                    │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│              @repo/ui types                                 │
│   - AuthUser (跨应用共享)                                   │
│   - AuthTokens                                              │
│   - AuthProviderInterface                                   │
└─────────────────────────────────────────────────────────────┘
```

### 核心类型定义

#### User 类型 (`types/auth.ts`)

```typescript
export interface User {
  id: string;
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  department: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  userRoles: { roleId: string }[];
}
```

#### OAuthClient 类型 (`types/auth.ts`)

```typescript
export interface OAuthClient {
  id: string;
  clientId: string;
  clientSecret?: string;
  clientType: 'CONFIDENTIAL' | 'PUBLIC';
  name: string;
  description?: string;
  redirectUris: string[];
  allowedScopes?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  jwksUri?: string;
  logoUri?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Role 和 Permission 类型

```typescript
export interface Role {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  type: 'API' | 'MENU' | 'DATA';
  resource?: string;
  action?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Schema 验证 (Zod)

#### 用户创建 Schema (`features/users/domain/user.ts`)

```typescript
export const CreateUserSchema = z.object({
  username: z.string().min(3, '用户名至少需要3个字符'),
  password: z.string().min(8, '密码至少需要8个字符').optional(),
  displayName: z.string().min(1, '显示名称不能为空'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  organization: z.string().optional(),
  department: z.string().optional(),
  isActive: z.boolean().default(true),
  mustChangePassword: z.boolean().default(true),
  roleIds: z.array(z.string().cuid('无效的角色ID')).default([]),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

#### 用户更新 Schema

```typescript
export const UpdateUserSchema = z.object({
  displayName: z.string().min(1, '显示名称不能为空').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  organization: z.string().optional(),
  department: z.string().optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  roleIds: z.array(z.string().cuid('无效的角色ID')).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
```

### 数据流转

```
┌─────────────────────────────────────────────────────────────┐
│                    1. UI 层 (页面/组件)                      │
│   - 用户交互（表单输入、按钮点击）                            │
│   - 触发 Hook 中的方法                                       │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ CreateUserInput
                ▼
┌─────────────────────────────────────────────────────────────┐
│              2. Hook 层 (use-user-management.ts)             │
│   - 封装业务逻辑和状态                                       │
│   - 调用 React Query Mutation                               │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ CreateUserInput
                ▼
┌─────────────────────────────────────────────────────────────┐
│              3. React Query 层 (queries.ts)                  │
│   - mutationFn: () => userService.createUser(data)          │
│   - onSuccess: 更新缓存、失效查询                            │
│   - onError: 错误处理                                        │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ CreateUserInput
                ▼
┌─────────────────────────────────────────────────────────────┐
│           4. 应用服务层 (application/user.service.ts)        │
│   - 数据验证（Zod Schema）                                   │
│   - 调用仓储层                                               │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ CreateUserInput
                ▼
┌─────────────────────────────────────────────────────────────┐
│       5. 仓储层 (infrastructure/user.repository.ts)          │
│   - 调用 API 客户端                                          │
│   - 数据格式转换                                             │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ JSON body
                ▼
┌─────────────────────────────────────────────────────────────┐
│                  6. API 客户端 (lib/api.ts)                  │
│   - HTTP 请求（POST /api/v2/users）                         │
│   - 添加认证头（Bearer token）                               │
│   - 错误处理                                                 │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ HTTP Request
                ▼
┌─────────────────────────────────────────────────────────────┐
│         7. OAuth Service (Rust + Axum, 通过 Pingora 6188)   │
│   - 接收请求                                                 │
│   - 业务处理                                                 │
│   - 数据库操作                                               │
│   - 返回响应 (User JSON)                                     │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ User (JSON response)
                ▼
┌─────────────────────────────────────────────────────────────┐
│              8. 数据回流（逆向流转）                          │
│   API 客户端 → 仓储层 → 服务层 → React Query                │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ User
                ▼
┌─────────────────────────────────────────────────────────────┐
│               9. 缓存更新和 UI 刷新                          │
│   - queryClient.invalidateQueries()                         │
│   - queryClient.setQueryData()                              │
│   - React 自动重新渲染                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 性能优化策略

### 1. 代码分割和懒加载

#### 路由级代码分割

Next.js 自动为每个页面生成独立的 JavaScript 包：

```
app/
├── (dashboard)/admin/users/page.tsx        → /admin/users.js
├── (dashboard)/admin/system/roles/page.tsx → /admin/system/roles.js
└── (dashboard)/admin/config/page.tsx       → /admin/config.js
```

#### 组件懒加载

```typescript
import dynamic from 'next/dynamic';

// 懒加载重型组件
const HeavyChart = dynamic(() => import('@/components/charts/HeavyChart'), {
  loading: () => <Skeleton className="h-96 w-full" />,
  ssr: false, // 禁用服务端渲染（仅客户端）
});

function DashboardPage() {
  return (
    <div>
      <HeavyChart data={chartData} />
    </div>
  );
}
```

### 2. React Query 缓存优化

#### 查询配置

```typescript
// 列表查询 - 保留旧数据直到新数据到达
export const useUsersQuery = (params: UsersQueryVariables = {}) => {
  return useQuery({
    queryKey: userQueryKeys.list(params),
    queryFn: () => userService.getUsers(params),
    placeholderData: (previousData) => previousData, // 关键：防止闪烁
    staleTime: 30 * 1000, // 30秒内数据新鲜
    gcTime: 5 * 60 * 1000, // 5分钟后清理缓存（原 cacheTime）
  });
};
```

#### 预取（Prefetching）

```typescript
function UserListItem({ user }: { user: User }) {
  const queryClient = useQueryClient();

  const prefetchUserDetails = () => {
    queryClient.prefetchQuery({
      queryKey: userQueryKeys.detail(user.id),
      queryFn: () => userService.getUserById(user.id),
    });
  };

  return (
    <div onMouseEnter={prefetchUserDetails}>
      {user.username}
    </div>
  );
}
```

#### 乐观更新

```typescript
export const useUpdateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, userData }) => userService.updateUser(userId, userData),
    onMutate: async ({ userId, userData }) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: userQueryKeys.detail(userId) });

      // 保存快照
      const previousUser = queryClient.getQueryData<User>(userQueryKeys.detail(userId));

      // 乐观更新
      if (previousUser) {
        queryClient.setQueryData(userQueryKeys.detail(userId), {
          ...previousUser,
          ...userData,
        });
      }

      return { previousUser };
    },
    onError: (err, variables, context) => {
      // 回滚到快照
      if (context?.previousUser) {
        queryClient.setQueryData(userQueryKeys.detail(variables.userId), context.previousUser);
      }
    },
    onSettled: (data, error, { userId }) => {
      // 刷新数据
      queryClient.invalidateQueries({ queryKey: userQueryKeys.detail(userId) });
    },
  });
};
```

### 3. React 性能优化

#### useMemo 和 useCallback

```typescript
function UserManagementView() {
  const {
    users,
    openEditModal,
    openDeleteConfirm,
  } = useUserManagement();

  // 缓存表格列定义（防止重复创建）
  const columns = useMemo(
    () => getUserColumns({ onEdit: openEditModal, onDelete: openDeleteConfirm }),
    [openEditModal, openDeleteConfirm]
  );

  // 缓存过滤逻辑
  const filteredUsers = useMemo(() => {
    return users.filter(user => user.isActive);
  }, [users]);

  return <DataTable columns={columns} data={filteredUsers} />;
}
```

#### React.memo 组件优化

```typescript
export const UserTableRow = React.memo<UserTableRowProps>(
  function UserTableRow({ user, onEdit, onDelete }) {
    return (
      <tr>
        <td>{user.username}</td>
        <td>
          <Button onClick={() => onEdit(user)}>编辑</Button>
          <Button onClick={() => onDelete(user)}>删除</Button>
        </td>
      </tr>
    );
  },
  (prevProps, nextProps) => {
    // 自定义比较函数
    return prevProps.user.id === nextProps.user.id &&
           prevProps.user.username === nextProps.user.username;
  }
);
```

### 4. 图片和资源优化

#### Next.js Image 组件

```typescript
import Image from 'next/image';

function UserAvatar({ user }: { user: User }) {
  return (
    <Image
      src={user.avatar || '/default-avatar.png'}
      alt={user.username}
      width={40}
      height={40}
      className="rounded-full"
      priority={false} // 非关键图片，懒加载
    />
  );
}
```

### 5. 网络优化

#### 请求去重

React Query 自动去重同一 queryKey 的并发请求：

```typescript
// 多个组件同时调用，仅发起一个网络请求
function ComponentA() {
  const { data } = useUsersQuery();
}

function ComponentB() {
  const { data } = useUsersQuery(); // 共享同一个请求
}
```

#### 请求取消

```typescript
export const useUsersQuery = (params: UsersQueryVariables = {}) => {
  return useQuery({
    queryKey: userQueryKeys.list(params),
    queryFn: async ({ signal }) => {
      // 传递 AbortSignal 到 fetch
      const response = await fetch('/api/users', { signal });
      return response.json();
    },
  });
};
```

---

## 测试架构

### 测试金字塔

```
               ┌─────────────┐
               │   E2E 测试   │  (Playwright)
               │   10-20%     │  - 关键业务流程
               └─────┬───────┘  - 跨服务集成测试
                     │
              ┌──────▼────────┐
              │   集成测试     │  (Jest + Testing Library)
              │   30-40%       │  - 组件集成测试
              └──────┬────────┘  - Hook 测试
                     │            - API Mock 测试
              ┌──────▼────────┐
              │   单元测试     │  (Jest)
              │   40-50%       │  - 工具函数测试
              └───────────────┘  - 业务逻辑测试
```

### E2E 测试 (Playwright)

#### 测试结构

```
tests/e2e/
├── specs/                      # 测试用例
│   ├── auth-flow.spec.ts       # 认证流程测试
│   ├── user-management.spec.ts # 用户管理测试
│   ├── role-management.spec.ts # 角色管理测试
│   └── dashboard.spec.ts       # 仪表盘测试
├── pages/                      # 页面对象模式
│   ├── login.page.ts
│   ├── users.page.ts
│   └── dashboard.page.ts
├── fixtures/                   # 测试数据和 fixtures
│   └── test-data.ts
└── helpers/                    # 测试工具函数
    └── auth-helpers.ts
```

#### 认证流程测试示例

```typescript
// tests/e2e/specs/auth-flow.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('OAuth 2.1 Authentication Flow', () => {
  test('should complete full OAuth flow with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    // 1. 访问受保护页面
    await page.goto('http://localhost:3002/admin/users');

    // 2. 应该重定向到登录页面
    await expect(page).toHaveURL(/.*login/);

    // 3. 输入凭证
    await loginPage.login('admin', 'admin123');

    // 4. 应该重定向回原始页面
    await expect(page).toHaveURL('http://localhost:3002/admin/users');

    // 5. 验证用户已登录
    await expect(dashboardPage.userMenu).toBeVisible();
    await expect(dashboardPage.userMenu).toContainText('admin');
  });

  test('should handle invalid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await page.goto('http://localhost:3002/login');
    await loginPage.login('invalid', 'invalid');

    // 应该显示错误消息
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText('用户名或密码错误');
  });

  test('should enforce CSRF protection with state parameter', async ({ page }) => {
    // ... CSRF 测试逻辑
  });
});
```

#### 页面对象模式示例

```typescript
// tests/e2e/pages/login.page.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByTestId('username-input');
    this.passwordInput = page.getByTestId('password-input');
    this.loginButton = page.getByTestId('login-button');
    this.errorMessage = page.locator('[role="alert"]');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async goto() {
    await this.page.goto('http://localhost:3002/login');
  }
}
```

### 单元测试 (Jest)

#### Hook 测试示例

```typescript
// features/users/hooks/use-user-management.test.ts
import { renderHook, act } from '@testing-library/react';
import { useUserManagement } from './use-user-management';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('useUserManagement', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  test('should open create modal', () => {
    const { result } = renderHook(() => useUserManagement(), { wrapper });

    expect(result.current.isModalOpen).toBe(false);

    act(() => {
      result.current.openCreateModal();
    });

    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.selectedUser).toBeNull();
  });

  test('should open edit modal with selected user', () => {
    const { result } = renderHook(() => useUserManagement(), { wrapper });
    const mockUser = { id: '1', username: 'testuser' };

    act(() => {
      result.current.openEditModal(mockUser);
    });

    expect(result.current.isModalOpen).toBe(true);
    expect(result.current.selectedUser).toEqual(mockUser);
  });
});
```

#### 组件测试示例

```typescript
// components/common/error-display.test.tsx
import { render, screen } from '@testing-library/react';
import { ErrorDisplay } from './error-display';

describe('ErrorDisplay', () => {
  test('should render error message', () => {
    render(<ErrorDisplay error="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  test('should not render when error is null', () => {
    const { container } = render(<ErrorDisplay error={null} />);

    expect(container.firstChild).toBeNull();
  });

  test('should render with different severity levels', () => {
    const { rerender } = render(<ErrorDisplay error="Error" severity="error" />);
    expect(screen.getByRole('alert')).toHaveClass('error');

    rerender(<ErrorDisplay error="Warning" severity="warning" />);
    expect(screen.getByRole('alert')).toHaveClass('warning');
  });
});
```

---

## 安全实践

### 1. CSRF 防护

#### Proxy.ts CSRF Token

```typescript
// 为 GET 请求设置 CSRF 令牌
if (request.method === 'GET') {
  const csrfToken = request.cookies.get('csrf_token')?.value;
  if (!csrfToken) {
    const newCSRFToken = generateCodeVerifier(); // 128字符随机字符串
    response.cookies.set('csrf_token', newCSRFToken, {
      maxAge: 3600,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
}
```

#### API 请求验证

```typescript
async function authenticatedRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const csrfToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('csrf_token='))
    ?.split('=')[1];

  return apiRequest<T>(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'X-CSRF-Token': csrfToken || '',
    },
  });
}
```

### 2. XSS 防护

#### 内容安全策略 (CSP)

```typescript
const contentSecurityPolicy = {
  dashboard: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // 注：生产环境应移除 unsafe-*
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
};
```

#### 输入验证和清理

```typescript
// 使用 Zod 进行输入验证
export const CreateUserSchema = z.object({
  username: z.string()
    .min(3, '用户名至少需要3个字符')
    .max(50, '用户名不能超过50个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和连字符'),
  displayName: z.string()
    .min(1, '显示名称不能为空')
    .max(100, '显示名称不能超过100个字符')
    .transform(val => val.trim()), // 去除首尾空格
});
```

### 3. Open Redirect 防护

#### Login 页面 redirect 验证

```typescript
function validateRedirectUrl(redirect: string): boolean {
  try {
    const url = new URL(decodeURIComponent(redirect));

    // 检查 host 必须是 localhost（开发）或指定域名（生产）
    const validHost = url.host.startsWith('localhost');

    // 检查路径必须是 /api/v2/oauth/authorize
    const validPath = url.pathname === '/api/v2/oauth/authorize';

    return validHost && validPath;
  } catch (err) {
    console.error('Redirect URL validation error:', err);
    return false;
  }
}
```

### 4. Token 安全

#### Token 存储策略

```typescript
// 双重存储：sessionStorage + httpOnly cookies
export const TokenStorage = {
  setTokens(tokens: { accessToken: string; refreshToken: string }): void {
    // 客户端使用（API 调用）
    sessionStorage.setItem('access_token', tokens.accessToken);
    sessionStorage.setItem('refresh_token', tokens.refreshToken);

    // 服务器使用（proxy.ts 路由保护）
    // 由 /api/auth/login-callback 设置 httpOnly cookies
  },

  clearTokens(): void {
    sessionStorage.clear();
    // 清除 cookies（由服务器端处理）
  },
};
```

#### Token 过期处理

```typescript
function isTokenExpired(token: string): boolean {
  try {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// 在 proxy.ts 中自动检查
if (!accessToken || isTokenExpired(accessToken)) {
  return await initiateOAuthFlow(request, pathname);
}
```

### 5. 权限验证

#### 多层权限检查

```
1. proxy.ts（服务器端）
   ├─ 检查 access_token 是否存在
   ├─ 解析 JWT payload 获取 permissions
   └─ 验证路由所需权限

2. 页面组件（客户端）
   ├─ PermissionGuard 组件包装
   └─ 验证用户权限

3. UI 元素（客户端）
   ├─ hasPermission() 条件渲染
   └─ 隐藏无权限的按钮/链接
```

#### 权限检查示例

```typescript
// proxy.ts
const payload = parseJwt(accessToken);
const userPermissions: string[] = payload?.permissions || [];
const requiredPermissions = routePermissionMap[pathname] || [];
const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));

// 组件中
const { hasPermission } = useAuth();

{hasPermission('users:create') && (
  <Button onClick={openCreateModal}>添加用户</Button>
)}
```

---

## 开发工作流

### 1. 本地开发环境设置

#### 环境变量配置

创建 `.env.local`：

```bash
# 服务配置
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188
NEXT_PUBLIC_ADMIN_PORTAL_URL=http://localhost:3002

# OAuth 客户端配置
NEXT_PUBLIC_OAUTH_CLIENT_ID=admin-portal-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:3002/auth/callback

# 开发环境
NODE_ENV=development
NEXT_PUBLIC_APP_ENV=development
```

#### 启动服务

```bash
# 1. 启动 OAuth Service Rust
cd apps/oauth-service-rust
cargo run

# 2. 启动 Pingora 代理（新终端）
cd apps/pingora-proxy
cargo run

# 3. 启动 Admin Portal（新终端）
cd apps/admin-portal
pnpm dev

# 访问 http://localhost:6188（通过 Pingora）
# 或 http://localhost:3002（直接访问 Admin Portal）
```

### 2. 开发命令

```bash
# 开发
pnpm dev              # 启动开发服务器（端口 3002）
pnpm dev:turbo        # 使用 Turbopack（Next.js 16 默认）

# 构建
pnpm build            # 生产构建
pnpm start            # 启动生产服务器

# 测试
pnpm test             # 运行单元测试
pnpm test:watch       # 监听模式
pnpm test:e2e         # 运行 E2E 测试
pnpm test:e2e:ui      # 带 UI 的 E2E 测试
pnpm test:e2e:debug   # 调试模式

# 代码质量
pnpm lint             # ESLint 检查
pnpm lint:fix         # 自动修复
pnpm format           # Prettier 格式化
pnpm type-check       # TypeScript 类型检查

# 依赖管理
pnpm install          # 安装依赖
pnpm update           # 更新依赖
```

### 3. Git 工作流

#### 分支策略

```
main/master           # 主分支（生产环境）
  ├─ develop          # 开发分支
  │   ├─ feature/*    # 功能分支
  │   ├─ bugfix/*     # Bug 修复分支
  │   └─ hotfix/*     # 紧急修复分支
```

#### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```bash
# 类型
feat:     # 新功能
fix:      # Bug 修复
docs:     # 文档更新
style:    # 代码格式（不影响功能）
refactor: # 重构（既不是新功能也不是 Bug 修复）
test:     # 测试相关
chore:    # 构建过程或辅助工具的变动

# 示例
git commit -m "feat(users): add user export functionality"
git commit -m "fix(auth): resolve OAuth callback redirect issue"
git commit -m "docs(readme): update installation instructions"
```

### 4. 添加新功能模块

#### 步骤清单

1. **创建功能目录结构**

```bash
mkdir -p features/new-feature/{domain,application,infrastructure,components,hooks}
touch features/new-feature/domain/entity.ts
touch features/new-feature/domain/entity.repository.ts
touch features/new-feature/application/entity.service.ts
touch features/new-feature/infrastructure/entity.repository.ts
touch features/new-feature/queries.ts
touch features/new-feature/hooks/use-entity-management.ts
```

2. **定义领域模型** (`domain/entity.ts`)

```typescript
import { z } from 'zod';

export const CreateEntitySchema = z.object({
  name: z.string().min(1),
  // ... 其他字段
});

export type CreateEntityInput = z.infer<typeof CreateEntitySchema>;
export type Entity = { /* ... */ };
```

3. **实现仓储层** (`infrastructure/entity.repository.ts`)

```typescript
export class EntityRepository implements IEntityRepository {
  async getEntities(params?: any): Promise<PaginatedResponse<Entity>> {
    return adminApi.getEntities(params);
  }
  // ... 其他方法
}
```

4. **实现应用服务** (`application/entity.service.ts`)

```typescript
export class EntityService {
  constructor(private repository: IEntityRepository) {}

  async getEntities(params?: any): Promise<PaginatedResponse<Entity>> {
    return this.repository.getEntities(params);
  }
  // ... 其他方法
}
```

5. **定义 React Query** (`queries.ts`)

```typescript
export const entityQueryKeys = { /* ... */ };
export const useEntitiesQuery = (params) => { /* ... */ };
export const useCreateEntityMutation = () => { /* ... */ };
```

6. **创建自定义 Hook** (`hooks/use-entity-management.ts`)

```typescript
export const useEntityManagement = () => {
  // 封装状态和方法
};
```

7. **创建 UI 组件** (`components/EntityManagementView.tsx`)

```typescript
export function EntityManagementView() {
  const { entities, ... } = useEntityManagement();
  return <DataTable data={entities} />;
}
```

8. **添加路由** (`app/(dashboard)/admin/entities/page.tsx`)

```typescript
export default function EntitiesPage() {
  return (
    <PermissionGuard requiredPermission="entities:list">
      <EntityManagementView />
    </PermissionGuard>
  );
}
```

9. **更新权限映射** (`proxy.ts`)

```typescript
const routePermissionMap: Record<string, string[]> = {
  // ... 现有映射
  '/admin/entities': ['menu:system:entity:view', 'entities:list'],
};
```

10. **更新菜单** (`components/layout/DashboardShell.tsx`)

```typescript
const menuItems: MenuItem[] = [
  // ... 现有菜单
  {
    id: 'entities',
    name: '实体管理',
    path: '/admin/entities',
    icon: 'Database',
    permissions: ['menu:system:entity:view', 'entities:list'],
  },
];
```

11. **添加 API 端点** (`lib/api.ts`)

```typescript
export const adminApi = {
  // ... 现有方法
  async getEntities(params?: any): Promise<PaginatedResponse<Entity>> {
    // ... 实现
  },
};
```

12. **编写测试**

```bash
# E2E 测试
touch tests/e2e/specs/entity-management.spec.ts

# 单元测试
touch features/new-feature/hooks/use-entity-management.test.ts
```

---

## 总结

### 架构优势

1. **清晰的分层架构**：DDD 分层结构使代码职责明确，易于维护
2. **类型安全**：TypeScript + Zod 提供端到端的类型安全
3. **高度模块化**：功能模块独立，易于扩展和复用
4. **性能优化**：React Query 缓存、代码分割、懒加载等多重优化
5. **安全可靠**：多层权限验证、CSRF 防护、XSS 防护等安全措施
6. **测试完善**：E2E、集成、单元测试全覆盖
7. **开发体验好**：热更新、类型提示、清晰的错误信息

### 技术亮点

- **Next.js 16 + React 19**：最新技术栈，性能和开发体验俱佳
- **OAuth 2.1 标准集成**：完整的授权码流程 + PKCE，符合业界最佳实践
- **领域驱动设计**：清晰的业务逻辑分层，易于理解和维护
- **React Query**：强大的服务端状态管理，自动缓存和同步
- **Tailwind CSS + shadcn/ui**：现代化的 UI 开发体验
- **Monorepo 架构**：共享组件库和工具函数，提高代码复用

### 未来优化方向

1. **React Compiler 集成**：启用 React 19 编译器优化（目前处于 beta）
2. **SSR/ISR 优化**：利用 Next.js 服务端渲染能力优化首屏加载
3. **PWA 支持**：添加离线支持和缓存策略
4. **国际化 (i18n)**：支持多语言
5. **主题系统**：支持暗黑模式和自定义主题
6. **性能监控**：集成 Sentry 或其他 APM 工具
7. **更多单元测试**：提高代码覆盖率到 80%+

---

**文档维护者**: 请在更新架构或添加新功能时同步更新此文档。

**联系方式**: 如有疑问或建议，请联系开发团队。
