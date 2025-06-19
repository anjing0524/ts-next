import { prisma } from '@/lib/prisma';
import Redis from 'ioredis'; // 引入 IORedis 客户端 (Import IORedis client)
import logger from '@/lib/utils/logger'; // 假设有一个日志记录器 (Assuming a logger utility)

// 定义批量权限检查请求的结构类型
// Define a type for the structure of permission requests in checkBatchPermissions
interface PermissionCheckRequest {
  id?: string; // 可选的请求标识符 (Optional request identifier)
  name: string; // 规范化的权限名称 (e.g., "users:list:api") (Canonical permission name)
}

// 定义批量权限检查结果的结构类型
// Define a type for the structure of results from checkBatchPermissions
interface BatchPermissionCheckResult {
  id?: string; // 可选的请求标识符，与请求对应 (Optional request identifier, mirrored from request)
  allowed: boolean; // 是否允许 (Whether allowed)
  reasonCode?: // 原因代码 (Reason code)
    | 'PERMISSION_GRANTED' // 权限已授予 (Permission granted)
    | 'PERMISSION_DENIED'  // 权限被拒绝 (Permission denied)
    | 'NO_PERMISSIONS'     // 用户无任何有效权限 (User has no effective permissions)
    | 'INVALID_REQUEST_FORMAT'; // 请求格式无效 (Invalid request format)
  message?: string; // 附加信息 (Additional message)
}

// PermissionService 类，用于处理用户权限相关的逻辑
// PermissionService class, for handling user permission related logic
export class PermissionService {
  // 用户权限的内存缓存
  // In-memory cache for user permissions
  private permissionCache = new Map<string, { permissions: Set<string>; timestamp: number }>();
  // 缓存持续时间（毫秒），默认为15分钟
  // Cache duration in milliseconds, defaults to 15 minutes
  private cacheDurationMs = 15 * 60 * 1000; // For in-memory cache fallback or if Redis is off

  private redisClient: Redis | undefined;
  private redisTtlSeconds: number;

