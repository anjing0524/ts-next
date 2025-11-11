export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
  stack?: string;
}

export interface NetworkError extends AppError {
  type: 'network';
  status?: number;
  url?: string;
}

export interface AuthenticationError extends AppError {
  type: 'auth';
  reason: 'expired' | 'invalid' | 'missing' | 'forbidden';
}

export interface ValidationError extends AppError {
  type: 'validation';
  field?: string;
  value?: any;
}

export interface ServerError extends AppError {
  type: 'server';
  status: number;
  endpoint?: string;
}

export type ErrorType = NetworkError | AuthenticationError | ValidationError | ServerError;

export class ErrorHandler {
  private static readonly ERROR_CODES = {
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTH_ERROR: 'AUTH_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    SERVER_ERROR: 'SERVER_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  };

  static createNetworkError(message: string, status?: number, url?: string): NetworkError {
    return {
      type: 'network',
      code: this.ERROR_CODES.NETWORK_ERROR,
      message,
      status,
      url,
      timestamp: Date.now(),
    };
  }

  static createAuthError(reason: AuthenticationError['reason'], message: string): AuthenticationError {
    return {
      type: 'auth',
      code: this.ERROR_CODES.AUTH_ERROR,
      message,
      reason,
      timestamp: Date.now(),
    };
  }

  static createValidationError(message: string, field?: string, value?: any): ValidationError {
    return {
      type: 'validation',
      code: this.ERROR_CODES.VALIDATION_ERROR,
      message,
      field,
      value,
      timestamp: Date.now(),
    };
  }

  static createServerError(message: string, status: number, endpoint?: string): ServerError {
    return {
      type: 'server',
      code: this.ERROR_CODES.SERVER_ERROR,
      message,
      status,
      endpoint,
      timestamp: Date.now(),
    };
  }

  static isNetworkError(error: any): error is NetworkError {
    return error?.type === 'network';
  }

  static isAuthError(error: any): error is AuthenticationError {
    return error?.type === 'auth';
  }

  static isValidationError(error: any): error is ValidationError {
    return error?.type === 'validation';
  }

  static isServerError(error: any): error is ServerError {
    return error?.type === 'server';
  }

  static getUserMessage(error: ErrorType): string {
    switch (error.type) {
      case 'network':
        return '网络连接失败，请检查您的网络连接后重试';
      case 'auth':
        switch (error.reason) {
          case 'expired':
            return '登录已过期，请重新登录';
          case 'invalid':
            return '登录信息无效，请重新登录';
          case 'missing':
            return '请先登录';
          case 'forbidden':
            return '您没有权限执行此操作';
          default:
            return '身份验证失败';
        }
      case 'validation':
        return error.field ? `${error.field}: ${error.message}` : error.message;
      case 'server':
        return error.status === 500 
          ? '服务器内部错误，请稍后重试'
          : `服务器错误 (${error.status})`;
      default:
        return '发生未知错误，请重试';
    }
  }

  static shouldRetry(error: ErrorType): boolean {
    switch (error.type) {
      case 'network':
        return true;
      case 'server':
        return error.status >= 500 || error.status === 429;
      case 'auth':
        return false;
      case 'validation':
        return false;
      default:
        return false;
    }
  }

  static getRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
    const jitter = Math.random() * 200;
    return baseDelay + jitter;
  }

  static logError(error: ErrorType, context?: any): void {
    const errorData = {
      ...error,
      context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      timestamp: new Date(error.timestamp).toISOString(),
    };

    if (process.env.NODE_ENV === 'development') {
      console.error('Error:', errorData);
    } else {
      // In production, send to error tracking service
      console.error('Error logged:', errorData);
    }
  }
}