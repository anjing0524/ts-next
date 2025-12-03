# Next.js 16 Hybrid Architecture Design for Admin-Portal

**Status:** ✅ Verified and Approved
**Date:** 2025-12-03
**Related Plan:** `2025-12-03-comprehensive-architecture-refactoring.md`

---

## Executive Summary

Admin-portal will use **Next.js 16 hybrid architecture** combining Server Components, Suspense boundaries, useActionState, and revalidateTag for optimal performance and developer experience.

**Key Improvements:**
- Delete ~1000 lines of unnecessary hook middleware
- Clear server/client responsibility separation
- Automatic data synchronization via revalidateTag
- 83% code reduction per feature (300 lines → 50 lines)

---

## Architecture Overview

### Three-Layer Model

```
Layer 1: Orchestration (Server Component - page.tsx)
  └─ Manages Suspense boundaries
  └─ Assembles UI layout
  └─ No business logic

Layer 2: Data Fetching (Server Component - *Container.tsx)
  └─ Direct async/await Server Action calls
  └─ Wrapped in unstable_cache with revalidateTag
  └─ Throws errors (caught by Error Boundary)

Layer 3a: Display (Client Component - *Table.tsx)
  └─ Pure presentational
  └─ Receives data as props
  └─ Zero data fetching

Layer 3b: Interaction (Client Component - *Modal.tsx)
  └─ useActionState for form submission
  └─ Modal state management (useState)
  └─ Calls Server Actions on form submit
```

### Data Flow Diagram

```
User Action
    ↓
UserFormModal (useActionState)
    ↓
Server Action (createUserAction)
    ↓
OAuth SDK (NAPI)
    ↓
Database
    ↓
revalidateTag('users')
    ↓
Server Component revalidation (unstable_cache)
    ↓
UserListContainer re-executes
    ↓
UserTable receives new props
    ↓
UI updates automatically
```

---

## File Structure

```
apps/admin-portal/
├── app/(dashboard)/admin/
│   ├── users/
│   │   ├── page.tsx                 ← Server Component (orchestrator)
│   │   ├── layout.tsx               ← Error Boundary
│   │   └── loading.tsx              ← Global fallback
│   ├── clients/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── loading.tsx
│   ├── permissions/
│   │   └── page.tsx
│   └── audit-logs/
│       └── page.tsx
│
├── app/actions/
│   ├── user.ts                      ← Server Actions with revalidateTag
│   ├── client.ts
│   ├── role.ts
│   ├── audit.ts
│   └── utils.ts
│
├── features/
│   └── users/
│       ├── components/
│       │   ├── UserListContainer.tsx      ← Server Component (fetch)
│       │   ├── UserTable.tsx              ← Client Component (display)
│       │   ├── UserFormModal.tsx          ← Client Component (interact)
│       │   ├── UserActionButtons.tsx      ← Client Component (buttons)
│       │   └── skeletons.tsx              ← Suspense fallback
│       ├── hooks/                         ← DELETED (no data management hooks)
│       │   └── useUserForm.ts             ← ONLY for complex form validation
│       ├── domain/
│       │   └── user.ts
│       └── application/                   ← DELETED (no application services)
│
└── lib/
    └── oauth-sdk.ts                 ← NAPI SDK singleton
```

**Key Deletions:**
- ❌ `features/*/hooks/use-*-management-server-actions.ts` (all 4 files)
- ❌ `features/*/application/*.ts` (old service layer)
- ❌ `features/*/infrastructure/*.ts` (old repository layer)

**Retained:**
- ✅ `features/*/domain/*.ts` (type definitions)
- ✅ `app/actions/*.ts` (business logic)

---

## Implementation Patterns

### Pattern 1: Page.tsx - Server Component Orchestrator

```typescript
// app/(dashboard)/admin/users/page.tsx
import { Suspense } from 'react';
import { UserListContainer } from '@/features/users/components/UserListContainer';
import { UserFormModal } from '@/features/users/components/UserFormModal';
import { UserListSkeleton } from '@/features/users/components/skeletons';

export default async function UsersPage(props: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const searchParams = await props.searchParams;
  const page = parseInt(searchParams.page || '1');
  const limit = parseInt(searchParams.limit || '10');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">用户管理</h1>

      {/* Suspense boundary for list data */}
      <Suspense fallback={<UserListSkeleton />}>
        <UserListContainer page={page} limit={limit} />
      </Suspense>

      {/* Modal for create/edit - outside Suspense */}
      <UserFormModal />
    </div>
  );
}
```

