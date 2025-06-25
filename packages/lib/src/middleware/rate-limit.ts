// 文件路径: lib/auth/middleware/rate-limit.ts
// File path: lib/auth/middleware/rate-limit.ts
// 描述: 速率限制中间件
// Description: Rate Limiting Middleware

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitUtils } from '../utils';

/**
 * 速率限制选项接口
 * Rate limit options interface
 */
export interface RateLimitOptions {
  /** 时间窗口内最大请求数 (Maximum requests per time window) */
  maxRequests: number;
  /** 时间窗口大小(毫秒) (Time window size in milliseconds) */
  windowMs: number;
  /** 速率限制键类型 (Rate limit key type) */
  keyType: 'ip' | 'client' | 'user' | 'custom';
  /** 自定义键生成函数 (Custom key generator function) */
  keyGenerator?: (request: NextRequest) => string;
  /** 超出限制时的响应消息 (Response message when limit exceeded) */
  message?: string;
  /** 是否包含剩余请求数头部 (Include remaining requests headers) */
  includeHeaders?: boolean;
  /** 是否跳过速率限制 (Skip rate limiting) */
  skip?: (request: NextRequest) => boolean;
  /** 自定义错误响应 (Custom error response) */
  onLimitReached?: (request: NextRequest, retryAfter: number) => NextResponse;
}

/**
 * 默认速率限制配置
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT_OPTIONS: Partial<RateLimitOptions> = {
  maxRequests: 100,
  windowMs: 15 * 60 * 1000, // 15分钟 (15 minutes)
  keyType: 'ip',
  message: '请求过于频繁，请稍后再试 (Too many requests, please try again later)',
  includeHeaders: true,
};

/**
 * 生成速率限制键
 * Generate rate limit key
 * 
 * @param request - Next.js请求对象
 * @param options - 速率限制选项
 * @returns 速率限制键
 */
function generateRateLimitKey(request: NextRequest, options: RateLimitOptions): string {
  if (options.keyGenerator) {
    return options.keyGenerator(request);
  }

  switch (options.keyType) {
    case 'ip':
      return `rate_limit:ip:${getClientIP(request)}`;
    
    case 'client':
      const clientId = extractClientId(request);
      return clientId ? `rate_limit:client:${clientId}` : `rate_limit:ip:${getClientIP(request)}`;
    
    case 'user':
      const userId = extractUserId(request);
      return userId ? `rate_limit:user:${userId}` : `rate_limit:ip:${getClientIP(request)}`;
    
    case 'custom':
      return `rate_limit:custom:${getClientIP(request)}`;
    
    default:
      return `rate_limit:ip:${getClientIP(request)}`;
  }
}

/**
 * 获取客户端IP地址
 * Get client IP address
 * 
 * @param request - Next.js请求对象
 * @returns 客户端IP地址
 */
function getClientIP(request: NextRequest): string {
  // 尝试从各种可能的头部获取真实IP
  // Try to get real IP from various possible headers
  const xForwardedFor = request.headers.get('x-forwarded-for');
  const xRealIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  if (xForwardedFor) {
    // X-Forwarded-For可能包含多个IP，取第一个
    // X-Forwarded-For may contain multiple IPs, take the first one
    return xForwardedFor.split(',')[0]?.trim() || '127.0.0.1';
  }
  
  if (xRealIP) return xRealIP;
  if (cfConnectingIP) return cfConnectingIP;
  
  // 从URL中提取IP（可能不准确）
  // Extract IP from URL (may not be accurate)
  return '127.0.0.1';
}

/**
 * 从请求中提取客户端ID
 * Extract client ID from request
 * 
 * @param request - Next.js请求对象
 * @returns 客户端ID或null
 */
function extractClientId(request: NextRequest): string | null {
  // 尝试从Authorization头中提取客户端ID
  // Try to extract client ID from Authorization header
  const authorization = request.headers.get('authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    try {
      const token = authorization.substring(7);
      // 这里应该解析JWT令牌获取client_id，简化处理
      // Should parse JWT token to get client_id, simplified handling
      const tokenParts = token.split('.');
      if (tokenParts.length >= 2 && tokenParts[1]) {
        const payload = JSON.parse(atob(tokenParts[1]));
        return payload.client_id || null;
      }
    } catch {
      // 忽略解析错误 (Ignore parsing errors)
    }
  }
  
  // 尝试从请求体中获取client_id
  // Try to get client_id from request body
  const url = new URL(request.url);
  return url.searchParams.get('client_id');
}

/**
 * 从请求中提取用户ID
 * Extract user ID from request
 * 
 * @param request - Next.js请求对象
 * @returns 用户ID或null
 */
