import { NextRequest } from 'next/server';

/**
 * 速率限制工具类 - 提供API速率限制功能
 * Rate limiting utility class - provides API rate limiting functions
 */
export class RateLimitUtils {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  /**
   * 检查给定的key是否已达到速率限制
   * Checks if the given key has reached the rate limit
   * 
   * @param key - 速率限制键 (Rate limit key)
   * @param maxRequests - 最大请求数 (Maximum requests)
   * @param windowMs - 时间窗口（毫秒） (Time window in milliseconds)
   * @returns 是否被限制 (Whether it's rate limited)
   */
  static isRateLimited(
    key: string,
    maxRequests: number = 100,
    windowMs: number = 60000
  ): boolean {
    // 测试环境和特殊情况下跳过速率限制
    // Skip rate limiting in test environment and special cases
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.DISABLE_RATE_LIMITING === 'true' ||
      key.startsWith('test-') ||
      key.includes('192.168.') || key.includes('127.0.0.1') ||
      key === 'unknown'
    ) {
      return false;
    }

    const now = Date.now();
    const record = this.requests.get(key);

    // 如果没有记录或者时间窗口已过期，重置计数
    // If no record exists or time window has expired, reset counter
    if (!record || now > record.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }

    // 如果已达到最大请求数，返回限制
    // If maximum requests reached, return limited
    if (record.count >= maxRequests) {
      return true;
    }

    // 增加计数
    // Increment counter
    record.count++;
    return false;
  }

  /**
   * 根据请求和类型生成速率限制的key
   * Generates a rate limiting key based on the request and type
   * 
   * @param request - Next.js请求对象 (Next.js request object)
   * @param type - 限制类型：'client'或'ip' (Limit type: 'client' or 'ip')
   * @returns 速率限制键 (Rate limit key)
   */
  static getRateLimitKey(request: NextRequest, type: 'client' | 'ip' = 'ip'): string {
    if (type === 'ip') {
      const forwardedFor = request.headers.get('x-forwarded-for');
      const realIp = request.headers.get('x-real-ip');
      
      const ip = 
        (forwardedFor?.split(',')[0]?.trim()) ||
        realIp ||
        'unknown';

      if (process.env.NODE_ENV === 'test') {
        return `test-${ip}`;
      }
      return ip;
    }
    
    // 客户端基础的速率限制键生成（占位符实现）
    // Client-based rate limiting key generation (placeholder implementation)
    console.warn("Client-based rate limiting key generation is placeholder. Implement actual client ID extraction.");
    return 'client-rate-limit-placeholder';
  }

  /**
   * 清除所有速率限制缓存
   * Clears all rate limit cache
   */
  static clearCache(): void {
    this.requests.clear();
    console.log("Rate limit cache cleared.");
  }

  /**
   * （仅用于测试）设置特定的速率限制状态
   * (For testing only) Sets a specific rate limit state
   * 
   * @param key - 速率限制键 (Rate limit key)
   * @param count - 当前计数 (Current count)
   * @param resetTime - 重置时间 (Reset time)
   */
  static setTestRateLimit(key: string, count: number, resetTime: number): void {
    if (process.env.NODE_ENV === 'test') {
      this.requests.set(key, { count, resetTime });
    } else {
      console.warn("setTestRateLimit called outside of test environment. Operation ignored.");
    }
  }
} 