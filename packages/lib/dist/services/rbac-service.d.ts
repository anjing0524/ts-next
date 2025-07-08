/**
 * RBAC (Role-Based Access Control) 权限管理服务
 * 基于 Prisma Schema 的企业级权限管理系统
 * 支持内网环境下的组织架构权限控制
 * @author 架构团队
 * @since 1.0.0
 */
/**
 * 用户权限信息
 */
interface UserPermissions {
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
interface PermissionCheckResult {
    hasPermission: boolean;
    reason?: string;
    context?: Record<string, any>;
}
/**
 * RBAC权限管理服务
 */
declare class RBACService {
    /**
     * 获取用户的完整权限信息 (带缓存)
     */
    static getUserPermissions(userId: string): Promise<UserPermissions | null>;
    /**
     * 检查用户是否拥有特定权限
     */
    static checkPermission(userId: string, permissionName: string): Promise<boolean>;
}

export { type PermissionCheckResult, RBACService, type UserPermissions };
