/**
 * API 客户端库 - 统一入口点
 *
 * 使用装饰器模式实现的现代化HTTP客户端，提供缓存、重试、熔断器、认证等功能
 */

import type {
  AuditLog,
  LoginCredentials,
  TokenResponse,
  ConsentParams,
  User,
  Role,
  Permission,
  OAuthClient,
  SystemConfiguration,
  ClientCreateRequest,
  ClientUpdateRequest,
  ClientFilter,
  RoleCreateRequest,
  RoleUpdateRequest,
  RoleFilter,
  UserCreateRequest,
  UserUpdateRequest,
  UserFilter,
} from '@/types/auth';

export type {
  AuditLog,
  LoginCredentials,
  TokenResponse,
  ConsentParams,
  User,
  Role,
  Permission,
  OAuthClient,
  SystemConfiguration,
  ClientCreateRequest,
  ClientUpdateRequest,
  ClientFilter,
  RoleCreateRequest,
  RoleUpdateRequest,
  RoleFilter,
  UserCreateRequest,
  UserUpdateRequest,
  UserFilter,
};

// --- HTTP客户端核心模块 ---
import { HttpClientFactory, defaultHttpClient } from './client/http-client';
export { HttpClientFactory, defaultHttpClient };
export type { HttpClient, HttpRequestOptions, HttpResponse } from './client/types';

// --- 装饰器模块 ---
export { CacheDecorator } from './decorators/cache-decorator';
export { RetryDecorator } from './decorators/retry-decorator';
export { CircuitBreakerDecorator } from './decorators/circuit-breaker-decorator';
export { AuthDecorator } from './decorators/auth-decorator';

// --- 资源API模块 ---
import { authResource, authApi } from './resources/auth';
import { usersResource, usersApi } from './resources/users';
import { rolesResource, rolesApi } from './resources/roles';
import { clientsResource, clientsApi } from './resources/clients';
import { permissionsResource, permissionsApi } from './resources/permissions';
import { systemResource, systemApi } from './resources/system';

export { authResource, usersResource, rolesResource, clientsResource, permissionsResource, systemResource };
export { authApi, usersApi, rolesApi, clientsApi, permissionsApi, systemApi };

// --- 向后兼容的API请求函数 ---

/**
 * @deprecated 请使用新的资源API类，例如：usersResource.list() 或 usersApi.getUsers()
 *
 * 发送 API 请求的通用函数
 *
 * 使用示例：
 * ```typescript
 * const data = await apiRequest<ResponseType>('/endpoint', {
 *   method: 'POST',
 *   body: JSON.stringify(payload),
 * });
 * ```
 */
export const apiRequest = <T = any>(
  endpoint: string,
  options?: any
): Promise<T> => {
  console.warn('apiRequest is deprecated. Please use the new resource APIs instead.');
  const client = HttpClientFactory.createFullFeaturedClient();
  return client.request<T>(endpoint, options).then((response: any) => response.data);
};

// --- 统一API对象 ---

/**
 * 统一API对象，组合所有资源特定的API
 * 提供应用程序中所有API调用的单一入口点
 */
export const api = {
  ...authApi,
  ...usersApi,
  ...rolesApi,
  ...clientsApi,
  ...permissionsApi,
  ...systemApi,
};

/**
 * @deprecated 请使用 `api` 对象
 */
export const adminApi = api;

// --- 类型定义 ---

/**
 * 分页响应类型
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    [key: string]: any;
  };
}

/**
 * 审计日志响应类型
 */
export interface AuditLogsResponse extends PaginatedResponse<AuditLog> {}

// --- 默认导出 ---

/**
 * 默认导出：HTTP客户端工厂
 */
export default HttpClientFactory;