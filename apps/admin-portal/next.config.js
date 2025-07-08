/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@repo/ui'],
  },
  output: "standalone",
  
  // 为Turbopack配置路径别名解析
  turbopack: {
    resolveAlias: {
      '@': './.',
      '@/hooks': './hooks',
      '@/lib': './lib',
      '@/components': './components',
      '@/app': './app',
      '@/types': './types',
    },
  },
};

module.exports = nextConfig;
