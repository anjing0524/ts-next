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
  reporter: [['json', { outputFile: 'test-results.json' }]],

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
  ],

  // 开发服务器配置
  webServer: [
    {
      // oauth-service服务（必须先启动）
      command: 'cd ../oauth-service && pnpm dev',
      port: 3001,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'file:./test.db',
        JWT_SECRET: 'test-jwt-secret-key-for-e2e-testing',
        ENCRYPTION_KEY: 'test-encryption-key-32-chars-long',
      },
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120000, // 2分钟启动超时
    },
    {
      // admin-portal服务
      command: 'pnpm dev',
      port: 3002,
      env: {
        NODE_ENV: 'test',
        NEXT_PUBLIC_OAUTH_SERVICE_URL: 'http://localhost:3001',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3002',
      },
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120000, // 2分钟启动超时
    },
  ],

  // 测试输出目录
  outputDir: 'test-results/',

  // 期望超时
  expect: {
    timeout: 10000,
  },

  // 全局设置
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),
});
