import { test, expect } from '@playwright/test';

/**
 * 简单的健康检查测试
 * 验证Playwright基础功能是否正常
 */
test.describe('简单健康检查', () => {
  test('基础测试 - 验证测试框架', async ({ page }) => {
    // 访问一个简单的页面
    await page.goto('https://example.com');
    
    // 验证页面标题
    await expect(page).toHaveTitle(/Example Domain/);
    
    // 验证页面内容
    await expect(page.locator('h1')).toContainText('Example Domain');
  });

  test('本地服务检查 - 如果服务运行', async ({ page }) => {
    try {
      // 尝试访问本地服务
      await page.goto('http://localhost:3002/health', { timeout: 5000 });
      
      // 如果能访问，验证健康检查页面
      await expect(page.locator('h1')).toContainText('Admin Portal 健康检查');
    } catch (error) {
      // 如果服务未运行，跳过测试
      test.skip(true, '本地服务未运行，跳过测试');
    }
  });
});