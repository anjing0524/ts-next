# Server Actions 与 OAuth NAPI SDK 集成设计

**时间**: 2025-12-03
**目标**: 用 Next.js Server Actions 替换 admin-portal 的直接 fetch 操作，集成 OAuth NAPI SDK，精简代码层级，提升安全性和性能

---

## 一、设计目标

### 核心问题
- 当前 admin-portal 的代码层级过多（装饰器、中间件、适配器等）
- 直接 fetch 操作分散在各处，难以维护
- 缺乏统一的错误处理和类型安全

### 解决目标
- ✅ **精简代码层级** - 消除不必要的装饰器和中间件抽象
- ✅ **统一的服务端逻辑** - Server Actions 作为轻薄适配层
- ✅ **类型安全** - NAPI SDK 的强类型支持
- ✅ **性能提升** - 直接调用 NAPI SDK（本地调用），减少网络往返
- ✅ **安全提升** - 敏感信息在服务端处理，不暴露给客户端

---

## 二、整体架构设计

### 数据流向

```
┌─────────────────────┐
│  前端组件           │
│  (React 19)         │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────────────┐
│  Server Actions             │
│  (轻薄适配层)               │
│  - 调用 NAPI SDK 函数      │
│  - 错误转换映射            │
│  - 类型转换                │
└──────────┬──────────────────┘
           │
           ↓
┌──────────────────────────────────────┐
│  NAPI SDK                            │
│  (OAuth-Service-Rust)                │
│  - 封装具体的 API 函数               │
│  - HTTP 请求处理                    │
│  - 返回强类型结果（已去除敏感信息）  │
└──────────┬───────────────────────────┘
           │
           ↓
┌──────────────────────────┐
│  OAuth Service (Axum)    │
│  - 权限检查              │
│  - 业务逻辑              │
│  - 缓存管理              │
│  - 审计日志              │
└──────────┬───────────────┘
           │
           ↓
┌──────────────────────┐
│  数据库              │
│  (SQLite/MySQL)      │
└──────────────────────┘
```

### 关键设计原则

| 层级 | 职责 | 不涉及 |
|-----|------|--------|
| **前端组件** | 调用 Server Action，处理 success/error | API 调用，错误映射 |
| **Server Actions** | 调用 NAPI SDK，转换错误 | 业务逻辑，权限检查 |
| **NAPI SDK** | HTTP 请求包装，参数序列化 | 业务逻辑，权限检查，敏感数据 |
| **OAuth Service** | 权限、业务逻辑、缓存、审计 | 前端关注，错误隐藏 |

---

## 三、第一部分：NAPI SDK 类型优化

### 当前问题
- NAPI 绑定层所有方法返回 `Result<serde_json::Value>`
- 生成的 TypeScript 类型都是 `Promise<any>`
- 失去类型安全优势

### 解决方案：复用已有的 Rust struct

#### 1. 确认现有 struct
已有的针对 API 返回的 struct（在 `oauth-core/src/napi/modules/`）：
```rust
// 用户信息（已去除 password_hash 等敏感字段）
pub struct UserInfo {
    pub user_id: String,
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// 请求类型
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}
```

#### 2. 修改 NAPI 绑定，直接返回这些 struct

**文件**: `apps/oauth-service-rust/oauth-sdk-napi/src/napi_binding.rs`

```rust
use napi::bindgen_prelude::*;
use oauth_core::napi::{OAuthSDK, SDKConfig};
use oauth_core::napi::modules::user::UserInfo;  // ← 复用现有 struct
use napi_derive::napi;

#[napi]
impl NapiOAuthSDK {
    /// 直接返回强类型结果，NAPI-RS 自动生成 TypeScript 类型
    #[napi]
    pub async fn user_get_info(&self) -> Result<UserInfo> {
        let result = self.sdk.user
            .get_info()
            .await
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?;

        Ok(result)  // 返回 UserInfo，不是 Value
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

    // 对所有返回值的方法都应用相同的模式
}
```

#### 3. 生成的 TypeScript 类型

构建后，`index.d.ts` 会自动生成：

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

