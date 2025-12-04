# Code Style Guide

## Overview

This guide establishes coding standards for the entire monorepo, covering both Rust and TypeScript/JavaScript code. Following these conventions ensures consistency, readability, and maintainability across the codebase.

## Rust Code Standards

### Module Organization

#### Crate Structure
- One primary responsibility per crate
- Clear public API (`pub use` re-exports)
- Private implementation details in submodules
- Logical grouping of related functionality

```rust
// ✅ Good: Clear module structure
pub mod models {
    pub use self::user::User;
    pub use self::token::Token;

    mod user;
    mod token;
}

// ❌ Bad: Everything in one module
pub mod everything {
    pub struct User { ... }
    pub struct Token { ... }
    pub fn validate_token() { ... }
}
```

#### Single Source of Truth
- All data structures live in `oauth-models` crate
- Other crates import and re-export
- Never duplicate type definitions
- Shared enums and constants in models

```rust
// ✅ Good: In oauth-models/src/lib.rs
pub struct User {
    pub id: String,
    pub email: String,
}

// ✅ Good: In oauth-core/src/lib.rs
use oauth_models::User;

pub fn validate_user(user: &User) { ... }

// ❌ Bad: Duplicate definition
pub struct User {
    pub id: String,
    pub email: String,
}
```

### Naming Conventions

- **Crates**: lowercase with hyphens (`oauth-service`)
- **Modules**: lowercase with underscores (`user_service`)
- **Types**: PascalCase (`UserService`, `TokenValidator`)
- **Functions**: snake_case (`validate_token`, `create_user`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_TOKEN_AGE`, `DEFAULT_SCOPE`)
- **Lifetimes**: single lowercase letters (`'a`, `'b`)
- **Type parameters**: PascalCase (`T`, `E`, or descriptive like `Response`)

```rust
// ✅ Good: Clear naming
pub struct UserService {
    db: Database,
}

impl UserService {
    pub fn new(db: Database) -> Self { ... }
    pub fn create_user(&mut self, email: &str) -> Result<User> { ... }
    pub fn validate_email(email: &str) -> bool { ... }
}

const MAX_TOKEN_LIFETIME: Duration = Duration::from_secs(3600);
```

### Error Handling

#### Using thiserror
```rust
// ✅ Good: Structured error types
use thiserror::Error;

#[derive(Error, Debug)]
pub enum UserError {
    #[error("User not found: {0}")]
    NotFound(String),

    #[error("Email already in use: {0}")]
    EmailInUse(String),

    #[error("Invalid email format")]
    InvalidEmail,

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),
}

// ✅ Good: Using custom errors
pub fn create_user(email: &str) -> Result<User, UserError> {
    if !validate_email(email) {
        return Err(UserError::InvalidEmail);
    }

    let user = User::new(email);
    database.insert(&user)?; // ? automatically converts sqlx::Error
    Ok(user)
}

// ❌ Bad: Generic error strings
pub fn create_user(email: &str) -> Result<User> {
    if !validate_email(email) {
        return Err(anyhow::anyhow!("bad email"));
    }
    Ok(User::new(email))
}

// ❌ Bad: Panic for recoverable errors
pub fn create_user(email: &str) -> User {
    if !validate_email(email) {
        panic!("Invalid email");
    }
    User::new(email)
}
```

#### Error Propagation
```rust
// ✅ Good: Use ? operator for clean error propagation
pub async fn fetch_and_process_user(id: &str) -> Result<ProcessedUser> {
    let user = database.get_user(id)?;
    let processed = process_user(&user)?;
    Ok(processed)
}

// ❌ Bad: Verbose error handling
pub async fn fetch_and_process_user(id: &str) -> Result<ProcessedUser> {
    match database.get_user(id) {
        Ok(user) => {
            match process_user(&user) {
                Ok(processed) => Ok(processed),
                Err(e) => Err(e),
            }
        }
        Err(e) => Err(e),
    }
}
```

### Comments and Documentation

#### Bilingual Comments (Chinese + English)
```rust
// ✅ Good: Bilingual documentation
/// 验证用户权限 - Validate user permissions.
///
/// 检查用户是否具有执行特定操作的权限。
/// Checks if the user has permission to perform an action.
///
/// # Arguments
/// * `user_id` - The ID of the user to validate
/// * `action` - The action to validate permission for
///
/// # Returns
/// Returns `Ok(true)` if authorized, `Ok(false)` if not, or `Err` on error.
pub fn validate_user_permission(user_id: &str, action: &str) -> Result<bool> {
    // 实现权限检查逻辑 - Implementation of permission check
    todo!()
}

