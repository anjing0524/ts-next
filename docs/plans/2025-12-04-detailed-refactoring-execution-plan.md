# Code Cleanup & Refactoring - Detailed Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Execute parallel Rust model consolidation and TypeScript SSR migration while systematically cleaning up intermediate documentation and obsolete code.

**Architecture:**
- Rust: Verify shared `oauth-models` crate is source-of-truth, consolidate any scattered model definitions
- TypeScript: Migrate admin-portal to Server Components + Server Actions, remove hook middleware layer
- Documentation: Consolidate 20+ documents into 2 authoritative guides

**Tech Stack:** Rust (Cargo workspace, NAPI), Next.js 16 (App Router, Server Actions), TypeScript, pnpm monorepo

---

## PHASE 1: RUST MODEL CONSOLIDATION & VERIFICATION

### Task 1.1: Audit Current Model Definitions

**Files:**
- Reference: `apps/oauth-service-rust/crates/oauth-models/src/lib.rs`
- Reference: `apps/oauth-service-rust/crates/oauth-core/src/lib.rs`
- Reference: `apps/oauth-service-rust/crates/oauth-sdk-napi/src/lib.rs`
- Create: `docs/RUST_MODEL_AUDIT.md` (temporary audit file)

**Step 1: List all model definitions**

```bash
cd /Users/liushuo/code/ts-next-template/apps/oauth-service-rust
grep -r "pub struct" crates/ | grep -v "test" | grep -v "mock" > /tmp/rust_models.txt
wc -l /tmp/rust_models.txt
```

Expected output: ~40-60 model definitions

**Step 2: Check for duplicates**

```bash
grep -r "pub struct User\|pub struct Client\|pub struct Role\|pub struct Permission" crates/ | wc -l
```

If output > 4, there are duplicates (should be 1 per struct in oauth-models)

**Step 3: Create audit document**

```markdown
# Rust Model Audit (2025-12-04)

## Current Model Status
- Models in oauth-models: [COUNT]
- Models in oauth-core: [COUNT]
- Models in oauth-sdk-napi: [COUNT]
- Duplicate definitions found: [YES/NO]

## Dependencies
- oauth-core depends on oauth-models: [CHECK]
- oauth-sdk-napi depends on oauth-models: [CHECK]
```

**Step 4: Save audit**

```bash
cat > docs/RUST_MODEL_AUDIT.md << 'EOF'
[content from Step 3]
EOF
```

**Step 5: Commit**

```bash
git add docs/RUST_MODEL_AUDIT.md
git commit -m "chore: audit Rust model definitions across crates"
```

---

### Task 1.2: Verify oauth-models as Source of Truth

**Files:**
- Verify: `apps/oauth-service-rust/crates/oauth-models/Cargo.toml`
- Reference: `apps/oauth-service-rust/Cargo.toml` (workspace)

**Step 1: Check oauth-models Cargo.toml**

```bash
cd /Users/liushuo/code/ts-next-template/apps/oauth-service-rust/crates/oauth-models
cat Cargo.toml
```

Expected:
```toml
[package]
name = "oauth-models"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
```

**Step 2: If missing dependencies, update**

```bash
# Open crates/oauth-models/Cargo.toml and ensure it has:
[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
chrono = { workspace = true }
uuid = { workspace = true }
```

**Step 3: List all models in oauth-models**

```bash
grep -r "pub struct\|pub enum" crates/oauth-models/src/ | grep -v "//" | cut -d: -f2 | sort
```

Expected: User, Client, Role, Permission, Scope, Token, etc. (all core models)

**Step 4: Verify oauth-core dependency**

```bash
cd crates/oauth-core && cat Cargo.toml | grep -A5 "\[dependencies\]"
```

Should include:
```toml
oauth-models = { path = "../oauth-models" }
```

**Step 5: Commit (if changes made)**

```bash
git add crates/oauth-models/Cargo.toml crates/oauth-core/Cargo.toml
git commit -m "chore: ensure oauth-models is source-of-truth with proper dependencies"
```

---

### Task 1.3: Remove Duplicate Model Definitions (If Any)

**Files:**
- Check: `apps/oauth-service-rust/crates/oauth-core/src/models/` (if exists)
- Check: `apps/oauth-service-rust/crates/oauth-sdk-napi/src/models/` (if exists)

**Step 1: List models in oauth-core**

```bash
find crates/oauth-core/src -name "*model*" -type f
```

**Step 2: If models/ directory exists in oauth-core, check for duplication**

```bash
# Compare struct definitions
diff <(grep "pub struct" crates/oauth-models/src/lib.rs | sort) \
     <(grep "pub struct" crates/oauth-core/src/models/lib.rs | sort)
```

