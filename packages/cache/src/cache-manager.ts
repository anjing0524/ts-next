/**
 * @fileoverview 通用缓存工具
 * @author 开发团队
 * @since 1.0.0
 */

import { LRUCache } from 'lru-cache';
import logger from './logger';

// 缓存接口定义
export interface CacheInterface {
  // eslint-disable-next-line no-unused-vars
  get<T = any>(key: string): Promise<T | null>;
  // eslint-disable-next-line no-unused-vars
  set(key: string, value: any, ttl?: number): Promise<void>;
  // eslint-disable-next-line no-unused-vars
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  // eslint-disable-next-line no-unused-vars
  exists(key: string): Promise<boolean>;
}

// 检查是否在Edge Runtime环境中
function isEdgeRuntime(): boolean {
  return typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'edge';
}

// Redis缓存实现（仅在Node.js环境中使用）
class RedisCache implements CacheInterface {
  private client: any; // 使用any类型避免Edge Runtime中的导入问题

  constructor(client: any) {
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
  private cache!: CacheInterface; // 使用 definite assignment assertion
  private redisClient?: any; // 使用any类型避免Edge Runtime中的导入问题

  private constructor() {
    this.initializeCache().catch(error => {
      logger.error('Failed to initialize cache:', error);
      this.fallbackToLRU();
    });
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private async initializeCache(): Promise<void> {
    // 在Edge Runtime环境中，强制使用LRU缓存
    if (isEdgeRuntime()) {
      logger.info('Edge Runtime detected, using LRU cache only');
      this.fallbackToLRU();
      return;
    }

    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      try {
        // 动态导入Redis，避免在Edge Runtime中加载
        const Redis = await import('ioredis');
        this.redisClient = new Redis.default(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });

        this.redisClient.on('error', (error: any) => {
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
  getRedisClient(): any | undefined {
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
