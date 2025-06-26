/**
 * 工具模块类型定义
 * Utility module type definitions
 */

// 速率限制相关类型
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

// 时间轮相关类型
export interface TaskOptions {
  delay: number;
  callback: () => void;
  repeat: boolean;
  maxExecutions?: number;
}
