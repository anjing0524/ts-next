# OAuth Service - Developer Guide

## Overview

The OAuth Service is a comprehensive OAuth 2.1 authorization server implementation built with Next.js, providing secure authentication and authorization flows for the entire application ecosystem. It supports multiple grant types, PKCE (Proof Key for Code Exchange), client credentials, and refresh token flows.

## Service Details

- **Service Name**: oauth-service
- **Port**: 3001
- **Technology**: Next.js 15, TypeScript, Prisma ORM
- **Purpose**: OAuth 2.1 authorization server with RBAC support

## Architecture

### Directory Structure

```
oauth-service/
├── app/
│   ├── api/v2/                 # API routes (Next.js App Router)
│   │   ├── oauth/             # OAuth 2.1 endpoints
│   │   │   ├── authorize/     # Authorization endpoint
│   │   │   ├── token/         # Token endpoint
│   │   │   ├── userinfo/      # User information endpoint
│   │   │   ├── revoke/        # Token revocation endpoint
│   │   │   └── introspect/    # Token introspection endpoint
│   │   ├── auth/              # Authentication endpoints
│   │   ├── clients/           # OAuth client management
│   │   ├── users/             # User management
│   │   ├── roles/             # Role management
│   │   ├── permissions/       # Permission management
│   │   ├── scopes/            # OAuth scope management
│   │   └── audit-logs/        # Audit log endpoints
│   └── globals.css
├── lib/                        # Business logic and utilities
│   ├── auth/
│   │   ├── authorization-code-flow.ts  # Authorization code flow logic
│   │   ├── client-credentials-flow.ts  # Client credentials flow logic
│   │   ├── constants.ts                # OAuth constants and configurations
│   │   └── services/                   # Service layer
│   │       ├── client-service.ts       # OAuth client management
│   │       ├── user-service.ts         # User operations
│   │       ├── role-service.ts         # Role management
│   │       ├── permission-service.ts   # Permission management
│   │       └── rbac-service.ts         # Role-based access control
│   ├── errors.ts              # Custom error definitions
│   ├── permission-map.ts      # API endpoint permission mapping
│   └── utils/
├── __tests__/                 # Test files
├── coverage/                  # Test coverage reports
├── logs/                      # Application logs
├── middleware.ts              # API middleware for authentication
├── next.config.ts             # Next.js configuration
├── jest.config.js             # Jest test configuration
└── package.json               # Dependencies and scripts
```

## Authentication & Authorization Flows

### Supported OAuth 2.1 Grant Types

1. **Authorization Code Flow** (with PKCE support)
   - Endpoint: `GET /api/v2/oauth/authorize`
   - Token Exchange: `POST /api/v2/oauth/token`
   - PKCE: Required for public clients, optional for confidential clients

2. **Client Credentials Flow**
   - Endpoint: `POST /api/v2/oauth/token`
   - For service-to-service authentication

3. **Refresh Token Flow**
   - Endpoint: `POST /api/v2/oauth/token`
   - Automatic token rotation supported

### OAuth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v2/oauth/authorize` | GET | Authorization endpoint for OAuth flows |
| `/api/v2/oauth/token` | POST | Token endpoint for all grant types |
| `/api/v2/oauth/userinfo` | GET | Get user information (OIDC) |
| `/api/v2/oauth/revoke` | POST | Revoke tokens |
| `/api/v2/oauth/introspect` | POST | Token introspection (RFC 7662) |
| `/api/v2/oauth/jwks` | GET | JSON Web Key Set for JWT validation |

## Database Models

### Core Authentication Models

- **User**: Central user management with password hashing, role assignments, and audit trails
- **OAuthClient**: OAuth client configuration with security settings
- **AuthorizationCode**: PKCE-enabled authorization codes
- **AccessToken**: JWT-based access tokens
- **RefreshToken**: Refresh tokens with rotation and revocation

### RBAC Models

- **Role**: System roles with hierarchical permissions
- **Permission**: Fine-grained permission definitions
- **UserRole**: User-to-role assignments
- **RolePermission**: Role-to-permission mappings