export class NapiOAuthSdk {
  userGetInfo(): Promise<UserInfo>;
  userUpdateProfile(data: Record<string, any>): Promise<UserInfo>;
  // ...
}
```

#### 4. 好处
- ✅ 不重复定义 struct
- ✅ NAPI-RS 自动生成精确的 TypeScript 类型
- ✅ 单一数据源（Rust 是唯一的定义点）
- ✅ 敏感信息在 Rust 端就去除（不会被序列化）

---

## 四、第二部分：Server Actions 架构设计

### 目录结构

```
apps/admin-portal/
├── app/
│   ├── (dashboard)/
│   │   ├── users/
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   ├── clients/page.tsx
│   │   ├── roles/page.tsx
│   │   └── audit/page.tsx
│   └── api/
│       └── auth/
│           └── callback/route.ts
│
├── actions/                              ← Server Actions 集中管理
│   ├── index.ts                          ← 统一导出
│   ├── types.ts                          ← 类型定义（只有包装类型）
│   ├── utils.ts                          ← 工具函数（错误处理）
│   ├── users.ts                          ← 用户操作 actions
│   ├── clients.ts                        ← 客户端操作 actions
│   ├── roles.ts                          ← 角色操作 actions
│   └── audit.ts                          ← 审计操作 actions
│
└── lib/
    ├── napi-sdk.ts                       ← NAPI SDK 初始化
    └── api/                              ← 删除：decorator、http-client 等
```

### 删除的文件结构
```
❌ lib/api/client/         (HTTP 客户端 - 不需要了)
❌ lib/api/decorators/     (装饰器模式 - 不需要了)
❌ lib/api/middleware/     (中间件 - 不需要了)
```

---

## 五、第三部分：Server Actions 实现

### 1. 类型定义

**文件**: `apps/admin-portal/actions/types.ts`

```typescript
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

