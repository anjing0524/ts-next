import { test, expect } from '@playwright/test';

test.describe('浏览器兼容性测试', () => {
  test('页面布局在不同浏览器中应保持一致', async ({ page }) => {
    await page.goto('/');

    // 检查关键元素是否可见
    await expect(page.locator('img[alt="Next.js logo"]')).toBeVisible();
    await expect(page.locator('text=Get started by editing')).toBeVisible();

    // 检查页面布局 - 获取主要容器的尺寸
    const mainContainer = page.locator('main');
    const boundingBox = await mainContainer.boundingBox();

    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      // 确保主容器宽度适应视口
      expect(boundingBox.width).toBeGreaterThan(200);
      // 可以根据设计要求添加更多断言
    }
  });

  test('响应式布局在不同视口大小下正常工作', async ({ page }) => {
    await page.goto('/');

    // 测试桌面视口
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('main')).toBeVisible();

    // 测试平板视口
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('main')).toBeVisible();

    // 测试移动视口
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('main')).toBeVisible();
  });

  test('交互元素在所有浏览器中正常工作', async ({ page }) => {
    await page.goto('/');

    // 查找并点击链接
    const links = page.locator('a[href^="https://"]');
    const count = await links.count();

    // 确保页面上至少有一个外部链接
    expect(count).toBeGreaterThan(0);

    // 检查第一个链接是否可点击（不实际导航，只检查元素）
    if (count > 0) {
      await links.first().hover();
      // 检查悬停状态 - 可以检查CSS变化
      const hoverStyle = await links.first().evaluate((el) => {
        return window.getComputedStyle(el).cursor;
      });
      expect(hoverStyle).toBe('pointer');
    }
  });
});
