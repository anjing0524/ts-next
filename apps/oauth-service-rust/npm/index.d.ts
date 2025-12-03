/**
 * OAuth SDK TypeScript 类型定义 (Type Definitions)
 *
 * 提供完整的 TypeScript 类型支持，包括配置、响应数据结构和 SDK 方法
 * (Provides complete TypeScript type support, including configuration, response data structures, and SDK methods)
 */

/**
 * SDK 配置接口 (SDK Configuration Interface)
 */
export interface SDKConfig {
  /** 基础 URL (Base URL) */
  base_url: string;
  /** 超时时间（毫秒）(Timeout in milliseconds) */
  timeout?: number;
  /** 重试次数 (Retry count) */
  retry_count?: number;
  /** 重试延迟（毫秒）(Retry delay in milliseconds) */
  retry_delay?: number;
  /** 调试模式 (Debug mode) */
  debug?: boolean;
}

/**
 * 登录请求接口 (Login Request Interface)
 */
export interface LoginRequest {
  /** 用户名 (Username) */
  username: string;
  /** 密码 (Password) */
  password: string;
}

/**
 * 登录响应接口 (Login Response Interface)
 */
export interface LoginResponse {
  /** 会话令牌 (Session Token) */
  session_token: string;
  /** 用户ID (User ID) */
  user_id: string;
  /** 用户名 (Username) */
  username: string;
  /** 过期时间（秒）(Expires in seconds) */
  expires_in: number;
}

/**
 * 令牌对接口 (Token Pair Interface)
 */
export interface TokenPair {
  /** 访问令牌 (Access Token) */
  access_token: string;
  /** 刷新令牌 (Refresh Token) */
  refresh_token: string;
  /** ID令牌 (ID Token) */
  id_token: string;
  /** 过期时间（秒）(Expires in seconds) */
  expires_in: number;
  /** 令牌类型 (Token Type) */
  token_type: string;
}

/**
 * 令牌信息接口 (Token Introspect Response Interface)
 */
export interface TokenIntrospectResponse {
  /** 令牌是否有效 (Token Active) */
  active: boolean;
  /** 作用域 (Scope) */
  scope: string;
  /** 用户ID (User ID) */
  user_id: string;
  /** 过期时间戳 (Expiration Timestamp) */
  exp: number;
}

/**
 * 用户信息接口 (User Info Interface)
 */
export interface UserInfo {
  /** 用户ID (User ID) */
  user_id: string;
  /** 用户名 (Username) */
  username: string;
  /** 邮箱 (Email) */
  email: string;
  /** 显示名称 (Display Name) */
  display_name: string;
  /** 头像URL (Avatar URL) */
  avatar_url?: string;
  /** 创建时间 (Created At) */
  created_at: string;
  /** 更新时间 (Updated At) */
  updated_at: string;
}

/**
 * 更新用户信息请求接口 (Update Profile Request Interface)
 */
export interface UpdateProfileRequest {
  /** 显示名称 (Display Name) */
  display_name?: string;
  /** 头像URL (Avatar URL) */
  avatar_url?: string;
  /** 邮箱 (Email) */
  email?: string;
}

/**
 * 权限接口 (Permission Interface)
 */
export interface Permission {
  /** 权限ID (Permission ID) */
  id: string;
  /** 权限名称 (Permission Name) */
  name: string;
  /** 权限描述 (Permission Description) */
  description: string;
  /** 资源 (Resource) */
  resource: string;
  /** 操作 (Action) */
  action: string;
}

/**
 * 角色接口 (Role Interface)
 */
export interface Role {
  /** 角色ID (Role ID) */
  id: string;
  /** 角色名称 (Role Name) */
  name: string;
  /** 角色描述 (Role Description) */
  description: string;
  /** 权限列表 (Permissions) */
  permissions: Permission[];
}

/**
 * 用户角色关联接口 (User Role Interface)
 */
export interface UserRole {
  /** 用户ID (User ID) */
  user_id: string;
  /** 角色ID (Role ID) */
  role_id: string;
  /** 分配时间 (Assigned At) */
  assigned_at: string;
}

/**
 * 客户端信息接口 (Client Info Interface)
 */
export interface ClientInfo {
  /** 客户端ID (Client ID) */
  client_id: string;
  /** 客户端名称 (Client Name) */
  client_name: string;
  /** 客户端类型 (Client Type) */
  client_type: string;
  /** 重定向URI列表 (Redirect URIs) */
  redirect_uris: string[];
  /** 授权类型列表 (Grant Types) */
  grant_types: string[];
  /** 作用域列表 (Scopes) */
  scopes: string[];
}

/**
 * 审计日志接口 (Audit Log Interface)
 */
export interface AuditLog {
  /** 日志ID (Log ID) */
  log_id: string;
  /** 用户ID (User ID) */
  user_id: string;
  /** 操作类型 (Action Type) */
  action: string;
  /** 资源类型 (Resource Type) */
  resource_type: string;
  /** 资源ID (Resource ID) */
  resource_id: string;
  /** IP地址 (IP Address) */
  ip_address: string;
  /** 用户代理 (User Agent) */
  user_agent: string;
  /** 创建时间 (Created At) */
  created_at: string;
}

