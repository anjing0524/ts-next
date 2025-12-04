/**
 * 请求去重装饰器
 * 防止在短时间内发送相同的重复请求
 * 对于GET、HEAD、OPTIONS等幂等请求进行自动去重
 */

import type { HttpClient, HttpRequestOptions, HttpResponse } from '../client/types';
import { HttpClientDecoratorBase } from '../client/http-client';

/**
 * 请求去重配置接口
 */
export interface DeduplicationConfig {
  // 需要去重的HTTP方法（默认：GET, HEAD, OPTIONS）
  methods?: string[];

  // 待处理请求的超时时间（毫秒，默认：60000）
  timeout?: number;

  // 缓存待处理请求的结果（默认：true）
  cachePendingResults?: boolean;

  // 按端点进行的覆盖配置
  endpoints?: Record<
    string,
    {
      methods?: string[];
      timeout?: number;
      enabled?: boolean;
    }
  >;
}

/**
 * 待处理请求的追踪信息
 */
interface PendingRequest {
  promise: Promise<HttpResponse<any>>;
  subscribers: number;
  startTime: number;
  dedupeKey: string;
}

/**
 * 请求去重装饰器
 * 防止在请求还在处理时发送相同的请求
 */
export class RequestDeduplicationDecorator extends HttpClientDecoratorBase {
  private readonly config: Required<DeduplicationConfig>;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(
    wrappedClient: HttpClient,
    config: DeduplicationConfig = {}
  ) {
    super(wrappedClient);
    this.config = this.mergeConfig(config);
  }

  /**
   * 发送HTTP请求（带请求去重）
   */
  async request<T = any>(
    url: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const dedupeKey = this.generateDedupeKey(url, options);
    const shouldDedupe = this.shouldDeduplicateRequest(url, options);

    if (!shouldDedupe) {
      return this.wrappedClient.request<T>(url, options);
    }

    // 检查是否有待处理的相同请求
    const pending = this.pendingRequests.get(dedupeKey);
    if (pending) {
      pending.subscribers++;
      console.log(
        `[RequestDedup] Reusing pending request: ${dedupeKey} (${pending.subscribers} subscribers)`
      );
      return pending.promise as Promise<HttpResponse<T>>;
    }

    // 启动新请求
    console.log(`[RequestDedup] Starting new request: ${dedupeKey}`);
    const promise = this.wrappedClient
      .request<T>(url, options)
      .finally(() => this.releasePendingRequest(dedupeKey));

    const pendingRequest: PendingRequest = {
      promise,
      subscribers: 1,
      startTime: Date.now(),
      dedupeKey,
    };

    this.pendingRequests.set(dedupeKey, pendingRequest);

    // 设置超时清理
    this.scheduleCleanup(dedupeKey);

    return promise;
  }

  /**
   * 生成去重键
   */
  private generateDedupeKey(url: string, options: HttpRequestOptions): string {
    // 如果明确指定了去重键，使用指定的
    if (options.dedupeKey) {
      return options.dedupeKey;
    }

    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : '';
    const params = options.params ? JSON.stringify(options.params) : '';
    const headers = this.extractDedupeHeaders(options.headers);

    return `${method}:${url}:${body}:${params}:${headers}`;
  }

  /**
   * 提取与去重相关的请求头
   * （排除掉易变的头部，如Authorization中的token）
   */
  private extractDedupeHeaders(headers?: HeadersInit): string {
    if (!headers) return '';

    // 将headers转换为Record<string, string>格式
    const headersRecord: Record<string, string> = {};

    if (Array.isArray(headers)) {
      // 处理数组形式的headers [[key, value], ...]
      for (const [key, value] of headers) {
        headersRecord[key] = value;
      }
    } else if (headers instanceof Headers) {
      // 处理Headers对象
      headers.forEach((value, key) => {
        headersRecord[key] = value;
      });
    } else {
      // 处理Record<string, string>形式
      Object.assign(headersRecord, headers);
    }

    // 只包含与请求去重相关的头部
    const dedupeRelevantHeaders: Record<string, string> = {};

    // Accept头部通常影响响应格式
    if (headersRecord['Accept']) {
      dedupeRelevantHeaders['Accept'] = headersRecord['Accept'];
    }

    // Accept-Language可能影响返回内容
    if (headersRecord['Accept-Language']) {
      dedupeRelevantHeaders['Accept-Language'] = headersRecord['Accept-Language'];
    }

    return JSON.stringify(dedupeRelevantHeaders);
  }

  /**
   * 判断请求是否应该被去重
   */
  private shouldDeduplicateRequest(url: string, options: HttpRequestOptions): boolean {
    const method = options.method || 'GET';

    // 检查是否明确禁用去重
    if (options.skipDedup === true) {
      return false;
    }

    // 检查端点特定配置
    const endpointConfig = this.config.endpoints?.[url];
    if (endpointConfig?.enabled === false) {
      return false;
    }

    // 获取此端点允许的方法列表
    const allowedMethods = endpointConfig?.methods || this.config.methods;
    const upperMethod = method.toUpperCase();

    return allowedMethods.includes(upperMethod);
  }

  /**
   * 释放待处理请求
   */
  private releasePendingRequest(dedupeKey: string): void {
    const pending = this.pendingRequests.get(dedupeKey);
    if (!pending) return;

    pending.subscribers--;
    console.log(
      `[RequestDedup] Released subscriber: ${dedupeKey} (${pending.subscribers} remaining)`
    );

    // 如果没有更多订阅者，清理该请求
    if (pending.subscribers <= 0) {
      this.pendingRequests.delete(dedupeKey);
      console.log(`[RequestDedup] Cleaned up pending request: ${dedupeKey}`);
    }
  }

  /**
   * 为待处理请求安排超时清理
   */
  private scheduleCleanup(dedupeKey: string): void {
    const pending = this.pendingRequests.get(dedupeKey);
    if (!pending) return;

    setTimeout(() => {
      const current = this.pendingRequests.get(dedupeKey);
      if (current && current.startTime === pending.startTime) {
        // 请求已经超时，强制清理
        this.pendingRequests.delete(dedupeKey);
        console.warn(`[RequestDedup] Cleaned up timed-out request: ${dedupeKey}`);
      }
    }, this.config.timeout);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    pendingCount: number;
    pendingRequests: Array<{
      dedupeKey: string;
      subscribers: number;
      age: number;
    }>;
  } {
    const pendingRequests = Array.from(this.pendingRequests.values()).map((req) => ({
      dedupeKey: req.dedupeKey,
      subscribers: req.subscribers,
      age: Date.now() - req.startTime,
    }));

    return {
      pendingCount: this.pendingRequests.size,
      pendingRequests,
    };
  }

  /**
   * 手动清理所有待处理请求
   */
  clearPendingRequests(): void {
    this.pendingRequests.clear();
    console.log('[RequestDedup] Cleared all pending requests');
  }

  /**
   * 合并配置
   */
  private mergeConfig(config: DeduplicationConfig): Required<DeduplicationConfig> {
    return {
      methods: config.methods || ['GET', 'HEAD', 'OPTIONS'],
      timeout: config.timeout ?? 60000,
      cachePendingResults: config.cachePendingResults ?? true,
      endpoints: config.endpoints || {},
    };
  }
}
