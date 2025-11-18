/**
 * Unit tests for ErrorHandler
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ErrorHandler } from './error-handler';

describe('ErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNetworkError', () => {
    it('should create network error with all fields', () => {
      const error = ErrorHandler.createNetworkError('Connection failed', 500, 'https://api.example.com');

      expect(error.type).toBe('network');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Connection failed');
      expect(error.status).toBe(500);
      expect(error.url).toBe('https://api.example.com');
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it('should create network error with minimal fields', () => {
      const error = ErrorHandler.createNetworkError('Connection timeout');

      expect(error.type).toBe('network');
      expect(error.message).toBe('Connection timeout');
      expect(error.status).toBeUndefined();
      expect(error.url).toBeUndefined();
    });

    it('should generate current timestamp', () => {
      const beforeTime = Date.now();
      const error = ErrorHandler.createNetworkError('Test');
      const afterTime = Date.now();

      expect(error.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(error.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('createAuthError', () => {
    it('should create auth error for expired reason', () => {
      const error = ErrorHandler.createAuthError('expired', 'Token expired');

      expect(error.type).toBe('auth');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.reason).toBe('expired');
      expect(error.message).toBe('Token expired');
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it('should create auth error for invalid reason', () => {
      const error = ErrorHandler.createAuthError('invalid', 'Invalid credentials');

      expect(error.reason).toBe('invalid');
    });

    it('should create auth error for missing reason', () => {
      const error = ErrorHandler.createAuthError('missing', 'Token not found');

      expect(error.reason).toBe('missing');
    });

    it('should create auth error for forbidden reason', () => {
      const error = ErrorHandler.createAuthError('forbidden', 'Access denied');

      expect(error.reason).toBe('forbidden');
    });
  });

  describe('createValidationError', () => {
    it('should create validation error with all fields', () => {
      const error = ErrorHandler.createValidationError('Invalid email', 'email', 'not-an-email');

      expect(error.type).toBe('validation');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid email');
      expect(error.field).toBe('email');
      expect(error.value).toBe('not-an-email');
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it('should create validation error with minimal fields', () => {
      const error = ErrorHandler.createValidationError('Validation failed');

      expect(error.type).toBe('validation');
      expect(error.message).toBe('Validation failed');
      expect(error.field).toBeUndefined();
      expect(error.value).toBeUndefined();
    });

    it('should accept any value type', () => {
      const objectError = ErrorHandler.createValidationError('Invalid object', 'data', { key: 'value' });
      expect(objectError.value).toEqual({ key: 'value' });

      const arrayError = ErrorHandler.createValidationError('Invalid array', 'items', [1, 2, 3]);
      expect(arrayError.value).toEqual([1, 2, 3]);

      const nullError = ErrorHandler.createValidationError('Invalid null', 'field', null);
      expect(nullError.value).toBeNull();
    });
  });

  describe('createServerError', () => {
    it('should create server error with all fields', () => {
      const error = ErrorHandler.createServerError('Internal server error', 500, '/api/users');

      expect(error.type).toBe('server');
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.message).toBe('Internal server error');
      expect(error.status).toBe(500);
      expect(error.endpoint).toBe('/api/users');
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it('should create server error with minimal fields', () => {
      const error = ErrorHandler.createServerError('Service unavailable', 503);

      expect(error.type).toBe('server');
      expect(error.status).toBe(503);
      expect(error.endpoint).toBeUndefined();
    });
  });

  describe('Type guard functions', () => {
    describe('isNetworkError', () => {
      it('should return true for network errors', () => {
        const error = ErrorHandler.createNetworkError('Network error');
        expect(ErrorHandler.isNetworkError(error)).toBe(true);
      });

      it('should return false for non-network errors', () => {
        const authError = ErrorHandler.createAuthError('invalid', 'Invalid');
        expect(ErrorHandler.isNetworkError(authError)).toBe(false);
      });

      it('should return false for null', () => {
        expect(ErrorHandler.isNetworkError(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(ErrorHandler.isNetworkError(undefined)).toBe(false);
      });

      it('should return false for objects without type field', () => {
        expect(ErrorHandler.isNetworkError({ message: 'error' })).toBe(false);
      });
    });

    describe('isAuthError', () => {
      it('should return true for auth errors', () => {
        const error = ErrorHandler.createAuthError('expired', 'Expired');
        expect(ErrorHandler.isAuthError(error)).toBe(true);
      });

      it('should return false for non-auth errors', () => {
        const networkError = ErrorHandler.createNetworkError('Network error');
        expect(ErrorHandler.isAuthError(networkError)).toBe(false);
      });
    });

    describe('isValidationError', () => {
      it('should return true for validation errors', () => {
        const error = ErrorHandler.createValidationError('Validation error');
        expect(ErrorHandler.isValidationError(error)).toBe(true);
      });

      it('should return false for non-validation errors', () => {
        const serverError = ErrorHandler.createServerError('Server error', 500);
        expect(ErrorHandler.isValidationError(serverError)).toBe(false);
      });
    });

    describe('isServerError', () => {
      it('should return true for server errors', () => {
        const error = ErrorHandler.createServerError('Server error', 500);
        expect(ErrorHandler.isServerError(error)).toBe(true);
      });

      it('should return false for non-server errors', () => {
        const validationError = ErrorHandler.createValidationError('Validation error');
        expect(ErrorHandler.isServerError(validationError)).toBe(false);
      });
    });
  });

  describe('getUserMessage', () => {
    it('should return network error message', () => {
      const error = ErrorHandler.createNetworkError('Connection failed');
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('网络连接失败，请检查您的网络连接后重试');
    });

    it('should return auth error message for expired', () => {
      const error = ErrorHandler.createAuthError('expired', 'Token expired');
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('登录已过期，请重新登录');
    });

    it('should return auth error message for invalid', () => {
      const error = ErrorHandler.createAuthError('invalid', 'Invalid token');
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('登录信息无效，请重新登录');
    });

    it('should return auth error message for missing', () => {
      const error = ErrorHandler.createAuthError('missing', 'Token missing');
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('请先登录');
    });

    it('should return auth error message for forbidden', () => {
      const error = ErrorHandler.createAuthError('forbidden', 'Access denied');
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('您没有权限执行此操作');
    });

    it('should return validation error message with field', () => {
      const error = ErrorHandler.createValidationError('Invalid format', 'email');
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('email: Invalid format');
    });

    it('should return validation error message without field', () => {
      const error = ErrorHandler.createValidationError('Invalid input');
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('Invalid input');
    });

    it('should return server error message for 500', () => {
      const error = ErrorHandler.createServerError('Internal error', 500);
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('服务器内部错误，请稍后重试');
    });

    it('should return server error message for other status codes', () => {
      const error = ErrorHandler.createServerError('Bad request', 400);
      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe('服务器错误 (400)');
    });
  });

  describe('shouldRetry', () => {
    it('should return true for network errors', () => {
      const error = ErrorHandler.createNetworkError('Connection failed');
      expect(ErrorHandler.shouldRetry(error)).toBe(true);
    });

    it('should return true for 500 server errors', () => {
      const error = ErrorHandler.createServerError('Internal error', 500);
      expect(ErrorHandler.shouldRetry(error)).toBe(true);
    });

    it('should return true for 502 server errors', () => {
      const error = ErrorHandler.createServerError('Bad gateway', 502);
      expect(ErrorHandler.shouldRetry(error)).toBe(true);
    });

    it('should return true for 503 server errors', () => {
      const error = ErrorHandler.createServerError('Service unavailable', 503);
      expect(ErrorHandler.shouldRetry(error)).toBe(true);
    });

    it('should return true for 429 rate limit errors', () => {
      const error = ErrorHandler.createServerError('Too many requests', 429);
      expect(ErrorHandler.shouldRetry(error)).toBe(true);
    });

    it('should return false for 400 client errors', () => {
      const error = ErrorHandler.createServerError('Bad request', 400);
      expect(ErrorHandler.shouldRetry(error)).toBe(false);
    });

    it('should return false for auth errors', () => {
      const error = ErrorHandler.createAuthError('expired', 'Expired');
      expect(ErrorHandler.shouldRetry(error)).toBe(false);
    });

    it('should return false for validation errors', () => {
      const error = ErrorHandler.createValidationError('Invalid input');
      expect(ErrorHandler.shouldRetry(error)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should return increasing delays with exponential backoff', () => {
      const delay1 = ErrorHandler.getRetryDelay(1);
      const delay2 = ErrorHandler.getRetryDelay(2);
      const delay3 = ErrorHandler.getRetryDelay(3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should return delay for first attempt', () => {
      const delay = ErrorHandler.getRetryDelay(1);

      // First attempt: 1000 * 2^0 = 1000ms + jitter (0-200ms)
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThan(1200);
    });

    it('should return delay for second attempt', () => {
      const delay = ErrorHandler.getRetryDelay(2);

      // Second attempt: 1000 * 2^1 = 2000ms + jitter
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThan(2200);
    });

    it('should cap delay at 30 seconds', () => {
      const delay = ErrorHandler.getRetryDelay(10);

      // Should be capped at 30000ms + jitter
      expect(delay).toBeLessThanOrEqual(30200);
    });

    it('should include jitter', () => {
      const delays = Array.from({ length: 10 }, () => ErrorHandler.getRetryDelay(1));
      const uniqueDelays = new Set(delays);

      // With jitter, delays should be different
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('logError', () => {
    const originalConsoleError = console.error;
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      console.error = jest.fn();
    });

    afterEach(() => {
      console.error = originalConsoleError;
      process.env.NODE_ENV = originalEnv;
    });

    it('should log error in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = ErrorHandler.createNetworkError('Test error');

      ErrorHandler.logError(error);

      expect(console.error).toHaveBeenCalled();
    });

    it('should log error in production mode', () => {
      process.env.NODE_ENV = 'production';
      const error = ErrorHandler.createNetworkError('Test error');

      ErrorHandler.logError(error);

      expect(console.error).toHaveBeenCalled();
    });

    it('should include context in log', () => {
      const error = ErrorHandler.createNetworkError('Test error');
      const context = { userId: '123', action: 'login' };

      ErrorHandler.logError(error, context);

      expect(console.error).toHaveBeenCalled();
      const logCall = (console.error as jest.MockedFunction<typeof console.error>).mock.calls[0];
      expect(logCall[1]).toMatchObject({ context });
    });

    it('should include timestamp in ISO format', () => {
      const error = ErrorHandler.createNetworkError('Test error');

      ErrorHandler.logError(error);

      const logCall = (console.error as jest.MockedFunction<typeof console.error>).mock.calls[0];
      expect(logCall[1].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