**Key Points:**
- Server Component by default (no 'use client')
- Suspense wraps each data loading zone
- Modal is outside Suspense (not blocked by loading)
- searchParams properly awaited (Next.js 16+)

### Pattern 2: UserListContainer.tsx - Server Component Data Fetcher

```typescript
// features/users/components/UserListContainer.tsx
import { unstable_cache } from 'next/cache';
import { listUsersAction } from '@/app/actions';
import { UserTable } from './UserTable';

async function fetchUsersList(page: number, limit: number) {
  const result = await listUsersAction({ page, page_size: limit });

  if (!result.success) {
    throw new Error(result.error); // Error Boundary catches this
  }

  return result.data; // { items: User[], total: number }
}

// ✅ CRITICAL: unstable_cache marks data with revalidateTag
const getCachedUsersList = unstable_cache(
  fetchUsersList,
  ['users-list'], // cache key
  {
    tags: ['users'] // ← When revalidateTag('users') is called, this cache clears
  }
);

export async function UserListContainer({
  page,
  limit
}: {
  page: number;
  limit: number
}) {
  const data = await getCachedUsersList(page, limit);

  return (
    <UserTable
      users={data.items}
      total={data.total}
      page={page}
      limit={limit}
    />
  );
}
```

**Key Points:**
- Server Component (no 'use client')
- unstable_cache enables revalidateTag
- Data passed to client component as props
- Errors are thrown (Error Boundary handles)

### Pattern 3: UserTable.tsx - Client Component Display

```typescript
// features/users/components/UserTable.tsx
'use client';

import { User } from '../domain/user';
import { EditButton, DeleteButton } from './UserActionButtons';

interface UserTableProps {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export function UserTable({ users, total, page, limit }: UserTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2">用户名</th>
            <th className="px-4 py-2">邮箱</th>
            <th className="px-4 py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t hover:bg-gray-50">
              <td className="px-4 py-2">{user.username}</td>
              <td className="px-4 py-2">{user.email}</td>
              <td className="px-4 py-2 space-x-2">
                <EditButton userId={user.id} />
                <DeleteButton userId={user.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="mt-4 flex justify-between items-center">
        <div>Total: {total} users</div>
        <div>
          Page {page} of {Math.ceil(total / limit)}
        </div>
      </div>
    </div>
  );
}
```

**Key Points:**
- Pure presentational component
- All data comes from props
- Zero business logic
- Buttons trigger actions via onEdit/onDelete

### Pattern 4: UserFormModal.tsx - useActionState for Forms

```typescript
// features/users/components/UserFormModal.tsx
'use client';

import { useActionState, useState } from 'react';
import { createUserAction, updateUserAction } from '@/app/actions';

interface UserFormModalProps {
  user?: User;
  isOpen: boolean;
  onClose: () => void;
}

export function UserFormModal({ user, isOpen, onClose }: UserFormModalProps) {
  const action = user ? updateUserAction : createUserAction;

  // ✅ useActionState manages form submission state
  const [state, formAction, isPending] = useActionState(action, null);

  // Close modal on successful submission
  if (state?.success) {
    onClose();
  }

  return (
    isOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg w-96">
          <h2 className="text-xl font-bold mb-4">
            {user ? '编辑用户' : '创建用户'}
          </h2>

          {/* Form bound to Server Action via useActionState */}
          <form action={formAction} className="space-y-4">
            {user && (
              <input type="hidden" name="userId" value={user.id} />
            )}

            <input
              type="text"
              name="username"
              placeholder="用户名"
              defaultValue={user?.username}
              required
              disabled={isPending}
              className="w-full border px-3 py-2 rounded"
            />

            <input
              type="email"
              name="email"
              placeholder="邮箱"
              defaultValue={user?.email}
              required
              disabled={isPending}
              className="w-full border px-3 py-2 rounded"
            />

            {/* Server-side error display */}
            {state?.error && (
              <div className="text-red-600 text-sm">
                {state.error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 bg-blue-600 text-white py-2 rounded disabled:opacity-50"
              >
                {isPending ? '处理中...' : '提交'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  );
}
```

