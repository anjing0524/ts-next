"use strict";
/**
 * @fileoverview 通用缓存工具
 * @author 开发团队
 * @since 1.0.0
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheExists = exports.clearCache = exports.deleteCacheValue = exports.setCacheValue = exports.getCacheValue = exports.cache = exports.cacheManager = exports.CacheManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const lru_cache_1 = require("lru-cache");
const logger_1 = __importDefault(require("./utils/logger"));
// Redis缓存实现
class RedisCache {
    constructor(client) {
        this.client = client;
    }
    async get(key) {
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch (error) {
            logger_1.default.error('Redis get error:', error);
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            const serialized = JSON.stringify(value);
            if (ttl) {
                await this.client.setex(key, ttl, serialized);
            }
            else {
                await this.client.set(key, serialized);
            }
        }
        catch (error) {
            logger_1.default.error('Redis set error:', error);
        }
    }
    async del(key) {
        try {
            await this.client.del(key);
        }
        catch (error) {
            logger_1.default.error('Redis del error:', error);
        }
    }
    async clear() {
        try {
            await this.client.flushdb();
        }
        catch (error) {
            logger_1.default.error('Redis clear error:', error);
        }
    }
    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch (error) {
            logger_1.default.error('Redis exists error:', error);
            return false;
        }
    }
}
// LRU缓存实现
class LRUCacheAdapter {
    constructor(options) {
        this.cache = new lru_cache_1.LRUCache({
            max: options.max,
            ttl: options.ttl ? options.ttl * 1000 : undefined, // LRU-cache uses milliseconds
        });
    }
    async get(key) {
        return this.cache.get(key) || null;
    }
    async set(key, value, ttl) {
        if (ttl) {
            this.cache.set(key, value, { ttl: ttl * 1000 });
        }
        else {
            this.cache.set(key, value);
        }
    }
    async del(key) {
        this.cache.delete(key);
    }
    async clear() {
        this.cache.clear();
    }
    async exists(key) {
        return this.cache.has(key);
    }
}
// 缓存管理器
class CacheManager {
    constructor() {
        this.initializeCache();
    }
    static getInstance() {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }
    initializeCache() {
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            try {
                this.redisClient = new ioredis_1.default(redisUrl, {
                    maxRetriesPerRequest: 3,
                    lazyConnect: true,
                });
                this.redisClient.on('error', (error) => {
                    logger_1.default.error('Redis connection error:', error);
                    this.fallbackToLRU();
                });
                this.redisClient.on('connect', () => {
                    logger_1.default.info('Redis connected successfully');
                });
                this.cache = new RedisCache(this.redisClient);
                logger_1.default.info('Cache initialized with Redis');
            }
            catch (error) {
                logger_1.default.error('Failed to initialize Redis, falling back to LRU cache:', error);
                this.fallbackToLRU();
            }
        }
        else {
            this.fallbackToLRU();
        }
    }
    fallbackToLRU() {
        this.cache = new LRUCacheAdapter({
            max: 1000, // 最大缓存项数
            ttl: 3600, // 默认1小时过期
        });
        logger_1.default.info('Cache initialized with LRU cache');
    }
    // 获取缓存实例
    getCache() {
        return this.cache;
    }
    // 获取Redis客户端（如果可用）
    getRedisClient() {
        return this.redisClient;
    }
    // 检查是否使用Redis
    isUsingRedis() {
        return this.redisClient !== undefined;
    }
    // 关闭连接
    async close() {
        if (this.redisClient) {
            await this.redisClient.quit();
        }
    }
}
exports.CacheManager = CacheManager;
// 导出单例实例
exports.cacheManager = CacheManager.getInstance();
exports.cache = exports.cacheManager.getCache();
// 便捷函数
const getCacheValue = (key) => exports.cache.get(key);
exports.getCacheValue = getCacheValue;
const setCacheValue = (key, value, ttl) => exports.cache.set(key, value, ttl);
exports.setCacheValue = setCacheValue;
const deleteCacheValue = (key) => exports.cache.del(key);
exports.deleteCacheValue = deleteCacheValue;
const clearCache = () => exports.cache.clear();
exports.clearCache = clearCache;
const cacheExists = (key) => exports.cache.exists(key);
exports.cacheExists = cacheExists;
exports.default = exports.cacheManager;
