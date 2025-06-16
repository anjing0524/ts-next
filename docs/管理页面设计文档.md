# OAuth2.1认证授权中心管理页面设计文档

**版本**: 1.0  
**创建日期**: 2024-12-19  
**状态**: 设计阶段  
**团队**: 前端设计团队  

## 目录

1. [设计概述](#设计概述)
2. [页面架构](#页面架构)
3. [菜单权限设计](#菜单权限设计)
4. [核心页面设计](#核心页面设计)
5. [用户体验设计](#用户体验设计)
6. [响应式设计](#响应式设计)
7. [安全考虑](#安全考虑)

## 设计概述

### 设计原则

- **内网专用**: 专为内网环境设计，简化外网相关功能
- **权限驱动**: 基于RBAC模型的菜单和功能权限控制
- **管理员友好**: 专注管理员操作体验，简化复杂流程
- **安全优先**: 所有操作都需要适当的权限验证
- **现代化UI**: 使用shadcn/ui + Tailwind CSS构建现代化界面

### 技术栈

- **框架**: Next.js 14 (App Router)
- **UI组件**: shadcn/ui
- **样式**: Tailwind CSS
- **状态管理**: React Query (TanStack Query)
- **表单**: React Hook Form + Zod
- **图标**: Lucide React

## 页面架构

### 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│                        顶部导航栏                            │
│  Logo | 用户信息 | 通知 | 设置 | 退出                        │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│   侧边菜单栏     │              主内容区域                    │
│                 │                                           │
│ • 仪表板        │  ┌─────────────────────────────────────┐  │
│ • 用户管理      │  │                                     │  │
│ • 客户端管理    │  │            页面内容                  │  │
│ • 权限管理      │  │                                     │  │
│ • 审计日志      │  │                                     │  │
│ • 系统设置      │  └─────────────────────────────────────┘  │
│                 │                                           │
└─────────────────┴───────────────────────────────────────────┘
```

### 路由结构

```
/admin
├── /dashboard              # 仪表板
├── /users                  # 用户管理
│   ├── /list               # 用户列表
│   ├── /create             # 创建用户
│   └── /[id]/edit          # 编辑用户
├── /clients               # 客户端管理
│   ├── /list               # 客户端列表
│   ├── /create             # 创建客户端
│   └── /[id]/edit          # 编辑客户端
├── /permissions           # 权限管理
│   ├── /roles              # 角色管理
│   ├── /scopes             # 权限范围管理
│   └── /assignments        # 权限分配
├── /audit                 # 审计日志
└── /settings              # 系统设置
```

## 菜单权限设计

### 权限层级

```typescript
// 菜单权限配置
interface MenuPermission {
  id: string;
  name: string;
  path: string;
  icon: string;
  requiredPermissions: string[];
  children?: MenuPermission[];
}

const menuConfig: MenuPermission[] = [
  {
    id: 'dashboard',
    name: '仪表板',
    path: '/admin/dashboard',
    icon: 'LayoutDashboard',
    requiredPermissions: ['admin:dashboard:read']
  },
  {
    id: 'users',
    name: '用户管理',
    path: '/admin/users',
    icon: 'Users',
    requiredPermissions: ['admin:users:read'],
    children: [
      {
        id: 'users-list',
        name: '用户列表',
        path: '/admin/users/list',
        icon: 'List',
        requiredPermissions: ['admin:users:read']
      },
      {
        id: 'users-create',
        name: '创建用户',
        path: '/admin/users/create',
        icon: 'UserPlus',
        requiredPermissions: ['admin:users:create']
      }
    ]
  },
  {
    id: 'clients',
    name: '客户端管理',
    path: '/admin/clients',
    icon: 'Settings',
    requiredPermissions: ['admin:clients:read'],
    children: [
      {
        id: 'clients-list',
        name: '客户端列表',
        path: '/admin/clients/list',
        icon: 'List',
        requiredPermissions: ['admin:clients:read']
      },
      {
        id: 'clients-create',
        name: '创建客户端',
        path: '/admin/clients/create',
        icon: 'Plus',
        requiredPermissions: ['admin:clients:create']
      }
    ]
  },
  {
    id: 'permissions',
    name: '权限管理',
    path: '/admin/permissions',
    icon: 'Shield',
    requiredPermissions: ['admin:permissions:read'],
    children: [
      {
        id: 'roles',
        name: '角色管理',
        path: '/admin/permissions/roles',
        icon: 'UserCheck',
        requiredPermissions: ['admin:roles:read']
      },
      {
        id: 'scopes',
        name: '权限范围',
        path: '/admin/permissions/scopes',
        icon: 'Key',
        requiredPermissions: ['admin:scopes:read']
      }
    ]
  },
  {
    id: 'audit',
    name: '审计日志',
    path: '/admin/audit',
    icon: 'FileText',
    requiredPermissions: ['admin:audit:read']
  },
  {
    id: 'settings',
    name: '系统设置',
    path: '/admin/settings',
    icon: 'Settings',
    requiredPermissions: ['admin:settings:read']
  }
];
```

### 动态菜单渲染

```typescript
// 菜单权限检查Hook
function useMenuPermissions() {
  const { data: userPermissions } = useQuery({
    queryKey: ['user-permissions'],
    queryFn: fetchUserPermissions
  });

  const hasPermission = (requiredPermissions: string[]) => {
    return requiredPermissions.every(permission => 
      userPermissions?.includes(permission)
    );
  };

  const filterMenuByPermissions = (menus: MenuPermission[]): MenuPermission[] => {
    return menus.filter(menu => {
      if (!hasPermission(menu.requiredPermissions)) {
        return false;
      }
      
      if (menu.children) {
        menu.children = filterMenuByPermissions(menu.children);
      }
      
      return true;
    });
  };

  return {
    hasPermission,
    filterMenuByPermissions,
    availableMenus: filterMenuByPermissions(menuConfig)
  };
}
```

## 核心页面设计

### 1. 仪表板页面

**功能概述**: 系统概览和关键指标展示

**页面组件**:
- 系统状态卡片
- 用户统计图表
- 客户端活跃度
- 最近操作日志
- 安全警告面板

**布局设计**:
```
┌─────────────┬─────────────┬─────────────┐
│  活跃用户   │  客户端数   │  今日认证   │
├─────────────┴─────────────┴─────────────┤
│              用户增长趋势图              │
├─────────────────────┬───────────────────┤
│    最近操作日志      │    安全警告       │
└─────────────────────┴───────────────────┘
```

### 2. 用户管理页面

**功能概述**: 内网用户的创建、编辑、禁用等管理操作

**核心功能**:
- 用户列表展示（支持搜索、筛选、分页）
- 创建新用户（管理员创建，无需邮箱验证）
- 编辑用户信息
- 用户状态管理（激活/禁用）
- 密码重置
- 角色分配

**表单字段**:
```typescript
interface UserForm {
  username: string;          // 用户名（必填，唯一）
  displayName?: string;      // 显示名称
  firstName?: string;        // 名
  lastName?: string;         // 姓
  organization?: string;     // 组织
  department?: string;       // 部门
  isActive: boolean;         // 是否激活
  mustChangePassword: boolean; // 强制修改密码
  roles: string[];           // 角色列表
}
```

**页面布局**:
```
┌─────────────────────────────────────────────────────────┐
│  [搜索框] [筛选] [创建用户]                              │
├─────────────────────────────────────────────────────────┤
│  用户名 │ 显示名 │ 组织 │ 状态 │ 最后登录 │ 操作        │
│  admin  │ 管理员 │ IT   │ 活跃 │ 2小时前  │ [编辑][禁用] │
│  user1  │ 张三   │ 销售 │ 活跃 │ 1天前   │ [编辑][禁用] │
└─────────────────────────────────────────────────────────┘
```

### 3. 客户端管理页面

**功能概述**: OAuth2.1客户端应用的注册和管理

**核心功能**:
- 客户端列表展示
- 注册新客户端
- 编辑客户端配置
- 客户端密钥管理
- 重定向URI管理
- 权限范围配置

**表单字段**:
```typescript
interface ClientForm {
  clientName: string;              // 客户端名称
  clientDescription?: string;      // 客户端描述
  clientType: 'PUBLIC' | 'CONFIDENTIAL'; // 客户端类型
  redirectUris: string[];          // 重定向URI列表
  grantTypes: string[];            // 授权类型
  allowedScopes: string[];         // 允许的权限范围
  requirePkce: boolean;            // 是否要求PKCE
  requireConsent: boolean;         // 是否要求用户同意
  accessTokenLifetime?: number;    // 访问令牌生命周期
  refreshTokenLifetime?: number;   // 刷新令牌生命周期
}
```

### 4. 权限管理页面

**功能概述**: RBAC权限模型的管理界面

**子页面**:

#### 4.1 角色管理
- 角色列表
- 创建/编辑角色
- 角色权限分配
- 角色用户分配

#### 4.2 权限范围管理
- Scope列表
- 创建/编辑Scope
- Scope描述管理

#### 4.3 权限分配
- 用户-角色关系管理
- 批量权限操作

### 5. 审计日志页面

**功能概述**: 系统操作的审计追踪

**核心功能**:
- 操作日志列表
- 高级搜索和筛选
- 日志详情查看
- 日志导出

**筛选条件**:
- 时间范围
- 操作类型
- 用户
- 客户端
- IP地址

## 用户体验设计

### 交互设计原则

1. **一致性**: 所有页面使用统一的交互模式
2. **反馈性**: 每个操作都有明确的反馈
3. **容错性**: 提供撤销和确认机制
4. **效率性**: 支持批量操作和快捷键

### 状态管理

```typescript
// 全局状态管理
interface AppState {
  user: User | null;
  permissions: string[];
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
}

// 页面状态管理
interface PageState {
  loading: boolean;
  error: string | null;
  data: any;
  filters: Record<string, any>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}
```

### 错误处理

```typescript
// 统一错误处理
interface ErrorBoundary {
  // 网络错误
  networkError: () => void;
  // 权限错误
  permissionError: () => void;
  // 验证错误
  validationError: (errors: ValidationError[]) => void;
  // 系统错误
  systemError: (error: Error) => void;
}
```

## 响应式设计

### 断点设计

```css
/* Tailwind CSS 断点 */
sm: 640px   /* 小屏幕 */
md: 768px   /* 中等屏幕 */
lg: 1024px  /* 大屏幕 */
xl: 1280px  /* 超大屏幕 */
2xl: 1536px /* 超超大屏幕 */
```

### 移动端适配

- **侧边栏**: 在移动端折叠为抽屉式菜单
- **表格**: 使用卡片式布局替代表格
- **表单**: 单列布局，增大触摸目标
- **导航**: 底部标签栏导航

## 安全考虑

### 前端安全措施

1. **XSS防护**: 所有用户输入都进行转义
2. **CSRF防护**: 使用CSRF令牌
3. **权限验证**: 前端和后端双重权限检查
4. **敏感信息**: 不在前端存储敏感信息
5. **会话管理**: 自动登出和会话刷新

### 权限控制

```typescript
// 页面级权限控制
function ProtectedPage({ requiredPermissions, children }) {
  const { hasPermission } = useAuth();
  
  if (!hasPermission(requiredPermissions)) {
    return <UnauthorizedPage />;
  }
  
  return children;
}

// 组件级权限控制
function PermissionGate({ permission, children, fallback = null }) {
  const { hasPermission } = useAuth();
  
  return hasPermission(permission) ? children : fallback;
}
```

### 数据验证

```typescript
// 使用Zod进行表单验证
const userSchema = z.object({
  username: z.string()
    .min(3, '用户名至少3个字符')
    .max(50, '用户名最多50个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  displayName: z.string().max(100).optional(),
  organization: z.string().max(100).optional(),
  department: z.string().max(100).optional()
});
```

## 实施计划

### 开发阶段

1. **第一阶段**: 基础框架和布局（1周）
2. **第二阶段**: 用户管理页面（1周）
3. **第三阶段**: 客户端管理页面（1周）
4. **第四阶段**: 权限管理页面（1周）
5. **第五阶段**: 审计日志和系统设置（1周）
6. **第六阶段**: 测试和优化（1周）

### 技术债务

- 国际化支持
- 主题切换
- 高级搜索功能
- 数据可视化增强
- 移动端应用

---

**注意**: 本文档将随着开发进度持续更新，确保设计与实现的一致性。