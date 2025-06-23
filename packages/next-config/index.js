/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    optimizePackageImports: ['@repo/ui']
  },
  transpilePackages: ['@repo/ui', '@repo/lib'],
};

module.exports = nextConfig;
