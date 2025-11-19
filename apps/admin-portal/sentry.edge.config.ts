/**
 * Sentry Edge Runtime 配置
 * 用于 Edge Functions（如 middleware/proxy）错误监控
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV;

Sentry.init({
  // Sentry DSN（从环境变量获取）
  dsn: SENTRY_DSN,

  // 环境标识
  environment: SENTRY_ENVIRONMENT,

  // 应用发布版本
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // Tracing（性能监控）- Edge Runtime 资源有限，降低采样率
  tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.05 : 0.5, // 生产环境 5%，开发环境 50%

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

    return event;
  },

  // 忽略特定错误
  ignoreErrors: [
    // 网络错误
    'Network request failed',
    'NetworkError',
  ],

  // Debug 模式（仅在开发环境）
  debug: SENTRY_ENVIRONMENT === 'development',

  // 启用全局错误处理
  enabled: !!SENTRY_DSN,
});
