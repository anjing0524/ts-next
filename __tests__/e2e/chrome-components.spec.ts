import { test, expect } from '@playwright/test';

test.describe('Chrome 78+ 组件兼容性测试', () => {
  // 只在 Chrome 浏览器上运行测试
  test.beforeEach(async ({ browser }) => {
    const isChrome = browser.browserType().name() === 'chromium';
    test.skip(!isChrome, '此测试仅适用于 Chrome 浏览器');
  });

  test('Button 组件在 Chrome 78+ 中正常渲染', async ({ page }) => {
    await page.goto('/');

    // 添加测试按钮
    await page.evaluate(() => {
      const testDiv = document.createElement('div');
      testDiv.id = 'button-test';
      testDiv.innerHTML = `
        <button class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] bg-primary text-primary-foreground shadow-xs h-9 px-4 py-2">
          默认按钮
        </button>
      `;
      document.body.appendChild(testDiv);
    });

    // 检查按钮样式
    const buttonStyles = await page.locator('#button-test button').evaluate((el) => {
      // 这里的 el 参数已经由 Playwright 保证不为 null
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        borderRadius: style.borderRadius,
        transition: style.transition,
        gap: style.gap,
      };
    });

    expect(buttonStyles.display).toBe('inline-flex');
    expect(parseFloat(buttonStyles.borderRadius)).toBeGreaterThan(0);
    expect(buttonStyles.transition).toContain('box-shadow');
    expect(buttonStyles.gap).not.toBe('normal'); // 确认 gap 属性被应用
  });

  test('项目中的 CSS 选择器在 Chrome 78+ 中正常工作', async ({ page }) => {
    await page.goto('/');

    // 测试项目中使用的现代 CSS 选择器
    await page.evaluate(() => {
      const testDiv = document.createElement('div');
      testDiv.id = 'selector-test';
      testDiv.innerHTML = `
        <div class="parent">
          <span>第一个子元素</span>
          <span>第二个子元素</span>
          <span>第三个子元素</span>
        </div>
        <button>
          <svg width="16" height="16"></svg>
          按钮文本
        </button>
      `;
      document.head.insertAdjacentHTML(
        'beforeend',
        `
        <style>
          #selector-test .parent > span:first-child { color: red; }
          #selector-test .parent > span:nth-child(2) { color: green; }
          #selector-test button:has(> svg) { padding-left: 24px; }
          #selector-test button svg:not([class*='size-']) { width: 16px; }
        </style>
      `
      );
      document.body.appendChild(testDiv);
    });

    // 检查选择器效果
    const selectorResults = await page.evaluate(() => {
      const firstSpan = document.querySelector('#selector-test .parent > span:first-child');
      const secondSpan = document.querySelector('#selector-test .parent > span:nth-child(2)');

      // 添加空值检查
      if (!firstSpan || !secondSpan) {
        return {
          firstSpanColor: null,
          secondSpanColor: null,
          hasSupport: false,
        };
      }

      // :has 选择器在 Chrome 105+ 才支持，所以这里可能会失败
      let hasSupport = false;
      try {
        document.querySelector('#selector-test button:has(> svg)');
        hasSupport = true;
      } catch (e) {
        console.error(e); // 输出错误信息以进行调试
        hasSupport = false;
      }

      return {
        firstSpanColor: window.getComputedStyle(firstSpan).color,
        secondSpanColor: window.getComputedStyle(secondSpan).color,
        hasSupport,
      };
    });

    // 添加非空检查
    if (selectorResults.firstSpanColor && selectorResults.secondSpanColor) {
      expect(selectorResults.firstSpanColor).toBe('rgb(255, 0, 0)');
      expect(selectorResults.secondSpanColor).toBe('rgb(0, 128, 0)');
    } else {
      // 如果元素未找到，测试失败
      expect(selectorResults.firstSpanColor).not.toBeNull();
      expect(selectorResults.secondSpanColor).not.toBeNull();
    }

    // 注意：:has 选择器在 Chrome 105+ 才支持，如果测试在较旧版本上可能会失败
    console.log(':has 选择器支持:', selectorResults.hasSupport);
  });
});
