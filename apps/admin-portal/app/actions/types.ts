/**
 * Server Actions 共享类型定义 (Server Actions Shared Types)
 *
 * 定义了所有 Server Actions 的通用返回类型和数据结构
 * Defines common return types and data structures for all Server Actions
 */

/**
 * 通用结果类型 (Generic Result Type)
 * 用于统一的 Server Action 响应格式
 * Used for unified Server Action response format
 */
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 分页响应类型 (Paginated Response Type)
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// ============================================================
// 用户类型 (User Types)
// ============================================================

/**
 * 用户信息 (User Information)
 */
export interface UserInfo {
  user_id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * 用户更新请求 (User Update Request)
 */
export interface UpdateUserProfileRequest {
  display_name?: string;
  avatar_url?: string;
  email?: string;
}

export type UserResult = ActionResult<UserInfo>;
export type UserListResult = ActionResult<PaginatedResult<UserInfo>>;

// ============================================================
// 认证类型 (Authentication Types)
// ============================================================

/**
 * 登录凭证 (Login Credentials)
 */
export interface LoginInput {
  username: string;
  password: string;
}

/**
 * 登录响应数据 (Login Response Data)
 */
export interface LoginResponse {
  session_token: string;
  user_id: string;
  username: string;
  expires_in: number;
}

export type LoginResult = ActionResult<LoginResponse>;

/**
 * 令牌刷新响应 (Token Refresh Response)
 */
export interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type TokenRefreshResult = ActionResult<TokenRefreshResponse>;

/**
 * 令牌验证响应 (Token Introspect Response)
 */
export interface TokenIntrospectResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
}

export type TokenIntrospectResult = ActionResult<TokenIntrospectResponse>;

// ============================================================
// 客户端类型 (Client Types)
// ============================================================

/**
 * 客户端信息（公开版本，不含敏感字段）
 * Client Information (Public version without sensitive fields)
 */
export interface ClientInfoPublic {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  created_at: string;
  updated_at: string;
}

/**
 * 创建客户端请求 (Create Client Request)
 */
export interface CreateClientRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
}

export type ClientResult = ActionResult<ClientInfoPublic>;
export type ClientListResult = ActionResult<PaginatedResult<ClientInfoPublic>>;

// ============================================================
// 角色权限类型 (Role & Permission Types)
// ============================================================

/**
 * 权限 (Permission)
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

/**
 * 角色 (Role)
 */
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

/**
 * 用户角色关联 (User Role Assignment)
 */
export interface UserRole {
  user_id: string;
  role_id: string;
  assigned_at: string;
}

export type PermissionListResult = ActionResult<PaginatedResult<Permission>>;
export type RoleListResult = ActionResult<PaginatedResult<Role>>;
export type UserRoleResult = ActionResult<UserRole>;

// ============================================================
// 审计日志类型 (Audit Log Types)
// ============================================================

/**
 * 审计日志条目 (Audit Log Entry)
 */
export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  status: 'success' | 'failure';
  details: Record<string, unknown>;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * 审计日志过滤参数 (Audit Log Filter)
 */
export interface AuditLogFilter {
  actor_id?: string;
  resource_type?: string;
  action?: string;
  status?: 'success' | 'failure';
  start_time?: string;
  end_time?: string;
}

export type AuditLogResult = ActionResult<AuditLog>;
export type AuditLogListResult = ActionResult<PaginatedResult<AuditLog>>;

// ============================================================
// 分页选项 (Pagination Options)
// ============================================================

/**
 * 分页参数 (Pagination Parameters)
 */
export interface PaginationParams {
  page?: number;
  page_size?: number;
}
