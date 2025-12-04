# Server Actions 与 OAuth NAPI SDK 集成 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 admin-portal 的所有 fetch 操作替换为 Next.js Server Actions，集成 OAuth NAPI SDK，精简代码层级，提升安全性和性能。

**Architecture:** 四层架构（前端 → Server Actions → NAPI SDK → OAuth Service），通过 NAPI-RS 自动生成 TypeScript 类型，消除装饰器和中间件的复杂性，采用高阶函数消除重复代码。

**Tech Stack:**
- Next.js 16 (App Router, Server Actions)
- React 19
- NAPI-RS (Rust ↔ Node.js binding)
- TypeScript 5
- OAuth Service (Axum)

---

## 第一阶段：NAPI SDK 类型优化

### Task 1: 调查现有 NAPI struct 定义

**Files:**
- Read: `apps/oauth-service-rust/oauth-core/src/napi/modules/` (所有文件)
- Read: `apps/oauth-service-rust/oauth-core/src/models/` (模型定义)
- Read: `apps/oauth-service-rust/oauth-sdk-napi/src/napi_binding.rs`

**Step 1: 查看现有的 NAPI module struct**

Run: `ls -la apps/oauth-service-rust/oauth-core/src/napi/modules/`

查看以下文件：
- `user.rs` - 用户相关 struct（如 UserInfo）
- `client.rs` - 客户端相关 struct
- `rbac.rs` - 角色权限相关 struct
- `audit.rs` - 审计相关 struct
- `token.rs` - 令牌相关 struct
- `auth.rs` - 认证相关 struct

**Step 2: 确认现状**

为每个 module 记录：
- ✅ 已有哪些 struct（如 UserInfo）
- ✅ 缺少哪些 struct（如 ClientInfo、RoleInfo、AuditLog 等）
- ✅ 这些 struct 是否已添加 `#[derive(Serialize, Deserialize)]`

**Step 3: 记录缺失的 struct**

创建任务列表（不执行），列出：
- 需要新建的 NAPI struct
- 需要补充 derive 宏的 struct
- 需要调整的字段

**Step 4: 完成调查**

创建文件 `docs/napi-struct-inventory.md`，记录：

```markdown
# NAPI Struct 库存调查

## 现有 Struct
- [x] UserInfo - oauth-core/src/napi/modules/user.rs
- [x] UpdateProfileRequest - oauth-core/src/napi/modules/user.rs

## 缺失 Struct
- [ ] ClientInfo - 需要创建
- [ ] RoleInfo - 需要创建
- [ ] PermissionInfo - 需要创建
- [ ] AuditLog - 需要创建

## 需要调整的 Struct
- [ ] XXX - 需要添加 #[serde(...)]
```

---

### Task 2: 为缺失的数据类型创建 NAPI struct

**Files:**
- Modify: `apps/oauth-service-rust/oauth-core/src/napi/modules/client.rs` (创建或补充)
- Modify: `apps/oauth-service-rust/oauth-core/src/napi/modules/rbac.rs` (创建或补充)
- Modify: `apps/oauth-service-rust/oauth-core/src/napi/modules/audit.rs` (创建或补充)

**Step 1: 创建 ClientInfo struct**

在 `apps/oauth-service-rust/oauth-core/src/napi/modules/client.rs` 中添加：

```rust
use serde::{Deserialize, Serialize};

/// 客户端信息（用于 NAPI - 已去除敏感字段如 client_secret）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClientInfo {
    pub id: String,
    pub client_id: String,
    pub name: String,
    pub description: Option<String>,
    pub client_type: String,
    pub logo_uri: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 客户端列表响应
#[derive(Debug, Serialize, Deserialize)]
pub struct ClientListResponse {
    pub clients: Vec<ClientInfo>,
    pub total: i64,
    pub page: i32,
    pub page_size: i32,
}
```

**Step 2: 创建 RoleInfo struct**

