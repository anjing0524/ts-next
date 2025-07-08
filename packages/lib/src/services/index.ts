/**
 * 服务模块统一导出
 * Services module exports
 *
 * 提供业务逻辑服务类
 * Provides business logic service classes
 */

// RBAC 权限服务 (RBAC permission service)
export { RBACService } from './rbac-service';

// 权限服务 (Permission service)
export { PermissionService } from './permission-service';

// 用户服务 (User service)
export { getUserDetails } from './user-service';

// 类型定义 (Type definitions)
export type { UserPermissions, PermissionCheckResult } from './types';
