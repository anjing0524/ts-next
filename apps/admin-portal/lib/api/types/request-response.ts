/**
 * API 请求和响应类型定义
 * 用于替代各处的 any 类型，提高类型安全性
 */

/**
 * 通用错误类型
 * 用于错误处理函数的参数类型
 */
export type HttpErrorLike = Error | { status?: number; message?: string; code?: string } | unknown;

/**
 * 令牌响应数据接口
 */
export interface TokenData {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/**
 * 用户信息接口
 */
export interface UserInfo {
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
  email?: string;
  name?: string;
  avatar?: string;
  roles?: string[];
  permissions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 令牌检查响应接口
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

/**
 * 同意授权响应接口
 */
export interface ConsentResponse {
  redirect_uri: string;
  authorization_code?: string;
  state?: string;
}

/**
 * 登录请求接口
 */
export interface LoginRequest {
  username: string;
  password: string;
  grant_type?: string;
  rememberMe?: boolean;
}

/**
 * 用户资料更新请求
 */
export interface ProfileUpdateRequest {
  name?: string;
  email?: string;
  avatar?: string;
  [key: string]: unknown;
}

/**
 * 密码更新请求
 */
export interface PasswordUpdateRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}

/**
 * 系统配置值类型
 */
export type ConfigValue = string | number | boolean | Record<string, unknown>;

/**
 * 系统配置更新请求
 */
export interface SystemConfigUpdateRequest {
  [key: string]: ConfigValue;
}

/**
 * OAuth 客户端注册请求
 */
export interface ClientRegisterRequest {
  name: string;
  redirectUris: string;
  responseTypes?: string[];
  grantTypes?: string[];
  scope?: string;
  jwksUri?: string;
  [key: string]: unknown;
}

/**
 * 系统日志项
 */
export interface SystemLog {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * 查询参数类型约束
 */
export type QueryParams = Record<string, string | number | boolean | string[]>;

/**
 * 通用的 API 响应体
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp?: string;
}

/**
 * 角色更新请求
 */
export interface RoleUpdateRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

/**
 * 权限创建请求
 */
export interface PermissionCreateRequest {
  name: string;
  displayName?: string;
  description?: string;
  type: 'API' | 'MENU' | 'DATA';
  resource?: string;
  action?: string;
}

/**
 * 权限更新请求
 */
export interface PermissionUpdateRequest {
  name?: string;
  displayName?: string;
  description?: string;
  type?: 'API' | 'MENU' | 'DATA';
  resource?: string;
  action?: string;
}
