/**
 * 查询优化服务
 * 提供数据库查询优化功能，包括批量查询、预加载等
 */

import { PrismaClient } from '@repo/database';
import { userCache, permissionCache, clientCache } from '../cache/multi-level-cache';

/**
 * 查询优化选项
 */
export interface QueryOptimizationOptions {
  /**
   * 是否使用缓存
   */
  useCache?: boolean;
  /**
   * 是否包含关联数据
   */
  includeRelations?: boolean;
  /**
   * 缓存 TTL（秒）
   */
  cacheTTL?: number;
}

/**
 * 批量查询结果
 */
export interface BatchQueryResult<T> {
  data: T[];
  cached: number;
  fromDb: number;
  errors: string[];
}

/**
 * 查询优化服务类
 */
export class QueryOptimizationService {
  constructor(private _prisma: PrismaClient) {}
  
  /**
   * 批量获取用户信息
   */
  async batchGetUsers(
    userIds: string[],
    options: QueryOptimizationOptions = {}
  ): Promise<BatchQueryResult<any>> {
    const result: BatchQueryResult<any> = {
      data: [],
      cached: 0,
      fromDb: 0,
      errors: [],
    };
    
    const { useCache = true, includeRelations = false, cacheTTL = 300 } = options;
    const uncachedIds: string[] = [];
    
    // 1. 尝试从缓存获取
    if (useCache) {
      for (const userId of userIds) {
        try {
          const cachedUser = await userCache.get(`user:${userId}`);
          if (cachedUser) {
            result.data.push(cachedUser);
            result.cached++;
          } else {
            uncachedIds.push(userId);
          }
        } catch (error) {
          result.errors.push(`Failed to get user ${userId} from cache: ${error}`);
          uncachedIds.push(userId);
        }
      }
    } else {
      uncachedIds.push(...userIds);
    }
    
    // 2. 批量查询数据库
    if (uncachedIds.length > 0) {
      try {
        const include = includeRelations
          ? {
              userRoles: {
                include: {
                  role: {
                    include: {
                      rolePermissions: {
                        include: { permission: true },
                      },
                    },
                  },
                },
              },
            }
          : undefined;
        
        const dbUsers = await this._prisma.user.findMany({
          where: {
            id: { in: uncachedIds },
            isActive: true,
          },
          include,
        });
        
        // 添加到结果并缓存
        for (const user of dbUsers) {
          result.data.push(user);
          result.fromDb++;
          
          if (useCache) {
            await userCache.set(`user:${user.id}`, user, cacheTTL);
          }
        }
      } catch (error) {
        result.errors.push(`Failed to batch query users: ${error}`);
      }
    }
    
    // 3. 按照输入顺序排序
    const userMap = new Map(result.data.map(user => [user.id, user]));
    result.data = userIds
      .map(id => userMap.get(id))
      .filter(user => user !== undefined);
    
    return result;
  }
  
  /**
   * 获取用户及其权限（优化查询）
   */
  async getUserWithPermissions(
    userId: string,
    options: QueryOptimizationOptions = {}
  ): Promise<any> {
    const { useCache = true, cacheTTL = 60 } = options;
    const cacheKey = `user:permissions:${userId}`;
    
    // 1. 尝试从缓存获取
    if (useCache) {
      const cached = await permissionCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    // 2. 查询数据库
    const user = await this._prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });
    
    if (!user) {
      return null;
    }
    
    // 3. 处理权限数据
    const roles = user.userRoles.map(ur => ur.role.name);
    const permissions = new Set<string>();
    
    user.userRoles.forEach(ur => {
      ur.role.rolePermissions.forEach(rp => {
        permissions.add(rp.permission.name);
      });
    });
    
    const result = {
      ...user,
      roles,
      permissions: Array.from(permissions),
    };
    
    // 4. 缓存结果
    if (useCache) {
      await permissionCache.set(cacheKey, result, cacheTTL);
    }
    
    return result;
  }
  
  /**
   * 批量获取客户端信息
   */
  async batchGetClients(
    clientIds: string[],
    options: QueryOptimizationOptions = {}
  ): Promise<BatchQueryResult<any>> {
    const result: BatchQueryResult<any> = {
      data: [],
      cached: 0,
      fromDb: 0,
      errors: [],
    };
    
    const { useCache = true, cacheTTL = 300 } = options;
    const uncachedIds: string[] = [];
    
    // 1. 尝试从缓存获取
    if (useCache) {
      for (const clientId of clientIds) {
        try {
          const cachedClient = await clientCache.get(`client:${clientId}`);
          if (cachedClient) {
            result.data.push(cachedClient);
            result.cached++;
          } else {
            uncachedIds.push(clientId);
          }
        } catch (error) {
          result.errors.push(`Failed to get client ${clientId} from cache: ${error}`);
          uncachedIds.push(clientId);
        }
      }
    } else {
      uncachedIds.push(...clientIds);
    }
    
    // 2. 批量查询数据库
    if (uncachedIds.length > 0) {
      try {
        const dbClients = await this._prisma.oAuthClient.findMany({
          where: {
            id: { in: uncachedIds },
            isActive: true,
          },
        });
        
        // 添加到结果并缓存
        for (const client of dbClients) {
          result.data.push(client);
          result.fromDb++;
          
          if (useCache) {
            await clientCache.set(`client:${client.id}`, client, cacheTTL);
          }
        }
      } catch (error) {
        result.errors.push(`Failed to batch query clients: ${error}`);
      }
    }
    
    // 3. 按照输入顺序排序
    const clientMap = new Map(result.data.map(client => [client.id, client]));
    result.data = clientIds
      .map(id => clientMap.get(id))
      .filter(client => client !== undefined);
    
    return result;
  }
  
  /**
   * 预加载用户数据
   */
  async preloadUserData(userIds: string[]): Promise<void> {
    // 使用批量查询但不等待结果
    this.batchGetUsers(userIds, { useCache: true, cacheTTL: 600 })
      .catch(error => console.error('Failed to preload user data:', error));
  }
  
  /**
   * 预加载客户端数据
   */
  async preloadClientData(clientIds: string[]): Promise<void> {
    this.batchGetClients(clientIds, { useCache: true, cacheTTL: 600 })
      .catch(error => console.error('Failed to preload client data:', error));
  }
  
  /**
   * 清除用户相关缓存
   */
  async clearUserCache(userId: string): Promise<void> {
    await Promise.all([
      userCache.del(`user:${userId}`),
      permissionCache.del(`user:permissions:${userId}`),
    ]);
  }
  
  /**
   * 清除客户端相关缓存
   */
  async clearClientCache(clientId: string): Promise<void> {
    await clientCache.del(`client:${clientId}`);
  }
  
  /**
   * 批量清除缓存
   */
  async batchClearCache(type: 'user' | 'client', ids: string[]): Promise<void> {
    const promises = ids.map(id => {
      if (type === 'user') {
        return this.clearUserCache(id);
      } else {
        return this.clearClientCache(id);
      }
    });
    
    await Promise.allSettled(promises);
  }
}