"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const cache_1 = require("@repo/cache");
// PermissionService 类，用于处理用户权限相关的逻辑
// PermissionService class, for handling user permission related logic
class PermissionService {
    constructor(prisma) {
        this.prisma = prisma;
        this.cache = cache_1.cacheManager.getCache();
        logger_1.default.info('PermissionService initialized with cache manager');
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
    async getUserEffectivePermissions(userId) {
        // 缓存键的格式为 "user:{userId}:permissions"
        // Cache key format is "user:{userId}:permissions"
        const cacheKey = `user:${userId}:permissions`;
        // 1. 尝试从缓存获取 (Try to get from cache)
        try {
            const cachedData = await this.cache.get(cacheKey);
            if (cachedData) {
                logger_1.default.debug(`[Cache HIT] Permissions for user ${userId}`);
                return new Set(cachedData);
            }
        }
        catch (error) {
            logger_1.default.error('Error reading from cache:', error);
            // 继续从数据库获取 (Continue to fetch from database)
        }
        // 3. 如果所有缓存都未命中，则从数据库获取 (If all caches miss, fetch from database)
        logger_1.default.debug(`[DB Fetch] Fetching permissions from DB for user ${userId}`);
        const userWithRoles = await this.prisma.user.findUnique({
            where: { id: userId, isActive: true }, // 确保用户是活动的 (Ensure user is active)
            include: {
                userRoles: {
                    where: {
                        role: { isActive: true }, // 确保关联的角色是活动的 (Ensure role is active)
                        // 确保用户角色关联未过期
                        // Ensure user-role assignment is not expired
                        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                    },
                    include: {
                        role: {
                            include: {
                                rolePermissions: {
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
            const emptyPermissions = new Set();
            await this.cache.set(cacheKey, [], 900); // 15分钟缓存
            logger_1.default.debug(`[Cache SET] Empty permissions for user ${userId} stored in cache.`);
            return emptyPermissions;
        }
        // 从用户角色和权限中提取有效的权限名称
        // Extract effective permission names from user roles and permissions
        const effectivePermissions = new Set();
        userWithRoles.userRoles.forEach((userRole) => {
            // 确保 userRole 和 role 对象存在且有效
            // Ensure userRole and role objects exist and are valid
            if (userRole.role && userRole.role.isActive) {
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
        // 3. 存入缓存 (Store in cache)
        const permissionsArray = Array.from(effectivePermissions);
        await this.cache.set(cacheKey, permissionsArray, 900); // 15分钟缓存
        logger_1.default.debug(`[Cache SET] Permissions for user ${userId} stored in cache.`);
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
    async clearUserPermissionCache(userId) {
        const cacheKey = `user:${userId}:permissions`;
        try {
            await this.cache.del(cacheKey);
            logger_1.default.info(`[Cache Cleared] Permissions for user ${userId}`);
        }
        catch (error) {
            logger_1.default.error(`[PermissionService] Cache DEL error for key ${cacheKey}:`, error);
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
    async clearCachesAffectedByRoleChange(roleId) {
        logger_1.default.info(`[Cache Invalidation] Role ${roleId} changed. Clearing all user permission caches.`);
        try {
            // 注意：这会清除所有缓存，在生产环境中可能需要更精细的策略
            // Note: This clears all cache, may need more granular strategy in production
            await this.cache.clear();
            logger_1.default.debug('[Cache] All user permission caches cleared due to role change.');
        }
        catch (error) {
            logger_1.default.error('[PermissionService] Error clearing caches after role change:', error);
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
    async checkPermission(userId, requiredPermission) {
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
    async checkBatchPermissions(userId, requests) {
        // 如果请求数组为空或未定义，则返回空数组
        // If the requests array is empty or undefined, return an empty array
        if (!requests || requests.length === 0) {
            return [];
        }
        // 获取用户的有效权限集合（此调用将利用缓存机制）
        // Get the user's effective permissions set (this call will now use the cache)
        const userPermissionsSet = await this.getUserEffectivePermissions(userId);
        const results = [];
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
            let reasonCode = 'PERMISSION_DENIED';
            if (isAllowed) {
                message = 'Operation allowed.'; // 操作允许 (Operation allowed)
                reasonCode = 'PERMISSION_GRANTED';
            }
            else {
                if (userPermissionsSet.size === 0) {
                    message = 'User has no effective permissions.'; // 用户没有任何有效权限 (User has no effective permissions)
                    reasonCode = 'NO_PERMISSIONS';
                }
                else {
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
exports.PermissionService = PermissionService;
// 可选：如果倾向于单例模式使用，可以导出一个实例，但通常服务会被实例化。
// Optional: Export an instance if you prefer singleton-like usage, though typically services are instantiated.
// export const permissionService = new PermissionService();
