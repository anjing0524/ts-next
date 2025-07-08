/**
 * 基础 Next.js 配置
 * @param {import('next').NextConfig} config - Next.js 配置对象
 * @returns {import('next').NextConfig} 合并后的配置
 */
function withNextConfig(config = {}) {
  return {
  // 基础配置
    output: "standalone",
    poweredByHeader: false,
    compress: true,
    
    // 实验性功能
    experimental: {
      optimizePackageImports: ["@repo/ui"],
    },
    
    // 新增：告知 Next.js 转译这些工作区内的包
    transpilePackages: ['@repo/ui', '@repo/lib', '@repo/database'],

    // 合并用户自定义配置
    ...config,
  };
}

module.exports = withNextConfig; 