import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../../helpers/auth-helpers';

test.describe('管理员仪表盘页面', () => {
  test.beforeEach(async ({ page }) => {
    await AuthHelpers.loginAsAdmin(page);
    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('管理员仪表盘');
  });

  test('应该显示统计卡片', async ({ page }) => {
    // 验证至少有4个统计卡片
    const statCards = await page.locator('div.grid > div > div.card-header').count();
    expect(statCards).toBeGreaterThanOrEqual(4);

    // 验证卡片标题
    await expect(page.locator('text=用户总数')).toBeVisible();
    await expect(page.locator('text=客户端总数')).toBeVisible();
    await expect(page.locator('text=角色总数')).toBeVisible();
    await expect(page.locator('text=今日颁发令牌')).toBeVisible();
  });

  test('应该显示用户增长趋势图表', async ({ page }) => {
    await expect(page.locator('text=用户增长趋势')).toBeVisible();
    // 验证图表容器存在
    await expect(page.locator('div.recharts-responsive-container')).toBeVisible();
  });
});
