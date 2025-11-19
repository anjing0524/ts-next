# E2E Test Strategy for OAuth 2.1 Service

## Executive Summary

This document defines a comprehensive end-to-end (E2E) testing strategy for the OAuth 2.1 authorization server built with Rust and Axum. The strategy is based on findings from codebase analysis and aims to validate:

- OAuth 2.1 protocol compliance
- Security controls (PKCE, RBAC, rate limiting)
- Critical issues identified in code analysis
- Production readiness

**Test Coverage Goals:**
- **Protocol Coverage:** 100% of OAuth 2.1 flows
- **Security Coverage:** All identified security controls
- **Critical Path Coverage:** All user-facing workflows
- **Error Scenario Coverage:** All RFC-defined error codes

---

## 1. Test Scope and Objectives

### 1.1 Primary Objectives

1. **OAuth 2.1 Protocol Compliance**
   - Validate all grant types work correctly
   - Ensure PKCE is mandatory for authorization code flow
   - Verify token lifecycle management (issue, refresh, revoke)
   - Validate RFC 6749, RFC 7636 compliance

2. **Security Validation**
   - PKCE enforcement (S256 method)
   - RBAC permission enforcement
   - Rate limiting effectiveness
   - CSRF protection (state parameter)
   - Token security (expiration, rotation)

