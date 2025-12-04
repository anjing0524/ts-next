/**
 * 性能指标收集器
 * 汇总API客户端性能数据（延迟、缓存命中、请求去重等）
 */

import { logger } from '../logger/logger';

/**
 * 请求指标接口
 */
export interface RequestMetrics {
  // 延迟指标（毫秒）
  duration: number;
  dnsLookup?: number;
  tcp?: number;
  ttfb?: number; // Time to First Byte

  // 状态指标
  success: boolean;
  statusCode?: number;
  errorType?: string;

  // 缓存指标
  cacheHit?: boolean;
  cacheAge?: number;

  // 请求去重指标
  wasDeduped?: boolean;
  dedupedRequestCount?: number;

  // 重试指标
  retried?: boolean;
  retryCount?: number;
  retrySuccess?: boolean;

  // 熔断器指标
  circuitBreakerOpen?: boolean;
  circuitBreakerFallback?: boolean;

  // 请求信息
  method?: string;
  url?: string;
  requestId?: string;
  timestamp: number;
}

/**
 * 聚合指标快照
 */
export interface MetricsSnapshot {
  // 请求计数
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;

  // 延迟指标（百分位数）
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    min: number;
    max: number;
  };

  // 缓存指标
  cache: {
    hitCount: number;
    missCount: number;
    hitRate: number; // 百分比
  };

  // 请求去重指标
  deduplication: {
    dedupedCount: number;
    dedupedRequests: number; // 被去重的请求总数
    dedupeRate: number; // 百分比
  };

  // 重试指标
  retry: {
    retriedCount: number;
    retrySuccessRate: number; // 百分比
  };

  // 熔断器指标
  circuitBreaker: {
    openCount: number;
    fallbackCount: number;
  };

  // 错误指标
  errors: {
    total: number;
    byType: Record<string, number>;
  };

  // 采集窗口
  collectWindow: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

/**
 * 性能指标收集器
 */
class MetricsCollector {
  private metrics: RequestMetrics[] = [];
  private maxMetrics = 1000; // 最多保留最后1000条请求
  private startTime = Date.now();

  /**
   * 记录请求指标
   */
  recordRequest(metrics: RequestMetrics): void {
    this.metrics.push(metrics);

    // 限制内存使用
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * 获取指标快照
   */
  getSnapshot(): MetricsSnapshot {
    const now = Date.now();
    const durations: number[] = [];
    let successCount = 0;
    let failCount = 0;
    let cacheHitCount = 0;
    let cacheMissCount = 0;
    let dedupedCount = 0;
    let dedupedRequests = 0;
    let retriedCount = 0;
    let retrySuccessCount = 0;
    let circuitBreakerOpenCount = 0;
    let fallbackCount = 0;
    const errorCounts: Record<string, number> = {};

    for (const metric of this.metrics) {
      durations.push(metric.duration);

      if (metric.success) {
        successCount++;
      } else {
        failCount++;
        if (metric.errorType) {
          errorCounts[metric.errorType] = (errorCounts[metric.errorType] || 0) + 1;
        }
      }

      if (metric.cacheHit) {
        cacheHitCount++;
      } else if (metric.cacheHit === false) {
        cacheMissCount++;
      }

      if (metric.wasDeduped) {
        dedupedCount++;
        dedupedRequests += metric.dedupedRequestCount || 1;
      }

      if (metric.retried) {
        retriedCount++;
        if (metric.retrySuccess) {
          retrySuccessCount++;
        }
      }

      if (metric.circuitBreakerOpen) {
        circuitBreakerOpenCount++;
      }

      if (metric.circuitBreakerFallback) {
        fallbackCount++;
      }
    }

    // 计算百分位数
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p50 = this.percentile(sortedDurations, 50);
    const p95 = this.percentile(sortedDurations, 95);
    const p99 = this.percentile(sortedDurations, 99);
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const totalRequests = successCount + failCount;
    const cacheTotal = cacheHitCount + cacheMissCount;

    return {
      totalRequests,
      successfulRequests: successCount,
      failedRequests: failCount,

      latency: {
        p50,
        p95,
        p99,
        avg,
        min: durations.length > 0 ? Math.min(...durations) : 0,
        max: durations.length > 0 ? Math.max(...durations) : 0,
      },

      cache: {
        hitCount: cacheHitCount,
        missCount: cacheMissCount,
        hitRate: cacheTotal > 0 ? (cacheHitCount / cacheTotal) * 100 : 0,
      },

      deduplication: {
        dedupedCount,
        dedupedRequests,
        dedupeRate: totalRequests > 0 ? (dedupedRequests / totalRequests) * 100 : 0,
      },

      retry: {
        retriedCount,
        retrySuccessRate: retriedCount > 0 ? (retrySuccessCount / retriedCount) * 100 : 0,
      },

      circuitBreaker: {
        openCount: circuitBreakerOpenCount,
        fallbackCount,
      },

      errors: {
        total: failCount,
        byType: errorCounts,
      },

      collectWindow: {
        startTime: this.startTime,
        endTime: now,
        duration: now - this.startTime,
      },
    };
  }

  /**
   * 清除所有指标
   */
  clear(): void {
    this.metrics = [];
    this.startTime = Date.now();
  }

  /**
   * 打印指标快照（用于调试）
   */
  printSnapshot(): void {
    const snapshot = this.getSnapshot();
    logger.info('Performance Metrics Snapshot', {
      totalRequests: snapshot.totalRequests,
      successRate: `${((snapshot.successfulRequests / snapshot.totalRequests) * 100).toFixed(2)}%`,
      avgLatency: `${snapshot.latency.avg.toFixed(2)}ms`,
      p95Latency: `${snapshot.latency.p95.toFixed(2)}ms`,
      cacheHitRate: `${snapshot.cache.hitRate.toFixed(2)}%`,
      dedupeRate: `${snapshot.deduplication.dedupeRate.toFixed(2)}%`,
      retrySuccessRate: `${snapshot.retry.retrySuccessRate.toFixed(2)}%`,
    });
  }

  /**
   * 获取原始指标数据（用于导出）
   */
  getRawMetrics(): RequestMetrics[] {
    return [...this.metrics];
  }

  /**
   * 计算百分位数
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    const value = sorted[Math.max(0, index)];
    return value ?? 0;
  }
}

/**
 * 导出单例指标收集器
 */
export const metricsCollector = new MetricsCollector();
