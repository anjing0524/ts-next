/**
 * 工具模块类型定义
 * Utility module type definitions
 */
export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    keyType?: 'ip' | 'client';
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
    retryAfter?: number;
}
export interface TaskOptions {
    delay: number;
    callback: () => void;
    repeat: boolean;
    maxExecutions?: number;
}
//# sourceMappingURL=types.d.ts.map