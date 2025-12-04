# Server Actions 指南

## 概述 / Overview

本目录包含所有 Next.js Server Actions，用于处理服务端逻辑、数据库操作和 API 调用。

Server Actions 在此目录中定义，每个文件都包含特定域的相关操作。

## 目录结构 / Directory Structure

```
lib/actions/
├── base.ts                 # 基础工具和模板 / Base utilities and templates
├── index.ts                # 导出入口 / Export entry point
├── admin/
│   ├── users.ts           # 用户管理操作 / User management actions
│   ├── clients.ts         # 客户端管理操作 / Client management actions
│   ├── permissions.ts     # 权限管理操作 / Permission management actions
│   └── audit.ts           # 审计操作 / Audit actions
└── README.md             # 本文件 / This file
```

## 核心概念 / Core Concepts

### 1. ActionResult 类型

所有 Server Actions 都返回标准化的 `ActionResult<T>` 类型：

```typescript
interface ActionResult<T> {
  success: boolean;          // 操作是否成功 / Whether operation succeeded
  data?: T;                  // 返回的数据 / Returned data
  error?: string;            // 错误消息 / Error message
  timestamp: number;         // 操作时间戳 / Operation timestamp
  code?: string;             // 错误代码 / Error code
}
```

### 2. serverActionTemplate

通用的 Server Action 模板，处理错误处理和缓存失效：

```typescript
export async function fetchUsers(
  input: ListUsersInput = {}
): Promise<ActionResult<{ users: User[]; total: number }>> {
  return serverActionTemplate(
    async () => {
      // 这里放置实际逻辑 / Put your actual logic here
      const response = await api.getUsers(input);
      return { users: response.data, total: response.total };
    },
    {
      invalidateTags: ["users"],        // 需要重新验证的缓存标签 / Tags to revalidate
      invalidatePaths: ["/admin/users"], // 需要重新生成的路径 / Paths to regenerate
    }
  );
}
```

### 3. 错误处理

使用 `ActionError` 类处理特定的业务错误：

```typescript
import { ActionError } from "./base";

export async function updateUser(input: UpdateUserInput): Promise<ActionResult<User>> {
  return serverActionTemplate(async () => {
    if (!input.id) {
      throw new ActionError(
        "User ID is required",
        "INVALID_INPUT",
        400
      );
    }
    // ... 更多逻辑 / ... more logic
  });
}
```

## 使用示例 / Usage Examples

### 在 Server Component 中使用

```typescript
// app/(dashboard)/admin/users/page.tsx
import { fetchUsers } from "@/lib/actions/admin/users";

export default async function UsersPage() {
  const result = await fetchUsers({ page: 1, pageSize: 10 });

  if (!result.success) {
    return <div>Error: {result.error}</div>;
  }

  return (
    <div>
      {result.data?.users.map((user) => (
        <div key={user.id}>{user.email}</div>
      ))}
    </div>
  );
}
```

### 在 Client Component 中使用

```typescript
"use client";

import { updateUser, type UpdateUserInput } from "@/lib/actions/admin/users";
import { FormEvent } from "react";

export function UserForm({ userId }: { userId: string }) {
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const result = await updateUser({
      id: userId,
      email: formData.get("email") as string,
      name: formData.get("name") as string,
    });

    if (result.success) {
      console.log("User updated:", result.data);
    } else {
      console.error("Error:", result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* 表单字段 / Form fields */}
    </form>
  );
}
```

## 最佳实践 / Best Practices

### 1. 命名约定

- **查询操作**: `fetch*` 或 `get*` (例如 `fetchUsers`, `getUser`)
- **修改操作**: `create*`, `update*`, `delete*` (例如 `updateUser`, `deleteUser`)
- **业务操作**: `perform*` (例如 `performAudit`)

### 2. 输入验证

总是在 Server Action 开始时验证输入：

```typescript
export async function deleteUser(userId: string): Promise<ActionResult<{ success: boolean }>> {
  return serverActionTemplate(async () => {
    // 1. 验证输入 / Validate input
    if (!userId || userId.trim() === "") {
      throw new ActionError("User ID is required", "INVALID_INPUT", 400);
    }

    // 2. 验证权限 / Validate permissions
    const auth = await getAuthContext();
    if (!auth.permissions?.includes("admin:delete-users")) {
      throw new ActionError("Insufficient permissions", "FORBIDDEN", 403);
    }

    // 3. 执行操作 / Execute operation
    await api.deleteUser(userId);

    return { success: true };
  }, {
    invalidateTags: ["users", `user-${userId}`],
  });
}
```

### 3. 缓存策略

