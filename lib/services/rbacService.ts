/**
 * RBAC (Role-Based Access Control) 权限管理服务
 * 基于 Prisma Schema 的企业级权限管理系统
 * 支持内网环境下的组织架构权限控制
 * @author 架构团队
 * @since 1.0.0
 */

import { prisma } from '@/lib/prisma';

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
   * 获取用户的完整权限信息
   */
  static async getUserPermissions(userId: string): Promise<UserPermissions | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId, isActive: true },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      return null;
    }

    // 收集所有角色
    const roles = user.userRoles.map(ur => ur.role.name);

    // 收集所有权限（去重）
    const permissionSet = new Set<string>();
    user.userRoles.forEach(userRole => {
      userRole.role.rolePermissions.forEach(rolePermission => {
        permissionSet.add(rolePermission.permission.name);
      });
    });

    return {
      userId: user.id,
      roles,
      permissions: Array.from(permissionSet),
      organizationContext: {
        organization: user.organization || undefined,
        department: user.department || undefined,
      }
    };
  }
} 