/**
 * Web Vitals 性能监控
 *
 * 监控和上报 Core Web Vitals 指标到 Sentry 和其他分析平台
 *
 * Core Web Vitals:
 * - LCP (Largest Contentful Paint): 最大内容绘制时间 < 2.5s
 * - FID (First Input Delay): 首次输入延迟 < 100ms
 * - CLS (Cumulative Layout Shift): 累积布局偏移 < 0.1
 *
 * 其他重要指标:
 * - FCP (First Contentful Paint): 首次内容绘制 < 1.8s
 * - TTFB (Time to First Byte): 首字节时间 < 800ms
 * - INP (Interaction to Next Paint): 交互到下次绘制 < 200ms
 */

import * as Sentry from '@sentry/nextjs';
import type { Metric } from 'web-vitals';

// Web Vitals 阈值定义
const THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
  INP: { good: 200, needsImprovement: 500 },
};

// 评级函数
function getRating(metric: Metric): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[metric.name as keyof typeof THRESHOLDS];
  if (!threshold) return 'good';

  if (metric.value <= threshold.good) {
    return 'good';
  } else if (metric.value <= threshold.needsImprovement) {
    return 'needs-improvement';
  } else {
    return 'poor';
  }
}

/**
 * 上报 Web Vitals 指标到 Sentry
 */
function reportToSentry(metric: Metric) {
  const rating = getRating(metric);

  // 上报到 Sentry Performance Monitoring
  Sentry.captureMessage(`Web Vital: ${metric.name}`, {
    level: rating === 'poor' ? 'warning' : 'info',
    contexts: {
      'web-vitals': {
        name: metric.name,
        value: metric.value,
        rating,
        id: metric.id,
        navigationType: metric.navigationType,
      },
    },
    tags: {
      'web-vital.name': metric.name,
      'web-vital.rating': rating,
    },
  });

  // 对于差的指标，额外记录详细信息
  if (rating === 'poor') {
    console.warn(`[Web Vitals] Poor ${metric.name}: ${metric.value}ms (threshold: ${
      THRESHOLDS[metric.name as keyof typeof THRESHOLDS]?.good
    }ms)`);
  }
}

/**
 * 上报到自定义分析端点（如果需要）
 */
async function reportToAnalytics(metric: Metric) {
  const analyticsEndpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (!analyticsEndpoint) return;

  try {
    const body = JSON.stringify({
      metric: metric.name,
      value: metric.value,
      rating: getRating(metric),
      id: metric.id,
      navigationType: metric.navigationType,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    });

    // 使用 sendBeacon 确保即使页面卸载也能发送
    if (navigator.sendBeacon) {
      navigator.sendBeacon(analyticsEndpoint, body);
    } else {
      // Fallback to fetch
      fetch(analyticsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(console.error);
    }
  } catch (error) {
    console.error('[Web Vitals] Failed to report to analytics:', error);
  }
}

/**
 * 上报到控制台（开发环境）
 */
function reportToConsole(metric: Metric) {
  if (process.env.NODE_ENV !== 'development') return;

  const rating = getRating(metric);
  const color = rating === 'good' ? 'green' : rating === 'needs-improvement' ? 'orange' : 'red';

  console.log(
    `%c[Web Vitals] ${metric.name}: ${metric.value}ms (${rating})`,
    `color: ${color}; font-weight: bold;`
  );
}

/**
 * 主要的 Web Vitals 上报函数
 *
 * 使用方式:
 * ```tsx
 * // app/layout.tsx
 * import { WebVitalsReporter } from '@/lib/analytics/web-vitals';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <WebVitalsReporter />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function reportWebVitals(metric: Metric) {
  // 上报到控制台（开发环境）
  reportToConsole(metric);

  // 上报到 Sentry（所有环境）
  reportToSentry(metric);

  // 上报到自定义分析端点（如果配置）
  reportToAnalytics(metric);
}

/**
 * React 组件：Web Vitals Reporter
 *
 * 使用 Next.js 的 useReportWebVitals hook 自动收集指标
 */
export function WebVitalsReporter() {
  if (typeof window === 'undefined') return null;

  // 在客户端加载 web-vitals 库
  import('web-vitals').then(({ onCLS, onFID, onFCP, onLCP, onTTFB, onINP }) => {
    onCLS(reportWebVitals);
    onFID(reportWebVitals);
    onFCP(reportWebVitals);
    onLCP(reportWebVitals);
    onTTFB(reportWebVitals);
    onINP(reportWebVitals);
  });

  return null;
}
