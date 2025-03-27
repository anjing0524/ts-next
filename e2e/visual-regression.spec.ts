import { test, expect } from '@playwright/test';

test.describe('视觉回归测试', () => {
  test('关键组件在不同浏览器中应有一致的外观', async ({ page, browserName }) => {
    await page.goto('/');

    // 添加测试组件
    await page.evaluate(() => {
      const testDiv = document.createElement('div');
      testDiv.id = 'visual-test';
      testDiv.style.padding = '20px';
      testDiv.innerHTML = `
        <div class="space-y-4">
          <div class="p-4 rounded-lg bg-background">
            <div class="flex flex-col space-y-4">
              <h2 class="text-lg font-medium">测试标题</h2>
              <div class="flex flex-wrap gap-4">
                <button class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] bg-primary text-primary-foreground shadow-xs h-9 px-4 py-2">
                  测试按钮
                </button>
                <span class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap border-transparent bg-primary text-primary-foreground">测试标签</span>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(testDiv);
    });

    // 等待组件完全渲染
    await page.waitForTimeout(500);

    // 截图并比较
    await expect(page.locator('#visual-test')).toHaveScreenshot(`visual-test-${browserName}.png`);
  });
});