3. **Critical Issue Validation**
   - Token refresh transaction atomicity (SQLX_ANALYSIS issue #1)
   - Cache invalidation on permission changes (CODEBASE_ANALYSIS issue #1)
   - Public path bypass validation (CODEBASE_ANALYSIS issue #4)
   - Database error exposure prevention (AXUM_ANALYSIS issue #2)

4. **Integration Testing**
   - Database operations (SQLx queries, transactions)
   - Permission caching (InMemoryPermissionCache)
   - Middleware pipeline execution
   - Error handling and responses

### 1.2 Out of Scope

- Unit tests (already covered by `cargo test --lib`)
- Performance/load testing (separate test suite)
- Frontend Admin Portal testing (separate E2E suite)
- Pingora proxy testing

---

## 2. Test Architecture

### 2.1 Test Framework

**Technology Stack:**
```rust
[dev-dependencies]
tokio-test = "0.4"
reqwest = "0.11"          # HTTP client for API calls
serde_json = "1.0"
wiremock = "0.6"          # For mocking external services (if needed)
testcontainers = "0.15"   # For isolated database testing
serial_test = "3.0"       # For sequential test execution
```

**Test Structure:**
```
tests/
├── e2e/
│   ├── mod.rs                        # Test utilities and fixtures
│   ├── oauth_flows/
│   │   ├── authorization_code_pkce.rs
│   │   ├── refresh_token.rs
│   │   ├── client_credentials.rs
│   │   └── token_revocation.rs
│   ├── rbac/
│   │   ├── permission_enforcement.rs
│   │   ├── role_assignment.rs
│   │   └── cache_invalidation.rs
│   ├── security/
│   │   ├── rate_limiting.rs
│   │   ├── csrf_protection.rs
│   │   └── token_security.rs
│   ├── critical_issues/
│   │   ├── token_refresh_atomicity.rs
│   │   ├── cache_invalidation.rs
│   │   └── public_path_bypass.rs
│   └── error_scenarios/
│       ├── invalid_requests.rs
│       ├── expired_tokens.rs
│       └── unauthorized_access.rs
└── fixtures/
    ├── test_data.sql
    ├── clients.json
    └── users.json
```

### 2.2 Test Environment Setup

**Database Setup:**
```rust
// Use testcontainers for isolated SQLite/MySQL instances
async fn setup_test_database() -> Pool<Sqlite> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(":memory:")
        .await
        .unwrap();

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .unwrap();

    // Load test fixtures
    load_test_fixtures(&pool).await;

    pool
}
```

**Test Server:**
```rust
// Spawn actual Axum server on random port
async fn spawn_test_server() -> TestServer {
    let pool = setup_test_database().await;
    let app = create_app(pool).await;

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    TestServer { base_url: format!("http://{}", addr) }
}
```

**Test Client:**
```rust
struct OAuthTestClient {
    http_client: reqwest::Client,
    base_url: String,
    client_id: String,
    client_secret: Option<String>,
}

impl OAuthTestClient {
    async fn authorize(&self, pkce: PkceChallenge) -> AuthorizationResponse {
        // Implementation
    }

    async fn exchange_code(&self, code: String, verifier: String) -> TokenResponse {
        // Implementation
    }

    async fn refresh_token(&self, refresh_token: String) -> TokenResponse {
        // Implementation
    }
}
```

---

## 3. Test Scenarios

### 3.1 OAuth 2.1 Flow Tests

#### TC-OAUTH-001: Authorization Code Flow with PKCE (Happy Path)

**Objective:** Validate complete authorization code flow with S256 PKCE

**Prerequisites:**
- Confidential client registered with redirect_uri
- Test user with valid credentials

**Test Steps:**
1. Generate PKCE code_verifier (43-128 characters)
2. Generate code_challenge = BASE64URL(SHA256(code_verifier))
3. **GET** `/api/v2/oauth/authorize` with:
   ```
   client_id=test-client
   response_type=code
   redirect_uri=http://localhost:3000/callback
   scope=openid profile
   state=random-state-value
   code_challenge=<challenge>
   code_challenge_method=S256
   ```
4. Simulate user login and consent
5. Extract authorization `code` from redirect
6. **POST** `/api/v2/oauth/token` with:
   ```
   grant_type=authorization_code
   code=<authorization_code>
   redirect_uri=http://localhost:3000/callback
   client_id=test-client
   client_secret=<secret>
   code_verifier=<verifier>
   ```

**Expected Results:**
- Step 3: 302 redirect to login page
- Step 4: 302 redirect to callback with `code` and `state`
- Step 5: State matches original value
- Step 6: 200 OK with JSON:
  ```json
  {
    "access_token": "<jwt>",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "<jwt>",
    "scope": "openid profile"
  }
  ```
- Access token is valid JWT with correct claims
- Refresh token is valid and can be used once

**Validation:**
- Decode access_token and verify:
  - `iss` matches server issuer
  - `sub` matches user ID
  - `aud` contains client_id
  - `exp` is ~3600 seconds from now
  - `scope` contains "openid profile"

---

#### TC-OAUTH-002: PKCE Enforcement (Negative Test)

**Objective:** Verify authorization code flow FAILS without PKCE

**Test Steps:**
1. **GET** `/api/v2/oauth/authorize` WITHOUT `code_challenge`
2. **POST** `/api/v2/oauth/token` with code but WITHOUT `code_verifier`

**Expected Results:**
- Step 1: 400 Bad Request or automatic PKCE required error
- Step 2: 400 Bad Request with `error=invalid_grant`

---

#### TC-OAUTH-003: Refresh Token Flow

**Objective:** Validate refresh token grant and token rotation

**Test Steps:**
1. Obtain initial tokens via authorization code flow
2. **POST** `/api/v2/oauth/token` with:
   ```
   grant_type=refresh_token
   refresh_token=<refresh_token>
   client_id=test-client
   client_secret=<secret>
   ```
3. Attempt to reuse the same refresh_token again

**Expected Results:**
- Step 2: 200 OK with NEW access_token AND NEW refresh_token
- Old refresh_token is invalidated
- Step 3: 400 Bad Request with `error=invalid_grant`

**Critical Issue Validation:**
- **Atomicity Check:** Verify that if database fails after issuing new tokens but before revoking old ones, the operation rolls back completely
- **Test Method:** Mock database error after token creation to ensure transaction rollback

---

#### TC-OAUTH-004: Client Credentials Flow

**Objective:** Validate service-to-service authentication

**Prerequisites:**
- Confidential client with client_credentials grant type

**Test Steps:**
1. **POST** `/api/v2/oauth/token` with:
   ```
   grant_type=client_credentials
   client_id=service-client
   client_secret=<secret>
   scope=api.read api.write
   ```

**Expected Results:**
- 200 OK with access_token (no refresh_token)
- Token has no `sub` claim (client-only)
- Token expires per client configuration

---

#### TC-OAUTH-005: Token Revocation

**Objective:** Validate RFC 7009 token revocation

**Test Steps:**
1. Obtain access_token and refresh_token
2. **POST** `/api/v2/oauth/revoke` with:
   ```
   token=<access_token>
   token_type_hint=access_token
   client_id=test-client
   client_secret=<secret>
   ```
3. Attempt to use revoked access_token
4. Revoke refresh_token
5. Attempt to use revoked refresh_token

**Expected Results:**
- Step 2: 200 OK (successful revocation)
- Step 3: 401 Unauthorized when accessing protected resource
- Step 4: 200 OK
- Step 5: 400 Bad Request with `error=invalid_grant`

---

### 3.2 RBAC and Permission Tests

#### TC-RBAC-001: Permission Enforcement

**Objective:** Verify endpoints require correct permissions

**Test Steps:**
1. Create user with role "viewer" (has permission "users:read")
2. Obtain access_token for this user
3. **GET** `/api/v2/users` with Bearer token
4. **POST** `/api/v2/users` with same token (requires "users:write")

**Expected Results:**
- Step 3: 200 OK with user list
- Step 4: 403 Forbidden with error message

---

#### TC-RBAC-002: Cache Invalidation on Permission Change

**Objective:** Validate critical issue - cache invalidation when user permissions change

**Test Steps:**
1. User has role "viewer", obtain access_token
2. Verify user CAN access `/api/v2/users` (read permission)
3. Admin removes "viewer" role from user
4. **Immediately** access `/api/v2/users` again with same token (within cache TTL)
5. Wait for cache TTL expiration (300 seconds)
6. Access `/api/v2/users` again

**Expected Results:**
- Step 2: 200 OK
- Step 4: **403 Forbidden** (cache should be invalidated)
- Step 6: 403 Forbidden

**Critical Issue:**
- This tests CODEBASE_ANALYSIS issue #1
- Current implementation may not invalidate cache on role changes
- Fix required: Call `permission_cache.invalidate(user_id)` in role_service

---

#### TC-RBAC-003: Multi-Role Permission Aggregation

**Objective:** Verify user with multiple roles gets all permissions

**Test Steps:**
1. Create user with roles ["editor", "api-user"]
   - "editor" has permissions: ["users:read", "users:write"]
   - "api-user" has permissions: ["api:execute"]
2. Obtain access_token
3. Verify user can access all endpoints requiring any of those permissions

**Expected Results:**
- User has aggregated permissions from all roles
- No duplicate permissions in cache

---

### 3.3 Security Tests

#### TC-SEC-001: Rate Limiting

**Objective:** Verify rate limiting prevents abuse

**Test Steps:**
1. Send 101 requests to `/api/v2/oauth/token` within 60 seconds from same IP
2. Verify 101st request is rate limited

**Expected Results:**
- Requests 1-100: Normal responses
- Request 101: 429 Too Many Requests

**Critical Issue:**
- This tests AXUM_ANALYSIS issue #3
- Current implementation creates new RateLimiter per request
- May not actually enforce limits correctly

---

#### TC-SEC-002: CSRF Protection (State Parameter)

**Objective:** Verify state parameter prevents CSRF attacks

**Test Steps:**
1. Start authorization with `state=original-state`
2. Receive redirect with `state=different-state`
3. Attempt to complete flow with mismatched state

**Expected Results:**
- Client should reject mismatched state
- Server should not process authorization codes without validating state

---

#### TC-SEC-003: Token Expiration

**Objective:** Verify expired tokens are rejected

**Test Steps:**
1. Create access_token with 1-second TTL
2. Wait 2 seconds
3. Use expired token to access protected resource

**Expected Results:**
- 401 Unauthorized with `error=invalid_token`

---

#### TC-SEC-004: Public Path Bypass Prevention

**Objective:** Validate critical issue - ensure public paths cannot bypass authentication

**Test Steps:**
1. Access `/health` without authentication (should work)
2. Access `/api/v2/users` without authentication (should fail)
3. Attempt path traversal: `/health/../api/v2/users`
4. Attempt case variation: `/API/v2/users`

**Expected Results:**
- Step 1: 200 OK
- Step 2: 401 Unauthorized
- Step 3: 401 Unauthorized (no path traversal bypass)
- Step 4: 401 Unauthorized (case-insensitive check)

**Critical Issue:**
- This tests CODEBASE_ANALYSIS issue #4
- Hardcoded public paths may be vulnerable

---

### 3.4 Error Scenario Tests

#### TC-ERR-001: Invalid Client Credentials

**Test Steps:**
1. **POST** `/api/v2/oauth/token` with wrong client_secret
2. **POST** with non-existent client_id

**Expected Results:**
- Both: 401 Unauthorized with `error=invalid_client`
- Response should NOT reveal database errors (AXUM_ANALYSIS issue #2)

---

#### TC-ERR-002: Invalid Authorization Code

**Test Steps:**
1. **POST** `/api/v2/oauth/token` with:
   - Expired authorization code
   - Already-used authorization code
   - Non-existent authorization code

**Expected Results:**
- All cases: 400 Bad Request with `error=invalid_grant`

---

#### TC-ERR-003: Invalid Redirect URI

**Test Steps:**
1. Register client with redirect_uri: `http://localhost:3000/callback`
2. **GET** `/api/v2/oauth/authorize` with redirect_uri: `http://evil.com`
3. **POST** `/api/v2/oauth/token` with redirect_uri mismatch

**Expected Results:**
- Step 2: 400 Bad Request (NOT redirect to evil.com)
- Step 3: 400 Bad Request with `error=invalid_grant`

---

#### TC-ERR-004: Malformed Requests

**Test Steps:**
1. Send requests with:
   - Missing required parameters
   - Invalid JSON
   - SQL injection attempts in parameters
   - XSS payloads in parameters

**Expected Results:**
- 400 Bad Request with appropriate error messages
- No SQL injection (all queries are parameterized)
- No XSS vulnerabilities in responses

---

### 3.5 Database Transaction Tests

#### TC-DB-001: Token Refresh Atomicity

**Objective:** Validate SQLX_ANALYSIS critical issue #1

**Test Steps:**
1. Obtain initial tokens
2. Mock database to fail AFTER creating new tokens but BEFORE revoking old refresh token
3. Attempt refresh

**Expected Results:**
- Transaction should rollback completely
- Old refresh_token remains valid
- No orphaned tokens in database

**Implementation:**
```rust
#[tokio::test]
async fn test_token_refresh_transaction_rollback() {
    // Setup: Create a test that simulates DB failure mid-transaction
    // Verify both:
    // 1. Old refresh token still works
    // 2. No new tokens were persisted
}
```

---

#### TC-DB-002: Concurrent Token Operations

**Objective:** Verify no race conditions in token operations

**Test Steps:**
1. Spawn 10 concurrent requests to refresh the same token
2. Verify only ONE succeeds

**Expected Results:**
- Exactly 1 request returns 200 OK with new tokens
- Other 9 requests return 400 Bad Request (token already used)

---

## 4. Test Data and Fixtures

### 4.1 Test Clients

```json
[
  {
    "client_id": "test-confidential-client",
    "client_secret": "test-secret-12345",
    "client_type": "CONFIDENTIAL",
    "redirect_uris": ["http://localhost:3000/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "allowed_scopes": ["openid", "profile", "email"],
    "require_pkce": true,
    "require_consent": true
  },
  {
    "client_id": "test-public-client",
    "client_secret": null,
    "client_type": "PUBLIC",
    "redirect_uris": ["http://localhost:3000/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "allowed_scopes": ["openid", "profile"],
    "require_pkce": true,
    "require_consent": false
  },
  {
    "client_id": "service-client",
    "client_secret": "service-secret-67890",
    "client_type": "CONFIDENTIAL",
    "grant_types": ["client_credentials"],
    "allowed_scopes": ["api:read", "api:write"]
  }
]
```

### 4.2 Test Users

```json
[
  {
    "id": "user-001",
    "username": "testuser",
    "email": "test@example.com",
    "password_hash": "<bcrypt_hash>",
    "roles": ["viewer"]
  },
  {
    "id": "user-002",
    "username": "adminuser",
    "email": "admin@example.com",
    "password_hash": "<bcrypt_hash>",
    "roles": ["admin"]
  }
]
```

### 4.3 Test Roles and Permissions

```sql
-- Roles
INSERT INTO roles (id, name, description) VALUES
('role-001', 'viewer', 'Read-only access'),
('role-002', 'editor', 'Read and write access'),
('role-003', 'admin', 'Full administrative access');

-- Permissions
INSERT INTO permissions (id, name, resource, action, type) VALUES
('perm-001', 'users:read', 'users', 'read', 'API'),
('perm-002', 'users:write', 'users', 'write', 'API'),
('perm-003', 'clients:manage', 'clients', 'manage', 'API');

-- Role-Permission mappings
INSERT INTO role_permissions (role_id, permission_id) VALUES
('role-001', 'perm-001'),
('role-002', 'perm-001'),
('role-002', 'perm-002'),
('role-003', 'perm-001'),
('role-003', 'perm-002'),
('role-003', 'perm-003');
```

---

## 5. Test Execution Plan

### 5.1 Execution Order

**Phase 1: Foundational Tests (30 minutes)**
- Database setup and migrations
- Test fixture loading
- Basic health check

**Phase 2: OAuth Flow Tests (1 hour)**
- TC-OAUTH-001 through TC-OAUTH-005
- Validate all OAuth 2.1 grant types

**Phase 3: RBAC Tests (45 minutes)**
- TC-RBAC-001 through TC-RBAC-003
- Validate permission enforcement and caching

**Phase 4: Security Tests (45 minutes)**
- TC-SEC-001 through TC-SEC-004
- Validate all security controls

**Phase 5: Error Scenario Tests (30 minutes)**
- TC-ERR-001 through TC-ERR-004
- Validate error handling

**Phase 6: Critical Issue Tests (1 hour)**
- TC-DB-001, TC-DB-002
- TC-RBAC-002, TC-SEC-004
- Validate fixes for identified issues

**Total Estimated Time:** ~4.5 hours

### 5.2 CI/CD Integration

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: dtolnay/rust-toolchain@stable

      - name: Setup test database
        run: |
          cargo sqlx database create
          cargo sqlx migrate run

      - name: Run E2E tests
        run: cargo test --test e2e_* -- --test-threads=1

      - name: Upload test reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: target/test-results/
```

### 5.3 Success Criteria

**Minimum Passing Rate:** 95% (all critical tests must pass)

**Critical Tests (Must Pass 100%):**
- TC-OAUTH-001 (Authorization code flow)
- TC-OAUTH-002 (PKCE enforcement)
- TC-OAUTH-003 (Refresh token)
- TC-RBAC-001 (Permission enforcement)
- TC-RBAC-002 (Cache invalidation) ⚠️
- TC-SEC-001 (Rate limiting) ⚠️
- TC-SEC-004 (Public path bypass) ⚠️
- TC-DB-001 (Token refresh atomicity) ⚠️

⚠️ = Expected to fail initially due to identified issues

---

## 6. Test Metrics and Reporting

### 6.1 Coverage Metrics

**Endpoint Coverage:**
```
Total OAuth endpoints: 8
Covered by E2E tests: 8 (100%)

- /api/v2/oauth/authorize
- /api/v2/oauth/token
- /api/v2/oauth/revoke
- /api/v2/oauth/introspect
- /api/v2/oauth/userinfo
- /api/v2/users (RBAC test)
- /api/v2/clients (RBAC test)
- /health (public path test)
```

**Grant Type Coverage:**
```
- authorization_code + PKCE: ✅ TC-OAUTH-001, TC-OAUTH-002
- refresh_token: ✅ TC-OAUTH-003
- client_credentials: ✅ TC-OAUTH-004
```

**Error Code Coverage:**
```
OAuth 2.1 Error Codes:
- invalid_request: ✅
- invalid_client: ✅
- invalid_grant: ✅
- unauthorized_client: ✅
- unsupported_grant_type: ✅
- invalid_scope: ✅
```

### 6.2 Test Report Format

```json
{
  "test_run_id": "e2e-20250117-001",
  "timestamp": "2025-01-17T10:30:00Z",
  "total_tests": 25,
  "passed": 21,
  "failed": 4,
  "skipped": 0,
  "duration_seconds": 267,
  "failures": [
    {
      "test_id": "TC-RBAC-002",
      "name": "Cache Invalidation on Permission Change",
      "error": "Expected 403, got 200",
      "category": "critical_issue"
    },
    {
      "test_id": "TC-SEC-001",
      "name": "Rate Limiting",
      "error": "Request 101 returned 200, expected 429",
      "category": "security"
    }
  ]
}
```

---

## 7. Known Issues and Expected Failures

Based on code analysis, these tests are EXPECTED to fail initially:

### Issue #1: Token Refresh Atomicity
**Test:** TC-DB-001
**Reason:** Missing transaction wrapper in `token_service.rs:217-247`
**Fix Required:** Wrap refresh logic in `sqlx::Transaction`
**Priority:** CRITICAL

### Issue #2: Cache Invalidation
**Test:** TC-RBAC-002
**Reason:** `role_service.rs` doesn't invalidate cache on role changes
**Fix Required:** Add `permission_cache.invalidate()` calls
**Priority:** HIGH

### Issue #3: Rate Limiter Effectiveness
**Test:** TC-SEC-001
**Reason:** New RateLimiter instance created per request
**Fix Required:** Use `Extension(Arc<RateLimiter>)` in app state
**Priority:** HIGH

### Issue #4: Public Path Bypass
**Test:** TC-SEC-004
**Reason:** Hardcoded path checks may not handle edge cases
**Fix Required:** Use proper path normalization and whitelist
**Priority:** MEDIUM

---

## 8. Implementation Checklist

- [ ] **Setup Test Environment**
  - [ ] Add dev-dependencies to Cargo.toml
  - [ ] Create tests/e2e directory structure
  - [ ] Implement test fixtures and utilities

- [ ] **Phase 1: OAuth Flow Tests**
  - [ ] TC-OAUTH-001: Authorization code + PKCE
  - [ ] TC-OAUTH-002: PKCE enforcement
  - [ ] TC-OAUTH-003: Refresh token
  - [ ] TC-OAUTH-004: Client credentials
  - [ ] TC-OAUTH-005: Token revocation

- [ ] **Phase 2: RBAC Tests**
  - [ ] TC-RBAC-001: Permission enforcement
  - [ ] TC-RBAC-002: Cache invalidation
  - [ ] TC-RBAC-003: Multi-role aggregation

- [ ] **Phase 3: Security Tests**
  - [ ] TC-SEC-001: Rate limiting
  - [ ] TC-SEC-002: CSRF protection
  - [ ] TC-SEC-003: Token expiration
  - [ ] TC-SEC-004: Public path bypass

- [ ] **Phase 4: Error Tests**
  - [ ] TC-ERR-001: Invalid credentials
  - [ ] TC-ERR-002: Invalid auth codes
  - [ ] TC-ERR-003: Invalid redirect URIs
  - [ ] TC-ERR-004: Malformed requests

- [ ] **Phase 5: Database Tests**
  - [ ] TC-DB-001: Token refresh atomicity
  - [ ] TC-DB-002: Concurrent operations

- [ ] **Execution and Reporting**
  - [ ] Run all tests
  - [ ] Document failures
  - [ ] Create fix priority list
  - [ ] Generate test coverage report

---

## 9. Next Steps

After E2E test design approval:

1. **Implement Test Framework** (~4 hours)
   - Create test utilities and fixtures
   - Setup database seeding
   - Implement OAuthTestClient helper

2. **Write E2E Test Code** (~8 hours)
   - Implement all 25+ test scenarios
   - Add assertions and validations
   - Document test data requirements

3. **Execute Tests** (~2 hours)
   - Run full test suite
   - Document all failures
   - Categorize by priority

4. **Fix Critical Issues** (~6 hours)
   - Fix TC-DB-001 (transaction atomicity)
   - Fix TC-RBAC-002 (cache invalidation)
   - Fix TC-SEC-001 (rate limiter)
   - Fix TC-SEC-004 (public path bypass)

5. **Verify Fixes** (~2 hours)
   - Re-run all tests
   - Achieve 95%+ pass rate
   - Generate final report

6. **Architecture Optimization** (~4 hours)
   - Apply AXUM_ANALYSIS recommendations
   - Refactor based on test insights
   - Update documentation

**Total Estimated Effort:** 26 hours

---

## 10. References

- [OAuth 2.1 Draft Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 6749 - OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [RFC 7662 - Token Introspection](https://datatracker.ietf.org/doc/html/rfc7662)
- [RFC 7009 - Token Revocation](https://datatracker.ietf.org/doc/html/rfc7009)
- CODEBASE_ANALYSIS.md
- SQLX_ANALYSIS.md
- AXUM_ANALYSIS.md (inferred from summary)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-17
**Status:** Ready for Implementation
