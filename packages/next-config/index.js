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
    
    // 合并用户自定义配置
    ...config,
  };
}

module.exports = withNextConfig; 