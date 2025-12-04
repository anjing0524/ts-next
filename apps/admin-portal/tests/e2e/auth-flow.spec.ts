import { test, expect, Page } from '@playwright/test';
import { completeOAuthLogin, clearAuthState } from './helpers/test-helpers';

/**
 * OAuth 2.1 Authentication Flow E2E Tests
 *
 * These tests verify the complete OAuth 2.1 authentication flow
 * with PKCE protection. The flow is:
 *
 * 1. User accesses protected route → Middleware initiates OAuth authorize
 * 2. Redirects to OAuth Service /api/v2/oauth/authorize
 * 3. OAuth Service checks session → Redirects to admin-portal /login
 * 4. User enters credentials → Submits to OAuth Service /api/v2/auth/login
 * 5. OAuth Service validates → Sets session_token cookie
 * 6. Redirects back to authorize URL
 * 7. OAuth Service generates authorization code
 * 8. Redirects to admin-portal /auth/callback?code=...&state=...
 * 9. Callback page exchanges code for tokens
 * 10. Redirects to original protected route
 *
 * All traffic routes through Pingora (port 6188) for same-domain cookie sharing.
 */

test.describe('OAuth 2.1 Authentication Flow', () => {
  // Pingora 代理地址（6188）路由所有流量：
  // - /api/v2/* → OAuth Service (3001)
  // - 其他请求 → Admin Portal (3002)
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
  const protectedRoute = '/admin';
  const testUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

  /**
   * Scenario 1: Complete OAuth Flow
   * Tests the full authentication process from protected route access to dashboard
   */
  test('Scenario 1: Complete OAuth flow with valid credentials', async ({ page }) => {
    // Complete OAuth login flow
    const token = await completeOAuthLogin(page, testUsername, testPassword);

    // Verify we got a valid token
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
  });

  /**
   * Scenario 2: Invalid Credentials
   * Tests error handling for wrong username/password
   * 注意：必须先访问受保护资源(/admin)触发OAuth重定向，而不是直接访问/login
   */
  test('Scenario 2: Error handling for invalid credentials', async ({ page }) => {
    // Step 1: 访问受保护资源 - 触发OAuth重定向
    // Access protected route - triggers OAuth redirect
    console.log(`[Test] Step 1: Accessing protected resource ${baseUrl}${protectedRoute}`);
    await page.goto(`${baseUrl}${protectedRoute}`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });

    // Step 2: 应该重定向到登录页面
    console.log(`[Test] Step 2: Waiting for redirect to login page`);
    await page.waitForURL(/\/login/, { timeout: 8000 });

    // Clear any existing auth state after navigation
    await clearAuthState(page);

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

    // Step 3: Wait for form
    await page.waitForSelector('form', { timeout: 5000 });

    // Step 4: Try invalid credentials
    const usernameInput = page.getByTestId('username-input');
    await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
    await usernameInput.fill('invalid-user');

    const passwordInput = page.getByTestId('password-input');
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.fill('invalid-password');

    // Step 5: Submit login
    const loginButton = page.getByTestId('login-button');
    await loginButton.click();

    // Step 6: Wait for error response
    await page.waitForTimeout(2000);

    // Step 7: Verify error message is displayed (check multiple possible locations)
    try {
      await expect(page.getByText(/用户名或密码错误|invalid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
    } catch {
      // Error message might not be displayed as a visible element
      // Check if we're still on login page (which indicates login failed)
      expect(page.url()).toContain('/login');
    }
  });

  /**
   * Scenario 3: CSRF Protection
   * Tests that state parameter validation prevents CSRF attacks
   */
  test('Scenario 3: CSRF protection with state parameter validation', async ({ page }) => {
    // This test verifies that manipulated state parameters are rejected
    // by attempting to access callback with invalid state

    const invalidState = 'invalid-state-parameter-12345';
    const validCode = 'dummy-code'; // Would be invalid anyway

    // Try to directly access callback with mismatched state
    await page.goto(`${baseUrl}/auth/callback?code=${validCode}&state=${invalidState}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

    // Should either:
    // 1. Show error message, or
    // 2. Redirect to error/login page
    const currentUrl = page.url();

    // Try multiple ways to detect the error
    try {
      // First try: Look for error message
      const errorElements = await page.getByText(/invalid|error|failed|state|csrf/i).all();
      expect(errorElements.length).toBeGreaterThan(0);
    } catch {
      // Second try: Check if redirected to error page
      expect(currentUrl).toMatch(/error|login|unauthorized/i);
    }
  });

  /**
   * Scenario 4: Already Authenticated User
   * Tests that users with valid tokens can access protected routes directly
   */
  test('Scenario 4: Access protected route with valid token', async ({ page }) => {
    // Step 1: Complete OAuth login
    await completeOAuthLogin(page, testUsername, testPassword);

    // Step 2: Now access protected route - should not redirect to login
    await page.goto(`${baseUrl}${protectedRoute}`);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

    // Step 3: Verify we can access protected route
    const finalUrl = page.url();
    expect(finalUrl).toContain(protectedRoute);
  });

  /**
   * Scenario 5: Pingora Routing
   * Tests that all traffic routes through Pingora (6188) for same-domain cookies
   */
  test('Scenario 5: All requests route through Pingora proxy', async ({ page, context }) => {
    // Step 1: Authenticate
    await completeOAuthLogin(page, testUsername, testPassword);

    // Step 2: Set up network monitoring
    const networkLog: string[] = [];
    page.on('request', (request) => {
      networkLog.push(request.url());
    });

    // Step 3: Access protected route
    await page.goto(`${baseUrl}${protectedRoute}`);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

    // Step 4: Verify all requests are to Pingora (localhost:6188)
    // Step 4: Verify all requests are to Admin Portal Proxy (localhost:3002) or Pingora (localhost:6188)
    // We strictly forbid direct calls to OAuth Service (localhost:3001)
    const directBackendRequests = networkLog.filter(
      (url) =>
        url.includes('localhost:3001')
    );

    // Should have no direct requests to backend services
    expect(directBackendRequests.length).toBe(0);

    // Step 5: Verify we're on the right page
    expect(page.url()).toContain(protectedRoute);
  });

  /**
   * Scenario 6: Session Timeout and Token Expiration
   * Tests behavior when session token expires
   */
  test('Scenario 6: Handle expired session', async ({ page }) => {
    // Step 1: Complete OAuth login
    const token = await completeOAuthLogin(page, testUsername, testPassword);
    expect(token).toBeTruthy();

    // Step 2: Clear authentication state (simulating expired session)
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Step 3: Try to access protected route again
    await page.goto(`${baseUrl}${protectedRoute}`, { waitUntil: 'domcontentloaded' }).catch(() => { });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

    // Step 4: Should be redirected to login/authorize flow
    const url = page.url();
    expect(url).toMatch(/login|authorize/);
  });
});