/**
 * 分页响应接口 (Paginated Response Interface)
 */
export interface PaginatedResponse<T> {
  /** 数据列表 (Data List) */
  items: T[];
  /** 总数 (Total Count) */
  total: number;
  /** 当前页 (Current Page) */
  page: number;
  /** 每页大小 (Page Size) */
  page_size: number;
}

/**
 * OAuth SDK 主类 (OAuth SDK Main Class)
 *
 * 提供完整的 OAuth 认证、用户管理、权限控制等功能
 * (Provides complete OAuth authentication, user management, permission control, and other features)
 */
export class OAuthSDK {
  /**
   * 用户登录 (User Login)
   *
   * @param username - 用户名 (Username)
   * @param password - 密码 (Password)
   * @returns 登录响应数据 (Login Response Data)
   */
  authLogin(username: string, password: string): Promise<LoginResponse>;

  /**
   * 用户登出 (User Logout)
   *
   * @returns 登出是否成功 (Logout Success)
   */
  authLogout(): Promise<boolean>;

  /**
   * 刷新访问令牌 (Refresh Access Token)
   *
   * @param refreshToken - 刷新令牌 (Refresh Token)
   * @returns 新的令牌对数据 (New Token Pair Data)
   */
  tokenRefresh(refreshToken: string): Promise<TokenPair>;

  /**
   * 验证令牌 (Introspect Token)
   *
   * @param token - 要验证的令牌 (Token to Introspect)
   * @returns 令牌信息 (Token Information)
   */
  tokenIntrospect(token: string): Promise<TokenIntrospectResponse>;

  /**
   * 撤销令牌 (Revoke Token)
   *
   * @param token - 要撤销的令牌 (Token to Revoke)
   * @returns 撤销是否成功 (Revocation Success)
   */
  tokenRevoke(token: string): Promise<boolean>;

  /**
   * 获取用户信息 (Get User Info)
   *
   * @returns 用户信息数据 (User Info Data)
   */
  userGetInfo(): Promise<UserInfo>;

  /**
   * 更新用户信息 (Update User Profile)
   *
   * @param data - 用户数据 (User Profile Data)
   * @returns 更新后的用户信息 (Updated User Info)
   */
  userUpdateProfile(data: UpdateProfileRequest): Promise<UserInfo>;

  /**
   * 获取权限列表 (Get Permissions List)
   *
   * @param page - 页码 (Page Number)
   * @param pageSize - 每页大小 (Page Size)
   * @returns 权限列表数据 (Permissions List Data)
   */
  rbacGetPermissions(page?: number, pageSize?: number): Promise<PaginatedResponse<Permission>>;

  /**
   * 获取角色列表 (Get Roles List)
   *
   * @param page - 页码 (Page Number)
   * @param pageSize - 每页大小 (Page Size)
   * @returns 角色列表数据 (Roles List Data)
   */
  rbacGetRoles(page?: number, pageSize?: number): Promise<PaginatedResponse<Role>>;

  /**
   * 为用户分配角色 (Assign Role to User)
   *
   * @param userId - 用户ID (User ID)
   * @param roleId - 角色ID (Role ID)
   * @returns 分配结果数据 (Assignment Result Data)
   */
  rbacAssignRole(userId: string, roleId: string): Promise<UserRole>;

  /**
   * 撤销用户角色 (Revoke Role from User)
   *
   * @param userId - 用户ID (User ID)
   * @param roleId - 角色ID (Role ID)
   * @returns 撤销是否成功 (Revocation Success)
   */
  rbacRevokeRole(userId: string, roleId: string): Promise<boolean>;

  /**
   * 获取客户端列表 (Get Client List)
   *
   * @param page - 页码 (Page Number)
   * @param pageSize - 每页大小 (Page Size)
   * @returns 客户端列表数据 (Client List Data)
   */
  clientList(page?: number, pageSize?: number): Promise<PaginatedResponse<ClientInfo>>;

  /**
   * 获取客户端详情 (Get Client Details)
   *
   * @param clientId - 客户端ID (Client ID)
   * @returns 客户端详情数据 (Client Details Data)
   */
  clientGet(clientId: string): Promise<ClientInfo>;

  /**
   * 获取审计日志 (Get Audit Logs)
   *
   * @param page - 页码 (Page Number)
   * @param pageSize - 每页大小 (Page Size)
   * @returns 审计日志数据 (Audit Logs Data)
   */
  auditGetLogs(page?: number, pageSize?: number): Promise<PaginatedResponse<AuditLog>>;

  /**
   * 获取用户审计日志 (Get User Audit Logs)
   *
   * @param userId - 用户ID (User ID)
   * @param page - 页码 (Page Number)
   * @param pageSize - 每页大小 (Page Size)
   * @returns 审计日志数据 (Audit Logs Data)
   */
  auditGetUserLogs(userId: string, page?: number, pageSize?: number): Promise<PaginatedResponse<AuditLog>>;
}

/**
 * 创建 OAuth SDK 实例 (Create OAuth SDK Instance)
 *
 * @param config - SDK 配置 (SDK Configuration)
 * @returns SDK 实例 (SDK Instance)
 */
export function createSDK(config: SDKConfig): OAuthSDK;
