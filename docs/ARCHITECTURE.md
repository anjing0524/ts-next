# System Architecture

## Overview

This monorepo consists of two primary applications:

1. **oauth-service-rust**: Secure OAuth 2.0 server with NAPI bindings for Node.js
2. **admin-portal**: Next.js 16 management dashboard with SSR-first architecture

Both applications share a unified data model through the `oauth-models` crate, ensuring type safety and consistency across the entire system.

## Rust Architecture

### Workspace Structure

The Rust workspace (`apps/oauth-service-rust`) is organized as a multi-crate system with clear separation of concerns:

```
apps/oauth-service-rust/crates/
├── oauth-models/          # Shared data models (single source of truth)
├── oauth-core/            # Core OAuth business logic and services
├── oauth-service/         # HTTP server (Axum framework)
├── oauth-sdk-napi/        # Node.js NAPI bindings for OAuth service
└── Cargo.workspace.toml   # Workspace configuration
```

#### Key Design Principles

- **Single Source of Truth**: All crates import models from `oauth-models`
- **Clear Dependency Flow**: models → core → service, core → napi
- **Type Safety**: Shared models prevent serialization mismatches
- **Zero-Cost Integration**: NAPI provides efficient Node.js interop

### Crate Responsibilities

#### oauth-models
- Data structures for OAuth entities (User, Client, Token, etc.)
- Serialization/deserialization logic (serde)
- Validation rules and constraints
- Shared types used across all crates

#### oauth-core
- Business logic for OAuth flows (Authorization Code, Client Credentials, etc.)
- Service layer for user management, token generation, validation
- Error types and handling
- Database abstraction

#### oauth-service
- HTTP server built with Axum
- Request routing and middleware
- API endpoint handlers
- Integration with oauth-core services

#### oauth-sdk-napi
- Node.js NAPI bindings
- Bridge between Rust and JavaScript
- Async runtime integration
- Type conversion and error mapping

### Build and Testing

- **Build**: `cargo build -p oauth-service` (compiles all dependencies)
- **Tests**: `cargo test --workspace` (runs tests in all crates)
- **Clippy**: `cargo clippy --workspace -- -D warnings` (enforces style)
- **NAPI Build**: `npm run build` in `apps/admin-portal` triggers Rust compilation

## TypeScript Architecture

### SSR-First Philosophy

The admin-portal follows a Server-Side Rendering (SSR) first approach to minimize JavaScript sent to clients and optimize data fetching:

1. **Server Components** (default) - for data fetching and rendering
2. **Server Actions** - for mutations (create, update, delete operations)
3. **Client Components** - only for interactive features requiring browser APIs

This reduces bundle size, improves SEO, and provides better security for sensitive operations.

### Directory Structure

```
apps/admin-portal/
├── app/                   # Next.js app directory (Server Components)
│   ├── (auth)/           # Authentication routes
│   ├── admin/            # Admin dashboard pages
│   │   ├── users/        # User management
│   │   ├── permissions/  # Permission management
│   │   ├── audit-logs/   # Audit logs viewing
│   │   └── settings/     # System settings
│   └── layout.tsx        # Root layout and providers
├── components/           # Reusable components
│   ├── admin/           # Admin-specific components
│   ├── ui/              # Generic UI components
│   └── shared/          # Shared across the app
├── lib/
│   ├── actions/         # Server Actions for mutations
│   ├── api/             # API client utilities
│   ├── utils/           # Utility functions
│   └── services/        # Business logic services
├── hooks/               # (Removed - replaced by Server Actions)
├── middleware.ts        # Next.js middleware
├── instrumentation.ts   # Observability and monitoring
└── .env.local          # Environment variables
```

### Component Architecture

#### Server Components (Default)
- Defined in `app/` directory
- Fetch data directly from databases or APIs
- No "use client" directive
- Cannot use browser APIs (window, localStorage, etc.)

Example:
```typescript
// app/admin/users/page.tsx
import { getUsersList } from "@/lib/actions/users";

export default async function UsersPage() {
  const users = await getUsersList();
  return <UsersList users={users} />;
}
```

#### Client Components
- Marked with `"use client"` directive
- Only for interactive features
- Can use hooks (useState, useCallback, etc.)
- Limited to components/

Example:
```typescript
"use client";

import { useActionState } from "react";
import { deleteUserAction } from "@/lib/actions/users";

export function DeleteButton({ userId }: { userId: string }) {
  const [, deleteAction, isPending] = useActionState(deleteUserAction, null);

  return (
    <button
      onClick={() => deleteAction(userId)}
      disabled={isPending}
    >
      Delete
    </button>
  );
}
```

#### Server Actions
- Defined in `lib/actions/` with `"use server"` directive
- Handle mutations and data modifications
- Automatically serialized for client-side use
- Support form data and JSON payloads

Example:
```typescript
// lib/actions/users.ts
"use server";

import { revalidateTag } from "next/cache";

export async function deleteUserAction(userId: string) {
  // Perform deletion
  await oauthService.deleteUser(userId);

  // Invalidate cache to trigger re-render
  revalidateTag("users-list");

  return { success: true };
}
```

### Data Flow

1. **Initial Page Load**:
   - Server Component renders
   - Fetches data on server
   - Streams HTML to client

