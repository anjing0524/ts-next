/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/ui"], // Ensure UI package is transpiled if it uses TS/JSX not directly supported by Next.js
  experimental: {
    // Required for Turbopack if you're using it
    // typedRoutes: true,
  },
};

module.exports = nextConfig;
