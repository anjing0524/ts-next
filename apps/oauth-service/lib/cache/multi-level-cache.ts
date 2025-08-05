/**
 * 多级缓存服务
 * 提供内存缓存 + Redis 缓存的多级缓存解决方案
 */

import { cache } from '@repo/cache';

/**
 * 缓存选项接口
 */
export interface CacheOptions {
  /**
   * 内存缓存 TTL（毫秒）
   */
  memoryTTL?: number;
  /**
   * Redis 缓存 TTL（秒）
   */
  redisTTL?: number;
  /**
   * 是否使用内存缓存
   */
  useMemoryCache?: boolean;
  /**
   * 是否使用 Redis 缓存
   */
  useRedisCache?: boolean;
  /**
   * 缓存键前缀
   */
  keyPrefix?: string;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  hits: number;
  misses: number;
  memoryHits: number;
  redisHits: number;
  errors: number;
}

/**
 * 多级缓存类
 */
export class MultiLevelCache {
  private memoryCache = new Map<string, { value: any; expires: number }>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    memoryHits: 0,
    redisHits: 0,
    errors: 0,
  };
  
  constructor(private options: CacheOptions = {}) {
    // 默认选项
    this.options = {
      memoryTTL: 5000, // 5秒内存缓存
      redisTTL: 60, // 60秒Redis缓存
      useMemoryCache: true,
      useRedisCache: true,
      keyPrefix: 'oauth:',
      ...options,
    };
    
    // 定期清理过期的内存缓存
    setInterval(() => this.cleanupMemoryCache(), 60000);
  }
  
  /**
   * 生成缓存键
   */
  private generateKey(key: string): string {
    return `${this.options.keyPrefix}${key}`;
  }
  
  /**
   * 清理过期的内存缓存
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, item] of this.memoryCache.entries()) {
      if (item.expires < now) {
        this.memoryCache.delete(key);
      }
    }
  }
  
  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.generateKey(key);
    
    try {
      // 1. 先检查内存缓存
      if (this.options.useMemoryCache) {
        const memoryItem = this.memoryCache.get(fullKey);
        if (memoryItem && memoryItem.expires > Date.now()) {
          this.stats.hits++;
          this.stats.memoryHits++;
          return memoryItem.value;
        }
      }
      
      // 2. 检查 Redis 缓存
      if (this.options.useRedisCache) {
        const redisValue = await cache.get<T>(fullKey);
        if (redisValue !== null) {
          // 回填内存缓存
          if (this.options.useMemoryCache) {
            this.memoryCache.set(fullKey, {
              value: redisValue,
              expires: Date.now() + (this.options.memoryTTL || 5000),
            });
          }
          
          this.stats.hits++;
          this.stats.redisHits++;
          return redisValue;
        }
      }
      
      // 缓存未命中
      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }
  
  /**
   * 设置缓存值
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.generateKey(key);
    const redisTTL = ttl || this.options.redisTTL || 60;
    
    try {
      // 设置内存缓存
      if (this.options.useMemoryCache) {
        this.memoryCache.set(fullKey, {
          value,
          expires: Date.now() + (this.options.memoryTTL || 5000),
        });
      }
      
      // 设置 Redis 缓存
      if (this.options.useRedisCache) {
        await cache.set(fullKey, value, redisTTL);
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache set error for key ${key}:`, error);
    }
  }
  
  /**
   * 删除缓存值
   */
  async del(key: string): Promise<void> {
    const fullKey = this.generateKey(key);
    
    try {
      // 删除内存缓存
      if (this.options.useMemoryCache) {
        this.memoryCache.delete(fullKey);
      }
      
      // 删除 Redis 缓存
      if (this.options.useRedisCache) {
        await cache.del(fullKey);
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }
  
  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      // 清空内存缓存
      if (this.options.useMemoryCache) {
        this.memoryCache.clear();
      }
      
      // 清空 Redis 缓存（带前缀的）
      if (this.options.useRedisCache) {
        // 注意：这里需要根据实际的 Redis 客户端实现批量删除
        // 例如：await cache.keys(`${this.options.keyPrefix}*`).then(keys => cache.del(...keys));
      }
    } catch (error) {
      this.stats.errors++;
      console.error('Cache clear error:', error);
    }
  }
  
  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      redisHits: 0,
      errors: 0,
    };
  }
  
  /**
   * 计算缓存命中率
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? this.stats.hits / total : 0;
  }
}

/**
 * 创建专用的缓存实例
 */
export function createCache(options?: CacheOptions): MultiLevelCache {
  return new MultiLevelCache(options);
}

/**
 * 预定义的缓存实例
 */
export const userCache = createCache({
  keyPrefix: 'oauth:user:',
  memoryTTL: 30000, // 30秒
  redisTTL: 300, // 5分钟
});

export const permissionCache = createCache({
  keyPrefix: 'oauth:permission:',
  memoryTTL: 60000, // 1分钟
  redisTTL: 600, // 10分钟
});

export const clientCache = createCache({
  keyPrefix: 'oauth:client:',
  memoryTTL: 60000, // 1分钟
  redisTTL: 300, // 5分钟
});

export const tokenCache = createCache({
  keyPrefix: 'oauth:token:',
  memoryTTL: 0, // 不使用内存缓存（令牌通常较大）
  redisTTL: 3600, // 1小时
  useMemoryCache: false,
});