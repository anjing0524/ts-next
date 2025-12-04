# Admin Portal OAuth SDK 集成指南 (OAuth SDK Integration Guide for Admin Portal)

> **项目 (Project):** Admin Portal (Next.js 16)
> **SDK 版本 (SDK Version):** oauth-service-napi 0.1.0
> **更新时间 (Last Updated):** 2025-12-03

---

## 目录 (Table of Contents)

1. [概述 (Overview)](#概述-overview)
2. [环境配置 (Environment Setup)](#环境配置-environment-setup)
3. [Server Actions 集成 (Server Actions Integration)](#server-actions-集成-server-actions-integration)
4. [客户端组件使用 (Client Component Usage)](#客户端组件使用-client-component-usage)
5. [类型安全 (Type Safety)](#类型安全-type-safety)
6. [测试指南 (Testing Guide)](#测试指南-testing-guide)
7. [最佳实践 (Best Practices)](#最佳实践-best-practices)
8. [故障排查 (Troubleshooting)](#故障排查-troubleshooting)

---

## 概述 (Overview)

### 集成架构 (Integration Architecture)

Admin Portal 通过 **Next.js 16 Server Actions** 集成 OAuth napi SDK，实现了服务器端与 OAuth Service 的高性能通信。

Admin Portal integrates OAuth napi SDK through **Next.js 16 Server Actions**, achieving high-performance server-side communication with OAuth Service.

```
┌─────────────────────────────────────────────────────────┐
│               Admin Portal Architecture                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Client Layer (Browser)                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  React Components ('use client')                │   │
│  │  - LoginForm.tsx                                │   │
│  │  - UserProfile.tsx                              │   │
│  │  - RoleManagement.tsx                           │   │
│  └────────────────┬────────────────────────────────┘   │
│                   │ Form Actions / useTransition()      │
│                   ▼                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Server Actions ('use server')                  │   │
│  │  - app/actions/auth.ts                          │   │
│  │  - app/actions/user.ts                          │   │
│  │  - app/actions/rbac.ts                          │   │
│  └────────────────┬────────────────────────────────┘   │
│                   │ getOAuthSDK()                       │
│                   ▼                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │  SDK Initialization (lib/oauth-sdk.ts)          │   │
│  │  - createSDK(config)                            │   │
│  │  - Singleton Pattern                            │   │
│  └────────────────┬────────────────────────────────┘   │
│                   │ napi binding                        │
└───────────────────┼─────────────────────────────────────┘
                    ▼
          oauth-service-napi (Rust Module)
                    ↓
          OAuth Service (localhost:3001)
```

### 核心优势 (Core Advantages)

- ✅ **Server Actions:** 自动处理客户端-服务器通信，无需手动 API 路由 (Automatic client-server communication without manual API routes)
- ✅ **Type Safety:** 端到端的 TypeScript 类型安全 (End-to-end TypeScript type safety)
- ✅ **Performance:** Rust napi 模块提供 2-5x 性能提升 (Rust napi module provides 2-5x performance boost)
- ✅ **Progressive Enhancement:** 表单自动支持无 JavaScript 提交 (Forms automatically support no-JS submission)

---

## 环境配置 (Environment Setup)

### 1. 安装依赖 (Install Dependencies)

在 `apps/admin-portal/package.json` 中添加 SDK 依赖：

```json
{
  "name": "admin-portal",
  "version": "1.0.0",
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "oauth-service-napi": "file:../../apps/oauth-service-rust/npm"
  }
}
```

安装依赖：

```bash
cd apps/admin-portal
pnpm install
```

### 2. 配置环境变量 (Configure Environment Variables)

创建 `.env.local` 文件（已在 `.gitignore` 中，不会提交到仓库）：

```bash
# apps/admin-portal/.env.local

# OAuth Service 基础 URL (OAuth Service Base URL)
OAUTH_SERVICE_URL=http://localhost:3001

# SDK 超时时间（毫秒）(SDK Timeout in milliseconds)
# 默认 5000ms，根据网络情况调整
OAUTH_SDK_TIMEOUT=5000

# SDK 重试次数 (SDK Retry Count)
# 默认 3 次，建议 3-5 次
OAUTH_SDK_RETRY_COUNT=3

# Node 环境 (Node Environment)
NODE_ENV=development
```

**生产环境配置 (Production Environment):**

```bash
# .env.production
OAUTH_SERVICE_URL=https://oauth.yourdomain.com
OAUTH_SDK_TIMEOUT=10000
OAUTH_SDK_RETRY_COUNT=5
NODE_ENV=production
```

### 3. TypeScript 配置 (TypeScript Configuration)

确保 `tsconfig.json` 包含以下配置：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "dom"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./app/*"],
      "@/lib/*": ["./lib/*"],
      "@/actions/*": ["./app/actions/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

---

## Server Actions 集成 (Server Actions Integration)

### SDK 初始化模块 (SDK Initialization Module)

创建 `lib/oauth-sdk.ts`，实现单例模式的 SDK 初始化：

```typescript
/**
 * OAuth SDK 初始化模块 (OAuth SDK Initialization Module)
 *
 * 该模块负责初始化和提供 OAuth Service 的 Rust napi SDK 访问
 * This module is responsible for initializing and providing access to the OAuth Service Rust napi SDK
 */

import type { OAuthSDK, SDKConfig } from 'oauth-service-napi';
import { createSDK } from 'oauth-service-napi';

/**
 * SDK 配置 (SDK Configuration)
 * 从环境变量中读取配置
 * Configuration is read from environment variables
 */
const sdkConfig: SDKConfig = {
  base_url: process.env.OAUTH_SERVICE_URL || 'http://localhost:8080',
  timeout: parseInt(process.env.OAUTH_SDK_TIMEOUT || '5000'),
  retry_count: parseInt(process.env.OAUTH_SDK_RETRY_COUNT || '3'),
  debug: process.env.NODE_ENV === 'development',
};

/**
 * SDK 单例实例 (SDK Singleton Instance)
 */
let sdkInstance: OAuthSDK | null = null;

/**
 * 初始化 OAuth SDK (Initialize OAuth SDK)
 * 仅在服务器端运行
 * Only runs on the server side
 */
export function initializeOAuthSDK(): void {
  if (typeof window === 'undefined') {
    sdkInstance = createSDK(sdkConfig);
  }
}

/**
 * 获取 OAuth SDK 实例 (Get OAuth SDK Instance)
 * 用于 Server Actions 中调用 OAuth Service API
 * Used to call OAuth Service API from Server Actions
 *
 * @throws {Error} 如果在客户端调用 (If called from client side)
 * @throws {Error} 如果 SDK 初始化失败 (If SDK initialization fails)
 * @returns {OAuthSDK} SDK 实例 (SDK instance)
 */
export function getOAuthSDK(): OAuthSDK {
  if (typeof window !== 'undefined') {
    throw new Error('OAuth SDK can only be used on the server side');
  }
  if (!sdkInstance) {
    initializeOAuthSDK();
  }
  if (!sdkInstance) {
    throw new Error('Failed to initialize OAuth SDK');
  }
  return sdkInstance;
}

export type { OAuthSDK, SDKConfig };
```

### 认证 Server Actions (Authentication Server Actions)

创建 `app/actions/auth.ts`：

```typescript
/**
 * 认证相关的 Server Actions (Authentication Server Actions)
 *
 * 该文件包含所有与用户认证相关的 Server Actions
 * This file contains all Server Actions related to user authentication
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * 登录输入参数 (Login Input Parameters)
 */
export interface LoginInput {
  username: string;
  password: string;
}

/**
 * 登录结果 (Login Result)
 */
export interface LoginResult {
  success: boolean;
  data?: {
    session_token: string;
    user_id: string;
    username: string;
    expires_in: number;
  };
  error?: string;
}

/**
 * 登录操作 (Login Action)
 *
 * 通过 OAuth SDK 调用 OAuth Service 的登录接口
 * Calls OAuth Service login API through OAuth SDK
 *
 * @param credentials - 登录凭证 (Login credentials)
 * @returns 登录结果 (Login result)
 */
export async function loginAction(credentials: LoginInput): Promise<LoginResult> {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.authLogin(credentials.username, credentials.password);

    // 保存 session token 到 cookie (Save session token to cookie)
    const cookieStore = await cookies();
    cookieStore.set('session_token', result.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: result.expires_in,
      path: '/',
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

/**
 * 登出操作 (Logout Action)
 *
 * 通过 OAuth SDK 调用 OAuth Service 的登出接口
 * Calls OAuth Service logout API through OAuth SDK
 *
 * @returns 登出结果 (Logout result)
 */
export async function logoutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const sdk = getOAuthSDK();
    const success = await sdk.authLogout();

    if (success) {
      // 清除 cookie (Clear cookie)
      const cookieStore = await cookies();
      cookieStore.delete('session_token');
      cookieStore.delete('refresh_token');

      // 重定向到登录页 (Redirect to login page)
      redirect('/login');
    }

    return { success };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Logout failed',
    };
  }
}

/**
 * 刷新令牌操作 (Refresh Token Action)
 */
export async function refreshTokenAction() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh_token')?.value;

    if (!refreshToken) {
      return { success: false, error: 'No refresh token found' };
    }

    const sdk = getOAuthSDK();
    const tokenPair = await sdk.tokenRefresh(refreshToken);

    // 更新 cookie 中的令牌 (Update tokens in cookies)
    cookieStore.set('access_token', tokenPair.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: tokenPair.expires_in,
    });

    cookieStore.set('refresh_token', tokenPair.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return { success: true, data: tokenPair };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
    };
  }
}
```

### 用户 Server Actions (User Server Actions)

创建 `app/actions/user.ts`：

```typescript
/**
 * 用户相关的 Server Actions (User Server Actions)
 *
 * 该文件包含所有与用户信息相关的 Server Actions
 * This file contains all Server Actions related to user information
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';

/**
 * 用户信息结果 (User Information Result)
 */
export interface UserResult {
  success: boolean;
  data?: {
    user_id: string;
    username: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
  };
  error?: string;
}

/**
 * 获取用户信息操作 (Get User Info Action)
 *
 * 通过 OAuth SDK 调用 OAuth Service 的用户信息接口
 * Calls OAuth Service user info API through OAuth SDK
 *
 * @returns 用户信息结果 (User information result)
 */
export async function getUserInfoAction(): Promise<UserResult> {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.userGetInfo();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user info',
    };
  }
}

/**
 * 更新用户信息操作 (Update User Profile Action)
 */
export async function updateUserProfileAction(data: {
  display_name?: string;
  avatar_url?: string;
  email?: string;
}): Promise<UserResult> {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.userUpdateProfile(data);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    };
  }
}
```

### RBAC Server Actions (RBAC Server Actions)

创建 `app/actions/rbac.ts`：

```typescript
/**
 * RBAC 相关的 Server Actions (RBAC Server Actions)
 */

