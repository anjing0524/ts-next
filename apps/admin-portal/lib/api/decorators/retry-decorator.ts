/**
 * 重试装饰器
 * 为HTTP客户端添加智能重试功能
 */

import type { HttpClient, HttpRequestOptions, HttpResponse, HttpClientDecorator, RetryConfig } from '../client/types';
import { HttpClientDecoratorBase } from '../client/http-client';

/**
 * 重试装饰器
 */
export class RetryDecorator extends HttpClientDecoratorBase {
  private readonly config: Required<RetryConfig>;

  constructor(
    wrappedClient: HttpClient,
    config: RetryConfig = {}
  ) {
    super(wrappedClient);
    this.config = this.mergeConfig(config);
  }

  /**
   * 发送HTTP请求（带重试）
   */
  async request<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const retryConfig = this.getRetryConfig(options);
    const maxAttempts = retryConfig.maxAttempts;
    const retryCondition = retryConfig.retryCondition;

    let lastError: any = null;
    let lastResponse: HttpResponse<T> | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.wrappedClient.request<T>(url, {
          ...options,
          // 在重试时跳过缓存
          skipCache: attempt > 1 ? true : options.skipCache,
        });

        // 检查是否需要重试（针对部分成功的响应）
        if (this.shouldRetryOnResponse(response, attempt, maxAttempts)) {
          lastResponse = response;
          if (attempt < maxAttempts) {
            await this.delayBeforeRetry(attempt, retryConfig);
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError = error;

        // 检查是否需要重试
        if (attempt < maxAttempts && retryCondition(error, attempt)) {
          await this.delayBeforeRetry(attempt, retryConfig);
          continue;
        }

        // 不再重试，抛出错误
        throw error;
      }
    }

    // 所有重试都失败
    if (lastResponse) {
      return lastResponse;
    }

    throw lastError || new Error('Request failed after all retry attempts');
  }

  /**
   * 合并配置
   */
  private mergeConfig(config: RetryConfig): Required<RetryConfig> {
    return {
      maxAttempts: config.maxAttempts || 3,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      backoffFactor: config.backoffFactor || 2,
      jitter: config.jitter !== false,
      retryCondition: config.retryCondition || this.defaultRetryCondition,
    };
  }

  /**
   * 获取重试配置（合并选项和装饰器配置）
   */
  private getRetryConfig(options: HttpRequestOptions): Required<RetryConfig> {
    return {
      maxAttempts: options.retries || this.config.maxAttempts,
      baseDelay: options.retryDelay || this.config.baseDelay,
      maxDelay: this.config.maxDelay,
      backoffFactor: this.config.backoffFactor,
      jitter: this.config.jitter,
      retryCondition: this.config.retryCondition,
    };
  }

  /**
   * 默认重试条件
   */
  private defaultRetryCondition(error: any, attempt: number): boolean {
    // 不重试认证错误
    if (error?.status === 401 || error?.message?.includes('401')) {
      return false;
    }

    // 不重试验证错误
    if (error?.status === 400 || error?.message?.includes('400')) {
      return false;
    }

    // 不重试未找到错误
    if (error?.status === 404 || error?.message?.includes('404')) {
      return false;
    }

    // 不重试客户端错误（4xx），除了速率限制
    if (error?.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
      return false;
    }

    // 重试网络错误和服务器错误
    if (error instanceof TypeError || error?.status >= 500 || error?.status === 429) {
      return true;
    }

    // 检查是否离线
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    return true;
  }

  /**
   * 检查是否需要在响应上重试
   */
  private shouldRetryOnResponse<T>(response: HttpResponse<T>, attempt: number, maxAttempts: number): boolean {
    // 对于部分成功的响应（如206），可以重试获取完整数据
    if (response.status === 206 && attempt < maxAttempts) {
      return true;
    }

    // 对于服务器错误，可以重试
    if (response.status >= 500 && attempt < maxAttempts) {
      return true;
    }

    return false;
  }

  /**
   * 重试前的延迟
   */
  private async delayBeforeRetry(attempt: number, config: Required<RetryConfig>): Promise<void> {
    const delay = this.calculateDelay(attempt, config);
    await this.sleep(delay);
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(attempt: number, config: Required<RetryConfig>): number {
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
    delay = Math.min(delay, config.maxDelay);

    // 添加抖动以防止惊群效应
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取重试配置
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * 更新重试配置
   */
  updateConfig(config: Partial<RetryConfig>): void {
    Object.assign(this.config, config);
  }
}