/**
 * RBAC (Role-Based Access Control) 权限管理服务
 * 基于 Prisma Schema 的企业级权限管理系统
 * 支持内网环境下的组织架构权限控制
 * @author 架构团队
 * @since 1.0.0
 */

import { prisma } from '@repo/database/client';
import { cache } from '@repo/cache';

/**
 * 用户权限信息
 */
export interface UserPermissions {
  userId: string;
  roles: string[];
  permissions: string[];
  organizationContext: {
    organization?: string;
    department?: string;
  };
}

/**
 * 权限验证结果
 */
export interface PermissionCheckResult {
  hasPermission: boolean;
  reason?: string;
  context?: Record<string, any>;
}

/**
 * RBAC权限管理服务
 */
export class RBACService {
  /**
   * 获取用户的完整权限信息 (带缓存)
   */
  static async getUserPermissions(userId: string): Promise<UserPermissions | null> {
    const cacheKey = `user-permissions:${userId}`;
    const cachedPermissions = await cache.get<UserPermissions>(cacheKey);

    if (cachedPermissions) {
      console.log(`[RBAC] Cache hit for user ${userId}`);
      return cachedPermissions;
    }

    console.log(`[RBAC] Cache miss for user ${userId}, fetching from DB...`);
    const user = await prisma.user.findUnique({
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
    const permissionSet = new Set<string>();
    user.userRoles.forEach((userRole) => {
      userRole.role.rolePermissions.forEach((rolePermission) => {
        permissionSet.add(rolePermission.permission.name);
      });
    });

    const result: UserPermissions = {
      userId: user.id,
      roles,
      permissions: Array.from(permissionSet),
      organizationContext: {
        organization: user.organization || undefined,
        department: user.department || undefined,
      },
    };

    // 缓存60秒
    await cache.set(cacheKey, result, 60);
    return result;
  }

  /**
   * 检查用户是否拥有特定权限
   */
  static async checkPermission(userId: string, permissionName: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    if (!userPermissions) {
      return false;
    }
    return userPermissions.permissions.includes(permissionName);
  }
}
