const withNextConfig = require('@repo/next-config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // 保持默认 ESLint 与 TypeScript 严格检查
  // 添加webpack配置以正确解析路径别名
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // 确保路径别名正确解析
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, '.'),
    };
    
    return config;
  },
};

module.exports = withNextConfig(nextConfig);