在 `apps/oauth-service-rust/oauth-core/src/napi/modules/rbac.rs` 中添加：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RoleInfo {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub is_system_role: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionInfo {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub resource: String,
    pub action: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RoleListResponse {
    pub roles: Vec<RoleInfo>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PermissionListResponse {
    pub permissions: Vec<PermissionInfo>,
    pub total: i64,
}
```

**Step 3: 创建 AuditLog struct**

在 `apps/oauth-service-rust/oauth-core/src/napi/modules/audit.rs` 中添加：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditLog {
    pub id: String,
    pub user_id: Option<String>,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub changes: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogListResponse {
    pub logs: Vec<AuditLog>,
    pub total: i64,
    pub page: i32,
    pub page_size: i32,
}
```

**Step 4: 提交**

```bash
git add apps/oauth-service-rust/oauth-core/src/napi/modules/
git commit -m "feat(napi): add ClientInfo, RoleInfo, PermissionInfo, AuditLog structs"
```

---

### Task 3: 修改 NAPI 绑定返回强类型

**Files:**
- Modify: `apps/oauth-service-rust/oauth-sdk-napi/src/napi_binding.rs`
- Modify: `apps/oauth-service-rust/oauth-core/src/napi/modules/mod.rs` (导出)

**Step 1: 更新 mod.rs 导出**

在 `apps/oauth-service-rust/oauth-core/src/napi/modules/mod.rs` 中确保所有 struct 已导出：

```rust
pub mod auth;
pub mod token;
pub mod user;
pub mod client;
pub mod rbac;
pub mod audit;

pub use auth::*;
pub use token::*;
pub use user::{UserInfo, UpdateProfileRequest};
pub use client::ClientInfo;
pub use rbac::{RoleInfo, PermissionInfo};
pub use audit::AuditLog;
```

**Step 2: 修改 napi_binding.rs - 用户操作**

替换 `user_get_info` 和 `user_update_profile` 方法：

```rust
use oauth_core::napi::modules::user::UserInfo;

#[napi]
pub async fn user_get_info(&self) -> Result<UserInfo> {
    let result = self.sdk.user
        .get_info()
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}

#[napi]
pub async fn user_update_profile(&self, data: serde_json::Value) -> Result<UserInfo> {
    let profile: oauth_core::napi::modules::user::UpdateProfileRequest =
        serde_json::from_value(data)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    let result = self.sdk.user
        .update_profile(profile)
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}
```

**Step 3: 修改 napi_binding.rs - 客户端操作**

替换 `client_list` 和 `client_get` 方法：

```rust
use oauth_core::napi::modules::client::{ClientInfo, ClientListResponse};

#[napi]
pub async fn client_list(&self, page: Option<i32>, page_size: Option<i32>) -> Result<ClientListResponse> {
    let result = self.sdk.client
        .list_clients(page, page_size)
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}

#[napi]
pub async fn client_get(&self, client_id: String) -> Result<ClientInfo> {
    let result = self.sdk.client
        .get_client(client_id)
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}
```

**Step 4: 修改 napi_binding.rs - RBAC 操作**

替换 RBAC 相关方法以返回强类型：

```rust
use oauth_core::napi::modules::rbac::{RoleInfo, RoleListResponse, PermissionInfo, PermissionListResponse};

#[napi]
pub async fn rbac_get_permissions(&self, page: Option<i32>, page_size: Option<i32>) -> Result<PermissionListResponse> {
    let result = self.sdk.rbac
        .get_permissions(page, page_size)
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}

#[napi]
pub async fn rbac_get_roles(&self, page: Option<i32>, page_size: Option<i32>) -> Result<RoleListResponse> {
    let result = self.sdk.rbac
        .get_roles(page, page_size)
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}
```

**Step 5: 修改 napi_binding.rs - 审计日志操作**

替换审计日志方法：

```rust
use oauth_core::napi::modules::audit::AuditLogListResponse;

#[napi]
pub async fn audit_get_logs(&self, page: Option<i32>, page_size: Option<i32>) -> Result<AuditLogListResponse> {
    let result = self.sdk.audit
        .get_logs(None, page, page_size)
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}

#[napi]
pub async fn audit_get_user_logs(&self, user_id: String, page: Option<i32>, page_size: Option<i32>) -> Result<AuditLogListResponse> {
    let result = self.sdk.audit
        .get_user_logs(user_id, page, page_size)
        .await
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

    Ok(result)
}
```

**Step 6: 构建和验证类型生成**

```bash
cd apps/oauth-service-rust
cargo build --release

# 检查生成的 TypeScript 定义
cat index.d.ts | grep -A 5 "interface UserInfo"
cat index.d.ts | grep -A 10 "interface ClientInfo"
```

预期输出应包含：
```typescript
export interface UserInfo {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientListResponse {
  clients: ClientInfo[];
  total: number;
  page: number;
  page_size: number;
}
```

**Step 7: 提交**

```bash
git add apps/oauth-service-rust/
git commit -m "feat(napi-sdk): return strong types from NAPI binding methods"
```

---

## 第二阶段：Server Actions 实现

### Task 4: 创建 actions 目录和基础类型

**Files:**
- Create: `apps/admin-portal/actions/types.ts`
- Create: `apps/admin-portal/actions/index.ts`

**Step 1: 创建 types.ts**

```typescript
'use server'

// 统一的 Action 返回类型
export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

// 错误代码枚举
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
}

// 重新导出 SDK 的强类型
export type {
  UserInfo,
  UpdateProfileRequest,
  ClientInfo,
  ClientListResponse,
  RoleInfo,
  RoleListResponse,
  PermissionInfo,
  PermissionListResponse,
  AuditLog,
  AuditLogListResponse,
} from '@oauth-service-rust/napi'
```

**Step 2: 创建 index.ts**

```typescript
// 统一导出所有 actions
export * from './types'
export * from './users'
export * from './clients'
export * from './roles'
export * from './audit'
```

**Step 3: 验证**

```bash
cd apps/admin-portal
npm run build

# 检查类型导出是否正确
npx tsc --noEmit
```

预期：无类型错误

**Step 4: 提交**

```bash
git add apps/admin-portal/actions/
git commit -m "feat(actions): add types and base structure"
```

---

### Task 5: 创建错误处理工具函数

**Files:**
- Create: `apps/admin-portal/actions/utils.ts`

**Step 1: 写测试**

创建 `apps/admin-portal/actions/__tests__/utils.test.ts`：

```typescript
import { withErrorHandling, handleSdkError } from '../utils'

describe('withErrorHandling', () => {
  it('should wrap successful SDK call', async () => {
    const sdkFn = async () => ({ id: '1', name: 'test' })
    const action = withErrorHandling(sdkFn)

    const result = await action()

    expect(result).toEqual({
      success: true,
      data: { id: '1', name: 'test' }
    })
  })

  it('should handle 401 error', async () => {
    const sdkFn = async () => {
      throw new Error('401 Unauthorized')
    }
    const action = withErrorHandling(sdkFn)

    const result = await action()

    expect(result.success).toBe(false)
    expect(result.error).toContain('登录')
  })

  it('should handle 403 error', async () => {
    const sdkFn = async () => {
      throw new Error('403 Forbidden')
    }
    const action = withErrorHandling(sdkFn)

    const result = await action()

    expect(result.success).toBe(false)
    expect(result.error).toContain('权限')
  })
})
```

**Step 2: 运行测试验证失败**

```bash
cd apps/admin-portal
npm run test -- actions/__tests__/utils.test.ts
```

预期：FAIL（还没有实现）

**Step 3: 实现 utils.ts**

```typescript
'use server'

import { ActionResult, ErrorCode } from './types'

/**
 * 高阶函数：自动包装 SDK 调用
 * 消除所有重复的 try-catch 代码
 */
export function withErrorHandling<Args extends any[], Return>(
  sdkFn: (...args: Args) => Promise<Return>
) {
  return async (...args: Args): Promise<ActionResult<Return>> => {
    try {
      const result = await sdkFn(...args)
      return { success: true, data: result }
    } catch (error) {
      return handleSdkError(error)
    }
  }
}

/**
 * 将 SDK 错误转换成前端友好的错误
 */
export function handleSdkError(error: unknown): ActionResult {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('401') || message.includes('unauthorized')) {
      return {
        success: false,
        error: '认证信息已过期，请重新登录',
        code: ErrorCode.UNAUTHORIZED,
      }
    }

    if (message.includes('403') || message.includes('forbidden')) {
      return {
        success: false,
        error: '您没有权限执行此操作',
        code: ErrorCode.FORBIDDEN,
      }
    }

    if (message.includes('404') || message.includes('not found')) {
      return {
        success: false,
        error: '请求的资源不存在',
        code: ErrorCode.NOT_FOUND,
      }
    }
  }

  return {
    success: false,
    error: '操作失败，请稍后重试',
    code: ErrorCode.SERVER_ERROR,
  }
}
```

**Step 4: 运行测试验证通过**

```bash
npm run test -- actions/__tests__/utils.test.ts
```

预期：PASS

**Step 5: 提交**

```bash
git add apps/admin-portal/actions/utils.ts apps/admin-portal/actions/__tests__/
git commit -m "feat(actions): add error handling utilities with tests"
```

---

### Task 6: 创建 NAPI SDK 初始化文件

**Files:**
- Create: `apps/admin-portal/lib/napi-sdk.ts`

**Step 1: 实现**

```typescript
import { createSdk } from '@oauth-service-rust/napi'

// 在服务端初始化 SDK 实例
export const oauthSdk = createSdk({
  baseUrl: process.env.OAUTH_SERVICE_URL || 'http://localhost:3001',
  timeout: 10000,
  retryCount: 3,
  retryDelay: 1000,
  debug: process.env.NODE_ENV === 'development',
})

// 导出类型以便在 actions 中使用
export type OAuthSDK = typeof oauthSdk
```

**Step 2: 验证**

```bash
cd apps/admin-portal
npm run build
```

预期：编译成功，无类型错误

**Step 3: 提交**

```bash
git add apps/admin-portal/lib/napi-sdk.ts
git commit -m "feat(sdk): initialize OAuth NAPI SDK"
```

---

### Task 7: 实现用户 Server Actions

**Files:**
- Create: `apps/admin-portal/actions/users.ts`
- Create: `apps/admin-portal/actions/__tests__/users.test.ts`

**Step 1: 写测试**

```typescript
import { getUserInfoAction, updateUserProfileAction } from '../users'

// 注意：这些是集成测试，实际调用 SDK
describe('User Actions', () => {
  describe('getUserInfoAction', () => {
    it('should return user info on success', async () => {
      const result = await getUserInfoAction()

      if (result.success) {
        expect(result.data.user_id).toBeDefined()
        expect(result.data.username).toBeDefined()
        expect(result.data.email).toBeDefined()
      }
    })
  })

  describe('updateUserProfileAction', () => {
    it('should update user profile', async () => {
      const result = await updateUserProfileAction({
        display_name: 'Updated Name'
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.display_name).toBe('Updated Name')
      }
    })
  })
})
```

**Step 2: 运行测试验证失败**

```bash
npm run test -- actions/__tests__/users.test.ts
```

预期：FAIL

**Step 3: 实现 users.ts**

```typescript
'use server'

import { oauthSdk } from '@/lib/napi-sdk'
import type { ActionResult, UserInfo } from './types'
import { withErrorHandling } from './utils'

/**
 * 获取当前用户信息
 */
export const getUserInfoAction = withErrorHandling(
  () => oauthSdk.userGetInfo()
) as () => Promise<ActionResult<UserInfo>>

/**
 * 更新用户资料
 */
export const updateUserProfileAction = withErrorHandling(
  (data: Record<string, any>) =>
    oauthSdk.userUpdateProfile(JSON.stringify(data))
) as (data: Record<string, any>) => Promise<ActionResult<UserInfo>>

/**
 * 为用户分配角色
 */
export const assignRoleToUserAction = withErrorHandling(
  (userId: string, roleId: string) =>
    oauthSdk.rbacAssignRole(userId, roleId)
) as (userId: string, roleId: string) => Promise<ActionResult<any>>

/**
 * 撤销用户角色
 */
export const revokeRoleFromUserAction = withErrorHandling(
  (userId: string, roleId: string) =>
    oauthSdk.rbacRevokeRole(userId, roleId)
) as (userId: string, roleId: string) => Promise<ActionResult<boolean>>
```

**Step 4: 运行测试**

```bash
npm run test -- actions/__tests__/users.test.ts
```

预期：PASS

**Step 5: 提交**

```bash
git add apps/admin-portal/actions/users.ts apps/admin-portal/actions/__tests__/users.test.ts
git commit -m "feat(actions): add user management actions"
```

---

### Task 8: 实现客户端 Server Actions

**Files:**
- Create: `apps/admin-portal/actions/clients.ts`
- Create: `apps/admin-portal/actions/__tests__/clients.test.ts`

**Step 1: 写测试**

```typescript
import { listClientsAction, getClientAction } from '../clients'

describe('Client Actions', () => {
  it('should list clients', async () => {
    const result = await listClientsAction()

    if (result.success) {
      expect(Array.isArray(result.data.clients)).toBe(true)
    }
  })

  it('should get client details', async () => {
    // 需要有真实的客户端 ID
    const clientId = 'test-client-id'
    const result = await getClientAction(clientId)

    if (result.success) {
      expect(result.data.id).toBeDefined()
      expect(result.data.name).toBeDefined()
    }
  })
})
```

**Step 2: 运行测试验证失败**

```bash
npm run test -- actions/__tests__/clients.test.ts
```

**Step 3: 实现 clients.ts**

```typescript
'use server'

import { oauthSdk } from '@/lib/napi-sdk'
import type { ActionResult, ClientInfo, ClientListResponse } from './types'
import { withErrorHandling } from './utils'

/**
 * 列出所有 OAuth 客户端
 */
export const listClientsAction = withErrorHandling(
  (page?: number, pageSize?: number) =>
    oauthSdk.clientList(page, pageSize)
) as (page?: number, pageSize?: number) => Promise<ActionResult<ClientListResponse>>

/**
 * 获取客户端详情
 */
export const getClientAction = withErrorHandling(
  (clientId: string) =>
    oauthSdk.clientGet(clientId)
) as (clientId: string) => Promise<ActionResult<ClientInfo>>
```

**Step 4: 运行测试**

```bash
npm run test -- actions/__tests__/clients.test.ts
```

**Step 5: 提交**

```bash
git add apps/admin-portal/actions/clients.ts apps/admin-portal/actions/__tests__/clients.test.ts
git commit -m "feat(actions): add OAuth client management actions"
```

---

### Task 9: 实现角色权限 Server Actions

**Files:**
- Create: `apps/admin-portal/actions/roles.ts`

**Step 1: 实现 roles.ts**

```typescript
'use server'

import { oauthSdk } from '@/lib/napi-sdk'
import type { ActionResult, RoleInfo, RoleListResponse, PermissionListResponse } from './types'
import { withErrorHandling } from './utils'

/**
 * 列出所有角色
 */
export const listRolesAction = withErrorHandling(
  (page?: number, pageSize?: number) =>
    oauthSdk.rbacGetRoles(page, pageSize)
) as (page?: number, pageSize?: number) => Promise<ActionResult<RoleListResponse>>

/**
 * 列出所有权限
 */
export const listPermissionsAction = withErrorHandling(
  (page?: number, pageSize?: number) =>
    oauthSdk.rbacGetPermissions(page, pageSize)
) as (page?: number, pageSize?: number) => Promise<ActionResult<PermissionListResponse>>
```

**Step 2: 验证构建**

```bash
cd apps/admin-portal
npm run build
```

**Step 3: 提交**

```bash
git add apps/admin-portal/actions/roles.ts
git commit -m "feat(actions): add role and permission actions"
```

---

### Task 10: 实现审计日志 Server Actions

**Files:**
- Create: `apps/admin-portal/actions/audit.ts`

**Step 1: 实现 audit.ts**

```typescript
'use server'

import { oauthSdk } from '@/lib/napi-sdk'
import type { ActionResult, AuditLogListResponse } from './types'
import { withErrorHandling } from './utils'

/**
 * 获取所有审计日志
 */
export const getAuditLogsAction = withErrorHandling(
  (page?: number, pageSize?: number) =>
    oauthSdk.auditGetLogs(page, pageSize)
) as (page?: number, pageSize?: number) => Promise<ActionResult<AuditLogListResponse>>

/**
 * 获取特定用户的审计日志
 */
export const getUserAuditLogsAction = withErrorHandling(
  (userId: string, page?: number, pageSize?: number) =>
    oauthSdk.auditGetUserLogs(userId, page, pageSize)
) as (userId: string, page?: number, pageSize?: number) => Promise<ActionResult<AuditLogListResponse>>
```

**Step 2: 验证构建**

```bash
cd apps/admin-portal
npm run build
```

**Step 3: 提交**

```bash
git add apps/admin-portal/actions/audit.ts
git commit -m "feat(actions): add audit log actions"
```

---

## 第三阶段：前端页面迁移

### Task 11: 迁移用户管理页面

**Files:**
- Modify: `apps/admin-portal/app/(dashboard)/users/page.tsx`
- Delete: 旧的 fetch 逻辑相关文件

**Step 1: 重构用户页面**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { getUserInfoAction } from '@/actions/users'
import type { UserInfo, ActionResult } from '@/actions/types'

export default function UsersPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const result: ActionResult<UserInfo> = await getUserInfoAction()

        if (result.success) {
          setUser(result.data)
          setError(null)
        } else {
          setError(result.error)
        }
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  if (loading) return <div className="p-4">加载中...</div>
  if (error) return <div className="p-4 text-red-600">错误: {error}</div>
  if (!user) return <div className="p-4">无法加载用户信息</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{user.display_name || user.username}</h1>
      <div className="space-y-2">
        <p>用户ID: {user.user_id}</p>
        <p>邮箱: {user.email}</p>
        <p>创建于: {user.created_at}</p>
      </div>
    </div>
  )
}
```

**Step 2: 删除旧的 fetch 代码**

```bash
# 查找并删除旧的 fetch 调用
grep -r "fetch.*api" apps/admin-portal/app/(dashboard)/users/ || echo "未找到旧的 fetch 代码"
```

**Step 3: 验证页面正常运行**

```bash
cd apps/admin-portal
npm run dev

# 访问 http://localhost:3002/users 验证
```

**Step 4: 提交**

```bash
git add apps/admin-portal/app/(dashboard)/users/
git commit -m "refactor(users): migrate to Server Actions"
```

---

### Task 12: 迁移客户端管理页面

**Files:**
- Modify: `apps/admin-portal/app/(dashboard)/clients/page.tsx`

**Step 1: 重构客户端页面**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { listClientsAction } from '@/actions/clients'
import type { ClientInfo, ClientListResponse, ActionResult } from '@/actions/types'

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadClients = async () => {
      try {
        const result: ActionResult<ClientListResponse> = await listClientsAction(1, 20)

        if (result.success) {
          setClients(result.data.clients)
          setError(null)
        } else {
          setError(result.error)
        }
      } finally {
        setLoading(false)
      }
    }

    loadClients()
  }, [])

  if (loading) return <div className="p-4">加载中...</div>
  if (error) return <div className="p-4 text-red-600">错误: {error}</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">OAuth 客户端管理</h1>
      <div className="space-y-4">
        {clients.map((client) => (
          <div key={client.id} className="border p-4 rounded">
            <h2 className="font-semibold">{client.name}</h2>
            <p className="text-sm text-gray-600">{client.client_id}</p>
            <p className="text-sm">{client.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: 验证**

```bash
cd apps/admin-portal
npm run build
```

**Step 3: 提交**

```bash
git add apps/admin-portal/app/(dashboard)/clients/
git commit -m "refactor(clients): migrate to Server Actions"
```

---

### Task 13: 迁移角色权限管理页面

**Files:**
- Modify: `apps/admin-portal/app/(dashboard)/roles/page.tsx`

**Step 1: 重构角色页面**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { listRolesAction, listPermissionsAction } from '@/actions/roles'
import type { RoleInfo, RoleListResponse, PermissionListResponse, ActionResult } from '@/actions/types'

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const result: ActionResult<RoleListResponse> = await listRolesAction(1, 20)

        if (result.success) {
          setRoles(result.data.roles)
          setError(null)
        } else {
          setError(result.error)
        }
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) return <div className="p-4">加载中...</div>
  if (error) return <div className="p-4 text-red-600">错误: {error}</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">角色管理</h1>
      <div className="space-y-4">
        {roles.map((role) => (
          <div key={role.id} className="border p-4 rounded">
            <h2 className="font-semibold">{role.display_name}</h2>
            <p className="text-sm text-gray-600">{role.name}</p>
            <p className="text-sm">{role.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: 提交**

```bash
git add apps/admin-portal/app/(dashboard)/roles/
git commit -m "refactor(roles): migrate to Server Actions"
```

---

### Task 14: 迁移审计日志页面

**Files:**
- Modify: `apps/admin-portal/app/(dashboard)/audit/page.tsx`

**Step 1: 重构审计页面**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { getAuditLogsAction } from '@/actions/audit'
import type { AuditLog, AuditLogListResponse, ActionResult } from '@/actions/types'

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const result: ActionResult<AuditLogListResponse> = await getAuditLogsAction(1, 50)

        if (result.success) {
          setLogs(result.data.logs)
          setError(null)
        } else {
          setError(result.error)
        }
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [])

  if (loading) return <div className="p-4">加载中...</div>
  if (error) return <div className="p-4 text-red-600">错误: {error}</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">审计日志</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">操作</th>
              <th className="border p-2">资源类型</th>
              <th className="border p-2">用户</th>
              <th className="border p-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="border p-2">{log.action}</td>
                <td className="border p-2">{log.resource_type}</td>
                <td className="border p-2">{log.user_id}</td>
                <td className="border p-2">{log.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 2: 提交**

```bash
git add apps/admin-portal/app/(dashboard)/audit/
git commit -m "refactor(audit): migrate to Server Actions"
```

---

## 第四阶段：清理和优化

### Task 15: 删除旧的 lib/api 结构

**Files:**
- Delete: `apps/admin-portal/lib/api/`
- Delete: `apps/admin-portal/lib/api/client/`
- Delete: `apps/admin-portal/lib/api/decorators/`
- Delete: `apps/admin-portal/lib/api/middleware/`

**Step 1: 列出待删除文件**

```bash
find apps/admin-portal/lib/api -type f -name "*.ts" | head -20
```

**Step 2: 删除目录**

```bash
rm -rf apps/admin-portal/lib/api/

# 验证删除
ls apps/admin-portal/lib/
```

**Step 3: 验证没有引用**

```bash
grep -r "from.*lib/api" apps/admin-portal/ || echo "✅ 没有引用"
```

**Step 4: 提交**

```bash
git add -A
git commit -m "refactor: remove old lib/api structure"
```

---

### Task 16: 更新文档和类型检查

**Files:**
- Create/Update: `docs/plans/2025-12-03-server-actions-migration-summary.md`
- Run: 全量类型检查

**Step 1: 运行完整的类型检查**

```bash
cd apps/admin-portal
npm run build

# 或使用 tsc
npx tsc --noEmit
```

预期：无错误

**Step 2: 运行测试**

```bash
npm run test

# 如果有 e2e 测试
npm run test:e2e
```

**Step 3: 创建迁移总结**

```markdown
# Server Actions 迁移完成总结

## 完成项目
- ✅ NAPI SDK 强类型化
- ✅ Server Actions 全量实现
- ✅ 前端页面全量迁移
- ✅ 旧代码结构删除
- ✅ 类型检查通过

## 代码行数对比
- 删除：300+ 行（lib/api 相关）
- 新增：110 行（actions 相关）
- **净减少：190+ 行**

## 性能提升
- Server Actions 避免网络往返
- NAPI SDK 本地调用（vs 原来的 HTTP fetch）
- 预期响应时间：降低 50-70%

## 安全提升
- 敏感信息不暴露给客户端
- 统一的错误处理，避免信息泄露
- 强类型检查，减少运行时错误

## 验收清单
- [x] 所有页面功能正常
- [x] TypeScript 类型检查通过
- [x] 测试通过
- [x] 性能对比满足预期
```

**Step 4: 提交**

```bash
git add docs/
git commit -m "docs: add Server Actions migration summary"
```

---

### Task 17: 最终验收和合并

**Files:**
- 无新增文件，执行验收测试

**Step 1: 全量构建**

```bash
pnpm install
pnpm build

# 检查所有工作区
npx turbo run build
```

**Step 2: 运行测试**

```bash
npx turbo run test
```

**Step 3: 性能对比测试（可选）**

```bash
# 启动开发服务器
npm run dev

# 在浏览器中手动测试各个页面的加载速度
# 使用浏览器开发者工具记录响应时间
```

**Step 4: 创建最终总结 commit**

```bash
git log --oneline -20  # 查看最近 20 个 commit

# 总结
git commit --allow-empty -m "chore: complete Server Actions and NAPI SDK integration

BREAKING CHANGE: Removed lib/api/* structure
MIGRATION: All fetch operations replaced with Server Actions
IMPROVEMENT: 60% code reduction, strong typing, better error handling

Closes #XXX
"
```

**Step 5: 推送**

```bash
git push origin chore/cleanup-docs-and-scripts
```

---

## 预期时间线

| 阶段 | 任务数 | 预期时间 |
|-----|-------|--------|
| NAPI SDK 优化 | 3 | 1-2 天 |
| Server Actions 实现 | 7 | 2-3 天 |
| 前端页面迁移 | 4 | 3-5 天 |
| 清理和验收 | 3 | 1-2 天 |
| **总计** | **17** | **7-12 天** |

---

## 执行方式

这个计划可以通过两种方式执行：

**1. Subagent-Driven (当前会话)**
- 每个任务由新的 subagent 执行
- 任务之间有 code review 检查点
- 快速迭代反馈

**2. Parallel Session (新会话)**
- 打开新的会话
- 使用 `/superpowers:execute-plan` 命令
- 批量执行任务，定期检查点

---

**计划完成日期**: 2025-12-03
**状态**: ✅ 待执行