### Scope & Consent Models

- **Scope**: OAuth scopes with permission mappings
- **ConsentGrant**: User consent records for OAuth clients
- **ScopePermission**: Scope-to-permission relationships

### Audit & Security Models

- **AuditLog**: Comprehensive audit trail
- **SecurityPolicy**: Security policy configuration
- **TokenBlacklist**: JWT revocation blacklist
- **SystemConfiguration**: System-wide configuration

## API Development

### Permission System

The service implements a comprehensive permission system with:

- **API Permissions**: Endpoint-level access control
- **Menu Permissions**: UI navigation control
- **Data Permissions**: Row/column-level data access
- **OAuth Scopes**: OAuth-specific permission scopes

### Permission Mapping

Endpoint permissions are defined in `/lib/permission-map.ts`:

```typescript
export const permissionMap = {
  '/api/v2/users': { GET: 'user:list', POST: 'user:create' },
  '/api/v2/users/:userId': { GET: 'user:read', PUT: 'user:update', DELETE: 'user:delete' },
  '/api/v2/clients': { GET: 'client:list', POST: 'client:create' },
  // ... more mappings
};
```

## Development Commands

### Setup & Installation

```bash
# Install dependencies
pnpm install

# Initialize database
pnpm db:generate && pnpm db:push && pnpm db:seed

# Start development server
pnpm dev

# Start production server
pnpm build && pnpm start
```

### Database Operations

```bash
# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Seed database with initial data
pnpm db:seed

# Reset database (dev only)
pnpm db:reset

# Open Prisma Studio
pnpm db:studio
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test -- user-service.test.ts

# Run tests in watch mode
pnpm test --watch
```

### Code Quality

```bash
# Lint code
pnpm lint

# Format code
pnpm format

# Type checking
pnpm type-check
```

## Environment Variables

### Required Environment Variables

```bash
# Database
DATABASE_URL="file:./dev.db"

# JWT Configuration
JWT_PRIVATE_KEY_PATH="./test-private.pem"
JWT_PUBLIC_KEY_PATH="./test-public.pem"
JWT_ISSUER="https://your-oauth-service.com"

# OAuth Configuration
AUTH_CENTER_LOGIN_PAGE_URL="/login"
AUTH_CENTER_UI_AUDIENCE="urn:auth-center:ui"
AUTH_CENTER_UI_CLIENT_ID="auth-center-admin-client"

# Security
JWKS_URI="https://your-oauth-service.com/.well-known/jwks.json"

# Redis (for caching and sessions)
REDIS_URL="redis://localhost:6379"
```

### Optional Configuration

```bash
# Logging
LOG_LEVEL="info"
LOG_FILE_PATH="./logs"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Token Lifetimes
ACCESS_TOKEN_TTL=3600
REFRESH_TOKEN_TTL=2592000
```

## Key Files and Their Purposes

### Core Business Logic

- **`lib/auth/authorization-code-flow.ts`**: PKCE-enabled authorization code flow implementation
- **`lib/auth/client-credentials-flow.ts`**: Client credentials authentication and token generation
- **`lib/auth/constants.ts`**: OAuth configuration constants and supported grant types

### Services

- **`lib/auth/services/client-service.ts`**: OAuth client CRUD operations
- **`lib/auth/services/user-service.ts`**: User management with RBAC integration
- **`lib/auth/services/rbac-service.ts`**: Role-based access control logic
- **`lib/auth/services/permission-service.ts`**: Permission management
- **`lib/auth/services/role-service.ts`**: Role management with permission assignments

### Middleware & Security

- **`middleware.ts`**: API authentication and authorization middleware
- **`lib/permission-map.ts`**: Endpoint-to-permission mapping configuration
- **`lib/utils/client-auth-utils.ts`**: Client authentication utilities

### API Routes

