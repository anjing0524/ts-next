/**
 * Consolidated API and Auth Library - Unified entry point
 *
 * This file serves as the single entry point for all API and auth functionality
 * after the consolidation of legacy files.
 */

import { APIClient, type RequestOptions } from './api-client-consolidated';

// API Client (consolidated)
export { APIClient } from './api-client-consolidated';
export { APIClient as EnhancedAPIClient } from './api-client-consolidated';
export type { RequestOptions } from './api-client-consolidated';

// Token Storage (consolidated)
export { TokenStorage } from '../auth/token-storage';
export type { TokenStorageOptions } from '../auth/token-storage';

// Supporting modules
export { APICacheLayer } from './cache-layer';
export { RetryWithCircuitBreaker } from './retry-with-circuit-breaker';

// Auth-related exports
export { EnhancedTokenStorage as AuthTokenStorage } from '../auth/enhanced-token-storage';

// --- Convenient API Request Functions ---

/**
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
  options?: RequestOptions
): Promise<T> => APIClient.request<T>(endpoint, options);

/**
 * Admin Portal 统一的 API 助手函数集合
 *
 * 这些函数提供所有admin portal功能的便捷 API 调用
 */
export const adminApi = {
  // OAuth & 同意页面
  async submitConsent(
    action: 'allow' | 'deny',
    params: URLSearchParams
  ): Promise<{ redirect_uri: string }> {
    const response = await apiRequest<{ redirect_uri: string }>(
      '/oauth/consent/submit',
      {
        method: 'POST',
        body: JSON.stringify({
          decision: action,
          ...Object.fromEntries(params),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        skipCache: true,
      }
    );
    return response;
  },

  // 用户管理
  async getUsers(params?: any) {
    return apiRequest('/users', {
      method: 'GET',
      credentials: 'include',
    });
  },

  async getUserById(id: string) {
    return apiRequest(`/users/${id}`, {
      method: 'GET',
      credentials: 'include',
    });
  },

  async createUser(data: any) {
    return apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async updateUser(id: string, data: any) {
    return apiRequest(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async deleteUser(id: string) {
    return apiRequest(`/users/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  async updateUserProfile(data: any) {
    return apiRequest('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async updatePassword(data: any) {
    return apiRequest('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  // 角色管理
  async updateRole(id: string, data: any) {
    return apiRequest(`/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async deleteRole(id: string) {
    return apiRequest(`/roles/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  async updateRolePermissions(id: string, permissions: string[]) {
    return apiRequest(`/roles/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  // 系统配置
  async getSystemConfig() {
    return apiRequest('/system/config', {
      method: 'GET',
      credentials: 'include',
    });
  },

  async updateSystemConfig(data: any) {
    return apiRequest('/system/config', {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  // 审计日志
  async getAuditLogs(params?: any) {
    return apiRequest('/audit-logs', {
      method: 'GET',
      credentials: 'include',
    });
  },

  // 统计数据
  async getStatsSummary() {
    return apiRequest('/stats/summary', {
      method: 'GET',
      credentials: 'include',
    });
  },

  // OAuth 客户端管理
  async getClients(params?: any) {
    return apiRequest('/clients', {
      method: 'GET',
      credentials: 'include',
    });
  },

  async getClientById(clientId: string) {
    return apiRequest(`/clients/${clientId}`, {
      method: 'GET',
      credentials: 'include',
    });
  },

  async createClient(clientData: any) {
    return apiRequest('/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async updateClient(clientId: string, clientData: any) {
    return apiRequest(`/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(clientData),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async deleteClient(clientId: string) {
    return apiRequest(`/clients/${clientId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  async rotateClientSecret(clientId: string) {
    return apiRequest(`/clients/${clientId}/secret`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  // 权限管理
  async registerClient(data: any) {
    return apiRequest('/clients/register', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async getPermissions(params?: any) {
    return apiRequest('/permissions', {
      method: 'GET',
      credentials: 'include',
    });
  },

  // 角色相关（补充）
  async getRoles(params?: any) {
    return apiRequest('/roles', {
      method: 'GET',
      credentials: 'include',
    });
  },

  async getRoleById(roleId: string) {
    return apiRequest(`/roles/${roleId}`, {
      method: 'GET',
      credentials: 'include',
    });
  },

  async createRole(roleData: any) {
    return apiRequest('/roles', {
      method: 'POST',
      body: JSON.stringify(roleData),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

/**
 * 身份认证 API 助手函数集合
 *
 * 处理OAuth和令牌相关的认证操作
 */
export const authApi = {
  /**
   * 使用授权码交换访问令牌
   */
  async exchangeCodeForToken(code: string, codeVerifier: string) {
    return apiRequest('/oauth/token', {
      method: 'POST',
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
      headers: { 'Content-Type': 'application/json' },
      skipCache: true,
    });
  },

  /**
   * 登出并清除令牌
   */
  async logout() {
    return apiRequest('/oauth/revoke', {
      method: 'POST',
      credentials: 'include',
      skipCache: true,
    });
  },

  /**
   * 获取当前用户信息
   */
  async getUserById(userId: string) {
    return apiRequest(`/users/${userId}`, {
      method: 'GET',
      credentials: 'include',
    });
  },

  /**
   * 登录
   */
  async login(credentials: any) {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      headers: { 'Content-Type': 'application/json' },
      skipCache: true,
    });
  },

  /**
   * 获取用户个人资料
   */
  async fetchUserProfile() {
    return apiRequest('/users/me/profile', {
      method: 'GET',
      credentials: 'include',
    });
  },
};

/**
 * 用户管理 API 助手函数集合
 */
export const usersApi = {
  async getUsers(page = 1, limit = 20) {
    return apiRequest('/users', {
      method: 'GET',
      credentials: 'include',
    });
  },

  async getUserById(id: string) {
    return apiRequest(`/users/${id}`, {
      method: 'GET',
      credentials: 'include',
    });
  },

  async createUser(data: any) {
    return apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async updateUser(id: string, data: any) {
    return apiRequest(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async deleteUser(id: string) {
    return apiRequest(`/users/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  async updateUserProfile(data: any) {
    return apiRequest('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async updatePassword(data: any) {
    return apiRequest('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

/**
 * 角色管理 API 助手函数集合
 */
export const rolesApi = {
  async updateRole(id: string, data: any) {
    return apiRequest(`/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async deleteRole(id: string) {
    return apiRequest(`/roles/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  async updateRolePermissions(id: string, permissions: string[]) {
    return apiRequest(`/roles/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

/**
 * 系统配置 API 助手函数集合
 */
export const systemApi = {
  async getSystemConfig() {
    return apiRequest('/system/config', {
      method: 'GET',
      credentials: 'include',
    });
  },

  async updateSystemConfig(data: any) {
    return apiRequest('/system/config', {
      method: 'PUT',
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

/**
 * Paginated response type for list endpoints
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    [key: string]: any;
  };
}

/**
 * Audit log response type
 */
export interface AuditLogsResponse extends PaginatedResponse<any> {}