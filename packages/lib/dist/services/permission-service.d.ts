import { PrismaClient } from '@prisma/client';

interface PermissionCheckRequest {
    id?: string;
    name: string;
}
interface BatchPermissionCheckResult {
    id?: string;
    allowed: boolean;
    reasonCode?: 'PERMISSION_GRANTED' | 'PERMISSION_DENIED' | 'NO_PERMISSIONS' | 'INVALID_REQUEST_FORMAT';
    message?: string;
}
declare class PermissionService {
    private prisma;
    private cache;
    constructor(prisma: PrismaClient);
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
    getUserEffectivePermissions(userId: string): Promise<Set<string>>;
    /**
     * 清除特定用户在内存缓存中的权限数据。
     * Clears the cached permissions for a specific user from the in-memory cache.
     * 当用户的角色或直接权限发生更改时，应调用此方法以确保获取最新数据。
     * This should be called when a user's roles or direct permissions change to ensure fresh data is fetched.
     * 包含 Redis 缓存清除的占位符。
     * Includes placeholders for Redis cache clearing.
     * @param userId 需要清除权限缓存的用户ID。 (The ID of the user whose permission cache should be cleared.)
     */
    clearUserPermissionCache(userId: string): Promise<void>;
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
    clearCachesAffectedByRoleChange(roleId: string): Promise<void>;
    /**
     * 检查用户是否拥有特定权限。
     * Checks if a user has a specific permission.
     *
     * @param userId 用户的ID。 (The ID of the user.)
     * @param requiredPermission 需要检查的权限的规范化名称 (e.g., "users:list")。 (The canonical name of the permission to check.)
     * @returns 一个 Promise，如果用户拥有该权限则解析为 true，否则为 false。 (A Promise that resolves to true if the user has the permission, false otherwise.)
     */
    checkPermission(userId: string, requiredPermission: string): Promise<boolean>;
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
    checkBatchPermissions(userId: string, requests: PermissionCheckRequest[]): Promise<BatchPermissionCheckResult[]>;
}

export { PermissionService };
