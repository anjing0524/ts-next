module.exports = {
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['@repo/lib', '@repo/database', '@repo/ui'],
  },
};