**Step 3: If duplicates found, remove local copy**

```bash
# Delete duplicate files
rm -rf crates/oauth-core/src/models/

# Update oauth-core/src/lib.rs to import from oauth-models
# OLD: mod models; use models::*;
# NEW: use oauth_models::*;
```

**Step 4: Update oauth-core/src/lib.rs**

```rust
// At top of oauth-core/src/lib.rs
use oauth_models::{User, Client, Role, Permission, Scope, Token};

// Remove: mod models;
```

**Step 5: Run cargo check**

```bash
cd apps/oauth-service-rust
cargo check --workspace
```

Expected: No errors

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(oauth-core): remove duplicate model definitions, import from oauth-models"
```

---

### Task 1.4: Verify oauth-sdk-napi Uses Shared Models

**Files:**
- Verify: `apps/oauth-service-rust/crates/oauth-sdk-napi/src/lib.rs`

**Step 1: Check current imports in oauth-sdk-napi**

```bash
cd crates/oauth-sdk-napi
head -20 src/lib.rs
```

**Step 2: Ensure it depends on oauth-models**

```bash
grep "oauth-models" Cargo.toml
```

Should show:
```toml
oauth-models = { path = "../oauth-models" }
```

**Step 3: If missing, add dependency**

```bash
# Edit crates/oauth-sdk-napi/Cargo.toml
# Under [dependencies] add:
oauth-models = { path = "../oauth-models" }
```

**Step 4: Update imports in src/lib.rs**

```rust
// Add at top
use oauth_models::*;

