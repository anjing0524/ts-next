import { defineConfig, devices } from '@playwright/test';

/**
 * 简化的Playwright测试配置
 * 用于基础测试验证
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

  // 工作进程数
  workers: 1,

  // 测试报告配置
  reporter: [['list']],

  // 全局测试设置
  use: {
    // 基础URL
    baseURL: 'http://localhost:3002',

    // 浏览器设置
    headless: true,

    // 超时设置
    actionTimeout: 10000,
    navigationTimeout: 10000,

    // 忽略HTTPS错误
    ignoreHTTPSErrors: true,
  },

  // 项目配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 期望超时
  expect: {
    timeout: 5000,
  },
});