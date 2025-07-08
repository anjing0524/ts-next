import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../../tests/helpers/auth-helpers';

test.describe('Logout Flow E2E Test', () => {
  test.beforeEach(async ({ page }) => {
    // 确保开始前是登录状态
    await AuthHelpers.loginAsUser(page, 'system.admin', 'Test123!@#');
    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should correctly logout, revoke token, and redirect to login', async ({ page, context }) => {
    // 1. 获取注销前的Token
    const tokensBeforeLogout = await AuthHelpers.getAuthTokens(context);
    expect(tokensBeforeLogout.accessToken).not.toBeNull();

    // 2. 点击注销按钮
    const logoutButton = page.locator('button:has-text("Logout")');
    await logoutButton.click();

    // 3. 验证是否重定向到登录页
    await page.waitForURL('**/login', { timeout: 10000 });
    await page.waitForSelector('[data-testid="login-oauth-button"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="login-oauth-button"]')).toBeVisible();

    // 4. 验证本地Token是否被清除
    const tokensAfterLogout = await AuthHelpers.getAuthTokens(context);
    expect(tokensAfterLogout.accessToken).toBeNull();
    expect(tokensAfterLogout.refreshToken).toBeNull();

    // 5. 尝试使用旧的访问令牌访问受保护的API
    const apiContext = await context.request;
    const response = await apiContext.get('/api/v2/users/me', {
      headers: {
        'Authorization': `Bearer ${tokensBeforeLogout.accessToken}`,
      },
    });

    // 6. 验证API调用失败 (因为令牌已被撤销)
    expect(response.status()).toBe(401);
  });
});