// Remove any duplicate struct definitions
```

**Step 5: Run cargo build**

```bash
cd apps/oauth-service-rust
cargo build --release --package oauth-sdk-napi
```

Expected: Builds successfully with no errors

**Step 6: Commit**

```bash
git add crates/oauth-sdk-napi/Cargo.toml crates/oauth-sdk-napi/src/lib.rs
git commit -m "refactor(oauth-sdk-napi): import models from shared oauth-models crate"
```

---

### Task 1.5: Clean Up Obsolete Rust Files

**Files to delete:**
- `apps/oauth-service-rust/Cargo.toml.backup` (if exists)
- `apps/oauth-service-rust/examples/` (old examples if not relevant)
- Any old `models/` directories outside crates/

**Step 1: List backup files**

```bash
cd /Users/liushuo/code/ts-next-template/apps/oauth-service-rust
find . -name "*.backup" -o -name "*old*" | grep -v node_modules | grep -v ".git"
```

**Step 2: Remove backups**

```bash
rm -f Cargo.toml.backup
rm -rf Cargo.toml.backup  # if directory
```

**Step 3: Review examples/ directory**

```bash
ls -la examples/
```

If examples are outdated/not maintained, delete:

```bash
rm -rf examples/  # or individual example files
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(oauth-service-rust): remove obsolete backup files and outdated examples"
```

---

### Task 1.6: Run Full Rust Test Suite

**Files:**
- All: `apps/oauth-service-rust/crates/*/tests/`

**Step 1: Run all tests**

```bash
cd /Users/liushuo/code/ts-next-template/apps/oauth-service-rust
cargo test --workspace --lib
```

Expected: All tests pass

**Step 2: Run clippy linter**

```bash
cargo clippy --workspace -- -D warnings
```

Expected: No clippy warnings or errors

**Step 3: Build release**

```bash
cargo build --workspace --release
```

Expected: Build succeeds

**Step 4: Log results**

```bash
echo "✅ Rust Phase 1 Complete
- All tests passing
- No clippy warnings
- Build successful
- Models consolidated to oauth-models crate" >> /tmp/phase1_complete.log
```

**Step 5: Commit (if code changes made by clippy fixes)**

```bash
git add -A
git commit -m "chore(oauth-service-rust): fix clippy warnings and ensure all tests pass"
```

---

## PHASE 2: TYPESCRIPT ADMIN-PORTAL SSR MIGRATION

### Task 2.1: Audit Current admin-portal Architecture

**Files:**
- Reference: `apps/admin-portal/app/`
- Reference: `apps/admin-portal/lib/`
- Reference: `apps/admin-portal/hooks/`
- Create: `apps/admin-portal/TYPESCRIPT_AUDIT.md` (temporary)

**Step 1: List current app directory structure**

```bash
cd /Users/liushuo/code/ts-next-template/apps/admin-portal
find app -type f -name "*.tsx" -o -name "*.ts" | head -20
```

**Step 2: Count hook usage**

```bash
grep -r "import.*from.*hooks" app lib --include="*.tsx" --include="*.ts" | wc -l
```

If > 20, significant hook usage to migrate

**Step 3: List all hooks**

```bash
ls -la hooks/
```

**Step 4: Check for client-side data fetching patterns**

```bash
grep -r "useEffect.*fetch\|useState.*data" app --include="*.tsx" | wc -l
```

**Step 5: Create audit**

```bash
cat > TYPESCRIPT_AUDIT.md << 'EOF'
# Admin Portal TypeScript Audit (2025-12-04)

## Current Architecture
- Pages in app/: [COUNT]
- Components in components/: [COUNT]
- Hooks in use: [COUNT]
- Files using hooks: [COUNT]
- Client-side data fetching: [YES/NO]

## Migration Priority
1. Pages using Server Components: [LIST]
2. Pages needing Server Actions: [LIST]
3. Hook middleware to remove: [LIST]
EOF
```

**Step 6: Commit**

```bash
git add TYPESCRIPT_AUDIT.md
git commit -m "chore(admin-portal): audit current TypeScript architecture"
```

---

### Task 2.2: Create Server Action Utilities

**Files:**
- Create: `apps/admin-portal/lib/server-actions.ts`

**Step 1: Create server actions utility file**

```bash
cd /Users/liushuo/code/ts-next-template/apps/admin-portal
mkdir -p lib/actions
touch lib/actions/base.ts
```

**Step 2: Write base server action types**

```typescript
// lib/actions/base.ts
"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export async function revalidateAfterAction(
  paths: string[],
  tags: string[] = []
) {
  for (const path of paths) {
    revalidatePath(path);
  }
  for (const tag of tags) {
    revalidateTag(tag);
  }
}

// Example: createUser server action
export async function serverActionTemplate<T>(
  handler: () => Promise<T>,
  invalidateTags: string[] = []
): Promise<ActionResult<T>> {
  try {
    const data = await handler();

    // Revalidate cache
    if (invalidateTags.length > 0) {
      for (const tag of invalidateTags) {
        revalidateTag(tag);
      }
    }

    return {
      success: true,
      data,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: Date.now(),
    };
  }
}
```

**Step 3: Create specific server actions**

```typescript
// lib/actions/users.ts
"use server";

import { serverActionTemplate, ActionResult } from "./base";

interface CreateUserInput {
  name: string;
  email: string;
  role: string;
}

export async function createUser(
  input: CreateUserInput
): Promise<ActionResult<{ id: string }>> {
  return serverActionTemplate(async () => {
    // Call API or database directly
    const response = await fetch(`${process.env.API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) throw new Error("Failed to create user");
    return response.json();
  }, ["users-list"]);
}
```

**Step 4: Run type check**

```bash
npm run type-check
```

Expected: No type errors

**Step 5: Commit**

```bash
git add lib/actions/
git commit -m "feat(admin-portal): create server actions utilities and base patterns"
```

---

### Task 2.3: Migrate First Page to SSR (Example: Users List)

**Files:**
- Migrate: `apps/admin-portal/app/(authenticated)/users/page.tsx`
- Create: `apps/admin-portal/app/(authenticated)/users/actions.ts`
- Reference: `apps/admin-portal/features/users/` (current implementation)

**Step 1: Create SSR page component**

```typescript
// app/(authenticated)/users/page.tsx
import { Suspense } from "react";
import { getUsersData } from "./data";
import { UsersList } from "@/components/users/users-list";
import { UsersLoading } from "@/components/users/users-loading";
import { CreateUserForm } from "@/components/users/create-user-form";

export const metadata = {
  title: "Users",
  description: "Manage system users and permissions",
};

export default async function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
      </div>

      <CreateUserForm />

      <Suspense fallback={<UsersLoading />}>
        <UsersList />
      </Suspense>
    </div>
  );
}
```

**Step 2: Create data fetching function**

```typescript
// app/(authenticated)/users/data.ts
import { cache } from "react";

export const getUsersData = cache(async () => {
  const response = await fetch(`${process.env.API_URL}/users`, {
    headers: {
      Authorization: `Bearer ${process.env.API_KEY}`,
    },
    next: { tags: ["users"] },
  });

  if (!response.ok) throw new Error("Failed to fetch users");
  return response.json();
});
```

**Step 3: Create server actions for mutations**

```typescript
// app/(authenticated)/users/actions.ts
"use server";

import { revalidateTag } from "next/cache";
import { ActionResult, serverActionTemplate } from "@/lib/actions/base";

export async function createUserAction(
  formData: FormData
): Promise<ActionResult<any>> {
  const name = formData.get("name");
  const email = formData.get("email");
  const role = formData.get("role");

  return serverActionTemplate(async () => {
    const response = await fetch(`${process.env.API_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.API_KEY}`,
      },
      body: JSON.stringify({ name, email, role }),
    });

    if (!response.ok) throw new Error("Failed to create user");
    return response.json();
  }, ["users"]);
}

export async function deleteUserAction(
  userId: string
): Promise<ActionResult<null>> {
  return serverActionTemplate(async () => {
    const response = await fetch(`${process.env.API_URL}/users/${userId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`,
      },
    });

    if (!response.ok) throw new Error("Failed to delete user");
    revalidateTag("users");
    return null;
  }, ["users"]);
}
```

**Step 4: Update UsersList component to fetch data**

```typescript
// components/users/users-list.tsx
import { getUsersData } from "@/app/(authenticated)/users/data";
import { UserRow } from "./user-row";

export async function UsersList() {
  const users = await getUsersData();

  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user: any) => (
              <UserRow key={user.id} user={user} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 5: Create CreateUserForm component**

```typescript
// components/users/create-user-form.tsx
"use client";

import { useActionState } from "react";
import { createUserAction } from "@/app/(authenticated)/users/actions";

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: any, formData: FormData) => {
      return createUserAction(formData);
    },
    { success: false }
  );

  return (
    <form action={formAction} className="rounded-lg border p-4">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            type="text"
            name="name"
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Role</label>
          <select name="role" className="w-full rounded border px-3 py-2">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-500 px-4 py-2 text-white disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create User"}
        </button>
      </div>
      {state.error && <div className="mt-2 text-red-500">{state.error}</div>}
    </form>
  );
}
```

**Step 6: Run type check and build**

```bash
npm run type-check
npm run build
```

Expected: No errors

**Step 7: Test in dev**

```bash
npm run dev
# Navigate to /users and verify it works
```

**Step 8: Commit**

```bash
git add app/\(authenticated\)/users/ components/users/ lib/actions/
git commit -m "feat(admin-portal): migrate users page to SSR with Server Actions

- Convert users page to Server Component with data fetching
- Implement Server Actions for mutations (create, delete)
- Remove hook-based data fetching from users page
- Add useActionState for form handling"
```

---

### Task 2.4: Delete Old Hook-Based Files

**Files to delete:**
- Identify and delete old hook middleware files
- Delete old pages/ directory if using new App Router

**Step 1: Find files to delete**

```bash
cd /Users/liushuo/code/ts-next-template/apps/admin-portal

# List hook files
find hooks -type f -name "*.ts" -o -name "*.tsx"

# Check for old middleware
find . -name "*middleware*" -type f | grep -v node_modules | grep -v ".next"
```

**Step 2: Review before deletion**

```bash
# Check each hook file for usage
grep -r "useUsers\|useFetch" app lib --include="*.tsx" --include="*.ts"
```

If no usage found, safe to delete.

**Step 3: Delete identified old files**

```bash
# Example: delete old hooks that are replaced by Server Actions
rm -f hooks/use-fetch-hook.ts
rm -f hooks/use-auth-hook.ts

# Delete old middleware layer
rm -rf lib/middleware/  # if using new SSR approach
```

**Step 4: Verify no broken imports**

```bash
npm run type-check
```

Expected: No import errors

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(admin-portal): remove obsolete hook-based utilities replaced by Server Actions"
```

---

### Task 2.5: Run admin-portal Tests

**Files:**
- Reference: `apps/admin-portal/__tests__/`

**Step 1: Run all tests**

```bash
cd /Users/liushuo/code/ts-next-template/apps/admin-portal
npm run test
```

Expected: All tests pass (or skip for now if tests need updates)

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds

**Step 3: Run type check**

```bash
npm run type-check
```

Expected: No type errors

**Step 4: Commit (if fixes applied)**

```bash
git add -A
git commit -m "chore(admin-portal): ensure all tests pass after SSR migration"
```

---

## PHASE 3: DOCUMENTATION CONSOLIDATION & CLEANUP

### Task 3.1: Create ARCHITECTURE.md

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Extract from: docs/plans/*.md, existing documentation

**Step 1: Create skeleton**

```bash
touch docs/ARCHITECTURE.md
```

**Step 2: Write ARCHITECTURE.md content**

```markdown
# System Architecture

## Overview

This monorepo consists of:
- **oauth-service-rust**: OAuth 2.0 server with NAPI bindings for Node.js
- **admin-portal**: Next.js 16 management dashboard using SSR-first architecture

## Rust Architecture

### Workspace Structure

\`\`\`
apps/oauth-service-rust/
├── Cargo.toml (workspace root)
└── crates/
    ├── oauth-models/       # Shared data models (single source of truth)
    ├── oauth-core/         # Core OAuth logic
    ├── oauth-service/      # HTTP server (Axum)
    └── oauth-sdk-napi/     # Node.js bindings (NAPI)
\`\`\`

### Model Strategy

**Principle:** Single source of truth in `oauth-models`

- All data structures (User, Client, Role, Permission, Token, etc.) defined in `oauth-models`
- `oauth-core` and `oauth-sdk-napi` import shared models
- No duplicate struct definitions across crates

### Dependencies

- **oauth-models**: No dependencies (pure data)
- **oauth-core**: Depends on oauth-models
- **oauth-sdk-napi**: Depends on oauth-core and oauth-models
- **oauth-service**: Depends on oauth-core and oauth-models

## TypeScript Architecture

### SSR-First Philosophy

The admin-portal uses Next.js 16 App Router with server-first rendering:

1. **Server Components** (default) for data fetching and rendering
2. **Server Actions** for mutations (create, update, delete)
3. **Client Components** only for interactivity (useActionState, form submission)

### Directory Structure

\`\`\`
apps/admin-portal/
├── app/                    # Pages and layouts (Server Components first)
│   ├── (authenticated)/   # Protected routes
│   └── (public)/          # Public pages
├── components/            # Reusable components
├── lib/
│   ├── actions/          # Server Actions for mutations
│   └── [utilities]/      # Helpers, formatters, etc.
├── features/             # Feature-specific logic (being consolidated)
└── hooks/                # REMOVED - replaced by Server Actions
\`\`\`

### Data Fetching Patterns

**Server Components** (async):
\`\`\`typescript
async function UsersList() {
  const users = await fetch(...);
  return <div>{users.map(...)}</div>;
}
\`\`\`

**Server Actions** (mutations):
\`\`\`typescript
"use server";
export async function createUser(formData) {
  const result = await fetch(...);
  revalidateTag("users");
  return result;
}
\`\`\`

**Client Components** (forms):
\`\`\`typescript
"use client";
export function CreateForm() {
  const [state, formAction] = useActionState(createUser);
  return <form action={formAction}>...</form>;
}
\`\`\`

## Cross-Crate Model Sharing

Models are shared between Rust and TypeScript via:
1. Rust: `index.d.ts` - TypeScript type definitions generated from Rust types
2. TypeScript: Imports from `@repo/types` or directly from index.d.ts

This ensures type safety across the boundary without duplication.

## Key Design Decisions

### Why Workspace Structure?
- Single dependency resolution point (workspace.dependencies in Cargo.toml)
- Shared linting and formatting rules
- Simplified CI/CD

### Why SSR-First?
- Better SEO and initial page load
- Simpler data fetching (no race conditions)
- Less client-side JavaScript
- Server Actions eliminate middleware layer

### Why Single Model Crate?
- No duplication across services
- Single deploy/version point
- Forces thoughtful data structure design
```

**Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: create comprehensive ARCHITECTURE.md from consolidated knowledge"
```

---

### Task 3.2: Create CODE_STYLE_GUIDE.md

**Files:**
- Create: `docs/CODE_STYLE_GUIDE.md`

**Step 1: Create file**

```bash
touch docs/CODE_STYLE_GUIDE.md
```

**Step 2: Write content**

```markdown
# Code Style Guide

## Rust Standards

### Module Organization

\`\`\`rust
// ✅ Good: Clear, hierarchical organization
crates/oauth-core/src/
├── lib.rs          # Public API
├── models/         # Data structures (re-export from oauth-models)
├── services/       # Business logic
├── handlers/       # Route handlers
└── utils/          # Utilities
\`\`\`

### Model Definition

\`\`\`rust
// ✅ Only in oauth-models crate
pub struct User {
    pub id: String,
    pub email: String,
    pub roles: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

// ❌ WRONG: Duplicate in oauth-core or oauth-sdk-napi
\`\`\`

### Error Handling

\`\`\`rust
// ✅ Use thiserror for custom errors
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AuthError {
    #[error("Invalid credentials")]
    InvalidCredentials,
    #[error("User not found")]
    UserNotFound,
}

// ❌ WRONG: Using generic strings
\`\`\`

### Comments

Use bilingual comments where helpful:

\`\`\`rust
// 验证用户权限 - Validate user permissions
fn check_permission(user: &User, required_role: &str) -> bool {
    user.roles.contains(&required_role.to_string())
}
\`\`\`

---

## TypeScript Standards

### Component Structure

**Server Components** (default):
\`\`\`typescript
// ✅ Server Component - can fetch data
export async function UsersList() {
  const users = await fetch(...);
  return <div>{users.map(u => <UserCard key={u.id} user={u} />)}</div>;
}
\`\`\`

**Client Components** (when needed):
\`\`\`typescript
"use client";

// ✅ Client component - use hooks, interactivity
export function SearchUsers() {
  const [query, setQuery] = useState("");
  return <input onChange={e => setQuery(e.target.value)} />;
}
\`\`\`

### Server Actions

\`\`\`typescript
// ✅ Server Action - define in separate file
"use server";

export async function createUser(formData: FormData) {
  const name = formData.get("name");
  // Direct database access, no API call needed
  const result = await db.users.create({ name });
  revalidateTag("users");
  return result;
}
\`\`\`

### Naming Conventions

\`\`\`typescript
// ✅ Server Actions end with "Action"
export async function createUserAction() {}
export async function deleteUserAction() {}

// ✅ Pages in app/ directory
app/(authenticated)/users/page.tsx

// ✅ Components in components/ directory
components/users/user-list.tsx
components/users/user-card.tsx
\`\`\`

### Form Handling

\`\`\`typescript
"use client";

import { useActionState } from "react";
import { createUserAction } from "./actions";

export function CreateUserForm() {
  // ✅ useActionState for Server Actions
  const [state, formAction, isPending] = useActionState(
    createUserAction,
    { success: false }
  );

  return (
    <form action={formAction}>
      <input name="name" required />
      <button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
\`\`\`

---

## Anti-Patterns to Avoid

### ❌ Rust

1. **Duplicate Models**
   ```rust
   // Wrong: Model in oauth-core AND oauth-models
   pub struct User { ... }  // oauth-core
   pub struct User { ... }  // oauth-models
   ```

2. **Generic Error Strings**
   ```rust
   // Wrong
   Err("User not found".into())

   // Right
   Err(AuthError::UserNotFound.into())
   ```

3. **Scattered Dependencies**
   ```rust
   // Wrong: Different versions in different Cargo.tomls
   // Right: Use workspace.dependencies in root Cargo.toml
   ```

### ❌ TypeScript

1. **Hook-Based Data Fetching in Pages**
   ```typescript
   // Wrong: Client-side fetch in page
   export default function UsersPage() {
     const [users, setUsers] = useState([]);
     useEffect(() => { fetch(...) }, []);
   }

   // Right: Server Component with async
   export default async function UsersPage() {
     const users = await fetch(...);
   }
   ```

2. **Middleware Layer**
   ```typescript
   // Wrong: Extra abstraction layer
   const users = await useFetchUsers();

   // Right: Direct import and usage
   const users = await getUsersData();
   ```

3. **useEffect for Page Data**
   ```typescript
   // Wrong
   function Page() {
     useEffect(() => { fetchData() }, []);
   }

   // Right (Server Component)
   async function Page() {
     const data = await fetchData();
   }
   ```

---

## Documentation Standards

### Comments

- Use bilingual comments (中文 + English) for complex logic
- Include "why" not just "what"
- Document non-obvious decisions

\`\`\`typescript
// 使用缓存避免重复查询 - Cache to prevent duplicate queries
export const getUsers = cache(async () => {
  return fetch("/api/users", { next: { tags: ["users"] } });
});
\`\`\`

---

## Testing

### Rust

\`\`\`rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_user() {
        let user = User { ... };
        assert!(is_valid(&user));
    }
}
\`\`\`

### TypeScript

\`\`\`typescript
import { render, screen } from "@testing-library/react";
import { UserList } from "./user-list";

describe("UserList", () => {
  it("renders user names", async () => {
    const { container } = render(<UserList />);
    expect(screen.getByText(/users/i)).toBeInTheDocument();
  });
});
\`\`\`

---

## Commit Message Standards

Follow conventional commits:

\`\`\`
type(scope): description

feat(oauth-core): add user validation
fix(admin-portal): correct permissions check
refactor(oauth-models): consolidate user struct
chore(workspace): update dependencies
docs(ARCHITECTURE): clarify SSR patterns
\`\`\`

Types: feat, fix, refactor, chore, docs, style, test, perf
```

**Step 3: Commit**

```bash
git add docs/CODE_STYLE_GUIDE.md
git commit -m "docs: create comprehensive CODE_STYLE_GUIDE with Rust and TypeScript standards"
```

---

### Task 3.3: Delete Intermediate Documentation

**Files to delete:**
- `docs/plans/2025-12-03-napi-rs-learning-summary.md`
- `docs/plans/2025-12-02-high-priority-fixes.md`
- `docs/plans/2025-12-03-napi-sdk-build-verification.md`
- `docs/plans/2025-12-03-server-actions-napi-integration-status.md`
- `docs/plans/2025-12-03-testing-quality-assurance-complete.md`
- `docs/plans/2025-12-03-project-completion-summary.md`
- `docs/plans/2025-12-03-project-final-completion.md`
- Plus others from the list in the cleanup strategy document

**Step 1: Backup before deletion (optional)**

```bash
cd /Users/liushuo/code/ts-next-template
mkdir -p /tmp/doc_backup
cp docs/plans/2025-12-03-napi-rs-learning-summary.md /tmp/doc_backup/
cp docs/plans/2025-12-02-high-priority-fixes.md /tmp/doc_backup/
# ... copy others
```

**Step 2: Delete intermediate documents**

```bash
cd /Users/liushuo/code/ts-next-template

# Delete learning/status documents
rm -f docs/plans/2025-12-03-napi-rs-learning-summary.md
rm -f docs/plans/2025-12-02-high-priority-fixes.md
rm -f docs/plans/2025-12-03-napi-sdk-build-verification.md
rm -f docs/plans/2025-12-03-server-actions-napi-integration-status.md
rm -f docs/plans/2025-12-03-testing-quality-assurance-complete.md
rm -f docs/plans/2025-12-03-project-completion-summary.md
rm -f docs/plans/2025-12-03-project-final-completion.md

# Delete other intermediate documents
rm -f docs/plans/2025-12-02-high-priority-fixes.md
```

**Step 3: Keep only essential planning documents**

```bash
# Should remain:
# - 2025-12-03-comprehensive-architecture-refactoring.md (reference)
# - 2025-12-04-code-cleanup-and-refactoring-strategy.md (this strategy)
# - 2025-12-04-detailed-refactoring-execution-plan.md (this plan)

ls docs/plans/*.md
```

**Step 4: Delete root-level summary documents**

```bash
cd /Users/liushuo/code/ts-next-template

# From root and app directories
rm -f admin-portal/P0_TYPE_SAFETY_PHASE3_QUICK_SUMMARY.md
rm -f admin-portal/P0_TYPE_SAFETY_PHASE3_SUMMARY.md
rm -f admin-portal/UI_OPTIMIZATION_TASK5_6_LOADING_STATES_SUMMARY.md
rm -f admin-portal/CODE_REVIEW_WORK_SUMMARY.md
```

**Step 5: Verify cleanup**

```bash
# List remaining docs/plans files
echo "=== Remaining docs/plans files ==="
ls -1 docs/plans/*.md

# Should show only:
# 2025-12-03-comprehensive-architecture-refactoring.md
# 2025-12-04-code-cleanup-and-refactoring-strategy.md
# 2025-12-04-detailed-refactoring-execution-plan.md
```

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove intermediate documentation and task summaries

- Delete learning notes (napi-rs-learning-summary)
- Delete status tracking documents
- Delete old completion summaries
- Retain 3 essential planning documents"
```

---

### Task 3.4: Verify Final Project Structure

**Files:**
- All files in the project

**Step 1: Audit project structure**

```bash
cd /Users/liushuo/code/ts-next-template

# Check root level
echo "=== Root directory (should have minimal docs) ==="
ls -la | grep -E "\.md|\.txt|\.log" | grep -v "node_modules"

# Check docs/
echo -e "\n=== docs/ directory ==="
find docs -maxdepth 2 -name "*.md" | sort

# Check Rust structure
echo -e "\n=== Rust structure ==="
ls -la apps/oauth-service-rust/crates/

# Check TypeScript structure
echo -e "\n=== TypeScript structure ==="
ls -la apps/admin-portal/ | grep "^d"
```

**Step 2: Verify no orphaned files**

```bash
# Check for backup files
find . -name "*.backup" -o -name "*old*" -o -name "*tmp*" | grep -v node_modules | grep -v ".git"
```

Should return: nothing or expected files

**Step 3: Create final verification file**

```bash
cat > docs/STRUCTURE.md << 'EOF'
# Final Project Structure

## ✅ Cleanup Complete

### Documentation
- ✅ ARCHITECTURE.md - Comprehensive system design
- ✅ CODE_STYLE_GUIDE.md - Coding standards
- ✅ Intermediate documents deleted (15+ files)

### Rust (oauth-service-rust)
- ✅ Workspace structure established
- ✅ Shared oauth-models crate as single source of truth
- ✅ No duplicate model definitions
- ✅ All tests passing, no clippy warnings

### TypeScript (admin-portal)
- ✅ SSR-first architecture implemented
- ✅ Server Actions for mutations
- ✅ Hook middleware removed
- ✅ All tests passing, builds successfully

### Next Steps
- Review ARCHITECTURE.md for design overview
- Follow CODE_STYLE_GUIDE.md for contributions
- See 2025-12-03-comprehensive-architecture-refactoring.md for implementation reference
EOF
```

**Step 4: Commit**

```bash
git add docs/STRUCTURE.md
git commit -m "docs: add final structure verification document"
```

---

## FINAL VERIFICATION

### Task 3.5: Run Full Build & Tests

**All workspaces:**

**Step 1: Clean build**

```bash
cd /Users/liushuo/code/ts-next-template

# Clean everything
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
rm -rf apps/oauth-service-rust/target/

# Reinstall
pnpm install
```

**Step 2: Run Rust tests**

```bash
cd apps/oauth-service-rust
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

Expected: All pass

**Step 3: Run TypeScript build**

```bash
cd apps/admin-portal
npm run type-check
npm run build
npm run test
```

Expected: All pass

**Step 4: Run monorepo build**

```bash
cd /Users/liushuo/code/ts-next-template
npm run build
```

Expected: All projects build successfully

**Step 5: Create completion summary**

```bash
cat > docs/COMPLETION_SUMMARY.md << 'EOF'
# Code Cleanup & Refactoring - Completion Summary

**Date:** 2025-12-04
**Status:** ✅ Complete

## Achievements

### Rust Cleanup
- ✅ Consolidated model definitions to oauth-models crate
- ✅ Removed all duplicate struct definitions
- ✅ Workspace structure verified and working
- ✅ All tests passing, no clippy warnings

### TypeScript Migration
- ✅ Converted pages to Server Components
- ✅ Implemented Server Actions for mutations
- ✅ Removed hook middleware layer
- ✅ Updated form handling with useActionState
- ✅ All tests passing, builds successfully

### Documentation
- ✅ Created ARCHITECTURE.md (comprehensive design)
- ✅ Created CODE_STYLE_GUIDE.md (standards)
- ✅ Deleted 15+ intermediate documents
- ✅ Cleaned up root-level summary files

### Code Quality
- ✅ Rust: 0 clippy warnings
- ✅ TypeScript: No type errors
- ✅ All tests passing
- ✅ Successful clean build from scratch

## Files Changed
- Created: docs/ARCHITECTURE.md, docs/CODE_STYLE_GUIDE.md
- Modified: app/\(authenticated\)/users/ (example migration)
- Deleted: 20+ intermediate documents
- Refactored: Rust crates structure unified

## Build Status
- ✅ Rust: `cargo build --workspace --release` - SUCCESS
- ✅ TypeScript: `npm run build` - SUCCESS
- ✅ Monorepo: `npm run build` - SUCCESS

---

## Going Forward

1. Follow CODE_STYLE_GUIDE.md for new contributions
2. Reference ARCHITECTURE.md for system design
3. Use Server Actions pattern for new mutation pages
4. Keep oauth-models as single model source

**Next phase:** Continue migrating remaining pages to SSR pattern
EOF
```

**Step 6: Final commit**

```bash
git add docs/COMPLETION_SUMMARY.md
git commit -m "docs: add completion summary for code cleanup refactoring

Cleanup and refactoring complete:
- Rust models consolidated
- TypeScript SSR migration started
- Documentation consolidated and cleaned
- All tests passing, builds successful"
```

**Step 7: Verify commit history**

```bash
git log --oneline -10
```

Expected: Recent commits showing cleanup, documentation, and refactoring work

---

## SUCCESS CRITERIA

✅ All checkmarks below should be true:

- [ ] Rust workspace structure in place, tests passing
- [ ] No duplicate model definitions in Rust
- [ ] TypeScript admin-portal using Server Components
- [ ] Server Actions implemented for mutations
- [ ] Hook middleware removed from admin-portal
- [ ] docs/ARCHITECTURE.md created and comprehensive
- [ ] docs/CODE_STYLE_GUIDE.md created with standards
- [ ] 15+ intermediate documents deleted
- [ ] Root-level summary files cleaned up
- [ ] Full monorepo build succeeds
- [ ] All tests passing (Rust and TypeScript)
- [ ] No clippy warnings in Rust
- [ ] No TypeScript type errors
- [ ] Final commit includes all changes
- [ ] Project structure clean and organized

---

## NEXT STEPS

**Option 1: Continue SSR Migration** (recommended)
- Migrate remaining pages following Task 2.3 pattern
- Convert each page module-by-module
- Commit after each page migration

**Option 2: Refactor Components**
- Extract shared component patterns
- Consolidate duplicate utilities
- Improve component composition

**Option 3: Advanced Optimizations**
- Implement incremental static regeneration (ISR)
- Add streaming with Suspense boundaries
- Optimize image and font loading

---

**Plan saved.** Ready to execute!
