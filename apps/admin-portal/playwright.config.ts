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
    ['list'], // 控制台输出
    ['json', { outputFile: 'test-results.json' }], // JSON 报告
    ['html', { outputFolder: 'playwright-report', open: 'never' }], // HTML 报告
  ],

  // 全局测试设置
  use: {
    // 基础URL - 使用 Pingora 代理端口 6188
    baseURL: 'http://localhost:6188',

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
  // 注意：OAuth 客户端流程测试需要以下服务同时运行：
  // 1. oauth-service-rust (端口 3001)
  // 2. admin-portal (端口 3002)
  // 3. pingora-proxy (端口 6188)
  //
  // 推荐使用外部脚本启动所有服务，而不是在这里自动启动
  // 运行测试前，请确保所有服务已经启动
  webServer: process.env.PLAYWRIGHT_SKIP_SERVER_START ? undefined : [
    {
      // oauth-service服务（必须先启动）
      command: 'cd ../oauth-service-rust && DATABASE_URL="sqlite:test.db" cargo run',
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
        NEXT_PUBLIC_OAUTH_SERVICE_URL: 'http://localhost:6188',
        NEXT_PUBLIC_APP_URL: 'http://localhost:6188',
      },
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120000, // 2分钟启动超时
    },
    {
      // pingora-proxy服务
      command: 'cd ../pingora-proxy && cargo run',
      port: 6188,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60000, // 1分钟启动超时
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