  constructor() {
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = new Redis(process.env.REDIS_URL, {
          // 防止连接错误导致应用崩溃 (Prevent connection errors from crashing the app)
          // IORedis 会自动尝试重连 (IORedis will attempt to reconnect automatically)
          maxRetriesPerRequest: 3, // Optional: Limit retries for a single command
          connectTimeout: 10000, // 10 seconds
          // lazyConnect: true, // Optional: connect only when a command is first issued
        });

        this.redisClient.on('connect', () => {
          logger.info('[PermissionService] Connected to Redis successfully.');
        });
        this.redisClient.on('error', (err) => {
          logger.error('[PermissionService] Redis connection error:', err);
          // Consider a strategy if Redis connection is lost, e.g., disable client temporarily
          // For now, operations will try/catch and fallback to DB.
        });
        this.redisClient.on('reconnecting', () => {
          logger.info('[PermissionService] Reconnecting to Redis...');
        });
        this.redisClient.on('end', () => {
            logger.info('[PermissionService] Redis connection ended.');
        });


      } catch (error) {
        logger.error('[PermissionService] Failed to initialize Redis client:', error);
        this.redisClient = undefined; // Ensure client is undefined if init fails
      }
    } else {
      logger.info('[PermissionService] REDIS_URL not provided. Redis caching will be disabled.');
      this.redisClient = undefined;
    }
    // 从环境变量获取 Redis TTL，默认为 900 秒 (15 分钟)
    // Get Redis TTL from environment variable, default to 900 seconds (15 minutes)
    this.redisTtlSeconds = parseInt(process.env.REDIS_TTL || '900', 10);
  }

  /**
   * 获取指定用户的所有有效权限。
   * Retrieves all effective permissions for a given user.
   * 权限以规范化权限名称的 Set 形式返回 (e.g., "users:list", "documents:read:financial")。
   * Permissions are returned as a Set of canonical permission names.
   * 此方法会考虑活动用户、活动角色、活动的角色-权限关联以及活动权限。
   * This method considers active user, active roles, active role-permission links, and active permissions.
   * 现在包含一个带时间戳过期的内存缓存，并为 Redis 集成预留了占位符。
   * It now includes an in-memory cache with time-based expiration and placeholders for Redis integration.
   *
   * @param userId 用户的ID。 (The ID of the user.)
   * @returns 一个 Promise，解析为一个包含有效权限字符串的 Set。 (A Promise that resolves to a Set of effective permission strings.)
   */
  public async getUserEffectivePermissions(userId: string): Promise<Set<string>> {
    // 缓存键的格式为 "user:{userId}:permissions"
    // Cache key format is "user:{userId}:permissions"
    const cacheKey = `user:${userId}:permissions`;

    // 1. 尝试从 Redis 缓存获取 (Try fetching from Redis cache first)
    if (this.redisClient) {
      try {
        const cachedPermissionsJson = await this.redisClient.get(cacheKey);
        if (cachedPermissionsJson) {
          const permissionsArray = JSON.parse(cachedPermissionsJson) as string[];
          logger.debug(`[Redis Cache HIT] Permissions for user ${userId}`);
          // 可选：也更新内存缓存 (Optional: also update in-memory cache for very hot access)
          // this.permissionCache.set(cacheKey, { permissions: new Set(permissionsArray), timestamp: Date.now() });
          return new Set(permissionsArray);
        }
         logger.debug(`[Redis Cache MISS] Permissions for user ${userId} not found in Redis.`);
      } catch (err) {
        logger.error(`[PermissionService] Redis GET error for key ${cacheKey}:`, err);
        // 如果 Redis 失败，则记录错误并回退到数据库获取 (If Redis fails, log error and fall through to DB fetch)
      }
    }

    // 2. 如果 Redis 不可用或缓存未命中，尝试从内存缓存获取 (If Redis unavailable or cache miss, try in-memory cache)
    const memoryCachedEntry = this.permissionCache.get(cacheKey);
    if (memoryCachedEntry && Date.now() - memoryCachedEntry.timestamp < this.cacheDurationMs) {
      logger.debug(`[In-Memory Cache HIT] Permissions for user ${userId}`);
      return new Set(memoryCachedEntry.permissions); // 返回副本 (Return a copy)
    }

    // 3. 如果所有缓存都未命中，则从数据库获取 (If all caches miss, fetch from database)
    logger.debug(`[DB Fetch] Fetching permissions from DB for user ${userId}`);
    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId, isActive: true }, // 确保用户是活动的 (Ensure user is active)
      include: {
        userRoles: { // 包含用户的角色关联 (Include user's role assignments)
          where: {
            isActive: true, // 确保用户角色关联本身是活动的 (Ensure the UserRole assignment itself is active)
            role: { isActive: true }, // 确保关联的角色是活动的 (Ensure role is active)
            // 确保用户角色关联未过期
            // Ensure user-role assignment is not expired
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            role: { // 包含角色详情 (Include role details)
              include: {
                rolePermissions: { // 包含角色的权限关联 (Include role's permission assignments)
                  where: {
                    permission: { isActive: true }, // 确保关联的权限是活动的 (Ensure permission is active)
                  },
                  include: {
                    permission: true, // 包含权限详情 (Include permission details)
                  },
                },
              },
            },
          },
        },
      },
    });

    // 如果用户不存在或不活动，或没有任何符合条件的有效角色/权限
    // If user not found/inactive, or has no qualifying active roles/permissions
    if (!userWithRoles) {
      // 为没有角色/权限的用户缓存一个空集合，以避免重复的数据库查询
      // Cache an empty set for users with no roles/permissions to avoid repeated DB queries for them
      const emptyPermissions = new Set<string>();
      this.permissionCache.set(cacheKey, {
        permissions: new Set(emptyPermissions), // 存入副本 (Store a copy)
        timestamp: Date.now(),
      });
      // 如果 Redis 可用，也存入 Redis 缓存 (If Redis is available, also store in Redis cache)
      if (this.redisClient) {
        try {
          await this.redisClient.set(cacheKey, JSON.stringify([]), 'EX', this.redisTtlSeconds);
          logger.debug(`[Redis Cache SET] Empty permissions for user ${userId} stored in Redis.`);
        } catch(err){
          logger.error(`[PermissionService] Redis SET error for empty permissions (key ${cacheKey}):`, err);
        }
      }
      return emptyPermissions;
    }

    // 从用户角色和权限中提取有效的权限名称
    // Extract effective permission names from user roles and permissions
    const effectivePermissions = new Set<string>();
    userWithRoles.userRoles.forEach((userRole) => {
      // 确保 userRole 和 role 对象存在且有效
      // Ensure userRole and role objects exist and are valid
      if (userRole.isActive && userRole.role && userRole.role.isActive) {
        // 检查用户角色分配是否已过期
        // Check if the user-role assignment is expired
        const isExpired = userRole.expiresAt && userRole.expiresAt.getTime() <= Date.now();
        if (!isExpired) {
          userRole.role.rolePermissions.forEach((rolePermission) => {
            // 确保权限对象存在、活动且有名称
            // Ensure permission object exists, is active, and has a name
            if (rolePermission.permission && rolePermission.permission.isActive && rolePermission.permission.name) {
              effectivePermissions.add(rolePermission.permission.name);
            }
          });
        }
      }
    });

    // 3. 存入内存缓存
    // 3. Store in in-memory cache
    this.permissionCache.set(cacheKey, {
      permissions: new Set(effectivePermissions), // 存入副本 (Store a copy)
      timestamp: Date.now(),
    });

    // 4. 存入 Redis 缓存 (Store in Redis cache)
    if (this.redisClient) {
      try {
        const permissionsArray = Array.from(effectivePermissions);
        await this.redisClient.set(cacheKey, JSON.stringify(permissionsArray), 'EX', this.redisTtlSeconds);
        logger.debug(`[Redis Cache SET] Permissions for user ${userId} stored in Redis.`);
      } catch (err) {
        logger.error(`[PermissionService] Redis SET error for key ${cacheKey}:`, err);
        // 缓存失败不应影响主要操作 (Failure to cache should not fail the main operation)
      }
    }
    return effectivePermissions;
  }

  /**
   * 清除特定用户在内存缓存中的权限数据。
   * Clears the cached permissions for a specific user from the in-memory cache.
   * 当用户的角色或直接权限发生更改时，应调用此方法以确保获取最新数据。
   * This should be called when a user's roles or direct permissions change to ensure fresh data is fetched.
   * 包含 Redis 缓存清除的占位符。
   * Includes placeholders for Redis cache clearing.
   * @param userId 需要清除权限缓存的用户ID。 (The ID of the user whose permission cache should be cleared.)
   */
  public async clearUserPermissionCache(userId: string): Promise<void> {
    const cacheKey = `user:${userId}:permissions`;
    // 清除内存缓存 (Clear in-memory cache)
    this.permissionCache.delete(cacheKey);
    logger.debug(`[In-Memory Cache Cleared] Permissions for user ${userId}`);

    // 清除 Redis 缓存 (Clear Redis cache)
    if (this.redisClient) {
      try {
        await this.redisClient.del(cacheKey);
        logger.info(`[Redis Cache Cleared] Permissions for user ${userId}`);
      } catch (err) {
        logger.error(`[PermissionService] Redis DEL error for key ${cacheKey}:`, err);
      }
    }
  }

  // --- 新增：用于角色权限更改时的缓存失效 ---
  // --- NEW: Cache invalidation for role permission changes ---

  /**
   * 清除与特定角色相关的用户权限缓存。
   * Clears user permission caches that might be affected by a role change.
   * 这是一种简单的方法：使所有用户的缓存无效。更复杂的方法可能只针对具有该角色的用户。
   * This is a simplified approach: invalidates all users' caches. A more complex approach might target only users with that role.
   * 注意：这可能很昂贵，并且可能需要更精细的策略。
   * Note: This can be expensive and may require a more granular strategy.
   *
   * @param roleId 更改了权限的角色ID。 (The ID of the role whose permissions changed.)
   */
  public async clearCachesAffectedByRoleChange(roleId: string): Promise<void> {
    logger.info(`[Cache Invalidation] Role ${roleId} changed. Clearing all user permission caches.`);
    // 简单策略：清除所有用户的内存缓存
    // Simple strategy: clear all user caches from in-memory
    this.permissionCache.clear();
    logger.debug('[In-Memory Cache] All user permission caches cleared due to role change.');

    // 对于 Redis，如果需要清除所有与用户权限相关的键，则需要一种模式匹配删除或键列表。
    // For Redis, if needing to clear all user permission related keys, a pattern delete or list of keys is needed.
    // 'SCAN' 和 'DEL' 的组合通常用于此目的，但要小心用于生产环境。
    // A combination of 'SCAN' and 'DEL' is often used for this, but use with caution in production.
    // 示例：(Example:)
    if (this.redisClient) {
      try {
        logger.warn(`[Redis Cache] Role ${roleId} changed. Attempting to clear all 'user:*:permissions' keys. This could be slow.`);
        let cursor = '0';
        do {
          const [nextCursor, keys] = await this.redisClient.scan(cursor, 'MATCH', 'user:*:permissions', 'COUNT', 100);
          if (keys.length > 0) {
            await this.redisClient.del(...keys);
            logger.debug(`[Redis Cache] Deleted ${keys.length} user permission keys matching pattern.`);
          }
          cursor = nextCursor;
        } while (cursor !== '0');
        logger.info(`[Redis Cache] Finished clearing user permission keys for role ${roleId} change.`);
      } catch (err) {
        logger.error(`[PermissionService] Redis SCAN/DEL error during role change invalidation for role ${roleId}:`, err);
      }
    }
    // TODO: 实现一种更细化的策略，例如，仅使具有此角色的用户的缓存无效。
    // TODO: Implement a more granular strategy, e.g., invalidating caches only for users who have this role.
    // 这将需要一种反向查找（角色 -> 用户）或在用户缓存键中包含角色信息。
    // This would require a reverse lookup (role -> users) or including role info in user cache keys.
  }


  /**
   * 检查用户是否拥有特定权限。
   * Checks if a user has a specific permission.
   *
   * @param userId 用户的ID。 (The ID of the user.)
   * @param requiredPermission 需要检查的权限的规范化名称 (e.g., "users:list")。 (The canonical name of the permission to check.)
   * @returns 一个 Promise，如果用户拥有该权限则解析为 true，否则为 false。 (A Promise that resolves to true if the user has the permission, false otherwise.)
   */
  public async checkPermission(userId: string, requiredPermission: string): Promise<boolean> {
    // 如果未提供所需权限名称，则视为无效检查，返回 false (或根据策略抛出错误)
    // If no required permission name is provided, consider it an invalid check, return false (or throw error based on policy)
    if (!requiredPermission) {
      // console.warn('checkPermission called with empty requiredPermission');
      return false; // 或者 true，取决于业务逻辑：空权限是否意味着总是允许或总是拒绝
                    // Or true, depending on business logic: does empty permission mean always allow or always deny?
                    // 当前行为：空权限字符串不授予任何权限。
                    // Current behavior: empty permission string grants no permission.
    }
    // 获取用户的有效权限集合
    // Get the user's effective permissions set
    const userPermissions = await this.getUserEffectivePermissions(userId);
    // 检查用户权限集合中是否包含所需的权限
    // Check if the user's permission set contains the required permission
    return userPermissions.has(requiredPermission);
  }

  /**
   * 批量检查给定用户的一组权限请求。
   * Checks a batch of permission requests for a given user.
   * 此版本期望权限请求中的权限由其规范化名称标识。
   * This version expects permission requests where permissions are identified by their canonical name.
   *
   * @param userId 用户的ID。 (The ID of the user.)
   * @param requests 一个 PermissionCheckRequest 对象数组，每个对象包含一个 'name' 字段。 (An array of PermissionCheckRequest objects, each with a 'name' field.)
   * @returns 一个 Promise，解析为一个 BatchPermissionCheckResult 对象数组。 (A Promise that resolves to an array of BatchPermissionCheckResult objects.)
   */
  public async checkBatchPermissions(
    userId: string,
    requests: PermissionCheckRequest[]
  ): Promise<BatchPermissionCheckResult[]> {
    // 如果请求数组为空或未定义，则返回空数组
    // If the requests array is empty or undefined, return an empty array
    if (!requests || requests.length === 0) {
      return [];
    }

    // 获取用户的有效权限集合（此调用将利用缓存机制）
    // Get the user's effective permissions set (this call will now use the cache)
    const userPermissionsSet = await this.getUserEffectivePermissions(userId);
    const results: BatchPermissionCheckResult[] = [];

    // 遍历每个权限请求
    // Iterate through each permission request
    for (const req of requests) {
      // 检查请求中是否提供了规范化的权限名称
      // Check if the canonical permission name is provided in the request
      if (!req.name) {
        results.push({
          id: req.id, // 保留请求ID (Preserve request ID)
          allowed: false,
          reasonCode: 'INVALID_REQUEST_FORMAT',
          message: 'Request missing canonical permission name.',
        });
        continue; // 继续处理下一个请求 (Continue to the next request)
      }

      // 检查用户的权限集合是否包含当前请求的权限
      // Check if the user's permission set contains the permission from the current request
      const isAllowed = userPermissionsSet.has(req.name);

      let message = '';
      let reasonCode: BatchPermissionCheckResult['reasonCode'] = 'PERMISSION_DENIED';

      if (isAllowed) {
        message = 'Operation allowed.'; // 操作允许 (Operation allowed)
        reasonCode = 'PERMISSION_GRANTED';
      } else {
        if (userPermissionsSet.size === 0) {
          message = 'User has no effective permissions.'; // 用户没有任何有效权限 (User has no effective permissions)
          reasonCode = 'NO_PERMISSIONS';
        } else {
          message = `Permission '${req.name}' denied or not found in user's effective permissions.`; // 权限被拒绝或在用户有效权限中未找到 (Permission denied or not found in user's effective permissions)
          reasonCode = 'PERMISSION_DENIED';
        }
      }

      results.push({
        id: req.id,
        allowed: isAllowed,
        reasonCode: reasonCode,
        message: message,
      });
    }
    return results;
  }
}

// 可选：如果倾向于单例模式使用，可以导出一个实例，但通常服务会被实例化。
// Optional: Export an instance if you prefer singleton-like usage, though typically services are instantiated.
// export const permissionService = new PermissionService();
