import { test, expect } from '@playwright/test';

test('首页应该加载成功', async ({ page }) => {
  await page.goto('/');

  // 检查页面标题
  await expect(page).toHaveTitle(/Create Next App/);

  // 检查Next.js logo是否存在
  const logo = page.locator('img[alt="Next.js logo"]');
  await expect(logo).toBeVisible();
});

test('应该显示正确的欢迎文本', async ({ page }) => {
  await page.goto('/');

  // 检查页面是否包含特定文本
  await expect(page.locator('text=Get started by editing')).toBeVisible();
});