// ✅ Good: Inline comments explaining complex logic
// 使用 constant-time 比较防止时序攻击 - Use constant-time comparison to prevent timing attacks
if subtle::ConstantTimeComparison::new(token, &expected_token).is_equal() {
    return Ok(true);
}

// ❌ Bad: English-only in Chinese-speaking team
// This checks the permission
pub fn validate_permission(...) { }

// ❌ Bad: Unclear comments
// Do the thing
pub fn process_data(...) { }
```

### Async and Concurrency

```rust
// ✅ Good: Clear async/await usage
pub async fn fetch_user(id: &str) -> Result<User> {
    database.get_user(id).await
}

// ✅ Good: Spawning background tasks
tokio::spawn(async {
    let result = perform_expensive_operation().await;
    handle_result(result).await;
});

// ❌ Bad: Blocking in async context
pub async fn fetch_user(id: &str) -> Result<User> {
    std::thread::sleep(Duration::from_secs(1)); // Blocks executor!
    Ok(User::default())
}
```

### Logging

```rust
// ✅ Good: Structured logging with context
use tracing::{info, warn, error, debug};

info!(user_id = %user.id, email = %user.email, "Creating new user");

warn!(
    user_id = %failed_user.id,
    reason = "invalid_email",
    "User creation failed"
);

error!(
    error = %err,
    user_id = %user.id,
    "Database operation failed"
);

// ❌ Bad: Unstructured string logging
println!("User created: {}", user.id);
eprintln!("Error: {}", err);
```

### Testing

```rust
// ✅ Good: Clear, focused tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_user_permission_grants_access_to_owner() {
        let user = create_test_user();
        let action = "read_own_profile";

        let result = validate_user_permission(&user.id, action);

        assert!(result.unwrap());
    }

    #[test]
    fn test_validate_user_permission_denies_access_to_others() {
        let user = create_test_user();
        let other_user_id = "other_user";
        let action = format!("read_profile:{}", other_user_id);

        let result = validate_user_permission(&user.id, &action);

        assert!(!result.unwrap());
    }
}

// ❌ Bad: Unclear test purposes
#[test]
fn test_validate() {
    let result = validate_user_permission("user1", "action");
    assert!(result.is_ok());
}
```

## TypeScript Code Standards

### File and Directory Organization

#### Pages (app directory)
```
app/
├── (auth)/
│   ├── login/page.tsx          # Server Component for login form
│   ├── register/page.tsx       # Server Component for registration
│   └── layout.tsx              # Layout for auth routes
├── admin/
│   ├── users/
│   │   ├── page.tsx            # User list page
│   │   ├── [id]/page.tsx       # User detail page
│   │   └── layout.tsx
│   ├── settings/page.tsx
│   └── layout.tsx              # Admin layout with sidebar
└── layout.tsx                  # Root layout
```

#### Components
```
components/
├── admin/
│   ├── UsersList.tsx           # Admin-specific component
│   └── PermissionsForm.tsx
├── ui/
│   ├── Button.tsx              # Generic UI components
│   ├── Input.tsx
│   └── Dialog.tsx
└── shared/
    └── Navigation.tsx
```

#### Server Actions and API
```
lib/
├── actions/
│   ├── users.ts                # Server Actions for user mutations
│   ├── permissions.ts
│   └── audit-logs.ts
├── api/
│   ├── oauth-client.ts        # OAuth service client
│   └── http-client.ts         # Generic HTTP utilities
├── services/
│   ├── user-service.ts        # Business logic
│   └── permission-service.ts
└── utils/
    ├── validators.ts          # Validation helpers
    └── formatters.ts          # Formatting utilities
```

### Naming Conventions

- **Components**: PascalCase (`UsersList.tsx`, `DeleteButton.tsx`)
- **Pages**: kebab-case directories (`user-settings`, `audit-logs`)
- **Server Actions**: camelCase ending with "Action" (`deleteUserAction`, `updatePermissionAction`)
- **Utilities**: camelCase (`formatDate`, `validateEmail`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_ITEMS_PER_PAGE`, `API_TIMEOUT`)
- **Types**: PascalCase with "Props" suffix for component props (`UserListProps`, `ButtonProps`)

### Component Structure - SSR First

