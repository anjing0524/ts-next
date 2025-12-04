/**
 * 装饰器模式的HTTP客户端
 * 允许通过装饰器链式添加功能
 */

import type { HttpClient, HttpRequestOptions, HttpResponse, HttpClientDecorator, CacheConfig, RetryConfig, CircuitBreakerConfig, AuthConfig } from './types';
import { BaseHttpClient } from './base-client';
import { CacheDecorator } from '../decorators/cache-decorator';
import { RetryDecorator } from '../decorators/retry-decorator';
import { CircuitBreakerDecorator } from '../decorators/circuit-breaker-decorator';
import { AuthDecorator } from '../decorators/auth-decorator';
import { RequestDeduplicationDecorator, type DeduplicationConfig } from '../decorators/request-deduplication-decorator';
import { InstrumentationDecorator, type InstrumentationConfig } from '../decorators/instrumentation-decorator';

/**
 * 抽象装饰器基类
 */
export abstract class HttpClientDecoratorBase implements HttpClientDecorator {
  constructor(public readonly wrappedClient: HttpClient) {}

  abstract request<T = unknown>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  async get<T = unknown>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T = unknown>(url: string, data?: Record<string, unknown>, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = unknown>(url: string, data?: Record<string, unknown>, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = unknown>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  async patch<T = unknown>(url: string, data?: Record<string, unknown>, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async upload<T = unknown>(url: string, file: File, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {
        ...options?.headers,
        // 让浏览器自动设置Content-Type为multipart/form-data
      },
    });
  }
}

/**
 * HTTP客户端构建器
 */
export class HttpClientBuilder {
  private client: HttpClient;

  constructor(baseUrl?: string) {
    this.client = new BaseHttpClient(baseUrl);
  }

  /**
   * 添加缓存装饰器
   */
  withCache(config?: CacheConfig): HttpClientBuilder {
    this.client = new CacheDecorator(this.client, config);
    return this;
  }

  /**
   * 添加重试装饰器
   */
  withRetry(config?: RetryConfig): HttpClientBuilder {
    this.client = new RetryDecorator(this.client, config);
    return this;
  }

  /**
   * 添加熔断器装饰器
   */
  withCircuitBreaker(config?: CircuitBreakerConfig): HttpClientBuilder {
    this.client = new CircuitBreakerDecorator(this.client, config);
    return this;
  }

  /**
   * 添加认证装饰器
   */
  withAuth(config?: AuthConfig): HttpClientBuilder {
    this.client = new AuthDecorator(this.client, config);
    return this;
  }

  /**
   * 添加请求去重装饰器
   */
  withRequestDeduplication(config?: DeduplicationConfig): HttpClientBuilder {
    this.client = new RequestDeduplicationDecorator(this.client, config);
    return this;
  }

  /**
   * 添加仪表化装饰器（日志和指标收集）
   */
  withInstrumentation(config?: InstrumentationConfig): HttpClientBuilder {
    this.client = new InstrumentationDecorator(this.client, config);
    return this;
  }

  /**
   * 构建最终的HTTP客户端
   */
  build(): HttpClient {
    return this.client;
  }
}

/**
 * 默认HTTP客户端工厂
 */
export class HttpClientFactory {
  private static defaultClient: HttpClient | null = null;

  /**
   * 获取默认HTTP客户端
   */
  static getDefaultClient(): HttpClient {
    if (!this.defaultClient) {
      this.defaultClient = new HttpClientBuilder().build();
    }
    return this.defaultClient;
  }

  /**
   * 创建带所有装饰器的HTTP客户端
   * 装饰器链顺序（从内到外）：
   * BaseClient → Auth → RequestDedup → Retry → CircuitBreaker → Cache → Instrumentation
   * 仪表化在最外层以捕获所有操作的总时间
   */
  static createFullFeaturedClient(baseUrl?: string): HttpClient {
    return new HttpClientBuilder(baseUrl)
      .withAuth()
      .withRequestDeduplication()
      .withRetry()
      .withCircuitBreaker()
      .withCache()
      .withInstrumentation()
      .build();
  }

  /**
   * 创建SSR兼容的HTTP客户端
   */
  static createSSRClient(baseUrl?: string): HttpClient {
    return new HttpClientBuilder(baseUrl).build();
  }

  /**
   * 创建简单HTTP客户端（无装饰器）
   */
  static createSimpleClient(baseUrl?: string): HttpClient {
    return new BaseHttpClient(baseUrl);
  }
}

/**
 * 导出默认HTTP客户端
 */
export const defaultHttpClient = HttpClientFactory.getDefaultClient();