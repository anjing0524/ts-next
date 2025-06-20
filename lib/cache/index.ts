/**
 * @fileoverview 通用缓存工具
 * @author 开发团队
 * @since 1.0.0
 */

import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import logger from '@/lib/utils/logger';

// 缓存接口定义
export interface CacheInterface {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// Redis缓存实现
class RedisCache implements CacheInterface {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.error('Redis set error:', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis del error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.client.flushdb();
    } catch (error) {
      logger.error('Redis clear error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists error:', error);
      return false;
    }
  }
}

// LRU缓存实现
class LRUCacheAdapter implements CacheInterface {
  private cache: LRUCache<string, any>;

  constructor(options: { max: number; ttl?: number }) {
    this.cache = new LRUCache({
      max: options.max,
      ttl: options.ttl ? options.ttl * 1000 : undefined, // LRU-cache uses milliseconds
    });
  }

  async get<T = any>(key: string): Promise<T | null> {
    return this.cache.get(key) || null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (ttl) {
      this.cache.set(key, value, { ttl: ttl * 1000 });
    } else {
      this.cache.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async exists(key: string): Promise<boolean> {
    return this.cache.has(key);
  }
}

// 缓存管理器
export class CacheManager {
  private static instance: CacheManager;
  private cache: CacheInterface;
  private redisClient?: Redis;

  private constructor() {
    this.initializeCache();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private initializeCache(): void {
    const redisUrl = process.env.REDIS_URL;
    
    if (redisUrl) {
      try {
        this.redisClient = new Redis(redisUrl, {
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });

        this.redisClient.on('error', (error) => {
          logger.error('Redis connection error:', error);
          this.fallbackToLRU();
        });

        this.redisClient.on('connect', () => {
          logger.info('Redis connected successfully');
        });

        this.cache = new RedisCache(this.redisClient);
        logger.info('Cache initialized with Redis');
      } catch (error) {
        logger.error('Failed to initialize Redis, falling back to LRU cache:', error);
        this.fallbackToLRU();
      }
    } else {
      this.fallbackToLRU();
    }
  }

  private fallbackToLRU(): void {
    this.cache = new LRUCacheAdapter({
      max: 1000, // 最大缓存项数
      ttl: 3600, // 默认1小时过期
    });
    logger.info('Cache initialized with LRU cache');
  }

  // 获取缓存实例
  getCache(): CacheInterface {
    return this.cache;
  }

  // 获取Redis客户端（如果可用）
  getRedisClient(): Redis | undefined {
    return this.redisClient;
  }

  // 检查是否使用Redis
  isUsingRedis(): boolean {
    return this.redisClient !== undefined;
  }

  // 关闭连接
  async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

// 导出单例实例
export const cacheManager = CacheManager.getInstance();
export const cache = cacheManager.getCache();

// 便捷函数
export const getCacheValue = <T = any>(key: string): Promise<T | null> => cache.get<T>(key);
export const setCacheValue = (key: string, value: any, ttl?: number): Promise<void> => cache.set(key, value, ttl);
export const deleteCacheValue = (key: string): Promise<void> => cache.del(key);
export const clearCache = (): Promise<void> => cache.clear();
export const cacheExists = (key: string): Promise<boolean> => cache.exists(key);

export default cacheManager;