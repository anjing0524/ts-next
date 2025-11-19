/** @type {import('next').NextConfig} */
const nextConfig = {
  // 关键配置：告诉 Next.js/Turbopack 转译 monorepo 中的包
  transpilePackages: ['@repo/ui', '@repo/lib', '@repo/database', '@repo/cache'],

  experimental: {
    optimizePackageImports: ['@repo/ui'],
  },

  // 不要外部化 monorepo 包
  serverExternalPackages: [],
};

module.exports = nextConfig;
