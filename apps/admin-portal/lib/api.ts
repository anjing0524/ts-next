import { User } from '../types/auth';
import { User as DomainUser } from '../features/users/domain/user';
import { OAuthClient } from '@repo/database';

// API客户端配置
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v2';

// 基础请求函数
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// 带认证的请求函数
async function authenticatedRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // 使用TokenStorage获取access_token，而不是直接从localStorage
  const { TokenStorage } = await import('./auth/token-storage');
  const accessToken = TokenStorage.getAccessToken();

  return apiRequest<T>(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
    },
  });
}

// 认证API
export const authApi = {
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<import('@repo/ui').AuthTokens> {
    return apiRequest('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'auth-center-admin-client',
        code: code,
        redirect_uri: 'http://localhost:3000/auth/callback',
        code_verifier: codeVerifier,
      }),
    });
  },

  async login(credentials: { grant_type: string; username: string; password: string }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresIn: number }> {
    return apiRequest('/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: credentials.grant_type,
        client_id: 'auth-center-admin-client',
        username: credentials.username,
        password: credentials.password,
      }),
    });
  },

  async logout() {
    // 使用TokenStorage清除token
    const { TokenStorage } = await import('./auth/token-storage');
    TokenStorage.clearTokens();
  },

  async fetchUserProfile(): Promise<DomainUser> {
    return authenticatedRequest('/users/me');
  },
};

// 类型定义
export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
};

export type AuditLogsResponse = PaginatedResponse<any>;

// 导出基础请求函数，供页面等直接调用
export { apiRequest };

// 管理API
export const adminApi = {
  async getUserById(userId: string): Promise<import('@repo/ui').AuthUser | null> {
    return authenticatedRequest(`/users/${userId}`);
  },

  async getMenus() {
    return authenticatedRequest('/menu');
  },

  async getAuditLogs(params?: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: string;
    resource?: string;
    status?: string;
    search?: string;
  }): Promise<AuditLogsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.startDate) searchParams.set('startDate', params.startDate.toISOString());
    if (params?.endDate) searchParams.set('endDate', params.endDate.toISOString());
    if (params?.userId) searchParams.set('userId', params.userId);
    if (params?.action) searchParams.set('action', params.action);
    if (params?.resource) searchParams.set('resource', params.resource);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.search) searchParams.set('search', params.search);

    const queryString = searchParams.toString();
    const endpoint = `/audit-logs${queryString ? `?${queryString}` : ''}`;
    return authenticatedRequest(endpoint);
  },

  async getUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.role) searchParams.set('role', params.role);

    const queryString = searchParams.toString();
    const endpoint = `/users${queryString ? `?${queryString}` : ''}`;
    return authenticatedRequest(endpoint);
  },

  async getRoles(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);

    const queryString = searchParams.toString();
    const endpoint = `/roles${queryString ? `?${queryString}` : ''}`;
    return authenticatedRequest(endpoint);
  },

  async getPermissions(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);

    const queryString = searchParams.toString();
    const endpoint = `/permissions${queryString ? `?${queryString}` : ''}`;
    return authenticatedRequest(endpoint);
  },

  async getClients(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<OAuthClient>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);

    const queryString = searchParams.toString();
    const endpoint = `/clients${queryString ? `?${queryString}` : ''}`;
    return authenticatedRequest(endpoint);
  },

  // 新增：根据ID获取客户端
  async getClientById(clientId: string): Promise<OAuthClient> {
    return authenticatedRequest(`/clients/${clientId}`);
  },

  // 新增：创建客户端
  async createClient(clientData: any): Promise<OAuthClient> {
    return authenticatedRequest('/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  },

  // 新增：更新客户端
  async updateClient(clientId: string, clientData: any): Promise<OAuthClient> {
    return authenticatedRequest(`/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(clientData),
    });
  },

  // 新增：删除客户端
  async deleteClient(clientId: string): Promise<void> {
    await authenticatedRequest(`/clients/${clientId}`, {
      method: 'DELETE',
    });
  },

  // 新增：轮换客户端密钥
  async rotateClientSecret(clientId: string): Promise<{ clientSecret: string }> {
    return authenticatedRequest(`/clients/${clientId}/secret`, {
      method: 'POST',
    });
  },

  async registerClient(clientData: {
    name: string;
    redirectUris: string;
    jwksUri?: string;
  }): Promise<{ message: string; clientId?: string; clientSecret?: string }> {
    return authenticatedRequest('/clients', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  },

  async updateUserProfile(profileData: {
    displayName: string;
  }): Promise<{ message: string }> {
    return authenticatedRequest('/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  },

  async updatePassword(passwordData: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    return authenticatedRequest('/users/me/password', {
      method: 'PUT',
      body: JSON.stringify(passwordData),
    });
  },

  async createUser(userData: {
    username: string;
    password: string;
    displayName: string;
    isActive: boolean;
    mustChangePassword: boolean;
    roleIds: string[];
  }): Promise<{ message: string }> {
    return authenticatedRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async updateUser(userId: string, userData: {
    displayName: string;
    firstName: string;
    lastName: string;
    organization: string;
    department: string;
    isActive: boolean;
    mustChangePassword: boolean;
  }): Promise<{ message: string }> {
    return authenticatedRequest(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  // 新增：获取仪表盘统计数据
  async getStatsSummary(): Promise<import('../features/dashboard/queries').DashboardStats> {
    return authenticatedRequest('/stats/summary');
  },

  async getRoleById(roleId: string) {
    return authenticatedRequest(`/roles/${roleId}`);
  },

  async createRole(roleData: any) {
    return authenticatedRequest('/roles', {
      method: 'POST',
      body: JSON.stringify(roleData),
    });
  },

  async updateRole(roleId: string, roleData: any) {
    return authenticatedRequest(`/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(roleData),
    });
  },

  async deleteRole(roleId: string) {
    return authenticatedRequest(`/roles/${roleId}`, {
      method: 'DELETE',
    });
  },

  async updateRolePermissions(roleId: string, permissionIds: string[]) {
    return authenticatedRequest(`/roles/${roleId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permissionIds }),
    });
  },

  // 新增：获取系统配置
  async getSystemConfig(): Promise<any> {
    // 获取系统配置，返回 SystemConfig 对象
    return authenticatedRequest('/system/config');
  },

  // 新增：更新系统配置
  async updateSystemConfig(configData: any): Promise<any> {
    // 更新系统配置，返回更新后的 SystemConfig 对象
    return authenticatedRequest('/system/config', {
      method: 'PUT',
      body: JSON.stringify(configData),
    });
  },

  // 新增：删除用户
  async deleteUser(userId: string): Promise<void> {
    // 删除指定用户
    return authenticatedRequest(`/users/${userId}`, {
      method: 'DELETE',
    });
  },

  async submitConsent(decision: 'allow' | 'deny', consentParams: URLSearchParams): Promise<any> {
    return authenticatedRequest(`/oauth/consent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            decision,
            ...Object.fromEntries(consentParams),
        }),
    });
  },
};
