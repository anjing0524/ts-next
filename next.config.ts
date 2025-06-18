import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '/datamgr_flow',
  env: {
    TZ: 'Asia/Shanghai',
  },
};

export default nextConfig;
