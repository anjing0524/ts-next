// __tests__/e2e/auth.login.e2e.ts
import { test, expect } from '@playwright/test';
// Attempt to import TEST_USERS. If this path is incorrect, the subtask might need to adjust it
// or the test might need to define its own user credentials if test-helpers are not E2E compatible.
// For now, we assume it might be resolvable or will be handled by the subtask environment.
// If direct import from '../utils/test-helpers' fails due to context (Vitest vs Playwright),
// it's common to have a separate e2e/support or e2e/fixtures directory for E2E-specific helpers or data.
// For this subtask, we'll try the direct import path first.

// Hardcode user credentials for E2E test if direct import of TEST_USERS is problematic
// This user MUST exist in the database when E2E tests are run (e.g., seeded user).
const validE2EUser = {
  username: process.env.E2E_TEST_USER_USERNAME || 'e2e-test-user', // Standard test user for E2E
  password: process.env.E2E_TEST_USER_PASSWORD || 'E2ePassword123!', // Standard password
};

const invalidE2EUser = {
  username: 'invalid-e2e-user',
  password: 'InvalidPassword123!',
};

test.describe('Authentication - User Login and Session', () => {
  const loginPath = '/login'; // Login page path
  const dashboardPath = '/dashboard'; // Expected redirect path after successful login

  // Before running these tests, ensure the application is running (webServer in playwright.config.ts should handle this)
  // and that the validE2EUser exists in the test database.

  test('TC_E2E_LOGIN_001: should allow a user to log in with valid credentials and access a protected route', async ({ page }) => {
    await page.goto(loginPath);

    // Fill in login form (adjust selectors based on actual UI)
    await page.fill('input[name="username"]', validE2EUser.username);
    await page.fill('input[name="password"]', validE2EUser.password);
    await page.click('button[type="submit"]'); // Assuming a standard submit button

    // Verify successful login by checking URL and a specific element on the dashboard
    await expect(page).toHaveURL(dashboardPath, { timeout: 15000 }); // Increased timeout for page load and potential redirects

    // Check for a welcoming element or user-specific information
    // Example: await expect(page.locator('text=Welcome back, ' + validE2EUser.username)).toBeVisible();
    // For now, a generic check for a dashboard heading
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });


    // Optional: Verify session persistence (e.g., an auth cookie is set)
    const cookies = await page.context().cookies();
    // The actual cookie name might vary based on your auth setup (e.g., 'next-auth.session-token', 'auth_token')
    const sessionCookie = cookies.find(cookie => cookie.name === 'auth_token' || cookie.name.includes('session'));
    expect(sessionCookie).toBeDefined();
    // Add more specific cookie assertions if needed (e.g., httpOnly, secure in production)
    // For example, if 'auth_token' is the specific HttpOnly cookie:
    // const authTokenCookie = cookies.find(cookie => cookie.name === 'auth_token');
    // expect(authTokenCookie).toBeDefined();
    // if (authTokenCookie) { // Type guard
    //   expect(authTokenCookie.httpOnly).toBeTruthy();
    // }
  });

  test('TC_E2E_LOGIN_002: should show an error message for invalid credentials', async ({ page }) => {
    await page.goto(loginPath);

    // Fill in login form with invalid credentials
    await page.fill('input[name="username"]', invalidE2EUser.username);
    await page.fill('input[name="password"]', invalidE2EUser.password);
    await page.click('button[type="submit"]');

    // Verify error message is displayed (adjust selector and text as per actual UI)
    // Common patterns for error messages: class name, data-testid, or role="alert"
    const errorMessageLocator = page.locator('[data-testid="login-error-message"], .error-message, [role="alert"]');
    await expect(errorMessageLocator.first()).toBeVisible({ timeout: 10000 });
    // Check for common error texts, case-insensitive
    await expect(errorMessageLocator.first()).toContainText(/Invalid credentials|Invalid username or password|登录失败/i);


    // Verify still on the login page
    await expect(page).toHaveURL(loginPath, { timeout: 5000 });
  });

  test('TC_E2E_LOGIN_003: should redirect to login page when accessing a protected route without authentication', async ({ page }) => {
    await page.goto(dashboardPath); // Try to access protected page directly

    // Verify redirection to the login page
    // The URL should be the loginPath, and might include a redirect_uri query parameter
    const expectedLoginUrlPattern = new RegExp(`^${loginPath}(\\?redirect_uri=${encodeURIComponent(dashboardPath)})?$`);
    await expect(page).toHaveURL(expectedLoginUrlPattern, { timeout: 10000 });
  });
});
