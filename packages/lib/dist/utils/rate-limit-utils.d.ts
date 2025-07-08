import { NextRequest } from 'next/server';

/**
 * 速率限制结果接口 - 定义限流检查的返回值
 * Rate limit result interface - defines the return value of rate limit checks
 */
interface RateLimitResult {
    /** 是否允许请求 (Whether the request is allowed) */
    allowed: boolean;
    /** 剩余请求数 (Remaining requests) */
    remaining: number;
    /** 重置时间戳 (Reset timestamp) */
    resetTime: number;
    /** 总限制数 (Total limit) */
    limit: number;
    /** 重试延迟时间(毫秒) (Retry delay in milliseconds) */
    retryAfter?: number;
}
/**
 * 速率限制配置接口 - 定义限流参数
 * Rate limit configuration interface - defines rate limiting parameters
 */
interface RateLimitConfig {
    /** 最大请求数 (Maximum requests) */
    maxRequests: number;
    /** 时间窗口（毫秒） (Time window in milliseconds) */
    windowMs: number;
    /** 限制类型：'ip'、'client'、'user' (Limit type: 'ip', 'client', 'user') */
    keyType?: 'ip' | 'client' | 'user';
    /** 自定义键前缀 (Custom key prefix) */
    keyPrefix?: string;
    /** 是否跳过成功请求的计数 (Whether to skip counting successful requests) */
    skipSuccessfulRequests?: boolean;
    /** 是否跳过失败请求的计数 (Whether to skip counting failed requests) */
    skipFailedRequests?: boolean;
}
/**
 * 速率限制工具类 - 提供基于内存的滑动窗口限流功能
 * Rate limiting utility class - provides in-memory sliding window rate limiting
 */
declare class RateLimitUtils {
    private static store;
    private static cleanupInterval;
    /**
     * 启动清理过期记录的定时器
     * Starts the cleanup timer for expired records
     */
    private static startCleanupTimer;
    /**
     * 停止清理定时器
     * Stops the cleanup timer
     */
    static stopCleanupTimer(): void;
    /**
     * 从请求中提取真实IP地址
     * Extracts real IP address from request
     */
    static getClientIP(request: NextRequest): string;
    /**
     * 根据配置生成限流键
     * Generates rate limit key based on configuration
     */
    static generateKey(request: NextRequest, config: RateLimitConfig): string;
    /**
     * 检查是否超过速率限制
     * Checks if rate limit is exceeded
     */
    static checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult;
    /**
     * 为请求应用速率限制
     * Applies rate limiting to a request
     */
    static applyRateLimit(request: NextRequest, config: RateLimitConfig): RateLimitResult;
    /**
     * 重置指定键的限流记录
     * Resets rate limit record for specified key
     */
    static resetRateLimit(key: string): void;
    /**
     * 获取指定键的当前限流状态
     * Gets current rate limit status for specified key
     */
    static getRateLimitStatus(key: string, config: RateLimitConfig): RateLimitResult;
    /**
     * 清空所有限流记录
     * Clears all rate limit records
     */
    static clearAll(): void;
    /**
     * 获取当前存储的记录数量
     * Gets the current number of stored records
     */
    static getRecordCount(): number;
}
/**
 * 预配置的默认限流器
 * Pre-configured default rate limiter
 */
declare const defaultRateLimiter: {
    maxRequests: number;
    windowMs: number;
    keyType: "ip";
};
/**
 * 创建一个简单的限流检查函数
 * Creates a simple rate limiting check function
 */
declare function createRateLimit({ maxRequests, windowMs, }: {
    maxRequests: number;
    windowMs: number;
}): (key: string) => RateLimitResult;
/**
 * 创建一个请求级别的限流中间件函数
 * Creates a request-level rate limiting middleware function
 */
declare function createRequestRateLimit(config: RateLimitConfig): (request: NextRequest) => RateLimitResult;

export { type RateLimitConfig, type RateLimitResult, RateLimitUtils, createRateLimit, createRequestRateLimit, defaultRateLimiter };
