# E2E Testing Guide - OAuth 2.1 Integration

This guide explains how to run the E2E tests for the admin-portal OAuth 2.1 integration with Pingora proxy.

## Prerequisites

### Services Required

All three services must be running before executing tests:

1. **oauth-service-rust** (Port 3001)
2. **admin-portal** (Port 3002)
3. **pingora-proxy** (Port 6188)

### Environment Setup

1. **Test User Data**
   - Username: `admin`
   - Password: `admin123`
   - Verify this user exists in the database

2. **Environment Variables**
   ```bash
   # For E2E tests (optional, defaults provided)
   PLAYWRIGHT_TEST_BASE_URL=http://localhost:6188
   TEST_ADMIN_USERNAME=admin
   TEST_ADMIN_PASSWORD=admin123
   ```

3. **Network Configuration**
   - Ensure Pingora is properly configured to route:
     - `/api/v2/oauth/*` → oauth-service-rust (3001)
     - `/api/v2/auth/*` → oauth-service-rust (3001)
     - `/login` → admin-portal (3002)
     - `/auth/*` → admin-portal (3002)
     - `/oauth/consent` → admin-portal (3002)
     - `/*` (default) → admin-portal (3002)

## Quick Start

### Option 1: Using Helper Script (Recommended)

```bash
# Make sure you're in the admin-portal directory
cd apps/admin-portal

# Run tests with automatic service setup
./run-oauth-e2e-tests.sh
```

### Option 2: Manual Service Setup

```bash
# Terminal 1: Start oauth-service-rust
cd apps/oauth-service-rust
cargo run

# Terminal 2: Start admin-portal
cd apps/admin-portal
pnpm dev

# Terminal 3: Start Pingora proxy
cd apps/pingora-proxy
cargo run

# Terminal 4: Run Playwright tests
cd apps/admin-portal
pnpm test:e2e
```

## Running Tests

### All Tests (Default)
```bash
pnpm test:e2e
```

### Specific Test File
```bash
pnpm test:e2e auth-flow.spec.ts
```

### Specific Test Scenario
```bash
pnpm test:e2e -g "Complete OAuth flow"
```

### With UI Mode (Interactive)
```bash
pnpm test:e2e --ui
```

### With Browser Visible (Headed Mode)
```bash
pnpm test:e2e --headed
```

### Debug Mode
```bash
pnpm test:e2e --debug
```

## Test Scenarios

### Scenario 1: Complete OAuth Flow
- **What it tests**: Full authentication journey
- **Steps**:
  1. Access protected route `/admin`
  2. Middleware initiates OAuth authorize
  3. Redirected to login page
  4. Enter credentials (admin/admin123)
  5. OAuth Service validates and sets session
  6. Redirected back to authorize endpoint
  7. Authorization code generated and exchanged for tokens
  8. Redirected to original protected route
  9. Verify dashboard is accessible

**Pass Criteria**:
- Ends on `/admin` with Dashboard visible
- No errors in console

### Scenario 2: Invalid Credentials
- **What it tests**: Error handling for wrong password
- **Steps**:
  1. Access protected route
  2. Fill login form with invalid credentials
  3. Submit form

**Pass Criteria**:
- Remains on `/login`
- Error message displayed: "用户名或密码错误，请重试。"

### Scenario 3: CSRF Protection
- **What it tests**: State parameter validation against CSRF attacks
- **Steps**:
  1. Attempt to access callback with invalid state parameter
  2. Page should show error

**Pass Criteria**:
- Error message displayed about invalid/CSRF
- Not accepted as valid authorization

### Scenario 4: Already Authenticated User
- **What it tests**: Direct access with valid tokens
- **Steps**:
  1. Complete full login flow
  2. Open new tab/page with same cookies
  3. Access protected route

**Pass Criteria**:
- No redirect to login required
- Direct access to protected page

### Scenario 5: Pingora Routing
- **What it tests**: All traffic routes through Pingora proxy
- **Steps**:
  1. Monitor all network requests during auth flow
  2. Verify no direct requests to backend service ports

**Pass Criteria**:
- No requests to localhost:3001 (oauth-service direct)
- No requests to localhost:3002 (admin-portal direct)
- All requests to localhost:6188 (Pingora)

