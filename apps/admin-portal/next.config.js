const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@repo/ui'],
  },
  serverExternalPackages: [],
};

// Sentry 配置选项
const sentryWebpackPluginOptions = {
  // 静默所有 Sentry 插件日志（可选）
  silent: true,

  // 自动上传 source maps
  // 注意：需要设置 SENTRY_AUTH_TOKEN 环境变量
  automaticVercelMonitors: false,

  // 隐藏 source maps 从公共访问（推荐）
  widenClientFileUpload: true,

  // 禁用 Sentry CLI 提示（CI/CD 环境）
  disableLogger: true,

  // 仅在生产环境上传 source maps
  uploadSourceMaps: process.env.NODE_ENV === 'production',
};

// 使用 Sentry 包装 Next.js 配置
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
