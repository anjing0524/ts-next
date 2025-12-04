/**
 * Server Actions 导出文件 (Server Actions Exports)
 *
 * 集中导出所有 Server Actions 和类型
 * Centralized exports for all Server Actions and types
 */

// 认证相关 (Authentication)
export {
  loginAction,
  logoutAction,
  refreshTokenAction,
  introspectTokenAction,
  revokeTokenAction,
} from './auth';

// 用户相关 (User)
export { getUserInfoAction, updateUserProfileAction } from './user';

// 客户端相关 (Client)
export { listClientsAction, getClientAction } from './client';

// 角色权限相关 (Role & Permission)
export {
  listPermissionsAction,
  listRolesAction,
  assignRoleToUserAction,
  revokeRoleFromUserAction,
} from './role';

// 审计日志相关 (Audit Log)
export { listAuditLogsAction, listUserAuditLogsAction } from './audit';

// 类型导出 (Type Exports)
export type {
  // 通用类型
  ActionResult,
  PaginatedResult,
  PaginationParams,

  // 认证类型
  LoginInput,
  LoginResponse,
  LoginResult,
  TokenRefreshResponse,
  TokenRefreshResult,
  TokenIntrospectResponse,
  TokenIntrospectResult,

  // 用户类型
  UserInfo,
  UpdateUserProfileRequest,
  UserResult,
  UserListResult,

  // 客户端类型
  ClientInfoPublic,
  CreateClientRequest,
  ClientResult,
  ClientListResult,

  // 角色权限类型
  Permission,
  Role,
  UserRole,
  PermissionListResult,
  RoleListResult,
  UserRoleResult,

  // 审计日志类型
  AuditLog,
  AuditLogFilter,
  AuditLogResult,
  AuditLogListResult,
} from './types';

// 工具导出 (Utilities)
export { withErrorHandling, validatePaginationParams, extractPaginatedData, logger } from './utils';