#### Server Components (Default)
```typescript
// ✅ Good: Server Component for data fetching
// app/admin/users/page.tsx
import { getUsersList } from "@/lib/actions/users";
import { UsersList } from "@/components/admin/UsersList";

export const revalidate = 60; // ISR: Revalidate every 60 seconds

export default async function UsersPage() {
  const users = await getUsersList();

  return (
    <div className="p-6">
      <h1>Users Management</h1>
      <UsersList users={users} />
    </div>
  );
}

// ❌ Bad: Client Component for data fetching
"use client";

import { useEffect, useState } from "react";

export default function UsersPage() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then(setUsers);
  }, []);

  return <UsersList users={users} />;
}
```

#### Client Components - Interactive Only
```typescript
// ✅ Good: Client Component for interactivity
"use client";

import { useActionState } from "react";
import { deleteUserAction } from "@/lib/actions/users";

export function DeleteButton({ userId }: { userId: string }) {
  const [, deleteAction, isPending] = useActionState(
    deleteUserAction,
    null
  );

  return (
    <button
      onClick={() => deleteAction(userId)}
      disabled={isPending}
      className="px-4 py-2 bg-red-600 text-white rounded"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}

// ❌ Bad: Wrapping Server Component in "use client"
"use client";

import { getUsersList } from "@/lib/actions/users";

export default async function UsersList() {
  const users = await getUsersList(); // Can't use await in Client Component!
  return <div>{users.length}</div>;
}
```

#### Server Actions
```typescript
// ✅ Good: Server Action for mutations
// lib/actions/users.ts
"use server";

import { revalidateTag } from "next/cache";
import { oauthService } from "@/lib/api/oauth-client";

export async function deleteUserAction(userId: string) {
  try {
    // Perform deletion
    await oauthService.deleteUser(userId);

    // Invalidate cache
    revalidateTag("users-list");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// ✅ Good: Server Action for form submission
export async function updateUserAction(
  prevState: any,
  formData: FormData
) {
  const email = formData.get("email") as string;
  const name = formData.get("name") as string;

  try {
    await oauthService.updateUser({
      email,
      name,
    });

    revalidateTag("users-list");
    return { success: true, message: "User updated" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ❌ Bad: API route for simple mutations
// app/api/users/[id]/route.ts - Don't do this for simple operations
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  await oauthService.deleteUser(params.id);
  return Response.json({ success: true });
}
```

### Comments and Documentation

#### JSDoc for Functions
```typescript
// ✅ Good: Clear JSDoc comments
/**
 * 验证用户电子邮件 - Validates user email format.
 *
 * 检查电子邮件地址是否符合RFC 5322标准格式。
 * Checks if the email address matches RFC 5322 standard format.
 *
 * @param email - The email address to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * validateEmail("user@example.com") // true
 * validateEmail("invalid-email") // false
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ✅ Good: Bilingual inline comments
// 使用 Set 确保用户 ID 的唯一性 - Use Set to ensure unique user IDs
const uniqueUserIds = new Set(users.map(u => u.id));

// ❌ Bad: No comments
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

### Type Safety

```typescript
// ✅ Good: Explicit types
interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  createdAt: Date;
}

type UserListProps = {
  users: User[];
  onDelete?: (userId: string) => void;
};

export function UsersList({ users, onDelete }: UserListProps) {
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>
          {user.name} ({user.email})
        </li>
      ))}
    </ul>
  );
}

// ❌ Bad: Using any
export function UsersList({ users, onDelete }: any) {
  return <ul>{users.map((user: any) => <li>{user.name}</li>)}</ul>;
}

// ❌ Bad: Implicit types
export function UsersList({ users }) {
  return users.map(user => <li>{user.name}</li>);
}
```

### Error Handling

```typescript
// ✅ Good: Proper error handling
"use server";

export async function deleteUserAction(userId: string) {
  try {
    await oauthService.deleteUser(userId);
    revalidateTag("users-list");
    return { success: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete user" };
  }
}

// ❌ Bad: Ignoring errors
export async function deleteUserAction(userId: string) {
  await oauthService.deleteUser(userId); // What if this throws?
  return { success: true };
}

// ❌ Bad: Generic error messages
catch (error) {
  return { success: false, error: "Something went wrong" };
}
```

### Form Handling

```typescript
// ✅ Good: Using useActionState with Server Actions
"use client";

import { updateUserAction } from "@/lib/actions/users";
import { useActionState } from "react";

export function UserForm({ userId }: { userId: string }) {
  const [state, formAction, isPending] = useActionState(
    updateUserAction,
    null
  );

  return (
    <form action={formAction}>
      <input name="email" defaultValue={state?.email} />
      <input name="name" defaultValue={state?.name} />
      <button disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

// ❌ Bad: Using useEffect for data fetching
export function UserForm({ userId }: { userId: string }) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(data => setEmail(data.email));
  }, [userId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetch(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ email }),
    });
  };

  return <form onSubmit={handleSubmit}>...</form>;
}

