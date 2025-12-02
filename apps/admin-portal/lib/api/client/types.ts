/**
 * API客户端类型定义
 * 用于装饰器模式的HTTP客户端
 */

/**
 * HTTP请求选项
 */
export interface HttpRequestOptions extends RequestInit {
  /** 请求超时时间（毫秒） */
  timeout?: number;
  /** 是否跳过认证刷新 */
  skipAuthRefresh?: boolean;
  /** 请求去重键 */
  dedupeKey?: string;
  /** 缓存键 */
  cacheKey?: string;
  /** 缓存TTL（毫秒） */
  cacheTTL?: number;
  /** 是否跳过缓存 */
  skipCache?: boolean;
  /** 是否显示加载状态 */
  showLoading?: boolean;
  /** 是否显示错误 */
  showError?: boolean;
  /** 加载状态键 */
  loadingKey?: string;
  /** 错误键 */
  errorKey?: string;
  /** 强制刷新缓存 */
  forceRefresh?: boolean;
  /** 是否使用stale-while-revalidate模式 */
  staleWhileRevalidate?: boolean;
  /** 是否使用熔断器 */
  useCircuitBreaker?: boolean;
  /** 熔断器键 */
  circuitBreakerKey?: string;
  /** 重试次数 */
  retries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 查询参数 */
  params?: Record<string, any>;
  /** 响应类型 */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer' | 'formdata';
}

/**
 * HTTP响应包装器
 */
export interface HttpResponse<T = any> {
  /** 响应数据 */
  data: T;
  /** 响应状态码 */
  status: number;
  /** 响应头 */
  headers: Headers;
  /** 响应时间戳 */
  timestamp: number;
}

/**
 * HTTP客户端接口
 */
export interface HttpClient {
  /**
   * 发送HTTP请求
   */
  request<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * GET请求
   */
  get<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * POST请求
   */
  post<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * PUT请求
   */
  put<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * DELETE请求
   */
  delete<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * PATCH请求
   */
  patch<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>>;

  /**
   * 文件上传
   */
  upload<T = any>(url: string, file: File, options?: HttpRequestOptions): Promise<HttpResponse<T>>;
}

/**
 * HTTP客户端装饰器接口
 */
export interface HttpClientDecorator extends HttpClient {
  /**
   * 包装的HTTP客户端
   */
  readonly wrappedClient: HttpClient;
}

/**
 * 错误类型
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * 认证错误
 */
export class AuthError extends HttpError {
  constructor(message: string = 'Authentication failed') {
    super(401, 'AUTH_ERROR', message);
    this.name = 'AuthError';
  }
}

/**
 * 网络错误
 */
export class NetworkError extends HttpError {
  constructor(message: string = 'Network error') {
    super(0, 'NETWORK_ERROR', message);
    this.name = 'NetworkError';
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends HttpError {
  constructor(message: string = 'Request timeout') {
    super(408, 'TIMEOUT_ERROR', message);
    this.name = 'TimeoutError';
  }
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 缓存策略：memory, session, local */
  strategy?: 'memory' | 'session' | 'local';
  /** 缓存键 */
  key?: string;
  /** 缓存TTL（毫秒） */
  ttl?: number;
  /** 是否强制刷新 */
  forceRefresh?: boolean;
  /** 是否使用stale-while-revalidate模式 */
  staleWhileRevalidate?: boolean;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts?: number;
  /** 基础延迟（毫秒） */
  baseDelay?: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 退避因子 */
  backoffFactor?: number;
  /** 是否添加抖动 */
  jitter?: boolean;
  /** 重试条件函数 */
  retryCondition?: (error: any, attempt: number) => boolean;
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 失败阈值 */
  failureThreshold?: number;
  /** 重置超时时间（毫秒） */
  resetTimeout?: number;
  /** 监控周期（毫秒） */
  monitoringPeriod?: number;
  /** 预期异常断言函数 */
  expectedExceptionPredicate?: (error: any) => boolean;
}

/**
 * 认证配置
 */
export interface AuthConfig {
  /** 认证服务URL */
  authServiceUrl?: string;
  /** 客户端ID */
  clientId?: string;
  /** 令牌刷新URL */
  tokenRefreshUrl?: string;
  /** 是否自动刷新令牌 */
  autoRefresh?: boolean;
  /** 刷新令牌前的最大重试次数 */
  refreshRetries?: number;
}