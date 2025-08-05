# @repo/lib Package Guide

## Overview

`@repo/lib` is a shared utility library that provides authentication, authorization, middleware, and utility functions for the monorepo. It serves as the core infrastructure layer for all services in the project.

## Architecture

### Package Structure
```
@repo/lib/
├── src/
│   ├── auth/              # OAuth2 & JWT authentication utilities
│   ├── services/          # Business logic services (RBAC, permissions)
│   ├── middleware/        # Express/Next.js middleware
│   ├── utils/             # General utilities (logging, rate limiting, etc.)
│   ├── config/            # Configuration management
│   ├── types/             # TypeScript type definitions
│   ├── browser/           # Browser-specific exports
│   └── node/              # Node.js-specific exports
├── __tests__/             # Unit tests
└── dist/                  # Build output
```

### Entry Points

| Import Path | Environment | Purpose |
|-------------|-------------|---------|
| `@repo/lib` | Universal | Default exports (browser-focused) |
| `@repo/lib/node` | Node.js | Server-side utilities and middleware |
| `@repo/lib/browser` | Browser | Browser-safe utilities |
| `@repo/lib/auth` | Universal | Authentication utilities |
| `@repo/lib/services` | Universal | Business services |
| `@repo/lib/middleware` | Node.js | Express/Next.js middleware |

## Core Modules

### 🔐 Authentication (`src/auth/`)

**JWT Utilities** (`jwt-utils.ts`)
- `generateToken(payload, options)` - Generate JWT tokens
- `verifyToken(token, secret)` - Verify JWT tokens
- `refreshToken(refreshToken)` - Refresh access tokens
- Token types: AccessToken, RefreshToken, IdToken

**PKCE Utilities** (`pkce-utils.ts`)
- `generateCodeChallenge(codeVerifier)` - Generate PKCE challenge
- `validateCodeChallenge(challenge, verifier)` - Validate PKCE
- OAuth 2.1 PKCE flow support

**Password Utilities** (`password-utils.ts`)
- `hashPassword(password)` - Secure password hashing with bcrypt
- `verifyPassword(password, hash)` - Password verification
- Password complexity validation
- Password history tracking

**Authorization Utilities** (`authorization-utils.ts`)
- `validateRedirectUri(uri, client)` - OAuth redirect URI validation
- `validateResponseType(type)` - OAuth response type validation
- `generateAuthorizationCode()` - Generate secure auth codes
- `logAuditEvent()` - Security audit logging

### 🛡️ Services (`src/services/`)

**RBAC Service** (`rbac-service.ts`)
- Role-based access control implementation
- `getUserPermissions(userId)` - Get user permissions
- `checkPermission(userId, resource, action)` - Check access rights
- Permission caching with Redis

**Key Service** (`key-service.ts`)
- RSA key pair generation for JWT signing
- `getKeyPair()` - Get or generate signing keys
- JWKS (JSON Web Key Set) support
- Key rotation utilities

### 🚪 Middleware (`src/middleware/`)

**Bearer Authentication** (`bearer-auth.ts`)
- JWT token validation middleware
- Automatic token refresh
- User context injection

**CORS** (`cors.ts`)
- Configurable CORS middleware
- Environment-based CORS settings
- Pre-flight request handling

**Rate Limiting** (`rate-limit.ts`)
- IP-based rate limiting
- User-based rate limiting
- OAuth-specific rate limiting
- Redis-backed distributed rate limiting

**Validation** (`validation.ts`)
- Request validation middleware
- OAuth parameter validation
- PKCE validation
- Schema-based validation with Zod

### 🛠️ Utilities (`src/utils/`)

**Logger** (`logger.ts`)
- Winston-based logging
- Daily log rotation
- Structured JSON logging
- Environment-based log levels

**Error Handler** (`error-handler.ts`)
- Centralized error handling
- API error response formatting
- Error stack tracing

**Rate Limit Utils** (`rate-limit-utils.ts`)
- Redis-backed rate limiting
- Sliding window algorithms
- Distributed rate limiting

**Time Wheel** (`time-wheel.ts`)
- High-performance timer implementation
- Task scheduling and execution
- Memory-efficient time-based operations

**Tracing** (`tracing.ts`)
- Distributed tracing support
- B3 propagation headers
- Request correlation

### 📋 Types (`src/types/`)

**API Types** (`api.ts`)
- Standard API response formats
- Error response types
- Pagination types

**Authentication Types** (`auth/types.ts`)
- JWT payload types
- OAuth token types
- PKCE challenge types

## Usage Examples

