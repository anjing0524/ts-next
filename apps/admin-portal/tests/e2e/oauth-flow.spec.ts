import { test, expect } from '@playwright/test';

/**
 * Admin Portal OAuth认证流程端到端测试
 * 测试完整的OAuth2.1认证流程和用户交互
 */
test.describe('Admin Portal OAuth认证流程', () => {
  test.beforeEach(async ({ page }) => {
    // 确保每个测试开始时都是干净的状态
    await page.context().clearCookies();
    await page.context().clearPermissions();
  });

  test('用户应该能够访问登录页面', async ({ page }) => {
    // 访问登录页面
    await page.goto('/login');

    // 验证页面标题和基本元素
    await expect(page).toHaveTitle(/Admin Portal Login|Sign In|登录/);
    await expect(page.locator('h1, h2')).toContainText(/Admin Portal Login|登录|认证中心/);

    // 验证登录表单存在
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('用户应该能够完成登录流程', async ({ page }) => {
    // 访问登录页面
    await page.goto('/login');

    // 填写登录表单
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');

    // 提交表单
    await page.click('button[type="submit"]');

    // 等待重定向或页面变化
    await page.waitForLoadState('networkidle');

    // 验证登录成功（可能重定向到OAuth授权页面或仪表盘）
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/admin|\/dashboard|\/authorize|\/callback/);
  });

  test('无效凭据应该显示错误信息', async ({ page }) => {
    // 访问登录页面
    await page.goto('/login');

    // 填写无效凭据
    await page.fill('input[name="username"]', 'invalid_user');
    await page.fill('input[name="password"]', 'invalid_password');

    // 提交表单
    await page.click('button[type="submit"]');

    // 等待错误信息显示
    await page.waitForTimeout(2000);

    // 验证错误信息显示
    const errorMessage = page.locator('[role="alert"], .alert, .error-message');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('OAuth回调应该正常处理', async ({ page }) => {
    // 模拟从OAuth服务返回的授权码
    const mockAuthCode = 'test_auth_code_123';
    const mockState = 'test_state_456';

    // 设置必要的session storage（模拟PKCE参数）
    await page.goto('/login');
    await page.evaluate(() => {
      sessionStorage.setItem('oauth_code_verifier', 'test_code_verifier');
      sessionStorage.setItem('oauth_state', 'test_state_456');
    });

    // 拦截token交换请求并返回模拟token
    await page.route('**/api/v2/oauth/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });
    });

    // 访问回调URL（模拟OAuth服务重定向）
    const callbackUrl = `/auth/callback?code=${mockAuthCode}&state=${mockState}`;
    await page.goto(callbackUrl);
    await page.waitForLoadState('networkidle');

    // 验证成功重定向到管理页面
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/admin/);
  });

  test('OAuth回调错误应该正确处理', async ({ page }) => {
    // 测试OAuth错误回调
    const callbackUrl =
      '/auth/callback?error=access_denied&error_description=User%20denied%20access';

    await page.goto(callbackUrl);
    await page.waitForLoadState('networkidle');

    // 验证错误信息显示
    const errorAlert = page.locator('[role="alert"], .alert-destructive');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText(/denied|access/i);

    // 验证返回登录按钮存在
    const returnButton = page.locator(
      'button:has-text("Return to Login"), button:has-text("返回登录")'
    );
    await expect(returnButton).toBeVisible();
  });

  test('Token存储应该安全处理', async ({ page }) => {
    // 登录并获取token
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');

    // 拦截token请求并返回模拟响应
    await page.route('**/api/v2/oauth/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });
    });

    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // 验证token被正确存储在cookie中（而不是localStorage）
    const cookies = await page.context().cookies();
    const authCookie = cookies.find((cookie) => cookie.name === 'auth_token');
    expect(authCookie).toBeDefined();

    // 验证sessionStorage中有refresh token
    const refreshToken = await page.evaluate(() => sessionStorage.getItem('refresh_token'));
    expect(refreshToken).toBeTruthy();

    // 验证localStorage中没有敏感信息
    const localStorageAuth = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(localStorageAuth).toBeNull();
  });
});
