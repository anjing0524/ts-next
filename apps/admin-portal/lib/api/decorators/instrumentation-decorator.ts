/**
 * 仪表化装饰器
 * 为HTTP请求自动收集性能指标和结构化日志
 * 应该放在装饰器链的最外层（最后应用）以捕获所有操作时间
 */

import type { HttpClient, HttpRequestOptions, HttpResponse } from '../client/types';
import { HttpClientDecoratorBase } from '../client/http-client';
import { logger } from '../../logger/logger';
import { metricsCollector, type RequestMetrics } from '../../metrics/collector';
import { generateRequestId } from '../../utils/request-id';

/**
 * 仪表化配置
 */
export interface InstrumentationConfig {
  // 是否启用日志记录
  enableLogging?: boolean;

  // 是否启用指标收集
  enableMetrics?: boolean;

  // 是否在日志中包含请求体（可能包含敏感信息）
  logRequestBody?: boolean;

  // 是否在日志中包含响应体
  logResponseBody?: boolean;

  // 慢请求阈值（毫秒），超过此值会记录警告
  slowRequestThreshold?: number;

  // 是否记录成功的请求
  logSuccessfulRequests?: boolean;

  // 敏感请求路径（不记录详细信息）
  sensitivePaths?: string[];
}

/**
 * 仪表化装饰器
 */
export class InstrumentationDecorator extends HttpClientDecoratorBase {
  private readonly config: Required<InstrumentationConfig>;

  constructor(
    wrappedClient: HttpClient,
    config: InstrumentationConfig = {}
  ) {
    super(wrappedClient);
    this.config = this.mergeConfig(config);
  }

  /**
   * 发送HTTP请求（带仪表化）
   */
  async request<T = any>(
    url: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const requestId = options.dedupeKey || generateRequestId();
    const method = options.method || 'GET';
    const startTime = Date.now();

    // 设置请求上下文
    logger.setContext({
      requestId,
      method,
      url,
    });

    const isSensitive = this.config.sensitivePaths.some((path) => url.includes(path));

    if (this.config.enableLogging) {
      const logData: Record<string, any> = {
        requestId,
        method,
        url,
      };

      if (this.config.logRequestBody && options.body && !isSensitive) {
        logData.bodySize = typeof options.body === 'string' ? options.body.length : 'unknown';
      }

      logger.debug('Request started', logData);
    }

    try {
      const response = await this.wrappedClient.request<T>(url, options);
      const duration = Date.now() - startTime;

      if (this.config.enableMetrics) {
        this.recordMetrics(method, url, requestId, duration, true, response.status);
      }

      if (this.config.enableLogging && this.config.logSuccessfulRequests) {
        const logData: Record<string, any> = {
          requestId,
          method,
          url,
          duration: `${duration}ms`,
          status: response.status,
        };

        if (duration > this.config.slowRequestThreshold) {
          logger.warn(`Slow request detected`, logData);
        } else {
          logger.debug('Request succeeded', logData);
        }
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (this.config.enableMetrics) {
        this.recordMetrics(method, url, requestId, duration, false, undefined, error);
      }

      if (this.config.enableLogging) {
        logger.error(`Request failed after ${duration}ms`, error instanceof Error ? error : null, {
          requestId,
          method,
          url,
          duration: `${duration}ms`,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        });
      }

      throw error;
    }
  }

  /**
   * 记录请求指标
   */
  private recordMetrics(
    method: string,
    url: string,
    requestId: string,
    duration: number,
    success: boolean,
    statusCode?: number,
    error?: any
  ): void {
    const metrics: RequestMetrics = {
      duration,
      success,
      statusCode,
      method,
      url,
      requestId,
      timestamp: Date.now(),
      errorType: !success && error ? error.constructor.name : undefined,
    };

    metricsCollector.recordRequest(metrics);
  }

  /**
   * 合并配置
   */
  private mergeConfig(config: InstrumentationConfig): Required<InstrumentationConfig> {
    return {
      enableLogging: config.enableLogging ?? true,
      enableMetrics: config.enableMetrics ?? true,
      logRequestBody: config.logRequestBody ?? false,
      logResponseBody: config.logResponseBody ?? false,
      slowRequestThreshold: config.slowRequestThreshold ?? 5000,
      logSuccessfulRequests: config.logSuccessfulRequests ?? false,
      sensitivePaths: config.sensitivePaths ?? ['/auth', '/token', '/login', '/password'],
    };
  }
}
