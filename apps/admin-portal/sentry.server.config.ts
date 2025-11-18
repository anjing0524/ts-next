/**
 * Sentry 服务端配置
 * 用于 Next.js 服务端（Node.js Runtime）错误监控
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV;

Sentry.init({
  // Sentry DSN（从环境变量获取）
  dsn: SENTRY_DSN,

  // 环境标识
  environment: SENTRY_ENVIRONMENT,

  // 应用发布版本
  release: process.env.APP_VERSION,

  // Tracing（性能监控）
  tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0, // 生产环境 10%，开发环境 100%

  // 在发送到 Sentry 前过滤敏感数据
  beforeSend(event, hint) {
    // 在开发环境不发送错误
    if (SENTRY_ENVIRONMENT === 'development' && !SENTRY_DSN) {
      return null;
    }

    // 过滤掉敏感信息
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['Authorization'];
      delete event.request.headers['Cookie'];
    }

    // 过滤掉环境变量中的敏感信息
    if (event.contexts?.runtime?.name === 'node') {
      // 不发送环境变量
      delete event.contexts.runtime;
    }

    return event;
  },

  // 忽略特定错误
  ignoreErrors: [
    // 网络超时错误
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    // 客户端中断连接
    'aborted',
    'Client Closed Request',
  ],

  // Debug 模式（仅在开发环境）
  debug: SENTRY_ENVIRONMENT === 'development',

  // 启用全局错误处理
  enabled: !!SENTRY_DSN,
});
