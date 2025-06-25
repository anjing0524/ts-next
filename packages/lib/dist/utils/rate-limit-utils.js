"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRateLimiter = exports.RateLimitUtils = void 0;
exports.createRateLimit = createRateLimit;
exports.createRequestRateLimit = createRequestRateLimit;
/**
 * 速率限制工具类 - 提供基于内存的滑动窗口限流功能
 * Rate limiting utility class - provides in-memory sliding window rate limiting
 */
class RateLimitUtils {
    /**
     * 启动清理过期记录的定时器
     * Starts the cleanup timer for expired records
     */
    static startCleanupTimer() {
        if (this.cleanupInterval)
            return;
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const expiredKeys = [];
            for (const [key, record] of this.store.entries()) {
                // 清理超过24小时未使用的记录
                // Clean up records not used for more than 24 hours
                if (now - record.lastRequest > 24 * 60 * 60 * 1000) {
                    expiredKeys.push(key);
                }
            }
            expiredKeys.forEach(key => this.store.delete(key));
        }, 5 * 60 * 1000); // 每5分钟清理一次 (Clean up every 5 minutes)
    }
    /**
     * 停止清理定时器
     * Stops the cleanup timer
     */
    static stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
    /**
     * 从请求中提取真实IP地址
     * Extracts real IP address from request
     */
    static getClientIP(request) {
        // 检查常见的代理头
        // Check common proxy headers
        const forwarded = request.headers.get('x-forwarded-for');
        if (forwarded) {
            const firstIP = forwarded.split(',')[0];
            return firstIP ? firstIP.trim() : 'unknown';
        }
        const realIP = request.headers.get('x-real-ip');
        if (realIP) {
            return realIP;
        }
        const cfConnectingIP = request.headers.get('cf-connecting-ip');
        if (cfConnectingIP) {
            return cfConnectingIP;
        }
        // 回退到连接IP（在某些环境中可能不可用）
        // Fallback to connection IP (may not be available in some environments)
        return 'unknown';
    }
    /**
     * 根据配置生成限流键
     * Generates rate limit key based on configuration
     */
    static generateKey(request, config) {
        const { keyType = 'ip', keyPrefix = 'rate_limit' } = config;
        let identifier;
        switch (keyType) {
            case 'ip':
                identifier = this.getClientIP(request);
                break;
            case 'client':
                // 从授权头或查询参数中提取客户端ID
                // Extract client ID from auth header or query params
                const authHeader = request.headers.get('authorization');
                let clientIdFromHeader = null;
                if (authHeader === null || authHeader === void 0 ? void 0 : authHeader.includes('client_id=')) {
                    const parts = authHeader.split('client_id=')[1];
                    if (parts) {
                        clientIdFromHeader = parts.split(' ')[0] || null;
                    }
                }
                const clientIdFromQuery = request.nextUrl.searchParams.get('client_id');
                identifier = clientIdFromHeader || clientIdFromQuery || this.getClientIP(request);
                break;
            case 'user':
                // 从JWT或会话中提取用户ID
                // Extract user ID from JWT or session
                const userAgent = request.headers.get('user-agent') || 'unknown';
                identifier = `${this.getClientIP(request)}-${userAgent.slice(0, 50)}`;
                break;
            default:
                identifier = this.getClientIP(request);
        }
        return `${keyPrefix}:${keyType}:${identifier}`;
    }
    /**
     * 检查是否超过速率限制
     * Checks if rate limit is exceeded
     */
    static checkRateLimit(key, config) {
        this.startCleanupTimer();
        const now = Date.now();
        const { maxRequests, windowMs } = config;
        let record = this.store.get(key);
        if (!record) {
            // 首次请求，创建新记录
            // First request, create new record
            record = {
                count: 1,
                windowStart: now,
                lastRequest: now,
            };
            this.store.set(key, record);
            return {
                allowed: true,
                remaining: maxRequests - 1,
                resetTime: now + windowMs,
                limit: maxRequests,
            };
        }
        // 检查是否需要重置窗口
        // Check if window needs to be reset
        if (now - record.windowStart >= windowMs) {
            record.count = 1;
            record.windowStart = now;
            record.lastRequest = now;
            return {
                allowed: true,
                remaining: maxRequests - 1,
                resetTime: now + windowMs,
                limit: maxRequests,
            };
        }
        // 在当前窗口内，检查是否超限
        // Within current window, check if limit is exceeded
        record.lastRequest = now;
        if (record.count >= maxRequests) {
            const resetTime = record.windowStart + windowMs;
            const retryAfter = resetTime - now;
            return {
                allowed: false,
                remaining: 0,
                resetTime,
                limit: maxRequests,
                retryAfter,
            };
        }
        // 未超限，增加计数
        // Not exceeded, increment count
        record.count++;
        return {
            allowed: true,
            remaining: maxRequests - record.count,
            resetTime: record.windowStart + windowMs,
            limit: maxRequests,
        };
    }
    /**
     * 为请求应用速率限制
     * Applies rate limiting to a request
     */
    static applyRateLimit(request, config) {
        const key = this.generateKey(request, config);
        return this.checkRateLimit(key, config);
    }
    /**
     * 重置指定键的限流记录
     * Resets rate limit record for specified key
     */
    static resetRateLimit(key) {
        this.store.delete(key);
    }
    /**
     * 获取指定键的当前限流状态
     * Gets current rate limit status for specified key
     */
    static getRateLimitStatus(key, config) {
        const record = this.store.get(key);
        const now = Date.now();
        if (!record) {
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetTime: now + config.windowMs,
                limit: config.maxRequests,
            };
        }
        // 检查窗口是否已过期
        // Check if window has expired
        if (now - record.windowStart >= config.windowMs) {
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetTime: now + config.windowMs,
                limit: config.maxRequests,
            };
        }
        const resetTime = record.windowStart + config.windowMs;
        const remaining = Math.max(0, config.maxRequests - record.count);
        const allowed = record.count < config.maxRequests;
        return {
            allowed,
            remaining,
            resetTime,
            limit: config.maxRequests,
            retryAfter: allowed ? undefined : resetTime - now,
        };
    }
    /**
     * 清空所有限流记录
     * Clears all rate limit records
     */
    static clearAll() {
        this.store.clear();
    }
    /**
     * 获取当前存储的记录数量
     * Gets the current number of stored records
     */
    static getRecordCount() {
        return this.store.size;
    }
}
exports.RateLimitUtils = RateLimitUtils;
RateLimitUtils.store = new Map();
RateLimitUtils.cleanupInterval = null;
/**
 * 预配置的默认限流器
 * Pre-configured default rate limiter
 */
exports.defaultRateLimiter = {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1分钟
    keyType: 'ip',
};
/**
 * 创建一个简单的限流检查函数
 * Creates a simple rate limiting check function
 */
function createRateLimit({ maxRequests, windowMs }) {
    return (key) => {
        return RateLimitUtils.checkRateLimit(key, { maxRequests, windowMs });
    };
}
/**
 * 创建一个请求级别的限流中间件函数
 * Creates a request-level rate limiting middleware function
 */
function createRequestRateLimit(config) {
    return (request) => {
        const key = RateLimitUtils.generateKey(request, config);
        return RateLimitUtils.checkRateLimit(key, config);
    };
}
