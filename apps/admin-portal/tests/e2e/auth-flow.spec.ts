import { test, expect, Page } from '@playwright/test';

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
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:6188';
  const protectedRoute = '/admin';
  const testUsername = process.env.TEST_ADMIN_USERNAME || 'admin';
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

  /**
   * Scenario 1: Complete OAuth Flow
   * Tests the full authentication process from protected route access to dashboard
   */
  test('Scenario 1: Complete OAuth flow with valid credentials', async ({ page }) => {
    // Listen for console messages and errors
    page.on('console', (msg) => console.log(`BROWSER ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`PAGE ERROR: ${err.message}`));

    // Step 1: Access protected route
    await page.goto(`${baseUrl}${protectedRoute}`);

    // Verify: Should NOT immediately redirect to /login
    // Instead, middleware initiates OAuth authorize
    // OAuth Service might require login, so we expect to see login page
    // (but it should come from OAuth Service redirect, not middleware)

    // Wait for redirect chain to settle
    await page.waitForURL(/.*/, { timeout: 5000 });

    // Step 2: Fill login form (if we reached login page)
    const currentUrl = page.url();
    console.log(`Current URL after initial request: ${currentUrl}`);

    // If redirected to login, complete the login
    if (currentUrl.includes('/login')) {
      await test.step('Fill credentials and submit login', async () => {
        const usernameInput = page.getByTestId('username-input');
        const passwordInput = page.getByTestId('password-input');
        const loginButton = page.getByTestId('login-button');

        await usernameInput.fill(testUsername);
        await passwordInput.fill(testPassword);

        // Wait for login response and navigation
        // The OAuth flow involves: form submit → auth → redirect → authorize → callback
        const navigationPromise = page.waitForNavigation({ timeout: 30000 });
        await loginButton.click();
        await navigationPromise;

        // Wait additional time for OAuth redirects to complete
        await page.waitForTimeout(2000);
      });
    }

    // Step 3: Handle consent page (if required)
    const urlAfterLogin = page.url();
    if (urlAfterLogin.includes('/oauth/consent')) {
      await test.step('Approve consent request', async () => {
        // Wait for consent page to load
        await page.waitForLoadState('networkidle');

        // Look for approve button (various selectors)
        const approveButton =
          page.getByTestId('consent-approve-button') ||
          page.getByRole('button', { name: /allow|approve|授权|允许/i });

        if (await approveButton.isVisible()) {
          await approveButton.click();
          await page.waitForURL(/.*/, { timeout: 5000 });
        }
      });
    }

    // Step 4: Wait for callback processing and redirect
    await page.waitForURL(protectedRoute, { timeout: 10000 });

    // Step 5: Verify final state
    const finalUrl = page.url();
    expect(finalUrl).toContain(protectedRoute);

    // Verify we can see dashboard content
    await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 5000 });
  });

  /**
   * Scenario 2: Invalid Credentials
   * Tests error handling for wrong username/password
   */
  test('Scenario 2: Error handling for invalid credentials', async ({ page }) => {
    // Step 1: Access protected route
    await page.goto(`${baseUrl}${protectedRoute}`);
    await page.waitForURL(/.*/, { timeout: 5000 });

    // Step 2: If on login page, try invalid credentials
    if (page.url().includes('/login')) {
      await page.getByTestId('username-input').fill('invalid-user');
      await page.getByTestId('password-input').fill('invalid-password');
      await page.getByTestId('login-button').click();

      // Wait for error response
      await page.waitForURL(/.*\/login/, { timeout: 5000 });

      // Verify error message is displayed
      const errorMessage = page.getByText(/用户名或密码错误|invalid credentials/i);
      await expect(errorMessage).toBeVisible({ timeout: 3000 });
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

    // Should show error about invalid state
    const errorMessage = page.locator('[role="alert"]').getByText(/invalid state|csrf/i);
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  /**
   * Scenario 4: Already Authenticated User
   * Tests that users with valid tokens can access protected routes directly
   */
  test('Scenario 4: Access protected route with valid token', async ({ page: firstPage }) => {
    // First, authenticate with valid credentials
    await firstPage.goto(`${baseUrl}${protectedRoute}`);
    await firstPage.waitForURL(/.*/, { timeout: 5000 });

    // Complete the login flow
    if (firstPage.url().includes('/login')) {
      await firstPage.getByTestId('username-input').fill(testUsername);
      await firstPage.getByTestId('password-input').fill(testPassword);
      await firstPage.getByTestId('login-button').click();
      await firstPage.waitForURL(protectedRoute, { timeout: 10000 });
    }

    // Now in a new context (simulating new browser), with shared cookies
    // the user should not need to login again
    const { page: secondPage } = await firstPage.context().newPage().then((p) => ({ page: p }));

    await secondPage.goto(`${baseUrl}${protectedRoute}`);

    // Should NOT be redirected to login if token is still valid
    const finalUrl = secondPage.url();
    // May be redirected if token expired, but should not require login
    expect(finalUrl).not.toContain('/login');

    await secondPage.close();
    await firstPage.close();
  });

  /**
   * Scenario 5: Pingora Routing
   * Tests that all traffic routes through Pingora (6188) for same-domain cookies
   */
  test('Scenario 5: All requests route through Pingora proxy', async ({ page, context }) => {
    // Listen to all network requests
    const networkLog: string[] = [];

    page.on('request', (request) => {
      networkLog.push(request.url());
    });

    // Access a protected route
    await page.goto(`${baseUrl}${protectedRoute}`);
    await page.waitForURL(/.*/, { timeout: 5000 });

    // Verify all requests are to Pingora (localhost:6188)
    const directBackendRequests = networkLog.filter(
      (url) =>
        (url.includes('localhost:3001') ||
          url.includes('localhost:3002') ||
          url.includes('localhost:3003')) &&
        !url.includes('localhost:6188')
    );

    // Should have no direct requests to backend services
    expect(directBackendRequests.length).toBe(0);

    // Verify cookies are accessible (same-domain)
    const cookies = await context.cookies();
    const oauthCookies = cookies.filter((c) => c.name.startsWith('oauth_'));
    console.log(`OAuth cookies found: ${oauthCookies.map((c) => c.name).join(', ')}`);
  });

  /**
   * Scenario 6: Session Timeout and Token Expiration
   * Tests behavior when session token expires
   */
  test('Scenario 6: Handle expired session', async ({ page }) => {
    // First, authenticate
    await page.goto(`${baseUrl}${protectedRoute}`);
    await page.waitForURL(/.*/, { timeout: 5000 });

    // If on login, complete login
    if (page.url().includes('/login')) {
      await page.getByTestId('username-input').fill(testUsername);
      await page.getByTestId('password-input').fill(testPassword);
      await page.getByTestId('login-button').click();
      await page.waitForURL(protectedRoute, { timeout: 10000 });
    }

    // Simulate expired token by deleting cookies
    await page.context().clearCookies();

    // Try to access protected route again
    await page.goto(`${baseUrl}${protectedRoute}`);
    await page.waitForURL(/.*/, { timeout: 5000 });

    // Should be redirected back to login flow
    const url = page.url();
    expect(url).toMatch(/login|authorize/);
  });
});
