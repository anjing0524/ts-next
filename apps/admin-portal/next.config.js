/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@repo/ui'],
  },
  serverExternalPackages: [],
};

module.exports = nextConfig;
