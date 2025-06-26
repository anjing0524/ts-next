const nextConfig = {
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow',
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
