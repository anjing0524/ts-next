/**
 * @fileoverview 通用缓存工具
 * @author 开发团队
 * @since 1.0.0
 */
import Redis from 'ioredis';
export interface CacheInterface {
    get<T = any>(key: string): Promise<T | null>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    del(key: string): Promise<void>;
    clear(): Promise<void>;
    exists(key: string): Promise<boolean>;
}
export declare class CacheManager {
    private static instance;
    private cache;
    private redisClient?;
    private constructor();
    static getInstance(): CacheManager;
    private initializeCache;
    private fallbackToLRU;
    getCache(): CacheInterface;
    getRedisClient(): Redis | undefined;
    isUsingRedis(): boolean;
    close(): Promise<void>;
}
export declare const cacheManager: CacheManager;
export declare const cache: CacheInterface;
export declare const getCacheValue: <T = any>(key: string) => Promise<T | null>;
export declare const setCacheValue: (key: string, value: any, ttl?: number) => Promise<void>;
export declare const deleteCacheValue: (key: string) => Promise<void>;
export declare const clearCache: () => Promise<void>;
export declare const cacheExists: (key: string) => Promise<boolean>;
export default cacheManager;
//# sourceMappingURL=cache.d.ts.map