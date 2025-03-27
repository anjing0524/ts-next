import { test, expect } from '@playwright/test';

test.describe('Chrome 78+ 版本兼容性测试', () => {
  // 只在 Chrome 浏览器上运行测试
  test.beforeEach(async ({ browser }) => {
    const isChrome = browser.browserType().name() === 'chromium';
    test.skip(!isChrome, '此测试仅适用于 Chrome 浏览器');
  });

  test('检测 Chrome 78+ 功能支持', async ({ page, browser }) => {
    await page.goto('/');

    // 获取浏览器信息
    const browserInfo = await page.evaluate(() => {
      return {
        userAgent: navigator.userAgent,
        // 检测 Chrome 78+ 支持的关键 API
        features: {
          // Chrome 51+ 支持
          intersectionObserver: typeof IntersectionObserver !== 'undefined',
          // Chrome 64+ 支持
          resizeObserver: typeof ResizeObserver !== 'undefined',
          // Chrome 57+ 完全支持
          cssGrid: CSS.supports('display', 'grid'),
          // Chrome 49+ 支持
          cssVariables: CSS.supports('--test:0'),
          // Chrome 29+ 支持
          flexbox: CSS.supports('display', 'flex'),
          // Chrome 42+ 支持
          fetch: typeof fetch !== 'undefined',
          // Chrome 32+ 支持
          promise: typeof Promise !== 'undefined',
          // Chrome 55+ 支持
          asyncAwait: (function () {
            try {
              eval('async function test() {}');
              return true;
            } catch (e) {
              console.error(e); // 输出错误信息以进行调试
              return false;
            }
          })(),
          // Chrome 76+ 支持
          nullishCoalescing: (function () {
            try {
              eval('const test = null ?? "default"');
              return true;
            } catch (e) {
              console.error(e); // 输出错误信息以进行调试
              return false;
            }
          })(),
          // Chrome 69+ 支持
          flatArray: Array.prototype.hasOwnProperty('flat'),
          // Chrome 76+ 支持
          fromEntries: Object.hasOwnProperty('fromEntries'),
          // Chrome 69+ 支持
          bigInt: typeof BigInt !== 'undefined',
        },
        // 检测 Chrome 版本
        chromeVersion: (function () {
          const ua = navigator.userAgent;
          const match = ua.match(/Chrome\/(\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })(),
      };
    });

    console.log(`测试浏览器: ${browser.browserType().name()}`);
    console.log(`User Agent: ${browserInfo.userAgent}`);
    console.log(`Chrome 版本: ${browserInfo.chromeVersion}`);
    console.log('功能支持:', browserInfo.features);

    // 验证是否为 Chrome 78+
    if (browserInfo.chromeVersion !== null) {
      expect(browserInfo.chromeVersion).toBeGreaterThanOrEqual(78);
    }

    // 检查 Chrome 78+ 必须支持的功能
    expect(browserInfo.features.intersectionObserver).toBe(true);
    expect(browserInfo.features.resizeObserver).toBe(true);
    expect(browserInfo.features.cssGrid).toBe(true);
    expect(browserInfo.features.cssVariables).toBe(true);
    expect(browserInfo.features.flexbox).toBe(true);
    expect(browserInfo.features.fetch).toBe(true);
    expect(browserInfo.features.promise).toBe(true);
    expect(browserInfo.features.asyncAwait).toBe(true);
    expect(browserInfo.features.flatArray).toBe(true);
    expect(browserInfo.features.bigInt).toBe(true);
  });

  test('检查项目中使用的 Chrome 78+ 特定 CSS 特性', async ({ page }) => {
    await page.goto('/');

    // 测试 CSS Grid 支持
    await page.evaluate(() => {
      const testDiv = document.createElement('div');
      testDiv.id = 'grid-test';
      testDiv.style.display = 'grid';
      testDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
      testDiv.style.gap = '10px';
      document.body.appendChild(testDiv);
    });

    const gridSupport = await page.evaluate(() => {
      const el = document.getElementById('grid-test');
      // 添加空值检查
      if (!el) {
        throw new Error('grid-test element not found');
      }
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        gap: style.gap || style.gridGap,
      };
    });

    expect(gridSupport.display).toBe('grid');
    expect(gridSupport.gridTemplateColumns).not.toBe('');
    expect(gridSupport.gap).not.toBe('');

    // 测试项目中使用的其他 CSS 特性
    await page.evaluate(() => {
      const testDiv = document.createElement('div');
      testDiv.id = 'css-features-test';
      testDiv.innerHTML = `
        <div class="flex-test" style="display: flex; align-items: center;"></div>
        <div class="var-test" style="color: var(--test-color, red);"></div>
        <div class="sticky-test" style="position: sticky; top: 0;"></div>
      `;
      document.documentElement.style.setProperty('--test-color', 'rgb(0, 128, 0)');
      document.body.appendChild(testDiv);
    });

    const cssFeatures = await page.evaluate(() => {
      const flexEl = document.querySelector('.flex-test');
      const varEl = document.querySelector('.var-test');
      const stickyEl = document.querySelector('.sticky-test');

      // 添加空值检查
      if (!flexEl || !varEl || !stickyEl) {
        throw new Error('One or more test elements not found');
      }

      return {
        flex: window.getComputedStyle(flexEl).display,
        cssVar: window.getComputedStyle(varEl).color,
        sticky: window.getComputedStyle(stickyEl).position,
      };
    });

    expect(cssFeatures.flex).toBe('flex');
    expect(cssFeatures.cssVar).toBe('rgb(0, 128, 0)');
    expect(cssFeatures.sticky).toBe('sticky');
  });
});