'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';
import type { Role, Permission, PaginatedResponse } from 'oauth-service-napi';

/**
 * 获取角色列表 (Get Roles List)
 */
export async function getRolesAction(page = 1, pageSize = 20) {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.rbacGetRoles(page, pageSize);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get roles',
    };
  }
}

/**
 * 获取权限列表 (Get Permissions List)
 */
export async function getPermissionsAction(page = 1, pageSize = 20) {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.rbacGetPermissions(page, pageSize);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get permissions',
    };
  }
}

/**
 * 分配角色 (Assign Role)
 */
export async function assignRoleAction(userId: string, roleId: string) {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.rbacAssignRole(userId, roleId);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to assign role',
    };
  }
}

/**
 * 撤销角色 (Revoke Role)
 */
export async function revokeRoleAction(userId: string, roleId: string) {
  try {
    const sdk = getOAuthSDK();
    const success = await sdk.rbacRevokeRole(userId, roleId);

    return { success };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to revoke role',
    };
  }
}
```

---

## 客户端组件使用 (Client Component Usage)

### 登录表单组件 (Login Form Component)

创建 `app/components/LoginForm.tsx`：

```typescript
'use client';

import { useState, useTransition } from 'react';
import { loginAction, type LoginInput } from '@/actions/auth';
import { useRouter } from 'next/navigation';

