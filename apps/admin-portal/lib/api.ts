import { TokenStorage } from './auth/token-storage';
import { ENDPOINTS } from './api-endpoints';
import type { Role } from '@/types/auth';
import { TokenPayload } from '../types/auth';
import {
  User,
  CreateUserInput,
  UpdateUserInput,
} from '../features/users/domain/user';

// 定义标准化的分页响应类型
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

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Centralized token refresh logic
const refreshToken = async (): Promise<string | null> => {
  const currentRefreshToken = TokenStorage.getRefreshToken();
  if (!currentRefreshToken) {
    // No refresh token, clear session and trigger auth failure
    authApi.logout(); // Using logout to clear tokens and state
    return Promise.resolve(null);
  }

  try {
    const response = await fetch(ENDPOINTS.oauthToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentRefreshToken,
        client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const newTokens: TokenPayload = await response.json();
    TokenStorage.setTokens(newTokens.accessToken, newTokens.refreshToken);
    return newTokens.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    authApi.logout(); // Logout on refresh failure
    return null;
  }
};

// Wrapper for fetch that handles auth and token refreshing
const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const attachAuthHeader = (token: string | null, opts: RequestInit): RequestInit => {
    const headers = new Headers(opts.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return { ...opts, headers };
  };

  let requestOptions = attachAuthHeader(TokenStorage.getAccessToken(), options);
  let response = await fetch(url, requestOptions);

  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshToken().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    const newAccessToken = await refreshPromise;

    if (newAccessToken) {
      requestOptions = attachAuthHeader(newAccessToken, options);
      response = await fetch(url, requestOptions); // Retry the request
    } else {
      // If refresh fails, the refresh logic itself will handle logout.
      // We throw an error to stop the current failed request flow.
      throw new Error('Authentication failed; unable to refresh token.');
    }
  }

  return response;
};


// 分页参数适配器：将 offset/limit 转换为 page/pageSize
const adaptOffsetToPage = (offset: number = 0, limit: number = 10) => {
  const page = Math.floor(offset / limit) + 1;
  const pageSize = limit;
  return { page, pageSize };
};

// 响应格式适配器：将后端的 pagination 格式转换为前端期望的 meta 格式
const adaptPaginationToMeta = (response: any) => {
  if (response && response.pagination) {
    return {
      data: response.data,
      meta: {
        totalItems: response.pagination.totalItems,
        itemCount: response.data ? response.data.length : 0,
        itemsPerPage: response.pagination.pageSize,
        totalPages: response.pagination.totalPages,
        currentPage: response.pagination.page,
      },
    };
  }
  return response;
};

// Unified response handler
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      // If response is not JSON, use status text or a generic message
      errorData = { message: response.statusText || `请求失败，状态码: ${response.status}` };
    }
    // Prefer message from errorData if available
    const message =
      errorData?.message || errorData?.error_description || `请求失败，状态码: ${response.status}`;
    throw new Error(message);
  }
  // Handle cases where response might be empty (e.g., 204 No Content)
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.indexOf('application/json') !== -1) {
    return response.json();
  }
  return response.text(); // Or handle as appropriate for non-JSON responses
};

// API client for authentication-related operations
export const authApi = {
  /**
   * Logs in a user.
   * Corresponds to POST /api/v2/oauth/token with password grant.
   * @param credentials - User credentials (e.g., grant_type, username, password).
   */
  async login(credentials: { grant_type: string; [key: string]: string }) {
    // This is a direct fetch call, doesn't need apiFetch as it's fetching the first token
    const response = await fetch(ENDPOINTS.oauthToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // Or 'application/x-www-form-urlencoded' depending on server
      },
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },

  /**
   * 用户注销 - 使用OAuth2.1标准令牌撤销
   * User logout using OAuth2.1 standard token revocation
   */
  async exchangeCodeForToken(code: string, codeVerifier: string) {
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getOAuthRedirectUri(),
      client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
      code_verifier: codeVerifier,
    });
    // This is also a direct fetch call for the initial token exchange
    const response = await fetch(ENDPOINTS.oauthToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });
    return handleResponse(response);
  },

  async logout() {
    const accessToken = TokenStorage.getAccessToken();
    const refreshToken = TokenStorage.getRefreshToken();
    
    if (accessToken || refreshToken) {
      try {
        const tokenToRevoke = refreshToken || accessToken;
        const tokenTypeHint = refreshToken ? 'refresh_token' : 'access_token';
        
        // Use direct fetch, no need for auth or refresh on this endpoint
        await fetch(ENDPOINTS.oauthRevoke, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: tokenToRevoke!,
            token_type_hint: tokenTypeHint,
            client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'auth-center-admin-client',
          }),
        });
      } catch (error) {
        console.error('An error occurred during token revocation:', error);
      }
    }
    
    TokenStorage.clearTokens();
  },

  /**
   * Fetches the current user's profile information.
   * Corresponds to GET /api/v2/users/me.
   */
  async fetchUserProfile(): Promise<User> {
    const response = await apiFetch(`${ENDPOINTS.users}/me`);
    return handleResponse(response);
  },
};

