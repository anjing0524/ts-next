"use strict";
/**
 * RBAC (Role-Based Access Control) 权限管理服务
 * 基于 Prisma Schema 的企业级权限管理系统
 * 支持内网环境下的组织架构权限控制
 * @author 架构团队
 * @since 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RBACService = void 0;
const client_1 = require("@repo/database/client");
const cache_1 = require("@repo/cache");
/**
 * RBAC权限管理服务
 */
class RBACService {
    /**
     * 获取用户的完整权限信息 (带缓存)
     */
    static async getUserPermissions(userId) {
        const cacheKey = `user-permissions:${userId}`;
        const cachedPermissions = await cache_1.cache.get(cacheKey);
        if (cachedPermissions) {
            console.log(`[RBAC] Cache hit for user ${userId}`);
            return cachedPermissions;
        }
        console.log(`[RBAC] Cache miss for user ${userId}, fetching from DB...`);
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId, isActive: true },
            include: {
                userRoles: {
                    include: {
                        role: {
                            include: {
                                rolePermissions: {
                                    include: {
                                        permission: true,
                                    },
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
        // 收集所有角色
        const roles = user.userRoles.map((ur) => ur.role.name);
        // 收集所有权限（去重）
        const permissionSet = new Set();
        user.userRoles.forEach((userRole) => {
            userRole.role.rolePermissions.forEach((rolePermission) => {
                permissionSet.add(rolePermission.permission.name);
            });
        });
        const result = {
            userId: user.id,
            roles,
            permissions: Array.from(permissionSet),
            organizationContext: {
                organization: user.organization || undefined,
                department: user.department || undefined,
            },
        };
        // 缓存60秒
        await cache_1.cache.set(cacheKey, result, 60);
        return result;
    }
    /**
     * 检查用户是否拥有特定权限
     */
    static async checkPermission(userId, permissionName) {
        const userPermissions = await this.getUserPermissions(userId);
        if (!userPermissions) {
            return false;
        }
        return userPermissions.permissions.includes(permissionName);
    }
}
exports.RBACService = RBACService;
