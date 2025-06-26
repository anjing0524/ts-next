import { CacheManager } from './cache-manager';

// 导出单例实例
export const cacheManager = CacheManager.getInstance();
export const cache = cacheManager.getCache();

// 便捷函数
export const getCacheValue = <T = any>(key: string): Promise<T | null> => cache.get<T>(key);
export const setCacheValue = (key: string, value: any, ttl?: number): Promise<void> => cache.set(key, value, ttl);
export const deleteCacheValue = (key: string): Promise<void> => cache.del(key);
export const clearCache = (): Promise<void> => cache.clear();
export const cacheExists = (key: string): Promise<boolean> => cache.exists(key);

export * from './cache-manager';

export default cacheManager; 