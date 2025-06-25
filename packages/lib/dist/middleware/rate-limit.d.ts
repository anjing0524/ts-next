import { NextRequest, NextResponse } from 'next/server';
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
 * 速率限制中间件
 * Rate limiting middleware
 *
 * @param handler - 处理函数
 * @param options - 速率限制选项
 * @returns 包装后的中间件函数
 */
export declare function withRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, options?: Partial<RateLimitOptions>): (request: NextRequest) => Promise<NextResponse>;
/**
 * OAuth端点速率限制中间件
 * OAuth endpoint rate limiting middleware
 *
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
export declare function withOAuthRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, maxRequests?: number, windowMs?: number): (request: NextRequest) => Promise<NextResponse>;
/**
 * 基于IP的速率限制中间件
 * IP-based rate limiting middleware
 *
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
export declare function withIPRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, maxRequests?: number, windowMs?: number): (request: NextRequest) => Promise<NextResponse>;
/**
 * 基于用户的速率限制中间件
 * User-based rate limiting middleware
 *
 * @param handler - 处理函数
 * @param maxRequests - 最大请求数
 * @param windowMs - 时间窗口
 * @returns 包装后的中间件函数
 */
export declare function withUserRateLimit(handler: (request: NextRequest) => Promise<NextResponse>, maxRequests?: number, windowMs?: number): (request: NextRequest) => Promise<NextResponse>;
//# sourceMappingURL=rate-limit.d.ts.map