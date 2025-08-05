import { createNextJestConfig } from '@repo/jest-config/next';

// 使用 Next.js 的 Jest 配置生成器
const createJestConfig = createNextJestConfig();

// 导出最终配置
module.exports = createJestConfig({
  // 在这里可以添加或覆盖特定于此应用的 Jest 配置
  displayName: 'OAuth Service Tests',
});
