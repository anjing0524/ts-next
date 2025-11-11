/**
 * APICacheLayer - API缓存层
 * 
 * 提供智能缓存策略，支持TTL、stale-while-revalidate等模式
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
  lastModified?: string;
  hits: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  strategy?: 'memory' | 'session' | 'local';
  key?: string;
  forceRefresh?: boolean;
  staleWhileRevalidate?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class APICacheLayer {
  private static instance: APICacheLayer;
  private memoryCache = new Map<string, CacheEntry<any>>();
  private stats = { hits: 0, misses: 0 };

  private constructor() {}

  static getInstance(): APICacheLayer {
    if (!APICacheLayer.instance) {
      APICacheLayer.instance = new APICacheLayer();
    }
    return APICacheLayer.instance;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(url: string, options?: RequestInit): string {
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.stringify(options.body) : '';
    return `${method}:${url}:${body}`;
  }

  /**
   * 获取缓存存储
   */
  private getStorage(strategy: 'memory' | 'session' | 'local' = 'memory'): Storage | Map<string, any> {
    switch (strategy) {
      case 'session':
        return typeof window !== 'undefined' ? sessionStorage : new Map();
      case 'local':
        return typeof window !== 'undefined' ? localStorage : new Map();
      case 'memory':
      default:
        return this.memoryCache;
    }
  }

  /**
   * 从缓存获取数据
   */
  get<T>(url: string, options?: RequestInit, cacheOptions?: CacheOptions): T | null {
    const key = cacheOptions?.key || this.generateCacheKey(url, options);
    const storage = this.getStorage(cacheOptions?.strategy || 'memory');

    try {
      const entry = this.getCacheEntry<T>(storage, key);
      if (!entry) return null;

      const now = Date.now();
      const isExpired = now - entry.timestamp > entry.ttl;

      if (isExpired && !cacheOptions?.staleWhileRevalidate) {
        this.remove(key, cacheOptions?.strategy);
        return null;
      }

      // Update stats
      this.stats.hits++;
      entry.hits++;

      // For stale-while-revalidate, trigger background refresh
      if (isExpired && cacheOptions?.staleWhileRevalidate) {
        this.triggerBackgroundRefresh(url, options, cacheOptions);
      }

      return entry.data;
    } catch (error) {
      console.warn('Cache retrieval error:', error);
      return null;
    }
  }

  /**
   * 设置缓存数据
   */
  set<T>(
    url: string,
    data: T,
    options?: RequestInit,
    cacheOptions?: CacheOptions,
    response?: Response
  ): void {
    const key = cacheOptions?.key || this.generateCacheKey(url, options);
    const storage = this.getStorage(cacheOptions?.strategy || 'memory');
    const ttl = cacheOptions?.ttl || 5 * 60 * 1000; // 5 minutes default

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      hits: 0,
      etag: response?.headers.get('etag') || undefined,
      lastModified: response?.headers.get('last-modified') || undefined,
    };

    try {
      this.setCacheEntry(storage, key, entry);
    } catch (error) {
      console.warn('Cache storage error:', error);
    }
  }

  /**
   * 获取缓存条目
   */
  private getCacheEntry<T>(storage: Storage | Map<string, any>, key: string): CacheEntry<T> | null {
    if (storage instanceof Map) {
      return storage.get(key) || null;
    }

    const item = storage.getItem(key);
    if (!item) return null;

    try {
      return JSON.parse(item);
    } catch {
      return null;
    }
  }

  /**
   * 设置缓存条目
   */
  private setCacheEntry(storage: Storage | Map<string, any>, key: string, entry: CacheEntry<any>): void {
    if (storage instanceof Map) {
      storage.set(key, entry);
      return;
    }

    try {
      storage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      // Handle quota exceeded
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.evictLRU(storage);
        try {
          storage.setItem(key, JSON.stringify(entry));
        } catch {
          console.warn('Cache quota exceeded after eviction');
        }
      }
    }
  }

  /**
   * 移除缓存条目
   */
  remove(key: string, strategy: 'memory' | 'session' | 'local' = 'memory'): void {
    const storage = this.getStorage(strategy);
    
    if (storage instanceof Map) {
      storage.delete(key);
    } else {
      storage.removeItem(key);
    }
  }

  /**
   * 清空缓存
   */
  clear(strategy?: 'memory' | 'session' | 'local'): void {
    if (strategy) {
      const storage = this.getStorage(strategy);
      if (storage instanceof Map) {
        storage.clear();
      } else {
        storage.clear();
      }
    } else {
      this.memoryCache.clear();
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
        localStorage.clear();
      }
    }
  }

  /**
   * LRU缓存淘汰
   */
  private evictLRU(storage: Storage): void {
    const keys: string[] = [];
    const entries: Array<{ key: string; entry: CacheEntry<any> }> = [];

    // Collect all entries
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        keys.push(key);
        try {
          const entry = JSON.parse(storage.getItem(key)!);
          entries.push({ key, entry });
        } catch {
          // Remove invalid entries
          storage.removeItem(key);
        }
      }
    }

    // Sort by hits and timestamp
    entries.sort((a, b) => {
      if (a.entry.hits !== b.entry.hits) {
        return a.entry.hits - b.entry.hits;
      }
      return a.entry.timestamp - b.entry.timestamp;
    });

    // Remove 25% of entries
    const removeCount = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < removeCount && i < entries.length; i++) {
      const entry = entries[i];
      if (entry && entry.key) {
        storage.removeItem(entry.key);
      }
    }
  }

  /**
   * 触发后台刷新
   */
  private triggerBackgroundRefresh(
    url: string,
    options?: RequestInit,
    cacheOptions?: CacheOptions
  ): void {
    // Use fetch with low priority
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        fetch(url, {
          ...options,
          headers: {
            ...options?.headers,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
        })
          .then(response => {
            if (response.ok) {
              return response.json().then(data => {
                this.set(url, data, options, cacheOptions, response);
              });
            }
          })
          .catch(error => {
            console.warn('Background refresh failed:', error);
          });
      });
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.memoryCache.size,
      hitRate,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * 获取缓存大小
   */
  getSize(strategy?: 'memory' | 'session' | 'local'): number {
    const storage = this.getStorage(strategy || 'memory');
    
    if (storage instanceof Map) {
      return storage.size;
    }

    return storage.length;
  }

  /**
   * 清理过期条目
   */
  cleanup(): void {
    const now = Date.now();
    const strategies: Array<'memory' | 'session' | 'local'> = ['memory', 'session', 'local'];

    strategies.forEach(strategy => {
      const storage = this.getStorage(strategy);
      
      if (storage instanceof Map) {
        for (const [key, entry] of storage.entries()) {
          if (now - entry.timestamp > entry.ttl) {
            storage.delete(key);
          }
        }
      } else {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key) {
            try {
              const entry = JSON.parse(storage.getItem(key)!);
              if (now - entry.timestamp > entry.ttl) {
                storage.removeItem(key);
                i--; // Adjust index after removal
              }
            } catch {
              storage.removeItem(key);
              i--;
            }
          }
        }
      }
    });
  }

  /**
   * 预缓存数据
   */
  precache<T>(
    urls: Array<{ url: string; options?: RequestInit; data: T }>,
    cacheOptions?: CacheOptions
  ): void {
    urls.forEach(({ url, options, data }) => {
      this.set(url, data, options, cacheOptions);
    });
  }
}