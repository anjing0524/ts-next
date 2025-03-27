import { test, expect } from '@playwright/test';

test('首页应该加载成功', async ({ page }) => {
  await page.goto('/');

  // 检查页面标题
  await expect(page).toHaveTitle(/Create Next App/);

  // 检查Next.js logo是否存在
  const logo = page.locator('img[alt="Next.js logo"]');
  await expect(logo).toBeVisible();

  // 检查图片是否正确加载（无破损）
  const isBroken = await logo.evaluate((img) => {
    const htmlImg = img as HTMLImageElement;
    return htmlImg.naturalWidth === 0 || htmlImg.naturalHeight === 0;
  });
  expect(isBroken).toBe(false);
});

test('应该显示正确的欢迎文本', async ({ page }) => {
  await page.goto('/');

  // 检查页面是否包含特定文本
  await expect(page.locator('text=Get started by editing')).toBeVisible();

  // 检查字体渲染
  const fontFamily = await page.locator('text=Get started by editing').evaluate((el) => {
    return window.getComputedStyle(el).fontFamily;
  });

  // 确保使用了预期的字体系列（根据你的项目配置调整）
  expect(fontFamily).toContain('sans-serif');
});

test('CSS样式在当前浏览器中正确应用', async ({ page }) => {
  await page.goto('/');

  // 检查背景颜色
  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });

  // 确保背景颜色不是未定义的
  expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');

  // 检查Flexbox布局是否正常工作
  const display = await page.locator('main').evaluate((el) => {
    return window.getComputedStyle(el).display;
  });

  // 根据你的布局调整预期值
  expect(['flex', 'grid', 'block']).toContain(display);
});
