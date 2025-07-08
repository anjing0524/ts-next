import { test, expect, Page } from '@playwright/test';

const ADMIN_PORTAL_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
const OAUTH_SERVICE_URL = process.env.NEXT_PUBLIC_OAUTH_SERVICE_URL || 'http://localhost:3001/datamgr_flow';

test.describe('Admin Portal OAuth Integration', () => {

  test('should redirect unauthenticated user to login page', async ({ page }) => {
    await page.goto(`${ADMIN_PORTAL_URL}/admin`);
    await page.waitForURL(`${ADMIN_PORTAL_URL}/login**`);
    await page.waitForSelector('[data-testid="login-oauth-button"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="login-oauth-button"]')).toBeVisible();
  });

  test('should allow a user to log in, see the dashboard, and log out', async ({ page }) => {
    // 1. Start login flow
    await page.goto(`${ADMIN_PORTAL_URL}/login`);
    await page.waitForSelector('[data-testid="login-oauth-button"]', { timeout: 10000 });
    await page.locator('[data-testid="login-oauth-button"]').click();

    // 2. Handle login and consent on oauth-service
    await page.waitForURL(`${OAUTH_SERVICE_URL}/api/v2/oauth/authorize**`);
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'adminpassword');
    await page.click('button[type="submit"]');
    
    // Handle consent if it appears
    try {
      await page.waitForURL('**/oauth/consent**', { timeout: 5000 });
      await page.click('button:has-text("同意并授权")');
    } catch (e) {
      // Ignore if consent is skipped
    }

    // 3. Verify successful login and dashboard access
    await page.waitForURL(`${ADMIN_PORTAL_URL}/admin**`);
    await expect(page.locator('h1')).toContainText('Dashboard');

    // 4. Logout
    await page.click('[data-testid="user-menu-button"]');
    await page.click('[data-testid="logout-button"]');

    // 5. Verify successful logout
    await page.waitForURL(`${ADMIN_PORTAL_URL}/login**`);
    await page.waitForSelector('[data-testid="login-oauth-button"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="login-oauth-button"]')).toBeVisible();
  });
});