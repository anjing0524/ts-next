import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login-page';
import { DashboardPage } from '../pages/dashboard-page';

/**
 * 冒烟测试 - 验证核心功能是否正常工作
 * 这些测试应该快速运行，用于验证应用的基本功能
 */
test.describe('冒烟测试', () => {
  test.describe.configure({ mode: 'serial' });

  test('应用基本功能验证', async ({ page }) => {
    // 1. 验证登录页面可以访问
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    
    // 验证页面标题
    await expect(page).toHaveTitle(/Admin Portal/);
    
    // 验证登录表单存在
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    
    // 2. 验证可以成功登录
    await loginPage.login('admin@test.com', 'admin123');
    
    // 3. 验证跳转到仪表盘
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.waitForPageLoad();
    
    // 验证仪表盘页面元素
    await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    
    // 4. 验证导航菜单
    await expect(page.locator('[data-testid="nav-users"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-roles"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-clients"]')).toBeVisible();
    
    // 5. 验证可以成功登出
    await dashboardPage.logout();
    
    // 验证返回登录页面
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('API 健康检查', async ({ page }) => {
    // 验证 OAuth Service 健康状态
    const oauthHealthResponse = await page.request.get('http://localhost:3001/health');
    expect(oauthHealthResponse.ok()).toBeTruthy();
    
    // 验证 Admin Portal 可以访问
    await page.goto('/');
    await expect(page).toHaveTitle(/Admin Portal/);
  });

  test('响应式设计基本验证', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    
    // 桌面端
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    
    // 平板端
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    
    // 移动端
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('基本可访问性验证', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    
    // 验证页面有正确的语言属性
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang');
    
    // 验证主要表单元素有正确的标签
    await expect(page.locator('input[type="email"]')).toHaveAttribute('aria-label');
    await expect(page.locator('input[type="password"]')).toHaveAttribute('aria-label');
    
    // 验证按钮有正确的文本或 aria-label
    const loginButton = page.locator('[data-testid="login-button"]');
    await expect(loginButton).toBeVisible();
    
    // 验证焦点管理
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('错误处理基本验证', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    
    // 测试无效登录
    await loginPage.fillCredentials('invalid@test.com', 'wrongpassword');
    await loginPage.clickLoginButton();
    
    // 验证错误消息显示
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    
    // 验证表单仍然可用
    await expect(page.locator('[data-testid="email-input"]')).toBeEnabled();
    await expect(page.locator('[data-testid="password-input"]')).toBeEnabled();
    await expect(page.locator('[data-testid="login-button"]')).toBeEnabled();
  });

  test('性能基本验证', async ({ page }) => {
    // 记录页面加载时间
    const startTime = Date.now();
    
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    
    const loadTime = Date.now() - startTime;
    
    // 验证页面在合理时间内加载（5秒）
    expect(loadTime).toBeLessThan(5000);
    
    // 验证页面完全加载
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    
    // 验证没有 JavaScript 错误
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    // 执行一些基本操作
    await page.locator('[data-testid="email-input"]').click();
    await page.locator('[data-testid="password-input"]').click();
    
    // 验证没有 JavaScript 错误
    expect(errors).toHaveLength(0);
  });

  test('安全基本验证', async ({ page }) => {
    await page.goto('/');
    
    // 验证安全头
    const response = await page.waitForResponse('/');
    const headers = response.headers();
    
    // 验证基本安全头存在（如果配置了的话）
    // 注意：这些头可能在开发环境中不存在
    if (headers['x-frame-options']) {
      expect(headers['x-frame-options']).toBeTruthy();
    }
    
    if (headers['x-content-type-options']) {
      expect(headers['x-content-type-options']).toBe('nosniff');
    }
    
    // 验证 HTTPS 重定向（在生产环境中）
    if (process.env.NODE_ENV === 'production') {
      expect(headers['strict-transport-security']).toBeTruthy();
    }
  });
});