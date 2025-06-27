import { defineConfig, devices } from '@playwright/test';

/**
 * admin-portal Playwright测试配置
 * 专用于admin-portal应用的端到端测试
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e',

  // 测试文件匹配模式
  testMatch: '**/*.{test,spec}.{js,ts}',

  // 并行执行
  fullyParallel: true,

  // 失败时不重试
  retries: 0,

  // CI环境中的工作进程数
  workers: process.env.CI ? 1 : undefined,

  // 测试报告配置
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  // 全局测试设置
  use: {
    // 基础URL
    baseURL: 'http://localhost:3002',

    // 浏览器设置
    headless: !!process.env.CI,

    // 视频录制
    video: 'retain-on-failure',

    // 截图
    screenshot: 'only-on-failure',

    // 超时设置
    actionTimeout: 30000,
    navigationTimeout: 30000,

    // 忽略HTTPS错误
    ignoreHTTPSErrors: true,

    // 跟踪设置
    trace: 'retain-on-failure',
  },

  // 项目配置
  projects: [
    // Chrome桌面端
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },

    // Firefox桌面端
    {
      name: 'Desktop Firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Safari桌面端（仅Mac）
    ...(process.platform === 'darwin'
      ? [
          {
            name: 'Desktop Safari',
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),

    // 移动端Chrome
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // 开发服务器配置
  webServer: [
    {
      // admin-portal服务
      command: 'pnpm dev',
      port: 3002,
      env: {
        NODE_ENV: 'test',
        NEXT_PUBLIC_OAUTH_SERVICE_URL: 'http://localhost:3001/datamgr_flow',
      },
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // oauth-service服务（如果需要）
      command: 'cd ../oauth-service && pnpm dev',
      port: 3001,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'file:./test.db',
      },
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],

  // 测试输出目录
  outputDir: 'test-results/',

  // 期望超时
  expect: {
    timeout: 10000,
  },

  // 全局设置
  globalSetup: require.resolve('./tests/helpers/global-setup.ts'),
  globalTeardown: require.resolve('./tests/helpers/global-teardown.ts'),
});
