import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../../helpers/auth-helpers';

test.describe('系统配置页面', () => {
  test.beforeEach(async ({ page }) => {
    await AuthHelpers.loginAsAdmin(page);
    await page.goto('/admin/system/config');
    await expect(page.locator('h1')).toContainText('系统配置');
  });

  test('应该加载并显示当前的系统配置', async ({ page }) => {
    // 验证访问令牌生命周期输入框已加载并有值
    const accessTokenLifetimeInput = page.locator('input[name="accessTokenLifetime"]');
    await expect(accessTokenLifetimeInput).toBeVisible();
    await expect(accessTokenLifetimeInput).not.toBeEmpty();

    // 验证刷新令牌生命周期输入框已加载并有值
    const refreshTokenLifetimeInput = page.locator('input[name="refreshTokenLifetime"]');
    await expect(refreshTokenLifetimeInput).toBeVisible();
    await expect(refreshTokenLifetimeInput).not.toBeEmpty();

    // 验证密码授权模式开关存在
    await expect(page.locator('role=switch[name="允许密码授权模式"]')).toBeVisible();
  });

  test('应该能成功更新系统配置', async ({ page }) => {
    const accessTokenLifetimeInput = page.locator('input[name="accessTokenLifetime"]');
    const originalValue = await accessTokenLifetimeInput.inputValue();
    const newValue = String(Number(originalValue) + 10);

    // 修改配置并保存
    await accessTokenLifetimeInput.fill(newValue);
    await page.click('button:has-text("保存配置")');

    // 验证成功提示
    await expect(page.locator('text=系统配置已更新')).toBeVisible();

    // 刷新页面并验证更改已持久化
    await page.reload();
    await expect(accessTokenLifetimeInput).toHaveValue(newValue);

    // 恢复原始值以避免影响其他测试
    await accessTokenLifetimeInput.fill(originalValue);
    await page.click('button:has-text("保存配置")');
    await expect(page.locator('text=系统配置已更新')).toBeVisible();
  });
});
