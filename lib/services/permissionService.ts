import { prisma } from '@/lib/prisma';

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
  private cacheDurationMs = 15 * 60 * 1000;

  // Redis 客户端占位符（如果可用）
  // Placeholder for a Redis client if it were available
  // private redisClient; //: Redis | undefined;
  // constructor() {
  //   // 如果适用，在此处初始化 Redis 客户端
  //   // Initialize Redis client here if applicable
  //   // if (process.env.REDIS_URL) {
  //   //   this.redisClient = new Redis(process.env.REDIS_URL);
  //   // }
  // }

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

    // 1. 尝试从内存缓存中获取
    // 1. Try fetching from in-memory cache
    const cachedEntry = this.permissionCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < this.cacheDurationMs) {
      // 如果缓存命中且未过期，则返回缓存数据
      // If cache hit and not expired, return cached data
      // console.log(`[In-Memory Cache HIT] Permissions for user ${userId}`);
      return new Set(cachedEntry.permissions); // 返回副本以防止外部修改 (Return a copy to prevent external modification)
    }

    // TODO: 如果 Redis 可用，则替换为实际的 Redis GET 调用
    // TODO: Replace with actual Redis GET call if Redis is available
    // if (this.redisClient) {
    //   try {
    //     // const cachedPermissionsJson = await this.redisClient.get(cacheKey);
    //     // if (cachedPermissionsJson) {
    //     //   const permissionsArray = JSON.parse(cachedPermissionsJson) as string[];
    //     //   console.log(`[Redis Cache HIT] Permissions for user ${userId}`);
    //     //   // 存入本地内存缓存以供短期热访问并设置时间戳
    //     //   // Store in local in-memory cache for short-term hot access & set timestamp
    //     //   const permissionsSet = new Set(permissionsArray);
    //     //   this.permissionCache.set(cacheKey, { permissions: permissionsSet, timestamp: Date.now() });
    //     //   return permissionsSet;
    //     // }
    //   } catch (err) {
    //     // console.error(`Redis GET error for key ${cacheKey}:`, err);
    //     // 如果 Redis 失败，则回退到数据库获取
    //     // Fall through to DB fetch if Redis fails
    //   }
    // }

    // 2. 如果不在缓存中或缓存已过期，则从数据库获取
    // 2. If not in cache or expired, fetch from database
    // console.log(`[Cache MISS] Fetching permissions from DB for user ${userId}`);
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
      // if (this.redisClient) { try { await this.redisClient.set(cacheKey, JSON.stringify([]), 'EX', 900); } catch(e){ /* ignore */ } }
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

    // TODO: 如果 Redis 可用，则替换为实际的 Redis SET 调用
    // TODO: Replace with actual Redis SET call if Redis is available
    // if (this.redisClient) {
    //   try {
    //     // 在 Redis 中存储为 JSON 数组，设置15分钟过期时间 (900秒)
    //     // Store as JSON array in Redis with 15 min expiry (900 seconds)
    //     // await this.redisClient.set(cacheKey, JSON.stringify(Array.from(effectivePermissions)), 'EX', 900);
    //   } catch (err) {
    //     // console.error(`Redis SET error for key ${cacheKey}:`, err);
    //     // 缓存失败不应影响主要操作
    //     // Failure to cache should not fail the main operation
    //   }
    // }

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
    this.permissionCache.delete(cacheKey);
    // console.log(`[In-Memory Cache Cleared] Permissions for user ${userId}`);

    // TODO: 如果 Redis 可用，则替换为实际的 Redis DEL 调用
    // TODO: Replace with actual Redis DEL call if Redis is available
    // if (this.redisClient) {
    //   try {
    //     // await this.redisClient.del(cacheKey);
    //     // console.log(`[Redis Cache Cleared] Permissions for user ${userId}`);
    //   } catch (err) {
    //     // console.error(`Redis DEL error for key ${cacheKey}:`, err);
    //   }
    // }
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