2. **User Interactions**:
   - Client Component captures interaction
   - Calls Server Action via useActionState
   - Server Action performs mutation
   - Calls revalidateTag to invalidate cache
   - Next.js re-fetches affected Server Components
   - UI updates automatically

3. **Form Submission**:
   - Form posts to Server Action
   - useActionState manages pending state
   - Form data automatically serialized
   - Response updates UI

### Cache Management

- **Data Cache**: Automatic caching of server component fetches
- **Request Deduplication**: Same fetch requests within same render deduplicated
- **Revalidation**: `revalidateTag()` invalidates specific caches
- **Background Revalidation**: `revalidatePath()` for immediate updates

Tags convention:
- `users-list`: For user list queries
- `permissions-list`: For permissions queries
- `audit-logs`: For audit logs
- `user-${id}`: For specific user data

## Rust-TypeScript Integration

### NAPI Bridge

The OAuth service is exposed to Node.js through NAPI bindings:

```
Rust Service
    ↓
NAPI Bindings (oauth-sdk-napi)
    ↓
Node.js Runtime
    ↓
TypeScript Server Actions
    ↓
Admin Portal Pages
```

### Type Synchronization

- Rust models compile to TypeScript types via code generation
- JSON serialization ensures compatibility
- Error types mapped between systems
- Async operations use Promises on TypeScript side

### Runtime Flow

1. **Token Validation**:
   - Server Action calls NAPI-exposed method
   - Rust validates token cryptographically
   - Returns validation result to TypeScript
   - TypeScript uses result for access control

2. **User Operations**:
   - TypeScript Server Action receives request
   - NAPI call invokes Rust user service
   - Rust performs database operation
   - Result serialized and returned
   - Cache invalidated in Next.js

## Database Design

### User Management
- **Users**: Core user entity with credentials
- **User Profiles**: Extended user information
- **User Roles**: Many-to-many relationship with roles

### OAuth Entities
- **Clients**: OAuth applications
- **Tokens**: Access and refresh tokens
- **Authorizations**: User consent grants
- **Audit Logs**: All operations logged

### Relationships
```
Users
  ├── Profile (1:1)
  ├── Roles (M:N)
  ├── Tokens (1:N)
  └── AuditLogs (1:N)

Clients
  ├── Credentials (1:N)
  ├── Tokens (1:N)
  └── AuditLogs (1:N)
```

## API Design

### RESTful Principles
- Resource-based URLs
- Standard HTTP methods (GET, POST, PUT, DELETE)
- Appropriate status codes
- JSON request/response format

### Authentication
- OAuth 2.0 Bearer tokens
- Token validation on all protected endpoints
- Automatic token refresh for long operations
- Revocation on logout

### Rate Limiting
- Per-user rate limits
- Per-endpoint rate limits
- Exponential backoff for retries
- Clear rate-limit headers

## Error Handling

### Rust Side
- Custom error types using `thiserror`
- Structured error context
- Error propagation with `?` operator
- Proper HTTP status mapping

### TypeScript Side
- Error boundaries for UI crashes
- Toast notifications for user errors
- Console logging for debugging
- Error recovery mechanisms

## Security Considerations

### Rust Service
- Input validation on all endpoints
- SQL injection prevention through ORM
- CSRF token validation
- Secure password hashing (argon2)

### TypeScript App
- Server-side session management
- No sensitive data in localStorage
- CORS properly configured
- Content Security Policy headers

### Cross-System
- Mutual TLS for service-to-service
- Environment variable secrets management
- Regular dependency updates
- Security audit logging

## Deployment Architecture

### Development Environment
```
Local Machine
├── Rust: cargo run
├── TypeScript: npm run dev
└── Database: Docker container
```

### Production Environment
```
Kubernetes Cluster
├── oauth-service-rust pod
├── admin-portal pod
├── PostgreSQL database
└── Redis cache
```

### CI/CD Pipeline
- Test on every commit
- Type-check TypeScript
- Lint and format check
- Build verification
- Security scanning
- Deploy on main branch

## Monitoring and Observability

### Metrics
- Request latency and throughput
- Error rates by endpoint
- Cache hit/miss ratios
- Database query performance

### Logging
- Structured JSON logs
- Log levels (debug, info, warn, error)
- Request correlation IDs
- Audit trail for user actions

### Tracing
- Distributed tracing for cross-system calls
- Span timing and dependencies
- Error tracking with stack traces

## Performance Optimization

### Rust Side
- Connection pooling (database and HTTP)
- Caching frequently accessed data
- Async runtime for concurrent requests
- Minimal allocations in hot paths

### TypeScript Side
- Static generation where possible
- Incremental static regeneration
- Image optimization
- Code splitting by route
- Bundle size monitoring

### Cross-System
- Data pagination for large results
- Compression for large responses
- CDN for static assets
- Database indexing for common queries

## Future Roadmap

### Near Term
- Enhanced audit logging with Elasticsearch
- Advanced user segmentation
- Custom dashboard widgets

### Medium Term
- Multi-tenancy support
- Federation with external OAuth providers
- Advanced analytics

### Long Term
- GraphQL API option
- Machine learning for security anomalies
- Marketplace for extensions
