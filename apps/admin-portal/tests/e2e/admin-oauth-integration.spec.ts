
import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TestDataManager } from '../helpers/test-data';

test.describe('Admin Portal - OAuth Service Integration', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await TestDataManager.cleanupTestData();
    await TestDataManager.createTestUser({
      username: 'e2e-admin',
      password: 'password123',
      roles: ['SYSTEM_ADMIN'],
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('should complete the full login, protected route access, and logout flow', async () => {
    // 1. Start login flow from admin-portal
    await page.goto('/login');
    const loginButton = page.locator('[data-testid="login-oauth-button"]');
    await expect(loginButton).toBeVisible({ timeout: 10000 });
    await loginButton.click();

    // 2. Handle login and consent on oauth-service page
    await page.waitForURL('**/api/v2/oauth/authorize**', { timeout: 15000 });
    
    // Fill in credentials on the oauth-service login form
    await page.fill('input[name="username"]', 'e2e-admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Handle consent screen
    await page.waitForURL('**/oauth/consent**', { timeout: 10000 });
    await page.click('button:has-text("同意并授权")');

    // 3. Verify redirection and successful login in admin-portal
    await page.waitForURL('**/admin', { timeout: 10000 });
    await expect(page.locator('nav').getByText('用户管理')).toBeVisible();
    const accessToken = await page.evaluate(() => window.localStorage.getItem('auth_token'));
    expect(accessToken).not.toBeNull();

    // 4. Access a protected route
    await page.goto('/admin/users');
    await expect(page.locator('h1')).toContainText('用户管理');
    
    // 5. Logout
    const logoutButton = page.locator('button', { hasText: '登出' });
    await logoutButton.click();

    // 6. Verify logout was successful
    await expect(page).toHaveURL('/login', { timeout: 10000 });
  });
});
