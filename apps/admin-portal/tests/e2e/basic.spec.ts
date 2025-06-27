import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../helpers/auth-helpers';
import { TestDataManager } from '../helpers/test-data';

/**
 * 基础功能测试
 * 验证admin-portal的基本功能和测试环境配置
 */
test.describe('基础功能测试', () => {
  test.beforeEach(async ({ page }) => {
    // 清理浏览器存储
    await AuthHelpers.clearStorage(page);
  });

  test('应用启动和登录页面加载', async ({ page }) => {
    // 访问应用首页
    await page.goto('/');

    // 应该重定向到登录页面
    await expect(page).toHaveURL(/.*\/login/);

    // 验证登录页面元素
    await expect(page.locator('text=Admin Center Login')).toBeVisible();
    await expect(page.locator('button:has-text("Sign In with OAuth 2.0")')).toBeVisible();

    // 验证OAuth配置信息显示
    await expect(page.locator('text=OAuth 2.1 + PKCE')).toBeVisible();
    await expect(page.locator('text=admin / adminpassword')).toBeVisible();
  });

  test('OAuth配置正确加载', async ({ page }) => {
    await page.goto('/login');

    // 点击登录按钮，检查是否正确跳转到OAuth服务
    await page.click('button:has-text("Sign In with OAuth 2.0")');

    // 等待重定向，验证URL包含正确的OAuth参数
    await page.waitForURL('**/api/v2/oauth/authorize**', { timeout: 10000 });

    const currentUrl = page.url();
    const url = new URL(currentUrl);

    // 验证OAuth授权参数
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('auth-center-admin-client');
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  test('测试数据验证', async () => {
    // 验证测试数据完整性
    const validation = TestDataManager.validateTestData();
    expect(validation.valid).toBe(true);

    if (!validation.valid) {
      console.error('测试数据验证失败:', validation.errors);
    }

    // 验证用户凭据
    const adminUser = TestDataManager.getUserCredentials('admin');
    expect(adminUser.username).toBe('admin');
    expect(adminUser.password).toBe('adminpassword');
    expect(adminUser.permissions).toContain('admin:full_access');

    // 验证客户端配置
    const adminClient = TestDataManager.getClientConfig('adminPortal');
    expect(adminClient.clientId).toBe('auth-center-admin-client');
    expect(adminClient.grantTypes).toContain('authorization_code');
  });

  test('页面响应性测试', async ({ page }) => {
    // 测试桌面端视图
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/login');

    const loginCard = page.locator('.card, [data-testid="login-card"]').first();
    await expect(loginCard).toBeVisible();

    // 测试移动端视图
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    // 验证移动端布局正常
    await expect(loginCard).toBeVisible();
    await expect(page.locator('button:has-text("Sign In with OAuth 2.0")')).toBeVisible();
  });

  test('错误处理测试', async ({ page }) => {
    await page.goto('/login');

    // 模拟网络错误情况
    await page.route('**/api/v2/oauth/authorize**', (route) => {
      route.abort('failed');
    });

    // 点击登录按钮
    await page.click('button:has-text("Sign In with OAuth 2.0")');

    // 等待错误状态
    await page.waitForTimeout(2000);

    // 验证页面仍然可用（不会白屏或崩溃）
    await expect(page.locator('button:has-text("Sign In with OAuth 2.0")')).toBeVisible();
  });

  test('无障碍访问测试', async ({ page }) => {
    await page.goto('/login');

    // 检查重要元素的可访问性属性
    const loginButton = page.locator('button:has-text("Sign In with OAuth 2.0")');
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toBeEnabled();

    // 验证键盘导航
    await page.keyboard.press('Tab');
    await expect(loginButton).toBeFocused();

    // 验证Enter键可以触发登录
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // 应该开始OAuth流程
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
      // 说明已经跳转，OAuth流程启动成功
      expect(currentUrl).toContain('authorize');
    }
  });

  test('浏览器兼容性基础检查', async ({ page, browserName }) => {
    await page.goto('/login');

    // 验证基础JavaScript功能
    const jsWorks = await page.evaluate(() => {
      return (
        typeof window !== 'undefined' &&
        typeof document !== 'undefined' &&
        typeof localStorage !== 'undefined' &&
        typeof sessionStorage !== 'undefined'
      );
    });

    expect(jsWorks).toBe(true);

    // 验证CSS支持
    const loginCard = page.locator('.card, [class*="card"]').first();
    if ((await loginCard.count()) > 0) {
      const styles = await loginCard.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          position: computed.position,
        };
      });

      expect(styles.display).not.toBe('');
    }

    console.log(`✅ 基础兼容性检查通过 - ${browserName}`);
  });
});
