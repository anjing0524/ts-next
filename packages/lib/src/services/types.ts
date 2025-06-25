/**
 * 服务模块类型定义
 * Service module type definitions
 */

// RBAC 相关类型
export interface UserPermissions {
  userId: string;
  roles: string[];
  permissions: string[];
  organizationContext: {
    organization?: string;
    department?: string;
  };
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  reason?: string;
  context?: Record<string, any>;
} 