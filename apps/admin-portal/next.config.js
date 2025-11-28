/** @type {import('next').NextConfig} */
const nextConfig = {
  // 关键配置：告诉 Next.js/Turbopack 转译 monorepo 中的包
  transpilePackages: ['@repo/ui', '@repo/lib', '@repo/database', '@repo/cache'],

  experimental: {
    optimizePackageImports: ['@repo/ui'],
  },

  // 不要外部化 monorepo 包
  serverExternalPackages: [],

  // 安全 Header 配置
  // Security headers configuration (P2-1: CSP Header)
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              // 脚本源 | Script sources (严格CSP - 无unsafe)
              "script-src 'self' https://cdn.jsdelivr.net",
              // 样式源 | Style sources (仅允许self和CDN)
              "style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com",
              // 图片源 | Image sources
              "img-src 'self' data: https:",
              // 字体源 | Font sources
              "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
              // 连接源 | Connect sources
              "connect-src 'self' http://localhost:* https://localhost:* wss://localhost:* ws://localhost:*",
              // 框架源 | Frame sources
              "frame-src 'self'",
              // 默认源 | Default source
              "default-src 'self'",
              // 报告地址（可选）| Report URI (optional)
              "report-uri /api/v2/security/csp-report",
            ].join('; '),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
