/**
 * Sentry 客户端配置
 * 用于浏览器端错误监控和性能追踪
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV;

Sentry.init({
  // Sentry DSN（从环境变量获取）
  dsn: SENTRY_DSN,

  // 环境标识
  environment: SENTRY_ENVIRONMENT,

  // 应用发布版本（用于错误追踪）
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // Tracing（性能监控）
  tracesSampleRate: SENTRY_ENVIRONMENT === 'production' ? 0.1 : 1.0, // 生产环境 10%，开发环境 100%

  // Replay（会话回放）- 帮助重现用户错误
  replaysSessionSampleRate: 0.1, // 10% 的正常会话
  replaysOnErrorSampleRate: 1.0, // 100% 的错误会话

  // 性能追踪传播目标（Sentry v10+ 顶层配置）
  tracePropagationTargets: [
    'localhost',
    /^https:\/\/[^/]*\.yourdomain\.com/,
    /^\/api\//,
  ],

  // 集成配置
  integrations: [
    // Sentry.replayIntegration({
    //   // Replay 配置
    //   maskAllText: true, // 掩盖所有文本（隐私保护）
    //   blockAllMedia: true, // 阻止所有媒体
    // }),
    Sentry.browserTracingIntegration(),
  ],

  // 在发送到 Sentry 前过滤敏感数据
  beforeSend(event, hint) {
    // 在开发环境不发送错误
    if (SENTRY_ENVIRONMENT === 'development' && !SENTRY_DSN) {
      return null;
    }

    // 过滤掉敏感信息
    if (event.request?.headers) {
      delete event.request.headers['Authorization'];
      delete event.request.headers['Cookie'];
    }

    // 过滤掉本地开发错误
    if (event.request?.url?.includes('localhost')) {
      // 可以选择性地过滤某些本地错误
    }

    return event;
  },

  // 忽略特定错误
  ignoreErrors: [
    // 浏览器扩展错误
    'top.GLOBALS',
    'originalCreateNotification',
    'canvas.contentDocument',
    'MyApp_RemoveAllHighlights',
    'atomicFindClose',
    // 第三方脚本错误
    /fb_xd_fragment/,
    // 网络错误（通常是用户网络问题）
    'Network request failed',
    'NetworkError',
    // ResizeObserver 错误（通常无害）
    'ResizeObserver loop',
  ],

  // Debug 模式（仅在开发环境）
  debug: SENTRY_ENVIRONMENT === 'development',

  // 启用全局错误处理
  enabled: !!SENTRY_DSN,
});
