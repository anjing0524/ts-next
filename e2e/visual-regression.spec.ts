import { test, expect } from '@playwright/test';

test.describe('视觉回归测试', () => {
  test('首页在不同浏览器中视觉一致', async ({ page }) => {
    await page.goto('/');

    // 等待页面完全加载
    await page.waitForLoadState('networkidle');

    // 截取整个页面的屏幕截图并与基准进行比较
    // 注意：首次运行时会创建基准截图
    await expect(page).toHaveScreenshot('home-page.png', {
      maxDiffPixelRatio: 0.05, // 允许5%的像素差异
    });
  });

  test('响应式布局在不同视口大小下视觉一致', async ({ page }) => {
    await page.goto('/');

    // 测试不同视口大小
    const viewports = [
      { width: 1280, height: 800, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForLoadState('networkidle');

      // 截取当前视口大小的屏幕截图
      await expect(page).toHaveScreenshot(`home-page-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.05,
      });
    }
  });
});
