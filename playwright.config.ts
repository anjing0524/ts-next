import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // 最新版 Chrome
    {
      name: 'chrome-latest',
      use: { ...devices['Desktop Chrome'] },
    },
    // Chrome 78 版本测试
    {
      name: 'chrome-78',
      use: {
        ...devices['Desktop Chrome'],
        // 使用 Chrome 78 的 User-Agent
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36',
      },
    },
    // 移动版 Chrome
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'pnpm run build && pnpm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