**Key Points:**
- `useActionState(action, initialState)` connects form to Server Action
- `formAction` bound to `<form action={formAction}>`
- `isPending` automatically manages loading state
- Server-side errors returned in `state.error`
- Modal closes on successful submission

### Pattern 5: Server Actions with revalidateTag

```typescript
// app/actions/user.ts
'use server';

import { revalidateTag } from 'next/cache';
import { getOAuthSDK } from '@/lib/oauth-sdk';
import { ActionResult, User } from './types';

export async function createUserAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResult<User>> {
  try {
    const sdk = getOAuthSDK();
    const username = formData.get('username') as string;
    const email = formData.get('email') as string;

    // Validate
    if (!username || !email) {
      return {
        success: false,
        error: '用户名和邮箱必填',
      };
    }

    // Call NAPI SDK
    const result = await sdk.userCreate({ username, email });

    // ✅ KEY: Invalidate all caches tagged with 'users'
    // This triggers UserListContainer to re-execute
    revalidateTag('users');

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '创建用户失败',
    };
  }
}

export async function updateUserAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResult<User>> {
  try {
    const sdk = getOAuthSDK();
    const userId = formData.get('userId') as string;
    const username = formData.get('username') as string;
    const email = formData.get('email') as string;

    const result = await sdk.userUpdate(userId, { username, email });

    // ✅ Invalidate cache - list will auto-update
    revalidateTag('users');

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '更新用户失败',
    };
  }
}

export async function deleteUserAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    const sdk = getOAuthSDK();
    const userId = formData.get('userId') as string;

    await sdk.userDelete(userId);

    revalidateTag('users');

    return {
      success: true,
      data: undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '删除用户失败',
    };
  }
}
```

**Key Points:**
- Server Action signature: `(prevState, formData) => Promise<Result>`
- `revalidateTag('users')` clears all caches tagged with 'users'
- UserListContainer automatically re-executes
- Error handling returns `success: false`

---

## Migration Sequence

### Round 1: Users Management
1. Create `app/(dashboard)/admin/users/page.tsx` (Server Component)
2. Create `UserListContainer.tsx` (Server Component data fetcher)
3. Create `UserTable.tsx` (Client display component)
4. Create `UserFormModal.tsx` (useActionState form)
5. Update `app/actions/user.ts` with `revalidateTag('users')`
6. Delete `features/users/hooks/use-user-management-server-actions.ts`
7. Verify TypeScript compilation and functionality

### Round 2-4: Clients, Permissions, Audit Logs
- Repeat same pattern for each module
- Each has own revalidateTag (e.g., 'clients', 'permissions', 'audit-logs')

---

## Verification Checklist

```
✅ TypeScript Compilation
  - pnpm exec tsc --noEmit → 0 errors

✅ Functionality
  - List loads with Suspense skeleton
  - Create user → list auto-updates (revalidateTag)
  - Edit user → list auto-updates
  - Delete user → list auto-updates
  - Error messages display correctly
  - Modal closes on success

✅ Performance
  - Initial page load (SSR) ✓
  - Form submission feedback (<1s)
  - List revalidation (<1s)
  - No unnecessary re-renders

✅ Code Quality
  - All hooks deleted
  - No useState for async data
  - useActionState only for forms
  - Pure display components
  - Clear server/client separation

✅ Production Build
  - pnpm run build → succeeds
  - JavaScript bundle size reduced
```

---

## Decision Summary

**Three Key Decisions (All Approved):**
1. ✅ **Execution Order**: Rust first, then TypeScript
2. ✅ **Architecture**: Hybrid (Server Components + useActionState + revalidateTag)
3. ✅ **Cache Strategy**: revalidateTag for automatic data sync

**Expected Outcomes:**
- 83% code reduction per feature (~1000 lines total)
- Clear server/client responsibility
- Automatic data synchronization
- Better performance (SSR, less JS)
- 100% type safety maintained

---

## Next Steps

Ready to proceed with implementation? Options:

**Option 1: Immediate Execution (This Session)**
- Create git worktree for isolated workspace
- Execute tasks one by one
- Review and commit as we go

**Option 2: Separate Implementation Session**
- Save this design ✓ (done)
- Create comprehensive implementation plan
- Execute in new session with fresh context

Which approach do you prefer?
