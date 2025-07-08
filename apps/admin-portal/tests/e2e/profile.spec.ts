import { test, expect } from '@playwright/test';
import { AuthHelpers } from '../../helpers/auth-helpers';

test.describe('个人资料页面', () => {
  test.beforeEach(async ({ page }) => {
    // 在每个测试前，使用辅助函数以管理员身份登录
    await AuthHelpers.loginAsAdmin(page);
    // 导航到个人资料页面
    await page.goto('/profile');
    await expect(page.locator('h1')).toContainText('个人资料');
  });

  test('应该能成功加载并显示用户信息', async ({ page }) => {
    // 验证显示名称输入框是否可见并且包含了用户的显示名称
    await expect(page.locator('input[name="displayName"]')).toBeVisible();
    await expect(page.locator('input[name="displayName"]')).toHaveValue(/admin/); // 假设管理员的显示名称包含 "admin"

    // 验证邮箱输入框是否可见
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('应该能成功更新个人资料', async ({ page }) => {
    const newDisplayName = `Test User ${Date.now()}`;
    const displayNameInput = page.locator('input[name="displayName"]');

    // 填充新的显示名称并保存
    await displayNameInput.fill(newDisplayName);
    await page.click('button:has-text("保存更改")');

    // 验证成功提示是否出现
    await expect(page.locator('text=个人资料已更新')).toBeVisible();

    // 刷新页面并验证更改是否已持久化
    await page.reload();
    await expect(page.locator('input[name="displayName"]')).toHaveValue(newDisplayName);
  });

  test('修改密码时，两次新密码输入不一致应该显示错误', async ({ page }) => {
    // 填充密码字段
    await page.locator('input[name="oldPassword"]').fill('admin123'); // 假设这是正确的旧密码
    await page.locator('input[name="newPassword"]').fill('newPassword123');
    await page.locator('input[name="confirmPassword"]').fill('wrongPassword123');

    // 点击修改密码按钮
    await page.click('button:has-text("修改密码")');

    // 验证错误提示是否出现
    await expect(page.locator('text=两次输入的新密码不匹配')).toBeVisible();
  });

  test('应该能成功修改密码', async ({ page }) => {
    // 为了不影响其他测试，这里只验证流程，实际密码修改可能需要更复杂的后端配合
    // 假设旧密码是 'admin123'，新密码是 'newAdminPassword123'
    const oldPassword = 'admin123';
    const newPassword = 'newAdminPassword123';

    // 填充密码字段
    await page.locator('input[name="oldPassword"]').fill(oldPassword);
    await page.locator('input[name="newPassword"]').fill(newPassword);
    await page.locator('input[name="confirmPassword"]').fill(newPassword);

    // 点击修改密码按钮
    await page.click('button:has-text("修改密码")');

    // 验证成功提示是否出现
    await expect(page.locator('text=密码已成功修改')).toBeVisible();

    // 验证表单是否已重置
    await expect(page.locator('input[name="oldPassword"]')).toBeEmpty();
  });
});
