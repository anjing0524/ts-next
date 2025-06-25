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
/**
 * RBAC权限管理服务
 */
class RBACService {
    /**
     * 获取用户的完整权限信息
     */
    static async getUserPermissions(userId) {
        const user = await client_1.prisma.user.findUnique({
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
        const permissionSet = new Set();
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
exports.RBACService = RBACService;