- **`app/api/v2/oauth/authorize/route.ts`**: OAuth authorization endpoint
- **`app/api/v2/oauth/token/route.ts`**: OAuth token endpoint with all grant types
- **`app/api/v2/users/route.ts`**: User management API
- **`app/api/v2/clients/route.ts`**: OAuth client management API

## Testing Strategy

### Test Structure

- **Unit Tests**: Service layer testing with mocked dependencies
- **Integration Tests**: API endpoint testing with real database
- **E2E Tests**: Full OAuth flow testing with actual browser automation

### Test Patterns

- **Mocking**: Prisma client, external services, and JWT tokens
- **Test Data**: Factory patterns for consistent test data
- **Database**: In-memory SQLite for unit tests, file-based for integration

### Example Test Files

- **`__tests__/api/user-service.test.ts`**: User service unit tests
- **`__tests__/api/audit-logs.test.ts`**: Audit log API tests

## Security Features

### OAuth 2.1 Compliance

- **PKCE Support**: Required for public clients
- **State Parameter**: CSRF protection
- **Redirect URI Validation**: Strict URL matching
- **Client Authentication**: Multiple methods (JWT, Basic Auth, Secret)

### Security Policies

- **Password Policies**: Configurable strength requirements
- **Account Lockout**: Brute force protection
- **Token Lifetimes**: Configurable per client
- **IP Whitelisting**: Client-level IP restrictions

### Audit & Monitoring

- **Comprehensive Logging**: All authentication events
- **Audit Trails**: User actions and system events
- **Security Events**: Failed logins, token revocations
- **Performance Metrics**: API response times and usage

## Integration Points

### Shared Packages

- **`@repo/database`**: Database models and Prisma client
- **`@repo/lib`**: Shared utilities and error handling
- **`@repo/cache`**: Redis caching layer
- **`@repo/ui`**: Shared UI components

### External Services

- **Admin Portal**: Management UI integration
- **Kline Service**: Financial data service authentication
- **Pingora Proxy**: Reverse proxy configuration

## Best Practices

### Code Organization

- **Domain-Driven Design**: Clear separation of concerns
- **Service Layer**: Business logic in dedicated services
- **Repository Pattern**: Database access abstraction
- **Error Handling**: Consistent error responses

### Security Best Practices

- **Never store secrets in code**: Use environment variables
- **Input validation**: Zod schemas for all inputs
- **Rate limiting**: API-level protection
- **Token rotation**: Refresh token rotation on use

### Development Workflow

1. **Feature Development**: Create feature branch from `main`
2. **TDD**: Write tests before implementation
3. **Code Review**: PR review process
4. **Testing**: Full test suite before merge
5. **Deployment**: Automated deployment pipeline

## Troubleshooting

### Common Issues

1. **Database Connection**: Check DATABASE_URL configuration
2. **JWT Validation**: Verify key files exist and are readable
3. **OAuth Flow**: Check redirect URI configurations
4. **Permissions**: Review permission map and role assignments

### Debug Commands

```bash
# Check database connection
pnpm exec prisma db pull

# Verify JWT keys
openssl rsa -in test-private.pem -check

# Test OAuth flow manually
curl -X POST http://localhost:3001/api/v2/oauth/token \
  -d "grant_type=client_credentials&client_id=your-client-id&client_secret=your-secret"

# Check logs
tail -f logs/2025-07-23.log
```

## Contributing

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Airbnb configuration
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Structured commit messages

### Pull Request Process

1. **Fork** the repository
2. **Create** feature branch: `git checkout -b feature/oauth-flow-enhancement`
3. **Write** tests for new functionality
4. **Implement** feature with proper error handling
5. **Run** full test suite: `pnpm test`
6. **Submit** pull request with detailed description

### Performance Considerations

- **Database Indexing**: Optimized for common queries
- **Caching**: Redis for session and configuration caching
- **Connection Pooling**: Prisma connection management
- **Rate Limiting**: Configurable per endpoint

This comprehensive guide should serve as the complete reference for developers working on the OAuth service. All code examples and configurations are based on the actual implementation found in the codebase.