**Failure Diagnosis**:
- If you see requests to 3001/3002 directly, check Pingora configuration
- Verify baseURL in playwright.config.ts: `http://localhost:6188`
- Check environment variables in callback/page.tsx

### Scenario 6: Session Timeout
- **What it tests**: Re-authentication when tokens expire
- **Steps**:
  1. Complete login flow
  2. Clear all cookies to simulate expiration
  3. Access protected route again

**Pass Criteria**:
- Redirected back to login or authorize flow
- Can log in again successfully

## Test Results

### Viewing Results

After tests complete:

1. **Console Output**
   ```bash
   # Shows pass/fail status for each test
   ```

2. **JSON Report**
   ```bash
   # Detailed results in test-results.json
   cat test-results.json
   ```

3. **HTML Report**
   ```bash
   # Open interactive report
   npx playwright show-report
   ```

### Troubleshooting

#### Test Timeout Issues
- **Symptom**: "Timeout waiting for URL"
- **Cause**: Redirect chain taking too long or services not responding
- **Fix**:
  1. Verify all services are running: `ps aux | grep cargo`
  2. Check Pingora logs for routing errors
  3. Increase timeout in playwright.config.ts: `navigationTimeout: 60000`

#### Login Form Not Found
- **Symptom**: "getByTestId('username-input') - not found"
- **Cause**: Redirect didn't lead to login page as expected
- **Fix**:
  1. Check OAuth Service is correctly redirecting to admin-portal
  2. Verify `/login` page exists and loads correctly
  3. Check browser console for errors

#### Cookie Issues
- **Symptom**: Token storage or CSRF state errors
- **Cause**: Cookies not persisting across redirects
- **Fix**:
  1. Verify SameSite=Lax in cookie settings
  2. Check Pingora domain configuration
  3. Ensure HttpOnly flags are set correctly

#### Pingora Routing Failures
- **Symptom**: "requests to localhost:3001 detected"
- **Cause**: Service URLs not configured for Pingora
- **Fix**:
  1. Update environment variable: `NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188`
  2. Check middleware.ts redirect URLs
  3. Verify callback/page.tsx uses apiRequest() for all API calls

## Key Configuration Points

### playwright.config.ts
```typescript
use: {
  baseURL: 'http://localhost:6188',  // Must use Pingora port
  actionTimeout: 30000,
  navigationTimeout: 30000,
  trace: 'retain-on-failure',
}
```

### Environment Variables (for testing)
```bash
NEXT_PUBLIC_OAUTH_SERVICE_URL=http://localhost:6188
NEXT_PUBLIC_OAUTH_CLIENT_ID=auth-center-admin-client
NEXT_PUBLIC_OAUTH_REDIRECT_URI=http://localhost:6188/auth/callback
```

### Testing Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Clear cookies between scenarios if needed
3. **Waits**: Use `waitForURL()` instead of `waitForTimeout()`
4. **Selectors**: Use `getByTestId()` for reliability
5. **Logging**: Check console output for detailed error messages

## Continuous Integration

For CI/CD pipelines:

```bash
# Environment variables for CI
export CI=true
export PLAYWRIGHT_TEST_BASE_URL=http://localhost:6188
export TEST_ADMIN_USERNAME=admin
export TEST_ADMIN_PASSWORD=admin123

# Run tests without UI (headless)
pnpm test:e2e

# Check exit code
echo $?
```

## Advanced: Custom Test Configuration

To add new test scenarios or modify existing ones:

1. Edit `tests/e2e/auth-flow.spec.ts`
2. Follow the existing test structure and patterns
3. Use test.step() for sub-steps
4. Add proper comments explaining the test intent
5. Verify test.step descriptions are clear

Example:
```typescript
test('New scenario: My test case', async ({ page }) => {
  await test.step('Step 1: Do something', async () => {
    await page.goto(baseUrl + '/some-path');
  });

  await test.step('Step 2: Verify result', async () => {
    await expect(page.getByText('Expected text')).toBeVisible();
  });
});
```

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-09)
- [PKCE Details](https://datatracker.ietf.org/doc/html/rfc7636)
- Project Architecture: See `notes.md` in this directory
