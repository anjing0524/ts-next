/**
 * RetryWithCircuitBreaker - 带熔断器的重试机制
 * 
 * 提供智能重试策略和熔断器模式，防止系统过载
 */

export interface RetryConfig {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  jitter?: boolean;
  retryCondition?: (error: any, attempt: number) => boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
  expectedExceptionPredicate?: (error: any) => boolean;
}

export interface RetryStats {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  lastError?: any;
  averageRetryTime: number;
}

export class CircuitBreakerState {
  public failureCount = 0;
  public lastFailureTime = 0;
  public state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  public nextAttemptTime = 0;

  constructor(private config: CircuitBreakerConfig) {}

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= (this.config.failureThreshold || 5)) {
      this.open();
    }
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private open(): void {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + (this.config.resetTimeout || 60000);
  }

  canAttempt(): boolean {
    const now = Date.now();
    
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'OPEN') {
      if (now >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    
    // HALF_OPEN state - allow one attempt
    return true;
  }

  isExpectedException(error: any): boolean {
    return this.config.expectedExceptionPredicate?.(error) || false;
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    this.nextAttemptTime = 0;
  }

  getState(): {
    state: string;
    failureCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}

export class RetryWithCircuitBreaker {
  private static circuitBreakers = new Map<string, CircuitBreakerState>();
  private static retryStats = new Map<string, RetryStats>();

  /**
   * 执行带重试和熔断器的操作
   */
  static async execute<T>(
    key: string,
    operation: () => Promise<T>,
    retryConfig: RetryConfig = {},
    circuitBreakerConfig: CircuitBreakerConfig = {}
  ): Promise<T> {
    const config = this.mergeRetryConfig(retryConfig);
    const cbConfig = this.mergeCircuitBreakerConfig(circuitBreakerConfig);
    
    // Get or create circuit breaker
    let circuitBreaker = this.circuitBreakers.get(key);
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreakerState(cbConfig);
      this.circuitBreakers.set(key, circuitBreaker);
    }

    // Get or create retry stats
    let stats = this.retryStats.get(key);
    if (!stats) {
      stats = {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        averageRetryTime: 0,
      };
      this.retryStats.set(key, stats);
    }

    // Check circuit breaker
    if (!circuitBreaker.canAttempt()) {
      throw new Error(`Circuit breaker is OPEN for key: ${key}`);
    }

    let lastError: any = null;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= config.maxAttempts!; attempt++) {
      stats.totalAttempts++;
      
      try {
        const result = await operation();
        
        // Record success
        circuitBreaker.recordSuccess();
        stats.successfulAttempts++;
        
        // Update average retry time
        const retryTime = Date.now() - startTime;
        stats.averageRetryTime = (stats.averageRetryTime * (stats.totalAttempts - 1) + retryTime) / stats.totalAttempts;
        
        return result;
      } catch (error) {
        lastError = error;
        stats.failedAttempts++;
        
        // Check if we should retry
        const shouldRetry = attempt < config.maxAttempts! && 
          this.defaultRetryCondition(error, attempt);
        
        if (!shouldRetry) {
          break;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt, config);
        
        // Wait before retry
        await this.sleep(delay);
      }
    }

    // All attempts failed
    circuitBreaker.recordFailure();
    throw lastError;
  }

  /**
   * 合并重试配置
   */
  private static mergeRetryConfig(config: RetryConfig): Required<RetryConfig> {
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
   * 合并熔断器配置
   */
  private static mergeCircuitBreakerConfig(config: CircuitBreakerConfig): Required<CircuitBreakerConfig> {
    return {
      failureThreshold: config.failureThreshold || 5,
      resetTimeout: config.resetTimeout || 60000,
      monitoringPeriod: config.monitoringPeriod || 60000,
      expectedExceptionPredicate: config.expectedExceptionPredicate || this.defaultExceptionPredicate,
    };
  }

  /**
   * 默认重试条件
   */
  private static defaultRetryCondition(error: any, attempt: number): boolean {
    // Don't retry on authentication errors
    if (error?.status === 401 || error?.message?.includes('401')) {
      return false;
    }

    // Don't retry on validation errors
    if (error?.status === 400 || error?.message?.includes('400')) {
      return false;
    }

    // Don't retry on not found errors
    if (error?.status === 404 || error?.message?.includes('404')) {
      return false;
    }

    // Don't retry on client errors (4xx) except for rate limiting
    if (error?.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
      return false;
    }

    // Retry on network errors and server errors
    if (error instanceof TypeError || error?.status >= 500 || error?.status === 429) {
      return true;
    }

    // Check if offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    return true;
  }

  /**
   * 默认异常断言
   */
  private static defaultExceptionPredicate(error: any): boolean {
    // Consider network errors and server errors as expected
    return (
      error instanceof TypeError ||
      error?.status >= 500 ||
      error?.status === 429 ||
      error?.message?.includes('timeout') ||
      error?.message?.includes('network')
    );
  }

  /**
   * 计算重试延迟
   */
  private static calculateDelay(attempt: number, config: Required<RetryConfig>): number {
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt - 1);
    delay = Math.min(delay, config.maxDelay);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }

  /**
   * 睡眠函数
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取熔断器状态
   */
  static getCircuitBreakerState(key: string) {
    const circuitBreaker = this.circuitBreakers.get(key);
    return circuitBreaker?.getState() || null;
  }

  /**
   * 获取重试统计
   */
  static getRetryStats(key: string): RetryStats | null {
    return this.retryStats.get(key) || null;
  }

  /**
   * 重置熔断器
   */
  static resetCircuitBreaker(key: string): void {
    const circuitBreaker = this.circuitBreakers.get(key);
    if (circuitBreaker) {
      circuitBreaker.reset();
    }
  }

  /**
   * 重置所有熔断器
   */
  static resetAllCircuitBreakers(): void {
    this.circuitBreakers.forEach(circuitBreaker => {
      circuitBreaker.reset();
    });
  }

  /**
   * 获取所有熔断器状态
   */
  static getAllCircuitBreakerStates(): Record<string, any> {
    const states: Record<string, any> = {};
    this.circuitBreakers.forEach((circuitBreaker, key) => {
      states[key] = circuitBreaker.getState();
    });
    return states;
  }

  /**
   * 获取所有重试统计
   */
  static getAllRetryStats(): Record<string, RetryStats> {
    const stats: Record<string, RetryStats> = {};
    this.retryStats.forEach((stat, key) => {
      stats[key] = stat;
    });
    return stats;
  }

  /**
   * 清理未使用的熔断器
   */
  static cleanup(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    this.circuitBreakers.forEach((circuitBreaker, key) => {
      const state = circuitBreaker.getState();
      // Remove if closed and no activity for 1 hour
      if (state.state === 'CLOSED' && state.failureCount === 0 && 
          now - state.lastFailureTime > 3600000) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach(key => {
      this.circuitBreakers.delete(key);
      this.retryStats.delete(key);
    });
  }
}