/**
 * 登录表单组件 (Login Form Component)
 */
export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>('');

  /**
   * 处理表单提交 (Handle Form Submit)
   */
  async function handleSubmit(formData: FormData) {
    setError('');

    const credentials: LoginInput = {
      username: formData.get('username') as string,
      password: formData.get('password') as string,
    };

    startTransition(async () => {
      const result = await loginAction(credentials);

      if (result.success) {
        console.log('Login successful:', result.data);
        router.push('/dashboard'); // 跳转到仪表板 (Redirect to dashboard)
      } else {
        setError(result.error || 'Login failed');
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          disabled={isPending}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          disabled={isPending}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      {error && (
        <div className="text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

### 用户资料组件 (User Profile Component)

创建 `app/components/UserProfile.tsx`：

```typescript
'use client';

import { useState, useEffect, useTransition } from 'react';
import { getUserInfoAction, updateUserProfileAction } from '@/actions/user';

/**
 * 用户资料组件 (User Profile Component)
 */
export function UserProfile() {
  const [isPending, startTransition] = useTransition();
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  /**
   * 加载用户信息 (Load User Info)
   */
  useEffect(() => {
    startTransition(async () => {
      const result = await getUserInfoAction();
      if (result.success) {
        setUser(result.data);
      } else {
        setError(result.error || 'Failed to load user info');
      }
    });
  }, []);

  /**
   * 处理资料更新 (Handle Profile Update)
   */
  async function handleSubmit(formData: FormData) {
    setError('');
    setSuccess('');

    const data = {
      display_name: formData.get('display_name') as string,
      email: formData.get('email') as string,
      avatar_url: formData.get('avatar_url') as string || undefined,
    };

    startTransition(async () => {
      const result = await updateUserProfileAction(data);

      if (result.success) {
        setUser(result.data);
        setSuccess('Profile updated successfully');
      } else {
        setError(result.error || 'Failed to update profile');
      }
    });
  }

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium">
          Username (Read-only)
        </label>
        <input
          id="username"
          value={user.username}
          readOnly
          disabled
          className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100"
        />
      </div>

      <div>
        <label htmlFor="display_name" className="block text-sm font-medium">
          Display Name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          defaultValue={user.display_name}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={user.email}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div>
        <label htmlFor="avatar_url" className="block text-sm font-medium">
          Avatar URL
        </label>
        <input
          id="avatar_url"
          name="avatar_url"
          type="url"
          defaultValue={user.avatar_url || ''}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      {error && (
        <div className="text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-600 text-sm" role="status">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Updating...' : 'Update Profile'}
      </button>
    </form>
  );
}
```

### 角色管理组件 (Role Management Component)

创建 `app/components/RoleManagement.tsx`：

```typescript
'use client';

import { useState, useEffect, useTransition } from 'react';
import { getRolesAction, assignRoleAction } from '@/actions/rbac';
import type { Role } from 'oauth-service-napi';

/**
 * 角色管理组件 (Role Management Component)
 */
export function RoleManagement({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string>('');

  /**
   * 加载角色列表 (Load Roles List)
   */
  useEffect(() => {
    startTransition(async () => {
      const result = await getRolesAction(1, 50);
      if (result.success) {
        setRoles(result.data.items);
      } else {
        setError(result.error || 'Failed to load roles');
      }
    });
  }, []);

  /**
   * 分配角色 (Assign Role)
   */
  function handleAssignRole(roleId: string) {
    startTransition(async () => {
      const result = await assignRoleAction(userId, roleId);
      if (result.success) {
        alert('Role assigned successfully');
      } else {
        setError(result.error || 'Failed to assign role');
      }
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Role Management</h2>

      {error && (
        <div className="text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}

      <ul className="space-y-2">
        {roles.map((role) => (
          <li key={role.id} className="flex justify-between items-center p-3 border rounded">
            <div>
              <h3 className="font-medium">{role.name}</h3>
              <p className="text-sm text-gray-600">{role.description}</p>
              <p className="text-xs text-gray-500">
                {role.permissions.length} permissions
              </p>
            </div>
            <button
              onClick={() => handleAssignRole(role.id)}
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Assign
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 类型安全 (Type Safety)

### 导入类型定义 (Import Type Definitions)

OAuth napi SDK 提供完整的 TypeScript 类型定义，可以直接导入使用：

```typescript
import type {
  // SDK 配置 (SDK Configuration)
  SDKConfig,
  OAuthSDK,

  // 认证相关 (Authentication)
  LoginRequest,
  LoginResponse,
  TokenPair,
  TokenIntrospectResponse,

  // 用户相关 (User)
  UserInfo,
  UpdateProfileRequest,

  // RBAC 相关 (RBAC)
  Role,
  Permission,
  UserRole,

  // 客户端相关 (Client)
  ClientInfo,

  // 审计相关 (Audit)
  AuditLog,

  // 分页响应 (Pagination)
  PaginatedResponse,
} from 'oauth-service-napi';
```

### 自定义类型包装 (Custom Type Wrapper)

创建 `types/oauth.ts` 统一管理 OAuth 相关类型：

```typescript
/**
 * OAuth 相关类型定义 (OAuth Type Definitions)
 */

import type {
  LoginResponse,
  UserInfo,
  Role,
  Permission,
  AuditLog,
} from 'oauth-service-napi';

/**
 * 标准化的响应包装类型 (Standardized Response Wrapper)
 */
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * 登录操作结果 (Login Action Result)
 */
export type LoginActionResult = ActionResult<LoginResponse>;

/**
 * 用户信息操作结果 (User Info Action Result)
 */
export type UserInfoActionResult = ActionResult<UserInfo>;

/**
 * 角色列表操作结果 (Roles List Action Result)
 */
export type RolesActionResult = ActionResult<{
  roles: Role[];
  total: number;
  page: number;
  pageSize: number;
}>;

/**
 * 权限列表操作结果 (Permissions List Action Result)
 */
export type PermissionsActionResult = ActionResult<{
  permissions: Permission[];
  total: number;
  page: number;
  pageSize: number;
}>;

/**
 * 审计日志操作结果 (Audit Logs Action Result)
 */
export type AuditLogsActionResult = ActionResult<{
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}>;
```

---

## 测试指南 (Testing Guide)

### Jest 配置 (Jest Configuration)

创建 `jest.config.js`：

```javascript
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/app/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/actions/(.*)$': '<rootDir>/app/actions/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
```

### Mock OAuth SDK (Mock OAuth SDK)

创建 `__mocks__/oauth-service-napi.ts`：

```typescript
/**
 * OAuth SDK Mock for Testing
 */

export const mockAuthLogin = jest.fn();
export const mockAuthLogout = jest.fn();
export const mockUserGetInfo = jest.fn();
export const mockUserUpdateProfile = jest.fn();
export const mockRbacGetRoles = jest.fn();

export const createSDK = jest.fn(() => ({
  authLogin: mockAuthLogin,
  authLogout: mockAuthLogout,
  userGetInfo: mockUserGetInfo,
  userUpdateProfile: mockUserUpdateProfile,
  rbacGetRoles: mockRbacGetRoles,
}));
```

### Server Actions 单元测试 (Server Actions Unit Tests)

创建 `app/actions/__tests__/auth.test.ts`：

```typescript
/**
 * 认证 Server Actions 单元测试 (Authentication Server Actions Unit Tests)
 */

import { loginAction, logoutAction } from '../auth';
import { mockAuthLogin, mockAuthLogout } from '__mocks__/oauth-service-napi';

// Mock Next.js cookies module
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    set: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
  })),
}));

