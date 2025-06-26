// apps/admin-portal/src/types/admin-entities.ts

/**
 * 通用的分页响应结构
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
}

/**
 * 权限 (Permission) 接口
 */
export interface Permission {
  id: string;
  name: string; // 例如: users:create, roles:edit, menu:system:user:view
  description?: string; // 对权限的详细解释
  group?: string; // 可选: 用于在UI中对权限进行分组，例如 "User Management", "Role Management"
  createdAt?: string; // 创建时间 (ISO 8601 字符串)
  updatedAt?: string; // 更新时间 (ISO 8601 字符串)
}

/**
 * 角色 (Role) 接口
 */
export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions?: Permission[]; // 通常在获取单个角色详情时填充
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 角色表单数据接口 (用于创建/编辑)
 */
export interface RoleFormData {
  name: string;
  description: string;
  // permissionIds 数组将在组件状态中管理，并在提交时加入
}

/**
 * OAuth客户端 (Client) 接口
 */
export interface Client {
  id: string; // 内部数据库ID
  clientId: string; // OAuth client_id, 对用户可见，必须唯一
  clientName: string;
  clientSecret?: string; // 仅在创建或轮换密钥后短暂可用
  redirectUris: string[]; // 重定向URI列表
  grantTypes: string[]; // 例如: ['authorization_code', 'refresh_token']
  responseTypes: string[]; // 例如: ['code', 'token']
  scope: string; // 空格分隔的scope字符串
  jwksUri?: string; // (可选) JWKS URI，用于公钥验证 (例如 private_key_jwt 客户端认证)
  logoUri?: string; // (可选) 客户端Logo的URI
  // tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt' | 'none'; // 令牌端点认证方法
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 客户端表单数据接口 (用于创建/编辑)
 */
export interface ClientFormData {
  clientId: string; // 在创建时可编辑，编辑时通常不可编辑
  clientName: string;
  redirectUris: string; // 在表单中通常为多行文本，提交前转换为数组
  grantTypes: string[]; // 在表单中通过多选组件管理
  responseTypes: string[]; // 在表单中通过多选组件管理
  scope: string; // 在表单中为文本输入，空格分隔
  jwksUri: string;
  logoUri: string;
}

/**
 * 审计日志 (AuditLog) 接口
 */
export interface AuditLog {
  id: string;
  userId: string; // 操作用户的ID
  userDisplay?: string; // (可选) 操作用户的显示名称，方便前端展示
  action: string; // 例如: USER_LOGIN, ROLE_UPDATE
  resource: string; // 操作的资源类型，例如: User, Role, Client
  resourceId?: string; // (可选) 被操作资源的ID
  timestamp: string; // 操作发生的时间戳 (ISO 8601)
  ipAddress?: string; // (可选) 操作来源的IP地址
  userAgent?: string; // (可选) 操作来源的User Agent
  status: 'SUCCESS' | 'FAILURE'; // 操作状态
  details?: Record<string, any>; // (可选) 额外信息，JSON对象
  oldValue?: Record<string, any>; // (可选) 更改前的值 (主要用于 UPDATE 操作)
  newValue?: Record<string, any>; // (可选) 更改后的值 (主要用于 CREATE/UPDATE 操作)
}

/**
 * 用户 (User) 接口 - 用于管理列表和个人资料等场景
 */
export interface UserProfile {
  // 用于 /profile 页面
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  firstName?: string; // 根据项目实际情况决定是否保留 firstName/lastName 或只用 displayName
  lastName?: string;
  isActive?: boolean;
  permissions: string[]; // 用户直接拥有的权限名列表
  roles?: { id: string; name: string }[]; // 用户所属的角色列表
  createdAt?: string;
  // ... 其他用户相关字段
}

export interface User extends UserProfile {
  // 用于用户管理列表等
  // 可继承 UserProfile 并添加更多管理特定字段
  lastLoginAt?: string;
}

/**
 * 用于用户个人资料编辑的表单数据接口
 */
export interface EditableProfileFormData {
  displayName: string;
  email: string;
  // firstName?: string;
  // lastName?: string;
}

/**
 * 用于密码修改的表单数据接口
 */
export interface PasswordChangeFormData {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/**
 * 仪表盘统计数据接口
 */
export interface DashboardStats {
  userCount: number | string;
  roleCount: number | string;
  clientCount: number | string;
}