function extractUserId(request: NextRequest): string | null {
  // 尝试从Authorization头中提取用户ID
  // Try to extract user ID from Authorization header
  const authorization = request.headers.get('authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    try {
      const token = authorization.substring(7);
      // 这里应该解析JWT令牌获取sub (user_id)，简化处理
      // Should parse JWT token to get sub (user_id), simplified handling
      const tokenParts = token.split('.');
      if (tokenParts.length >= 2 && tokenParts[1]) {
        const payload = JSON.parse(atob(tokenParts[1]));
        return payload.sub || payload.user_id || null;
      }
    } catch {
      // 忽略解析错误 (Ignore parsing errors)
    }
  }
  
  return null;
}

/**
 * 添加速率限制响应头
 * Add rate limit response headers
 * 
 * @param response - 响应对象
 * @param limit - 请求限制
 * @param remaining - 剩余请求数
 * @param resetTime - 重置时间
 * @returns 添加了头部的响应
 */
function addRateLimitHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  resetTime: number
): NextResponse {
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  response.headers.set('X-RateLimit-Reset', resetTime.toString());
  
  if (remaining <= 0) {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
    response.headers.set('Retry-After', retryAfter.toString());
  }
  
  return response;
}

/**
 * 速率限制中间件
 * Rate limiting middleware
 * 
 * @param handler - 处理函数
 * @param options - 速率限制选项
 * @returns 包装后的中间件函数
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: Partial<RateLimitOptions> = {}
) {
  // 合并配置选项 (Merge configuration options)
  const rateLimitOptions: RateLimitOptions = {
    ...DEFAULT_RATE_LIMIT_OPTIONS,
    ...options,
  } as RateLimitOptions;

  return async function rateLimitMiddleware(request: NextRequest): Promise<NextResponse> {
    // 检查是否跳过速率限制 (Check if rate limiting should be skipped)
    if (rateLimitOptions.skip && rateLimitOptions.skip(request)) {
      return handler(request);
    }

    // 生成速率限制键 (Generate rate limit key)
    const rateLimitKey = generateRateLimitKey(request, rateLimitOptions);

    try {
      // 检查速率限制 (Check rate limit)
      const rateLimitResult = RateLimitUtils.checkRateLimit(rateLimitKey, {
        maxRequests: rateLimitOptions.maxRequests,
        windowMs: rateLimitOptions.windowMs
      });

      if (!rateLimitResult.allowed) {
        // 超出速率限制 (Rate limit exceeded)
        const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
        
        // 使用自定义错误响应或默认响应 (Use custom error response or default)
        if (rateLimitOptions.onLimitReached) {
          return rateLimitOptions.onLimitReached(request, retryAfter);
        }

        const errorResponse = NextResponse.json(
          {
            success: false,
            error: 'rate_limit_exceeded',
            message: rateLimitOptions.message,
            retryAfter,
          },
          { status: 429 }
        );

        // 添加速率限制头部 (Add rate limit headers)
        if (rateLimitOptions.includeHeaders) {
          addRateLimitHeaders(
            errorResponse,
            rateLimitOptions.maxRequests,
            rateLimitResult.remaining,
            rateLimitResult.resetTime
          );
        }

        return errorResponse;
      }

      // 调用原始处理函数 (Call original handler)
      const response = await handler(request);

      // 添加速率限制头部 (Add rate limit headers)
      if (rateLimitOptions.includeHeaders) {
        addRateLimitHeaders(
          response,
          rateLimitOptions.maxRequests,
          rateLimitResult.remaining,
          rateLimitResult.resetTime
        );
      }

      return response;
    } catch (error) {
      console.error('速率限制中间件错误 (Rate limit middleware error):', error);
      
      // 发生错误时继续处理请求 (Continue processing request on error)
      return handler(request);
    }
  };
}

/**
 * OAuth端点速率限制中间件
 * OAuth endpoint rate limiting middleware
 * 
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
export function withOAuthRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  maxRequests: number = 60,
  windowMs: number = 60 * 1000 // 1分钟 (1 minute)
) {
  return withRateLimit(handler, {
    maxRequests,
    windowMs,
    keyType: 'client',
    message: 'OAuth请求过于频繁，请稍后再试 (OAuth requests too frequent, please try again later)',
  });
}

/**
 * 基于IP的速率限制中间件
 * IP-based rate limiting middleware
 * 
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
export function withIPRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15分钟 (15 minutes)
) {
  return withRateLimit(handler, {
    maxRequests,
    windowMs,
    keyType: 'ip',
    message: 'IP请求过于频繁，请稍后再试 (IP requests too frequent, please try again later)',
  });
}

/**
 * 基于用户的速率限制中间件
 * User-based rate limiting middleware
 * 
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
export function withUserRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  maxRequests: number = 200,
  windowMs: number = 15 * 60 * 1000 // 15分钟 (15 minutes)
) {
  return withRateLimit(handler, {
    maxRequests,
    windowMs,
    keyType: 'user',
    message: '用户请求过于频繁，请稍后再试 (User requests too frequent, please try again later)',
  });
} 