// 重新导出 SDK 的强类型（不重新定义）
export type {
  UserInfo,
  UpdateProfileRequest,
  // ... 从 SDK 导出的其他类型
} from '@oauth-service-rust/napi'
```

### 2. 错误处理工具函数

**文件**: `apps/admin-portal/actions/utils.ts`

```typescript
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
function handleSdkError(error: unknown): ActionResult {
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

### 3. SDK 初始化

**文件**: `apps/admin-portal/lib/napi-sdk.ts`

```typescript
import { createSdk } from '@oauth-service-rust/napi'

// 初始化 SDK 实例（在服务端）
export const oauthSdk = createSdk({
  baseUrl: process.env.OAUTH_SERVICE_URL || 'http://localhost:3001',
  timeout: 10000,
  retryCount: 3,
  retryDelay: 1000,
  debug: process.env.NODE_ENV === 'development',
})
```

### 4. 用户操作 Actions

**文件**: `apps/admin-portal/actions/users.ts`

```typescript
'use server'

import { oauthSdk } from '@/lib/napi-sdk'
import type { ActionResult, UserInfo } from './types'
import { withErrorHandling } from './utils'

/**
 * 获取当前用户信息
 * 使用 withErrorHandling 包装器，代码只需 1 行
 */
export const getUserInfoAction = withErrorHandling(
  () => oauthSdk.userGetInfo()
) as () => Promise<ActionResult<UserInfo>>

/**
 * 更新用户资料
 */
export const updateUserProfileAction = withErrorHandling(
  (data: Record<string, any>) => oauthSdk.userUpdateProfile(JSON.stringify(data))
) as (data: Record<string, any>) => Promise<ActionResult<UserInfo>>

/**
 * 列出所有用户（仅管理员）
 */
export const listUsersAction = withErrorHandling(
  () => oauthSdk.rbacGetPermissions()  // 如果有专门的 list users 端点
) as () => Promise<ActionResult<any>>

/**
 * 为用户分配角色
 */
export const assignRoleAction = withErrorHandling(
  (userId: string, roleId: string) => oauthSdk.rbacAssignRole(userId, roleId)
) as (userId: string, roleId: string) => Promise<ActionResult<any>>
```

### 5. 客户端操作 Actions

**文件**: `apps/admin-portal/actions/clients.ts`

```typescript
'use server'

import { oauthSdk } from '@/lib/napi-sdk'
import type { ActionResult } from './types'
import { withErrorHandling } from './utils'

export const listClientsAction = withErrorHandling(
  (page?: number, pageSize?: number) => oauthSdk.clientList(page, pageSize)
) as (page?: number, pageSize?: number) => Promise<ActionResult<any>>

export const getClientAction = withErrorHandling(
  (clientId: string) => oauthSdk.clientGet(clientId)
) as (clientId: string) => Promise<ActionResult<any>>
```

### 6. 前端组件调用

**文件**: `apps/admin-portal/app/(dashboard)/users/page.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { getUserInfoAction, updateUserProfileAction } from '@/actions/users'
import type { UserInfo, ActionResult } from '@/actions/types'

export default function UsersPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const result = await getUserInfoAction()

        if (result.success) {
          setUser(result.data)
        } else {
          setError(result.error)
        }
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  const handleUpdate = async (displayName: string) => {
    const result = await updateUserProfileAction({ displayName })

    if (result.success) {
      setUser(result.data)
      // 显示成功提示
    } else {
      setError(result.error)
      // 显示错误提示
    }
  }

  if (loading) return <div>加载中...</div>
  if (error) return <div>错误: {error}</div>
  if (!user) return <div>无法加载用户信息</div>

  return (
    <div>
      <h1>{user.display_name || user.username}</h1>
      <p>邮箱: {user.email}</p>
      <button onClick={() => handleUpdate('新名称')}>
        更新信息
      </button>
    </div>
  )
}
```

---

## 六、代码精简对比

### 之前（过度复杂）
```typescript
// lib/api/client/http-client.ts - 100+ 行
// lib/api/decorators/cache-decorator.ts - 50+ 行
// lib/api/decorators/retry-decorator.ts - 50+ 行
// lib/api/decorators/auth-decorator.ts - 40+ 行
// lib/api/middleware/... - 多个文件
// components/UserTable.tsx 中的 fetch 逻辑 - 30+ 行

// 总计：300+ 行代码，多层抽象
```

### 之后（精简）
```typescript
// actions/types.ts - 30 行
// actions/utils.ts - 40 行
// actions/users.ts - 20 行
// actions/clients.ts - 10 行
// actions/audit.ts - 10 行

// 总计：110 行代码，结构清晰
```

**节省 60% 的代码，同时提升可读性和类型安全**

---

## 七、实现步骤

### 阶段一：NAPI SDK 优化（1-2 天）
1. ✅ 修改 `oauth-sdk-napi/src/napi_binding.rs` - 返回强类型
2. ✅ 创建/补充缺失的 NAPI 对应 struct（如 RoleInfo、ClientInfo 等）
3. ✅ 重新构建 SDK，验证 TypeScript 类型生成

### 阶段二：Server Actions 实现（2-3 天）
1. ✅ 创建 `actions/` 目录结构
2. ✅ 实现 `types.ts` 和 `utils.ts`
3. ✅ 实现各模块的 Server Actions（users、clients、roles、audit）
4. ✅ 单元测试

### 阶段三：前端迁移（3-5 天）
1. ✅ 迁移用户管理页面
2. ✅ 迁移客户端管理页面
3. ✅ 迁移角色管理页面
4. ✅ 迁移审计日志页面
5. ✅ 删除旧的 `lib/api/` 结构

### 阶段四：验收（1 天）
1. ✅ 集成测试
2. ✅ 性能对比
3. ✅ 安全审计

---

## 八、预期收益

| 维度 | 改进 |
|-----|------|
| **代码行数** | 减少 60%（300+ → 110 行） |
| **代码层级** | 从 5+ 层减少到 2 层 |
| **类型安全** | 从 `any` 提升到强类型 |
| **错误处理** | 统一集中，消除重复 |
| **性能** | 减少网络往返（直接调用 SDK） |
| **安全性** | 敏感信息不暴露给客户端 |
| **可维护性** | 代码流清晰，易于扩展 |

---

## 九、注意事项

### 安全考虑
- ✅ NAPI SDK 返回的 struct 已去除敏感字段（password_hash、client_secret 等）
- ✅ Server Actions 在服务端执行，敏感信息不会到达浏览器
- ✅ 错误消息已通用化，不泄露系统内部信息

### 兼容性考虑
- ✅ Next.js 16 完全支持 Server Actions
- ✅ React 19 的使用场景不受影响
- ✅ 渐进式迁移（可以逐页面迁移）

### 性能考虑
- ✅ 消除了中间件和装饰器的开销
- ✅ NAPI SDK 调用是 Node.js 原生模块调用（快于 HTTP）
- ✅ 缓存由 OAuth Service 统一管理

---

## 十、后续优化机会

1. **缓存策略** - 在 Server Actions 层添加可选的缓存包装
2. **重试逻辑** - 由 NAPI SDK 统一处理（已支持）
3. **监控和日志** - 在 Server Actions 层添加细粒度的日志
4. **权限检查** - OAuth Service 已处理，Server Actions 仅转发结果

---

**设计完成日期**: 2025-12-03
**状态**: ✅ 待审批和实施