// API client for admin-related operations
export const adminApi = {
  // User Management
  async getUsers(params?: {
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<User>> {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);

    const response = await apiFetch(`${ENDPOINTS.users}?${searchParams.toString()}`);
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  async getUserById(userId: string): Promise<User> {
    const response = await apiFetch(`${ENDPOINTS.users}/${userId}`);
    return handleResponse(response);
  },
  async createUser(userData: CreateUserInput): Promise<User> {
    const response = await apiFetch(ENDPOINTS.users, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },
  async updateUser(userId: string, userData: Partial<CreateUserInput>): Promise<User> {
    const response = await apiFetch(`${ENDPOINTS.users}/${userId}`, {
      method: 'PUT', // Or PATCH
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },
  async deleteUser(userId: string): Promise<void> {
    const response = await apiFetch(`${ENDPOINTS.users}/${userId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: 'An unknown error occurred' }));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    // For DELETE, a 204 No Content is a success, so we resolve
    return Promise.resolve();
  },
  async updateUserProfile(profileData: Partial<User>): Promise<User> {
    // Specific for current user's profile
    const response = await apiFetch(ENDPOINTS.userProfile, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData),
    });
    return handleResponse(response);
  },

  async updatePassword(passwordData: { oldPassword?: string; newPassword?: string }) {
    const response = await apiFetch(ENDPOINTS.userPassword, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwordData),
    });
    return handleResponse(response);
  },

  // Role Management
  async getRoles(params?: { offset?: number; limit?: number; search?: string }) {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);

    const response = await apiFetch(`${ENDPOINTS.roles}?${searchParams.toString()}`);
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  async getRoleById(roleId: string): Promise<Role> {
    const response = await apiFetch(`${ENDPOINTS.roles}/${roleId}`);
    return handleResponse(response);
  },
  async createRole(roleData: { name: string; description?: string; permissions?: string[] }) {
    const response = await apiFetch(ENDPOINTS.roles, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roleData),
    });
    return handleResponse(response);
  },
  async updateRole(
    roleId: string,
    roleData: { name?: string; description?: string; permissions?: string[] }
  ) {
    const response = await apiFetch(`${ENDPOINTS.roles}/${roleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roleData),
    });
    return handleResponse(response);
  },
  async deleteRole(roleId: string) {
    const response = await apiFetch(`${ENDPOINTS.roles}/${roleId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: 'An unknown error occurred' }));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    return response.status === 204 ? Promise.resolve() : response.json();
  },
  async getRolePermissions(roleId: string) {
    const response = await apiFetch(ENDPOINTS.rolePermissions(roleId));
    return handleResponse(response);
  },
  async updateRolePermissions(roleId: string, permissionIds: string[]) {
    const response = await apiFetch(ENDPOINTS.rolePermissions(roleId), {
      method: 'PUT', // or POST
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: permissionIds }), // Backend expects an object like { permissions: [...] }
    });
    return handleResponse(response);
  },

  // Permission Management
  async getPermissions(params?: { offset?: number; limit?: number; search?: string }) {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);

    const response = await apiFetch(`${ENDPOINTS.permissions}?${searchParams.toString()}`);
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  // ... other permission CRUDs

  // OAuth Client Management
  async getClients(params?: { offset?: number; limit?: number; search?: string }) {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);

    const response = await apiFetch(`${ENDPOINTS.clients}?${searchParams.toString()}`);
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  async getClientById(id: string) {
    // id here is the internal DB ID, not client_id
    const response = await apiFetch(ENDPOINTS.clientById(id));
    return handleResponse(response);
  },
  async createClient(clientData: any) {
    // Define a proper type for clientData
    const response = await apiFetch(ENDPOINTS.clients, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientData),
    });
    return handleResponse(response);
  },
  async updateClient(id: string, clientData: any) {
    // Define a proper type for clientData
    const response = await apiFetch(ENDPOINTS.clientById(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientData),
    });
    return handleResponse(response);
  },
  async deleteClient(id: string) {
    const response = await apiFetch(ENDPOINTS.clientById(id), {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: 'An unknown error occurred' }));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    return response.status === 204 ? Promise.resolve() : response.json();
  },
  async rotateClientSecret(id: string) {
    const response = await apiFetch(ENDPOINTS.clientSecret(id), {
      method: 'POST',
    });
    return handleResponse(response);
  },

  // OAuth Scope Management
  async getScopes(params?: { offset?: number; limit?: number; search?: string }) {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);

    const response = await apiFetch(`${ENDPOINTS.permissions.replace('permissions', 'scopes')}?${searchParams.toString()}`);
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  // ... other scope CRUDs

  // Audit Log Management
  async getAuditLogs(params?: {
    offset?: number;
    limit?: number;
    search?: string;
    action?: string;
    status?: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ACCESS_DENIED' | '';
    startDate?: Date;
    endDate?: Date;
    sort?: string;
  }) {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.action) searchParams.set('action', params.action);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.startDate) searchParams.set('startDate', params.startDate.toISOString());
    if (params?.endDate) searchParams.set('endDate', params.endDate.toISOString());
    if (params?.sort) searchParams.set('sort', params.sort);

    const response = await apiFetch(`${ENDPOINTS.auditLogs}?${searchParams.toString()}`);
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },

  /**
   * 向后兼容旧代码中的 registerClient 调用，实质等同于 createClient
   */
  async registerClient(clientData: any) {
    return this.createClient(clientData);
  },

  // Stats
  async getStatsSummary() {
    const response = await apiFetch(ENDPOINTS.statsSummary);
    return handleResponse(response);
  },

  // System
  async getSystemConfig() {
    const response = await apiFetch(ENDPOINTS.systemConfig);
    return handleResponse(response);
  },
  async updateSystemConfig(configData: any) {
    const response = await apiFetch(ENDPOINTS.systemConfig, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configData),
    });
    return handleResponse(response);
  },

  // Menu Management (Simulated Backend API)
  async getMenus(): Promise<any[]> {
    // In a real scenario, this would be an actual API call to the backend
    // e.g., return apiFetch(ENDPOINTS.menus);
    await new Promise(resolve => setTimeout(resolve, 200)); // Simulate network delay
    return [
      {
        id: 'dashboard',
        name: '仪表盘',
        key: 'dashboard',
        path: '/admin',
        icon: 'LayoutDashboard',
        order: 10,
        permissions: ['menu:dashboard:view'],
      },
      {
        id: 'system-management',
        name: '系统管理',
        key: 'system-management',
        path: '#',
        icon: 'Settings',
        order: 100,
        children: [
          {
            id: 'users',
            name: '用户管理',
            key: 'users',
            path: '/admin/users',
            icon: 'Users',
            order: 110,
            permissions: ['menu:system:user:view', 'users:list'],
          },
          {
            id: 'roles',
            name: '角色管理',
            key: 'roles',
            path: '/admin/system/roles',
            icon: 'ShieldCheck',
            order: 120,
            permissions: ['menu:system:role:view', 'roles:list'],
          },
          {
            id: 'permissions',
            name: '权限管理',
            key: 'permissions',
            path: '/admin/system/permissions',
            icon: 'KeyRound',
            order: 130,
            permissions: ['menu:system:permission:view', 'permissions:list'],
          },
          {
            id: 'clients',
            name: 'OAuth 客户端',
            key: 'clients',
            path: '/admin/system/clients',
            icon: 'AppWindow',
            order: 140,
            permissions: ['menu:system:client:view', 'clients:list'],
          },
          {
            id: 'audit-logs',
            name: '审计日志',
            key: 'audit-logs',
            path: '/admin/system/audits',
            icon: 'ScrollText',
            order: 150,
            permissions: ['menu:system:audit:view', 'audit:list'],
          },
          {
            id: 'system-config',
            name: '系统配置',
            key: 'system-config',
            path: '/admin/system/config',
            icon: 'Settings2',
            order: 160,
            permissions: ['menu:system:config:view'],
          },
        ],
      },
      {
        id: 'oauth-register',
        name: '注册 OAuth 客户端',
        key: 'oauth-register',
        path: '/clients/register',
        icon: 'AppWindow',
        order: 200,
        permissions: ['clients:create'],
      },
    ];
  },
};

/**
 * 获取完整的URL
 * Get full URL for given path
 */
export function getFullUrl(path: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  // Server-side fallback
  return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}${path}`;
}

/**
 * 获取OAuth重定向URI
 * Get OAuth redirect URI
 */
export function getOAuthRedirectUri(): string {
  return getFullUrl('/auth/callback');
}