describe('Authentication Server Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loginAction', () => {
    it('should login successfully', async () => {
      // Arrange
      const mockResponse = {
        session_token: 'test-token-123',
        user_id: 'user-456',
        username: 'testuser',
        expires_in: 3600,
      };
      mockAuthLogin.mockResolvedValue(mockResponse);

      // Act
      const result = await loginAction({
        username: 'testuser',
        password: 'password123',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);
      expect(mockAuthLogin).toHaveBeenCalledWith('testuser', 'password123');
    });

    it('should handle login error', async () => {
      // Arrange
      mockAuthLogin.mockRejectedValue(new Error('Invalid credentials'));

      // Act
      const result = await loginAction({
        username: 'testuser',
        password: 'wrongpassword',
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('logoutAction', () => {
    it('should logout successfully', async () => {
      // Arrange
      mockAuthLogout.mockResolvedValue(true);

      // Act
      const result = await logoutAction();

      // Assert
      expect(result.success).toBe(true);
      expect(mockAuthLogout).toHaveBeenCalled();
    });
  });
});
```

### 集成测试 (Integration Tests)

创建 `app/actions/__tests__/integration.test.ts`：

```typescript
/**
 * 集成测试 (Integration Tests)
 * 需要 OAuth Service 运行在 localhost:3001
 */

import { loginAction } from '../auth';
import { getUserInfoAction } from '../user';

describe('OAuth SDK Integration Tests', () => {
  // 跳过集成测试除非设置了环境变量 (Skip unless env var is set)
  const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

  (runIntegrationTests ? describe : describe.skip)('Real OAuth Service', () => {
    it('should complete full login flow', async () => {
      // Step 1: Login
      const loginResult = await loginAction({
        username: 'testuser',
        password: 'testpass',
      });

      expect(loginResult.success).toBe(true);
      expect(loginResult.data?.session_token).toBeDefined();

      // Step 2: Get user info
      const userResult = await getUserInfoAction();
      expect(userResult.success).toBe(true);
      expect(userResult.data?.username).toBe('testuser');
    });
  });
});
```

运行测试：

```bash
# 单元测试 (Unit tests)
pnpm test

# 集成测试 (Integration tests - requires OAuth Service running)
RUN_INTEGRATION_TESTS=true pnpm test
```

---

## 最佳实践 (Best Practices)

### 1. 错误处理模式 (Error Handling Pattern)

```typescript
'use server';

import { getOAuthSDK } from '@/lib/oauth-sdk';

export async function robustAction() {
  try {
    const sdk = getOAuthSDK();
    const result = await sdk.someMethod();

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    // 记录详细错误到服务器日志 (Log detailed error to server logs)
    console.error('[robustAction] Error:', error);

    // 返回用户友好的错误消息 (Return user-friendly error message)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
      code: 'OPERATION_ERROR',
    };
  }
}
```

### 2. 使用 useTransition 优化 UI (Optimize UI with useTransition)

```typescript
'use client';

import { useTransition } from 'react';
import { someAction } from '@/actions/some-action';

export function MyComponent() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      // Server Action 调用 (Server Action call)
      await someAction();
    });
  }

  return (
    <button onClick={handleClick} disabled={isPending}>
      {isPending ? 'Loading...' : 'Click me'}
    </button>
  );
}
```

### 3. 分页数据加载 (Paginated Data Loading)

```typescript
'use client';

