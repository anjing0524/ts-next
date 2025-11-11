/**
 * 基础 Next.js 16 配置
 * @param {import('next').NextConfig} config - Next.js 配置对象
 * @returns {import('next').NextConfig} 合并后的配置
 */
function withNextConfig(config = {}) {
  return {
    // 基础配置
    output: 'standalone',
    poweredByHeader: false,
    compress: true,

    // 实验性功能
    experimental: {
      optimizePackageImports: ['@repo/ui'],
      reactCompiler: true, // 启用 React 编译器
    },

    // 转译工作区内的包
    transpilePackages: ['@repo/ui', '@repo/lib', '@repo/database'],

    // 合并用户自定义配置
    ...config,
  };
}

module.exports = withNextConfig;
