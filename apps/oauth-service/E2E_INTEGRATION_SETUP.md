# OAuth Service E2E Integration Setup

This document outlines the changes made to the OAuth service to support admin-portal integration and E2E testing.

## 🎯 Overview

The OAuth service has been enhanced to properly support integration with the admin-portal (localhost:3002) and E2E testing requirements. All OAuth 2.1 endpoints are now properly configured and accessible.

## 🔧 Configuration Changes

### 1. CORS Configuration
- **File**: `next.config.ts`
- **Changes**: Added comprehensive CORS headers for localhost:3002
- **Endpoints**: All `/api/v2/*` and `/api/v2/oauth/*` endpoints now accept requests from admin-portal

### 2. Preflight OPTIONS Handlers
- **Files**: 
  - `app/api/v2/oauth/authorize/route.options.ts`
  - `app/api/v2/oauth/token/route.options.ts`
- **Purpose**: Handles CORS preflight requests for OAuth endpoints

### 3. Environment Variables
- **File**: `.env.example`
- **Contains**: All necessary environment variables for OAuth configuration
- **Key Variables**:
  - `JWT_PRIVATE_KEY_PATH`: Path to RSA private key for JWT signing
  - `JWT_PUBLIC_KEY_PATH`: Path to RSA public key for JWT verification
  - `AUTH_CENTER_LOGIN_PAGE_URL`: Admin portal login page
  - `COOKIE_SECURE`: Set to false for development

## 🔐 OAuth 2.1 Endpoints

### Authentication Endpoints
- `POST /api/v2/auth/login` - Username/password login
- `GET /api/v2/auth/me` - Get current user info via Bearer token
- `POST /api/v2/auth/check` - Check specific user permissions
- `POST /api/v2/auth/logout` - Logout endpoint

### OAuth 2.1 Standard Endpoints
- `GET /api/v2/oauth/authorize` - Authorization endpoint with PKCE support
- `POST /api/v2/oauth/token` - Token endpoint (authorization_code, refresh_token, client_credentials)
- `GET /api/v2/oauth/jwks` - JSON Web Key Set endpoint
- `POST /api/v2/oauth/introspect` - Token introspection
- `POST /api/v2/oauth/revoke` - Token revocation
- `POST /api/v2/oauth/userinfo` - User information endpoint

### Management Endpoints
- `GET /api/v2/users/me` - Get current user details
- `PUT /api/v2/users/me` - Update current user profile
- `GET /api/v2/clients` - List OAuth clients
- `POST /api/v2/clients` - Create new OAuth client
- `GET /api/v2/roles` - List roles
- `GET /api/v2/permissions` - List permissions
- `GET /api/v2/audit-logs` - Audit logs

## 🧪 Test Data Setup

### E2E Test Users
- **Admin User**
  - Username: `admin`
  - Password: `Test123456!`
  - Email: `admin@example.com`
  - Role: `admin` (full permissions)

- **Regular User**
  - Username: `testuser`
  - Password: `Test123456!`
  - Email: `testuser@example.com`
  - Role: `user` (limited permissions)

### Test OAuth Clients
- **Admin Portal Client**
  - Client ID: `admin-portal-client`
  - Client Secret: `admin-portal-secret-key`
  - Redirect URIs: `http://localhost:3002/auth/callback`, `http://localhost:3002/`
  - PKCE: Required
  - Scopes: Full admin scopes including `users:read/write`, `clients:read/write`, etc.

- **Test Client**
  - Client ID: `test-client`
  - Client Secret: `test-client-secret`
  - Redirect URIs: `http://localhost:3000/callback`
  - PKCE: Optional
  - Scopes: Basic scopes (`openid`, `profile`, `email`)

## 🚀 Quick Setup Commands

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Generate JWT Keys
```bash
openssl genrsa -out test-private.pem 2048
openssl rsa -in test-private.pem -pubout -out test-public.pem
```

### 3. Setup Database
```bash
pnpm db:generate
pnpm db:push
pnpm db:seed:e2e
```

### 4. Start Services
```bash
# Start OAuth service
pnpm --filter=oauth-service dev

# Start admin portal
pnpm --filter=admin-portal dev
```

### 5. Verify Setup
```bash
# Check if service is ready
curl http://localhost:3001/api/v2/test/setup
```

## 🧪 E2E Testing

### Test Scenarios Covered
1. **Admin Login Flow**
   - Username/password authentication
   - OAuth 2.1 authorization code flow
   - Token refresh
   - Permission checking

2. **User Management**
   - User registration
   - User profile updates
   - Role assignment
   - Permission validation

3. **Client Management**
   - OAuth client creation
   - Client credential validation
   - Scope management

4. **Security**
   - Rate limiting
   - Token expiration
   - Invalid token handling
   - CORS protection

### Test Endpoints Available
- `GET /api/v2/test/setup` - Check if test data is properly set up
- `POST /api/v2/test/setup` - Reset test data (for cleanup between tests)

## 🔍 Error Response Format

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400,
  "details": {
    "code": "specific_error_code",
    "field_errors": { ... }
  }
}
```

## 📋 Common Test Commands

### Get Access Token
```bash
curl -X POST http://localhost:3001/api/v2/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "username=admin" \
  -d "password=Test123456!" \
  -d "client_id=admin-portal-client" \
  -d "client_secret=admin-portal-secret-key" \
  -d "scope=openid profile email"
```

### Check User Permissions
```bash
curl -X POST http://localhost:3001/api/v2/auth/check \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permission": "users:read"}'
```

### Get Current User
```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  http://localhost:3001/api/v2/auth/me
```

## ⚙️ Troubleshooting

### Common Issues
1. **CORS errors**: Ensure admin-portal is running on localhost:3002
2. **JWT errors**: Verify test keys are generated correctly
3. **Database errors**: Ensure database is properly seeded
4. **Permission errors**: Check user roles and permissions

### Debug Mode
Set `NODE_ENV=development` for detailed logging and error messages.

## 🔄 Integration Flow

1. **Admin Portal** → **OAuth Service** Authorization Flow:
   ```
   1. User visits admin-portal (localhost:3002)
   2. Redirects to /api/v2/oauth/authorize
   3. User login at /api/v2/auth/login
   4. Consent screen (if needed)
   5. Authorization code returned to admin-portal
   6. Token exchange at /api/v2/oauth/token
   7. Admin portal uses token for API calls
   ```

2. **API Authentication**:
   ```
   1. Include Bearer token in Authorization header
   2. Token validated via middleware
   3. User permissions checked
   4. Access granted/denied based on permissions
   ```

This setup provides a complete OAuth 2.1 service ready for admin-portal integration and E2E testing.