- 使用 `invalidateTags` 标记相关的缓存需要重新验证
- 使用 `invalidatePaths` 触发路径级的重新生成
- 为不同的实体类型使用一致的标签命名 (例如 "users", "user-{id}")

### 4. 错误代码约定

- `INVALID_INPUT` - 输入验证失败
- `NOT_FOUND` - 资源不存在
- `FORBIDDEN` - 权限不足
- `CONFLICT` - 资源冲突
- `NOT_IMPLEMENTED` - 功能未实现
- `UNKNOWN_ERROR` - 未知错误

### 5. 文件组织

```typescript
// lib/actions/admin/users.ts
"use server";

// 1. 导入 / Imports
import { serverActionTemplate, type ActionResult } from "../base";

// 2. 类型定义 / Type definitions
export interface User { ... }
export interface ListUsersInput { ... }

// 3. Server Actions (按操作类型组织)
export async function fetchUsers() { ... }
export async function fetchUser() { ... }
export async function updateUser() { ... }
export async function deleteUser() { ... }
```

## 权限验证 / Permission Validation

使用 `getAuthContext()` 获取当前用户的权限信息：

```typescript
import { getAuthContext, ActionError } from "./base";

export async function updateUser(input: UpdateUserInput): Promise<ActionResult<User>> {
  return serverActionTemplate(async () => {
    // 获取认证上下文 / Get auth context
    const auth = await getAuthContext();

    // 检查权限 / Check permissions
    if (!auth.permissions?.includes("admin:update-users")) {
      throw new ActionError("Insufficient permissions", "FORBIDDEN", 403);
    }

    // 执行操作 / Execute operation
    // ...
  });
}
```

## 测试 Server Actions / Testing Server Actions

示例测试结构：

```typescript
// lib/actions/__tests__/users.test.ts
import { fetchUsers, deleteUser } from "../admin/users";

describe("User Actions", () => {
  it("should fetch users successfully", async () => {
    const result = await fetchUsers({ page: 1, pageSize: 10 });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data?.users)).toBe(true);
  });

  it("should return error when deleting with invalid ID", async () => {
    const result = await deleteUser("");
    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_INPUT");
  });
});
```

## 常见模式 / Common Patterns

### 分页操作

```typescript
export async function fetchUsers(input: ListUsersInput = {}): Promise<ActionResult<...>> {
  return serverActionTemplate(async () => {
    const { pageSize, offset } = normalizePagination(input);
    const { sortBy, sortOrder } = normalizeSort(input);

    // 使用标准化的分页参数 / Use normalized pagination
    const response = await api.getUsers({ offset, pageSize, sortBy, sortOrder });
    return response;
  });
}
```

### 条件操作

```typescript
export async function updateUserIfExists(input: UpdateUserInput): Promise<ActionResult<User>> {
  return serverActionTemplate(async () => {
    // 检查资源是否存在 / Check if resource exists
    const existing = await api.getUser(input.id);
    if (!existing) {
      throw new ActionError("User not found", "NOT_FOUND", 404);
    }

    // 执行更新 / Perform update
    const updated = await api.updateUser(input.id, input);
    return updated;
  });
}
```

## 迁移指南 / Migration Guide

### 从 API Routes 迁移到 Server Actions

**之前** / Before:
```typescript
// app/api/users/route.ts
export async function GET(request: Request) {
  const users = await db.users.findMany();
  return Response.json(users);
}
```

**之后** / After:
```typescript
// lib/actions/admin/users.ts
export async function fetchUsers(): Promise<ActionResult<User[]>> {
  return serverActionTemplate(async () => {
    return await db.users.findMany();
  });
}

// app/(dashboard)/admin/users/page.tsx
const result = await fetchUsers();
```

## 常见问题 / FAQ

### Q: 如何在 Server Action 中访问请求头？
A: 使用 `headers()` 函数从 'next/headers' 导入：
```typescript
import { headers } from "next/headers";

export async function myAction() {
  const headerList = headers();
  const token = headerList.get("authorization");
  // ...
}
```

### Q: 如何处理文件上传？
A: 在 Client Component 中使用 FormData 和 File API：
```typescript
"use client";

export async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
  const formData = new FormData();
  formData.append("file", e.target.files?.[0]!);
  const result = await uploadFile(formData);
  // ...
}
```

### Q: 如何测试 Server Actions？
A: 在单元测试中直接导入并调用：
```typescript
const result = await fetchUsers({ page: 1 });
expect(result.success).toBe(true);
```

## 参考链接 / References

- [Next.js Server Actions Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Revalidating Data](https://nextjs.org/docs/app/building-your-application/data-fetching/revalidating)
- [Security Best Practices](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#security-considerations)

---

**维护者**: 架构团队
**最后更新**: 2025-12-04