### Basic Authentication Flow
```typescript
import { AuthorizationUtils, JWTUtils, PKCEUtils } from '@repo/lib';

// Generate PKCE challenge
const codeVerifier = PKCEUtils.generateCodeVerifier();
const codeChallenge = PKCEUtils.generateCodeChallenge(codeVerifier);

// Validate authorization request
const isValid = AuthorizationUtils.validateRedirectUri(redirectUri, client);

// Generate tokens
const accessToken = await JWTUtils.generateToken(payload, options);
```

### Rate Limiting Middleware
```typescript
import { withRateLimit } from '@repo/lib/middleware';

// Apply rate limiting to an API route
export default withRateLimit(handler, {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
```

### RBAC Permission Check
```typescript
import { RBACService } from '@repo/lib/services';

// Check user permissions
const hasPermission = await RBACService.checkPermission(
  userId,
  'users',
  'read'
);
```

### Server-Side Setup (Node.js)
```typescript
import { logger, withErrorHandling } from '@repo/lib/node';

// Configure logger
const log = logger('my-service');

// Use error handling middleware
app.use(withErrorHandling());
```

## Security Features

### Password Security
- bcrypt hashing with configurable salt rounds
- Password complexity requirements
- Password history tracking
- Secure password generation

### JWT Security
- RS256 asymmetric signing
- Token expiration management
- Refresh token rotation
- JWKS endpoint support

### Rate Limiting
- IP-based protection
- User-based protection
- Distributed Redis backing
- Configurable limits per endpoint

### Audit Logging
- Security event logging
- Failed authentication attempts
- Permission changes
- Token lifecycle events

## Configuration

### Environment Variables
```bash
# JWT Configuration
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### OAuth Configuration
```typescript
import { OAuthConfig } from '@repo/lib/OAuthConfig';

const config = new OAuthConfig({
  clients: [
    {
      clientId: 'web-app',
      redirectUris: ['http://localhost:3000/callback'],
      scopes: ['read', 'write'],
    }
  ]
});
```

## Testing

### Unit Tests
```bash
# Run tests for this package
pnpm test --filter=@repo/lib

# Run tests with coverage
pnpm test --filter=@repo/lib -- --coverage
```

### Test Structure
- `__tests__/` - Unit test files
- Jest configuration with TypeScript support
- Mock implementations for external dependencies
- Security-focused test cases

## Development Guidelines

### Import Guidelines
- Always use package imports (`@repo/lib`) instead of relative paths
- Use specific imports for tree-shaking: `import { JWTUtils } from '@repo/lib/auth'`
- Avoid importing from `src/` directly

### Adding New Features
1. Create feature in appropriate module directory
2. Add TypeScript types in `src/types/`
3. Add unit tests in `__tests__/`
4. Update module index files for exports
5. Update this documentation

### Security Considerations
- Never log sensitive data (passwords, tokens)
- Always validate input parameters
- Use constant-time comparison for secrets
- Implement proper error handling
- Follow OAuth 2.1 security best practices

## Dependencies

### Runtime Dependencies
- `jsonwebtoken` - JWT token handling
- `bcrypt` - Password hashing
- `jose` - Modern JWT library
- `uuid` - UUID generation
- `zod` - Schema validation
- `@repo/database` - Database access
- `@repo/cache` - Redis caching

### Development Dependencies
- `typescript` - Type checking
- `jest` - Testing framework
- `@types/*` - Type definitions

## API Reference

### JWTUtils
- `generateToken(payload: object, options: JWTOptions): Promise<string>`
- `verifyToken(token: string, secret: string): Promise<JWTPayload>`
- `refreshToken(refreshToken: string): Promise<TokenPair>`

### AuthorizationUtils
- `validateRedirectUri(uri: string, client: OAuthClient): boolean`
- `generateAuthorizationCode(clientId: string, userId: string): string`
- `validateScopes(requested: string[], allowed: string[]): string[]`

### RateLimitUtils
- `checkRateLimit(key: string, limit: number, window: number): Promise<boolean>`
- `resetRateLimit(key: string): Promise<void>`

## Troubleshooting

### Common Issues
1. **Import errors**: Ensure you're using the correct import path
2. **Type errors**: Check TypeScript configuration in consuming packages
3. **Runtime errors**: Verify all required environment variables are set
4. **Redis connection**: Check Redis server availability

### Debug Mode
```typescript
// Enable debug logging
import { logger } from '@repo/lib/utils';
logger.level = 'debug';
```

## Contributing

### Code Style
- Follow TypeScript strict mode
- Use ESLint configuration from `@repo/eslint-config`
- Add JSDoc comments for public APIs
- Write unit tests for new features

### Pull Request Process
1. Create feature branch from main
2. Add tests for new functionality
3. Update documentation
4. Ensure all tests pass
5. Submit PR with description of changes

## Version History

### v1.0.0
- Initial release with OAuth2 support
- JWT utilities and middleware
- RBAC implementation
- Rate limiting and security features