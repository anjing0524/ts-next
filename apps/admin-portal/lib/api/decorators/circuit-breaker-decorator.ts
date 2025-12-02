/**
 * 熔断器装饰器
 * 为HTTP客户端添加熔断器模式，防止系统过载
 */

import type { HttpClient, HttpRequestOptions, HttpResponse, HttpClientDecorator, CircuitBreakerConfig } from '../client/types';
import { HttpClientDecoratorBase } from '../client/http-client';

/**
 * 熔断器状态
 */
interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttemptTime: number;
}

/**
 * 熔断器装饰器
 */
export class CircuitBreakerDecorator extends HttpClientDecoratorBase {
  private readonly config: Required<CircuitBreakerConfig>;
  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();

  constructor(
    wrappedClient: HttpClient,
    config: CircuitBreakerConfig = {}
  ) {
    super(wrappedClient);
    this.config = this.mergeConfig(config);
  }

  /**
   * 发送HTTP请求（带熔断器）
   */
  async request<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const circuitBreakerKey = options.circuitBreakerKey || this.generateCircuitBreakerKey(url, options);
    const useCircuitBreaker = options.useCircuitBreaker !== false;

    if (!useCircuitBreaker) {
      return this.wrappedClient.request<T>(url, options);
    }

    const circuitBreaker = this.getOrCreateCircuitBreaker(circuitBreakerKey);

    // 检查熔断器状态
    if (!this.canAttempt(circuitBreaker)) {
      throw new Error(`Circuit breaker is OPEN for key: ${circuitBreakerKey}`);
    }

    try {
      const response = await this.wrappedClient.request<T>(url, options);

      // 记录成功
      this.recordSuccess(circuitBreaker);
      return response;
    } catch (error) {
      // 检查是否是预期异常
      if (this.isExpectedException(error)) {
        // 预期异常不计入失败计数
        throw error;
      }

      // 记录失败
      this.recordFailure(circuitBreaker);
      throw error;
    }
  }

  /**
   * 合并配置
   */
  private mergeConfig(config: CircuitBreakerConfig): Required<CircuitBreakerConfig> {
    return {
      failureThreshold: config.failureThreshold || 5,
      resetTimeout: config.resetTimeout || 60000,
      monitoringPeriod: config.monitoringPeriod || 60000,
      expectedExceptionPredicate: config.expectedExceptionPredicate || this.defaultExceptionPredicate,
    };
  }

  /**
   * 生成熔断器键
   */
  private generateCircuitBreakerKey(url: string, options: HttpRequestOptions): string {
    const method = options.method || 'GET';
    const baseUrl = url.split('?')[0]; // 移除查询参数
    return `${method}:${baseUrl}`;
  }

  /**
   * 获取或创建熔断器
   */
  private getOrCreateCircuitBreaker(key: string): CircuitBreakerState {
    let circuitBreaker = this.circuitBreakers.get(key);
    if (!circuitBreaker) {
      circuitBreaker = {
        failureCount: 0,
        lastFailureTime: 0,
        state: 'CLOSED',
        nextAttemptTime: 0,
      };
      this.circuitBreakers.set(key, circuitBreaker);
    }
    return circuitBreaker;
  }

  /**
   * 检查是否可以尝试
   */
  private canAttempt(circuitBreaker: CircuitBreakerState): boolean {
    const now = Date.now();

    if (circuitBreaker.state === 'CLOSED') {
      return true;
    }

    if (circuitBreaker.state === 'OPEN') {
      if (now >= circuitBreaker.nextAttemptTime) {
        circuitBreaker.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    // HALF_OPEN 状态 - 允许一次尝试
    return true;
  }

  /**
   * 记录成功
   */
  private recordSuccess(circuitBreaker: CircuitBreakerState): void {
    circuitBreaker.failureCount = 0;
    circuitBreaker.state = 'CLOSED';
  }

  /**
   * 记录失败
   */
  private recordFailure(circuitBreaker: CircuitBreakerState): void {
    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = Date.now();

    if (circuitBreaker.failureCount >= this.config.failureThreshold) {
      this.openCircuitBreaker(circuitBreaker);
    }
  }

  /**
   * 打开熔断器
   */
  private openCircuitBreaker(circuitBreaker: CircuitBreakerState): void {
    circuitBreaker.state = 'OPEN';
    circuitBreaker.nextAttemptTime = Date.now() + this.config.resetTimeout;
  }

  /**
   * 默认异常断言
   */
  private defaultExceptionPredicate(error: any): boolean {
    // 将网络错误和服务器错误视为预期异常
    return (
      error instanceof TypeError ||
      error?.status >= 500 ||
      error?.status === 429 ||
      error?.message?.includes('timeout') ||
      error?.message?.includes('network')
    );
  }

  /**
   * 检查是否是预期异常
   */
  private isExpectedException(error: any): boolean {
    return this.config.expectedExceptionPredicate(error);
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(key: string): CircuitBreakerState | null {
    return this.circuitBreakers.get(key) || null;
  }

  /**
   * 获取所有熔断器状态
   */
  getAllCircuitBreakerStates(): Record<string, CircuitBreakerState> {
    const states: Record<string, CircuitBreakerState> = {};
    this.circuitBreakers.forEach((circuitBreaker, key) => {
      states[key] = { ...circuitBreaker };
    });
    return states;
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(key: string): void {
    const circuitBreaker = this.circuitBreakers.get(key);
    if (circuitBreaker) {
      circuitBreaker.failureCount = 0;
      circuitBreaker.lastFailureTime = 0;
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.nextAttemptTime = 0;
    }
  }

  /**
   * 重置所有熔断器
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.forEach(circuitBreaker => {
      circuitBreaker.failureCount = 0;
      circuitBreaker.lastFailureTime = 0;
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.nextAttemptTime = 0;
    });
  }

  /**
   * 清理未使用的熔断器
   */
  cleanup(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    this.circuitBreakers.forEach((circuitBreaker, key) => {
      // 如果熔断器关闭且1小时内无活动，则移除
      if (circuitBreaker.state === 'CLOSED' && circuitBreaker.failureCount === 0 &&
          now - circuitBreaker.lastFailureTime > 3600000) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach(key => {
      this.circuitBreakers.delete(key);
    });
  }

  /**
   * 获取熔断器配置
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  /**
   * 更新熔断器配置
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    Object.assign(this.config, config);
  }
}