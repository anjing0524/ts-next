// 缓存客户端 - 支持内存缓存和标签管理
// 内存缓存用于单实例应用，支持TTL和标签系统

export interface CacheOptions {
  ttl?: number; // 缓存过期时间（秒），默认300秒
  tags?: string[]; // 缓存标签，用于分组清除
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

class CacheClient {
  private store = new Map<string, CacheEntry<any>>();
  private tags = new Map<string, Set<string>>(); // tag -> keys映射

  // 从缓存获取数据
  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.store.get(key);

      if (!entry) {
        console.log(`[Cache] MISS: ${key}`);
        return null;
      }

      // 检查是否过期
      if (entry.expiresAt < Date.now()) {
        this.store.delete(key);
        // 清除该key关联的标签
        entry.tags.forEach(tag => {
          const tagSet = this.tags.get(tag);
          if (tagSet) {
            tagSet.delete(key);
          }
        });
        console.log(`[Cache] EXPIRED: ${key}`);
        return null;
      }

      console.log(`[Cache] HIT: ${key}`);
      return entry.data;
    } catch (error) {
      console.warn('[Cache] Error getting from cache:', error);
      return null; // 缓存故障不应影响主流程
    }
  }

  // 设置缓存数据
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl || 300; // 默认5分钟
      const expiresAt = Date.now() + ttl * 1000;
      const tags = options?.tags || [];

      this.store.set(key, {
        data: value,
        expiresAt,
        tags,
      });

      // 建立tag到keys的映射
      tags.forEach(tag => {
        if (!this.tags.has(tag)) {
          this.tags.set(tag, new Set());
        }
        this.tags.get(tag)!.add(key);
      });

      console.log(`[Cache] SET: ${key} (TTL: ${ttl}s, Tags: ${tags.join(', ')})`);
    } catch (error) {
      console.warn('[Cache] Error setting cache:', error);
      // 缓存写入故障不应阻止请求
    }
  }

  // 清除匹配模式的缓存
  async invalidate(pattern: string): Promise<void> {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      let count = 0;

      for (const key of this.store.keys()) {
        if (regex.test(key)) {
          const entry = this.store.get(key);
          this.store.delete(key);
          // 清除tag映射
          entry?.tags.forEach(tag => {
            const tagSet = this.tags.get(tag);
            if (tagSet) {
              tagSet.delete(key);
            }
          });
          count++;
        }
      }

      console.log(`[Cache] Invalidated ${count} keys matching ${pattern}`);
    } catch (error) {
      console.warn('[Cache] Error invalidating cache:', error);
    }
  }

  // 按标签清除缓存
  async invalidateByTag(tag: string): Promise<void> {
    try {
      const keys = this.tags.get(tag);
      let count = 0;

      if (keys) {
        for (const key of keys) {
          this.store.delete(key);
          count++;
        }
        this.tags.delete(tag);
      }

      console.log(`[Cache] Invalidated ${count} keys with tag: ${tag}`);
    } catch (error) {
      console.warn('[Cache] Error invalidating by tag:', error);
    }
  }

  // 清除所有缓存
  async flush(): Promise<void> {
    try {
      this.store.clear();
      this.tags.clear();
      console.log('[Cache] Flushed all cache');
    } catch (error) {
      console.warn('[Cache] Error flushing cache:', error);
    }
  }

  // 获取缓存统计信息
  getStats() {
    return {
      size: this.store.size,
      tags: this.tags.size,
      memory: this.estimateMemory(),
    };
  }

  // 估计内存使用（粗略）
  private estimateMemory(): string {
    let bytes = 0;
    for (const entry of this.store.values()) {
      bytes += JSON.stringify(entry.data).length;
    }
    return bytes > 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(2)}MB`
      : `${(bytes / 1024).toFixed(2)}KB`;
  }
}

// 导出单例
export const cacheClient = new CacheClient();
