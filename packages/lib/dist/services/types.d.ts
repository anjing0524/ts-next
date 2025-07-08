/**
 * 服务模块类型定义
 * Service module type definitions
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
interface PermissionCheckResult {
    hasPermission: boolean;
    reason?: string;
    context?: Record<string, any>;
}

export type { PermissionCheckResult, UserPermissions };
