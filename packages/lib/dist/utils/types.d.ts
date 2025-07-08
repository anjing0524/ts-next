/**
 * 工具模块类型定义
 * Utility module type definitions
 */
interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    keyType?: 'ip' | 'client';
}
interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
    retryAfter?: number;
}
interface TaskOptions {
    delay: number;
    callback: () => void;
    repeat: boolean;
    maxExecutions?: number;
}

export type { RateLimitConfig, RateLimitResult, TaskOptions };
