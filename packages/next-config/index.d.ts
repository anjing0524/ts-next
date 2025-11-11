import { NextConfig } from 'next';

/**
 * 基础 Next.js 配置函数
 */
declare function withNextConfig(config?: NextConfig): NextConfig;

export = withNextConfig;