// ❌ Bad: useCallback without proper dependencies
export function UserForm({ userId }: { userId: string }) {
  const updateUser = useCallback(() => {
    fetch(`/api/users/${userId}`, { method: "PUT" });
  }, []); // Missing userId dependency!
}
```

### Performance Optimization

```typescript
// ✅ Good: Using React.memo for stable props
interface UserItemProps {
  user: User;
  onDelete: (id: string) => void;
}

export const UserItem = React.memo(
  ({ user, onDelete }: UserItemProps) => (
    <li>
      {user.name}
      <button onClick={() => onDelete(user.id)}>Delete</button>
    </li>
  ),
  (prev, next) => prev.user.id === next.user.id
);

// ✅ Good: Suspense for async operations
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UsersList />
    </Suspense>
  );
}

// ❌ Bad: Re-creating functions in render
export function UsersList({ users }: UserListProps) {
  return users.map(user => (
    <UserItem
      key={user.id}
      user={user}
      onDelete={id => fetch(`/api/users/${id}`, { method: "DELETE" })}
    />
  ));
}
```

### Testing TypeScript Code

```typescript
// ✅ Good: Clear test names and assertions
import { describe, it, expect } from "@jest/globals";
import { validateEmail } from "@/lib/utils/validators";

describe("validateEmail", () => {
  it("validates correct email format", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("rejects invalid email format", () => {
    expect(validateEmail("invalid-email")).toBe(false);
  });

  it("rejects email with spaces", () => {
    expect(validateEmail("user @example.com")).toBe(false);
  });
});

// ❌ Bad: Vague test names
it("validates emails", () => {
  expect(validateEmail("test@test.com")).toBe(true);
});
```

## Anti-Patterns to Avoid

### Rust Anti-Patterns

❌ **Duplicate Models**
```rust
// Don't do this in different crates
pub struct User { ... }  // In oauth-core
pub struct User { ... }  // In oauth-service
```

❌ **Generic Error Strings**
```rust
Err(anyhow::anyhow!("failed to process"))
```

❌ **Scattered Dependencies**
```rust
// Each crate defines its own database connection
// Instead: Share connection pool through constructor
```

❌ **Blocking Operations in Async Code**
```rust
pub async fn fetch_data() {
    std::thread::sleep(Duration::from_secs(1)); // ❌ Blocks executor
}
```

### TypeScript Anti-Patterns

❌ **Hook-Based Data Fetching in Pages**
```typescript
// In app/page.tsx
"use client";
useEffect(() => {
  fetch("/api/data").then(setData);
}, []);
```
**Fix**: Use Server Components instead

❌ **Extra Middleware Layers for Simple Operations**
```typescript
// API route wrapper → Service → Action
// Just use Server Actions directly
```

❌ **useEffect for Page Data**
```typescript
"use client";
useEffect(() => {
  fetchPageData();
}, []);
```
**Fix**: Make the page a Server Component

❌ **Props Drilling Deep**
```typescript
<ParentA users={users} onDelete={onDelete}>
  <ParentB users={users} onDelete={onDelete}>
    <UsersList users={users} onDelete={onDelete} />
  </ParentB>
</ParentA>
```
**Fix**: Split into smaller Server Components

## Linting and Formatting

### Rust
- **Format**: `cargo fmt`
- **Lint**: `cargo clippy -- -D warnings`
- **Test**: `cargo test --all`

### TypeScript
- **Format**: `prettier --write .`
- **Lint**: `eslint . --fix`
- **Type Check**: `tsc --noEmit`
- **Test**: `jest`

## Summary

By following these standards:
- Code remains **consistent** across the team
- **Errors** are caught early through types and linting
- **New developers** can understand code patterns quickly
- **Maintenance** is easier with predictable structure
- **Performance** is optimized through established patterns

When in doubt, prioritize **readability** and **maintainability** over clever code.
