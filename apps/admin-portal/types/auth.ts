/**
 * OAuth 认证和用户管理的应用层类型定义
 * 这些类型是从 OAuth Service API 响应中获取的
 * 不依赖任何数据库或 ORM 层的类型（不使用 Prisma）
 */

/**
 * User - 用户对象（来自 API 响应）
 */
export interface User {
  id: string;
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  department: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  userRoles: { roleId: string }[];
}

/**
 * TokenPayload - OAuth token 响应结构
 */
export interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * AuditLogDetails - 审计日志详情，存储为 JSON 数据
 */
export interface AuditLogDetails {
  [key: string]: unknown;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * AuditLog - 审计日志（来自 API 响应）
 */
export interface AuditLog {
  id: string;
  timestamp: string; // ISO 8601 格式: "2025-12-02T10:30:00Z"
  userId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: AuditLogDetails | null;
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  user?: {
    username: string;
  };
}

/**
 * OAuthClient - OAuth 客户端（来自 API 响应）
 */
export interface OAuthClient {
  id: string;
  clientId: string;
  clientSecret?: string;
  clientType: 'CONFIDENTIAL' | 'PUBLIC';
  name: string;
  description?: string;
  redirectUris: string[];
  allowedScopes?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  jwksUri?: string;
  logoUri?: string;
  isActive: boolean;
  createdAt: string; // ISO 8601 格式
  updatedAt: string; // ISO 8601 格式
}

/**
 * Client - OAuthClient 的别名（向后兼容）
 */
export type Client = OAuthClient;

/**
 * ClientFormData - 创建/编辑 OAuth 客户端的表单数据
 */
export interface ClientFormData {
  name: string;
  description?: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
}

/**
 * Role - 角色（来自 API 响应）
 */
export interface Role {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  isSystem: boolean;
  createdAt: string; // ISO 8601 格式
  updatedAt: string; // ISO 8601 格式
}

/**
 * RoleFormData - 创建/编辑角色的表单数据
 */
export interface RoleFormData {
  name: string;
  description?: string;
  permissions: string[];
}

/**
 * Permission - 权限（来自 API 响应）
 */
export interface Permission {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  type: 'API' | 'MENU' | 'DATA';
  resource?: string;
  action?: string;
  createdAt: string; // ISO 8601 格式
  updatedAt: string; // ISO 8601 格式
}

/**
 * SystemConfiguration - 系统配置（来自 API 响应）
 */
export interface SystemConfiguration {
  id: string;
  key: string;
  value: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  description?: string;
  updatedAt: string; // ISO 8601 格式
}

/**
 * LoginCredentials - 登录凭证
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * TokenResponse - 令牌响应
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  tokenType?: string;
}

/**
 * ConsentParams - 同意授权参数
 */
export interface ConsentParams {
  [key: string]: string;
}

/**
 * ClientCreateRequest - 客户端创建请求
 */
export interface ClientCreateRequest {
  name: string;
  redirectUris: string[];
  grantTypes: string[];
  clientType: 'CONFIDENTIAL' | 'PUBLIC';
  allowedScopes: string[];
  accessTokenTtl: number;
  refreshTokenTtl: number;
  requirePkce: boolean;
  requireConsent: boolean;
  description?: string;
}

/**
 * ClientUpdateRequest - 客户端更新请求
 */
export interface ClientUpdateRequest {
  name?: string;
  redirectUris?: string[];
  grantTypes?: string[];
  clientType?: 'CONFIDENTIAL' | 'PUBLIC';
  allowedScopes?: string[];
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  requirePkce?: boolean;
  requireConsent?: boolean;
  description?: string;
  isActive?: boolean;
}

/**
 * ClientFilter - 客户端过滤器
 */
export interface ClientFilter {
  offset?: number;
  limit?: number;
  search?: string;
  clientType?: string;
  isActive?: boolean;
}

/**
 * RoleCreateRequest - 角色创建请求
 */
export interface RoleCreateRequest {
  name: string;
  displayName?: string;
  description?: string;
  permissionIds: string[];
}

/**
 * RoleUpdateRequest - 角色更新请求
 */
export interface RoleUpdateRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

/**
 * RoleFilter - 角色过滤器
 */
export interface RoleFilter {
  offset?: number;
  limit?: number;
  search?: string;
  isSystem?: boolean;
}

/**
 * UserCreateRequest - 用户创建请求
 */
export interface UserCreateRequest {
  username: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  department?: string;
  roleIds?: string[];
  isActive?: boolean;
  mustChangePassword?: boolean;
}

/**
 * UserUpdateRequest - 用户更新请求
 */
export interface UserUpdateRequest {
  username?: string;
  password?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  department?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  roles?: string[];
}

/**
 * UserFilter - 用户过滤器
 */
export interface UserFilter {
  offset?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  organization?: string;
  department?: string;
}
