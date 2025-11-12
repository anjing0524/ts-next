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
 * AuditLog - 审计日志（来自 API 响应）
 */
export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: any;
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
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
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
  updatedAt: Date;
}
