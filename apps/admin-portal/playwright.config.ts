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
  fullyParallel: false,

  // 失败时不重试
  retries: 0,

  // 限制工作进程数以避免服务超载
  workers: 1,

  // 测试报告配置
  reporter: [
    ['list'], // 控制台输出
    ['json', { outputFile: 'test-results.json' }], // JSON 报告
    ['html', { outputFolder: 'playwright-report', open: 'never' }], // HTML 报告
  ],

  // 全局测试设置
  use: {
    // 基础URL - 使用 Pingora 代理端口 6188
    // 所有流量通过 Pingora 路由：
    // - /api/v2/* → OAuth Service (3001)
    // - 其他请求 → Admin Portal (3002)
    baseURL: 'http://localhost:6188',

    // 绕过 CSP
    bypassCSP: true,

    // 浏览器设置
    headless: !!process.env.CI,

    // 视频录制
    video: 'retain-on-failure',

    // 截图
    screenshot: 'only-on-failure',

    // 超时设置
    actionTimeout: 10000,
    navigationTimeout: 10000,

    // 忽略HTTPS错误
    ignoreHTTPSErrors: true,

    // 跟踪设置
    trace: 'retain-on-failure',

    // 代理配置：如果系统设置了 http_proxy 环境变量，
    // 为了访问本地 localhost:3002，需要禁用代理
    // 建议在运行测试前清除代理变量：
    // env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY npm run test:e2e
  },

  // 项目配置
  projects: [
    // Chrome桌面端
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium 启动参数 - 解决 headless 模式崩溃问题
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--no-first-run',
            '--no-zygote',
            '--disable-blink-features=AutomationControlled',
          ],
        },
      },
    },
  ],

  // 开发服务器配置
  // 注意：OAuth 客户端流程测试需要以下服务同时运行：
  // 1. oauth-service-rust (端口 3001)
  // 2. admin-portal (端口 3002)
  //
  // 推荐使用Docker Compose或外部脚本启动所有服务
  // 如果未配置 webServer，请确保在运行测试前手动启动服务

  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3002',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },

  // 测试输出目录
  outputDir: 'test-results/',

  // 期望超时
  expect: {
    timeout: 5000,
  },
});