import { useState, useEffect, useTransition } from 'react';
import { getRolesAction } from '@/actions/rbac';

export function PaginatedRolesList() {
  const [page, setPage] = useState(1);
  const [roles, setRoles] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getRolesAction(page, 20);
      if (result.success) {
        setRoles(result.data.items);
        setTotal(result.data.total);
      }
    });
  }, [page]);

  return (
    <div>
      <ul>
        {roles.map((role) => (
          <li key={role.id}>{role.name}</li>
        ))}
      </ul>

      <div className="flex gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || isPending}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={roles.length === 0 || isPending}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### 4. 环境变量验证 (Environment Variable Validation)

创建 `lib/env.ts`：

```typescript
/**
 * 环境变量验证 (Environment Variable Validation)
 */

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  OAUTH_SERVICE_URL: getRequiredEnv('OAUTH_SERVICE_URL'),
  OAUTH_SDK_TIMEOUT: parseInt(process.env.OAUTH_SDK_TIMEOUT || '5000'),
  OAUTH_SDK_RETRY_COUNT: parseInt(process.env.OAUTH_SDK_RETRY_COUNT || '3'),
  NODE_ENV: process.env.NODE_ENV || 'development',
};
```

---

## 故障排查 (Troubleshooting)

### 常见问题 (Common Issues)

#### 1. "OAuth SDK can only be used on the server side"

**原因 (Cause):** 在客户端组件中直接调用 SDK

**解决方案 (Solution):**

```typescript
// ❌ 错误 (Wrong)
'use client';
import { getOAuthSDK } from '@/lib/oauth-sdk';
const sdk = getOAuthSDK(); // Error!

// ✅ 正确 (Correct)
'use client';
import { loginAction } from '@/actions/auth';
const result = await loginAction(...); // OK
```

#### 2. TypeScript 类型错误 (TypeScript Type Error)

**错误信息 (Error Message):**

```
Cannot find module 'oauth-service-napi' or its corresponding type declarations
```

**解决方案 (Solution):**

```bash
# 检查 SDK 是否正确安装 (Check if SDK is installed)
ls node_modules/oauth-service-napi/index.d.ts

# 重新安装依赖 (Reinstall dependencies)
rm -rf node_modules
pnpm install

# 重启 TypeScript 服务器 (Restart TypeScript server in VS Code)
# Cmd+Shift+P → TypeScript: Restart TS Server
```

#### 3. 网络超时 (Network Timeout)

**解决方案 (Solution):**

```bash
# 增加超时时间 (Increase timeout)
# .env.local
OAUTH_SDK_TIMEOUT=10000

# 检查 OAuth Service 是否运行 (Check if OAuth Service is running)
curl http://localhost:3001/health
```

---

## 附录 (Appendix)

### 文件结构 (File Structure)

```
apps/admin-portal/
├── app/
│   ├── actions/
│   │   ├── auth.ts              # 认证 Server Actions
│   │   ├── user.ts              # 用户 Server Actions
│   │   ├── rbac.ts              # RBAC Server Actions
│   │   └── __tests__/
│   │       └── auth.test.ts     # 单元测试
│   ├── components/
│   │   ├── LoginForm.tsx        # 登录表单组件
│   │   ├── UserProfile.tsx      # 用户资料组件
│   │   └── RoleManagement.tsx   # 角色管理组件
│   └── page.tsx
├── lib/
│   ├── oauth-sdk.ts             # SDK 初始化模块
│   └── env.ts                   # 环境变量验证
├── types/
│   └── oauth.ts                 # OAuth 类型定义
├── __mocks__/
│   └── oauth-service-napi.ts    # SDK Mock
├── .env.local                   # 环境变量（不提交）
├── jest.config.js               # Jest 配置
├── package.json
└── tsconfig.json
```

---

**文档版本 (Document Version):** 1.0.0
**最后更新 (Last Updated):** 2025-12-03
**维护者 (Maintainer):** Admin Portal Team
