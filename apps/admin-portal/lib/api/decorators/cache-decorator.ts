/**
 * 缓存装饰器
 * 为HTTP客户端添加缓存功能
 */

import type { HttpClient, HttpRequestOptions, HttpResponse, HttpClientDecorator, CacheConfig } from '../client/types';
import { HttpClientDecoratorBase } from '../client/http-client';

/**
 * 缓存条目接口
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
  lastModified?: string;
  hits: number;
}

/**
 * 缓存存储接口
 */
interface CacheStorage {
  get<T>(key: string): CacheEntry<T> | null;
  set<T>(key: string, entry: CacheEntry<T>): void;
  remove(key: string): void;
  clear(): void;
  size(): number;
}

/**
 * 内存缓存存储
 */
class MemoryCacheStorage implements CacheStorage {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): CacheEntry<T> | null {
    return this.cache.get(key) || null;
  }

  set<T>(key: string, entry: CacheEntry<T>): void {
    this.cache.set(key, entry);
  }

  remove(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * 会话存储缓存
 */
class SessionCacheStorage implements CacheStorage {
  private readonly prefix = 'api_cache_';

  get<T>(key: string): CacheEntry<T> | null {
    try {
      const item = sessionStorage.getItem(`${this.prefix}${key}`);
      if (!item) return null;
      return JSON.parse(item);
    } catch {
      return null;
    }
  }

  set<T>(key: string, entry: CacheEntry<T>): void {
    try {
      sessionStorage.setItem(`${this.prefix}${key}`, JSON.stringify(entry));
    } catch (error) {
      console.warn('Failed to set session cache:', error);
    }
  }

  remove(key: string): void {
    try {
      sessionStorage.removeItem(`${this.prefix}${key}`);
    } catch {
      // Ignore
    }
  }

  clear(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch {
      // Ignore
    }
  }

  size(): number {
    try {
      let count = 0;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }
}

/**
 * 本地存储缓存
 */
class LocalCacheStorage implements CacheStorage {
  private readonly prefix = 'api_cache_';

  get<T>(key: string): CacheEntry<T> | null {
    try {
      const item = localStorage.getItem(`${this.prefix}${key}`);
      if (!item) return null;
      return JSON.parse(item);
    } catch {
      return null;
    }
  }

  set<T>(key: string, entry: CacheEntry<T>): void {
    try {
      localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(entry));
    } catch (error) {
      console.warn('Failed to set local cache:', error);
      this.evictLRU();
      try {
        localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(entry));
      } catch {
        // Ignore
      }
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(`${this.prefix}${key}`);
    } catch {
      // Ignore
    }
  }

  clear(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch {
      // Ignore
    }
  }

  size(): number {
    try {
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * LRU缓存淘汰
   */
  private evictLRU(): void {
    try {
      const entries: Array<{ key: string; entry: CacheEntry<any> }> = [];

      // 收集所有缓存条目
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          try {
            const entry = JSON.parse(localStorage.getItem(key)!);
            entries.push({ key, entry });
          } catch {
            localStorage.removeItem(key);
            i--;
          }
        }
      }

      // 按命中次数和时间戳排序
      entries.sort((a, b) => {
        if (a.entry.hits !== b.entry.hits) {
          return a.entry.hits - b.entry.hits;
        }
        return a.entry.timestamp - b.entry.timestamp;
      });

      // 移除25%的条目
      const removeCount = Math.ceil(entries.length * 0.25);
      for (let i = 0; i < removeCount && i < entries.length; i++) {
        const entry = entries[i];
        if (entry?.key) {
          localStorage.removeItem(entry.key);
        }
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * 缓存装饰器
 */
export class CacheDecorator extends HttpClientDecoratorBase {
  private readonly storage: CacheStorage;
  private readonly defaultTTL: number = 5 * 60 * 1000; // 5分钟默认TTL

  constructor(
    wrappedClient: HttpClient,
    private readonly config: CacheConfig = {}
  ) {
    super(wrappedClient);
    this.storage = this.createStorage(config.strategy || 'memory');
  }

  /**
   * 发送HTTP请求（带缓存）
   */
  async request<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const cacheKey = this.generateCacheKey(url, options);
    const cacheTTL = options.cacheTTL || this.config.ttl || this.defaultTTL;
    const skipCache = options.skipCache || this.config.forceRefresh || false;
    const staleWhileRevalidate = options.staleWhileRevalidate || this.config.staleWhileRevalidate || false;

    // 检查缓存
    if (!skipCache) {
      const cached = this.getFromCache<T>(cacheKey, cacheTTL, staleWhileRevalidate);
      if (cached) {
        return cached;
      }
    }

    // 执行实际请求
    const response = await this.wrappedClient.request<T>(url, options);

    // 缓存响应
    if (!skipCache) {
      this.setToCache(cacheKey, response, cacheTTL);
    }

    return response;
  }

  /**
   * 从缓存获取数据
   */
  private getFromCache<T>(key: string, ttl: number, staleWhileRevalidate: boolean): HttpResponse<T> | null {
    try {
      const entry = this.storage.get<T>(key);
      if (!entry) return null;

      const now = Date.now();
      const isExpired = now - entry.timestamp > ttl;

      // 如果过期且不使用stale-while-revalidate模式，移除缓存
      if (isExpired && !staleWhileRevalidate) {
        this.storage.remove(key);
        return null;
      }

      // 更新命中次数
      entry.hits++;
      this.storage.set(key, entry);

      // 对于stale-while-revalidate模式，触发后台刷新
      if (isExpired && staleWhileRevalidate) {
        this.triggerBackgroundRefresh(key);
      }

      return {
        data: entry.data,
        status: 200,
        headers: new Headers({
          'X-Cache': 'HIT',
          'X-Cache-Age': String(now - entry.timestamp),
        }),
        timestamp: entry.timestamp,
      };
    } catch (error) {
      console.warn('Cache retrieval error:', error);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  private setToCache<T>(key: string, response: HttpResponse<T>, ttl: number): void {
    try {
      const entry: CacheEntry<T> = {
        data: response.data,
        timestamp: response.timestamp,
        ttl,
        hits: 1,
        etag: response.headers.get('etag') || undefined,
        lastModified: response.headers.get('last-modified') || undefined,
      };

      this.storage.set(key, entry);
    } catch (error) {
      console.warn('Cache storage error:', error);
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(url: string, options: HttpRequestOptions): string {
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : '';
    const params = options.params ? JSON.stringify(options.params) : '';
    return `${method}:${url}:${body}:${params}`;
  }

  /**
   * 创建缓存存储
   */
  private createStorage(strategy: 'memory' | 'session' | 'local'): CacheStorage {
    switch (strategy) {
      case 'session':
        return new SessionCacheStorage();
      case 'local':
        return new LocalCacheStorage();
      case 'memory':
      default:
        return new MemoryCacheStorage();
    }
  }

  /**
   * 触发后台刷新
   */
  private triggerBackgroundRefresh(key: string): void {
    // 使用requestIdleCallback进行低优先级后台刷新
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        // 这里可以触发后台刷新逻辑
        console.debug('Background cache refresh triggered for:', key);
      });
    }
  }

  /**
   * 清理过期缓存
   */
  cleanup(): number {
    const before = this.storage.size();
    // 清理逻辑可以在具体的存储类中实现
    return before;
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number } {
    return {
      size: this.storage.size(),
    };
  }
}