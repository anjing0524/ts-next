import { test, expect } from '@playwright/test';

test.describe('CSS特性兼容性测试', () => {
  test('CSS Grid布局在所有浏览器中正常工作', async ({ page }) => {
    await page.goto('/');

    // 添加一个使用Grid布局的测试元素
    await page.evaluate(() => {
      const testDiv = document.createElement('div');
      testDiv.id = 'grid-test';
      testDiv.style.display = 'grid';
      testDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
      testDiv.style.gap = '10px';

      for (let i = 0; i < 6; i++) {
        const child = document.createElement('div');
        child.textContent = `Item ${i + 1}`;
        child.style.border = '1px solid #ccc';
        child.style.padding = '20px';
        testDiv.appendChild(child);
      }

      document.body.appendChild(testDiv);
    });

    // 检查Grid布局是否正确应用
    const gridDisplay = await page.locator('#grid-test').evaluate((el) => {
      return window.getComputedStyle(el).display;
    });

    expect(gridDisplay).toBe('grid');

    // 检查子元素是否正确排列
    const firstChildLeft = await page.locator('#grid-test > div:first-child').evaluate((el) => {
      return el.getBoundingClientRect().left;
    });

    const secondChildLeft = await page.locator('#grid-test > div:nth-child(2)').evaluate((el) => {
      return el.getBoundingClientRect().left;
    });

    // 确保第二个元素在第一个元素的右侧
    expect(secondChildLeft).toBeGreaterThan(firstChildLeft);
  });

  test('CSS变量在所有浏览器中正常工作', async ({ page }) => {
    await page.goto('/');

    // 添加使用CSS变量的测试元素
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--test-color', 'rgb(255, 0, 0)');

      const testDiv = document.createElement('div');
      testDiv.id = 'css-var-test';
      testDiv.style.color = 'var(--test-color)';
      testDiv.textContent = 'CSS变量测试';
      document.body.appendChild(testDiv);
    });

    // 检查CSS变量是否正确应用
    const textColor = await page.locator('#css-var-test').evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    expect(textColor).toBe('rgb(255, 0, 0)');
  });
});
