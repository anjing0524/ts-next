import { TokenStorage } from './auth/token-storage'; // Corrected import path
import type { Role } from '@/types/admin-entities';

// Helper function to construct authorization headers
const getAuthHeaders = (contentType: string = 'application/json') => {
  const headers: HeadersInit = {
    Authorization: `Bearer ${TokenStorage.getAccessToken()}`,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
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
    const response = await fetch('/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // Or 'application/x-www-form-urlencoded' depending on server
      },
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },

  /**
   * Logs out a user.
   * Corresponds to an optional POST /api/v2/auth/logout.
   */
  async logout() {
    // Server-side logout is optional; primary action is clearing local tokens.
    // If your server has a session invalidation endpoint, call it here.
    const token = TokenStorage.getAccessToken();
    if (token) {
      try {
        const response = await fetch('/api/v2/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        // We might not need to handle the response strictly if client-side cleanup is sufficient.
        if (!response.ok)
          console.warn('Server logout failed, proceeding with client-side cleanup.');
      } catch (error) {
        console.warn('Error during server logout:', error);
      }
    }
    TokenStorage.clearTokens(); // Ensure client-side tokens are always cleared
    return Promise.resolve(); // Indicate success from client perspective
  },

  /**
   * Refreshes an access token.
   * Corresponds to POST /api/v2/oauth/token with refresh_token grant.
   * @param refreshToken - The refresh token.
   * @param clientId - (Optional) The client ID, if required by the OAuth server.
   */
  async refreshToken(refreshToken: string, clientId?: string) {
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    if (clientId) {
      bodyParams.append('client_id', clientId);
    }
    const response = await fetch('/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });
    return handleResponse(response);
  },

  /**
   * Fetches the current user's profile information.
   * Corresponds to GET /api/v2/users/me.
   */
  async fetchUserProfile() {
    const response = await fetch('/api/v2/users/me', {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
};

// API client for admin-related operations
export const adminApi = {
  // User Management
  async getUsers(params?: { offset?: number; limit?: number; search?: string }) {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);

    const response = await fetch(`/api/v2/users?${searchParams.toString()}`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  async getUserById(userId: string) {
    const response = await fetch(`/api/v2/users/${userId}`, { headers: getAuthHeaders() });
    return handleResponse(response);
  },
  async createUser(userData: any) {
    const response = await fetch('/api/v2/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },
  async updateUser(userId: string, userData: any) {
    const response = await fetch(`/api/v2/users/${userId}`, {
      method: 'PUT', // Or PATCH
      headers: getAuthHeaders(),
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },
  async deleteUser(userId: string) {
    const response = await fetch(`/api/v2/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(''), // No content-type for DELETE with no body
    });
    // For DELETE, often a 204 No Content is returned.
    // handleResponse needs to be flexible or have a variant for this.
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: 'An unknown error occurred' }));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    return response.status === 204 ? Promise.resolve() : response.json();
  },
  async updateUserProfile(profileData: any) {
    // Specific for current user's profile
    const response = await fetch('/api/v2/users/me/profile', {
      // Assuming endpoint for profile update
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(profileData),
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

    const response = await fetch(`/api/v2/roles?${searchParams.toString()}`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  async getRoleById(roleId: string): Promise<Role> {
    const response = await fetch(`/api/v2/roles/${roleId}`, { headers: getAuthHeaders() });
    return handleResponse(response);
  },
  async createRole(roleData: { name: string; description?: string; permissions?: string[] }) {
    const response = await fetch('/api/v2/roles', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(roleData),
    });
    return handleResponse(response);
  },
  async updateRole(
    roleId: string,
    roleData: { name?: string; description?: string; permissions?: string[] }
  ) {
    const response = await fetch(`/api/v2/roles/${roleId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(roleData),
    });
    return handleResponse(response);
  },
  async deleteRole(roleId: string) {
    const response = await fetch(`/api/v2/roles/${roleId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(''), // No content-type for DELETE with no body
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
    // This might be part of getRoleById or a separate endpoint like /api/v2/roles/{roleId}/permissions
    // Assuming it's included in getRoleById for now, or needs a specific endpoint.
    // For a dedicated endpoint:
    const response = await fetch(`/api/v2/roles/${roleId}/permissions`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
  async updateRolePermissions(roleId: string, permissionIds: string[]) {
    const response = await fetch(`/api/v2/roles/${roleId}/permissions`, {
      method: 'PUT', // or POST
      headers: getAuthHeaders(),
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

    const response = await fetch(`/api/v2/permissions?${searchParams.toString()}`, {
      headers: getAuthHeaders(),
    });
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

    const response = await fetch(`/api/v2/clients?${searchParams.toString()}`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
  },
  async getClientById(id: string) {
    // id here is the internal DB ID, not client_id
    const response = await fetch(`/api/v2/clients/${id}`, { headers: getAuthHeaders() });
    return handleResponse(response);
  },
  async createClient(clientData: any) {
    // Define a proper type for clientData
    const response = await fetch('/api/v2/clients', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(clientData),
    });
    return handleResponse(response); // This might return the created client with its secret
  },
  async updateClient(id: string, clientData: any) {
    // Define a proper type for clientData
    const response = await fetch(`/api/v2/clients/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(clientData),
    });
    return handleResponse(response);
  },
  async deleteClient(id: string) {
    const response = await fetch(`/api/v2/clients/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(''),
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
    const response = await fetch(`/api/v2/clients/${id}/secret`, {
      // Assuming this endpoint
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(response); // Should return the client with the new secret
  },

  // OAuth Scope Management
  async getScopes(params?: { offset?: number; limit?: number; search?: string }) {
    // 转换分页参数：从 offset/limit 到 page/pageSize
    const { page, pageSize } = adaptOffsetToPage(params?.offset, params?.limit);

    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('pageSize', String(pageSize));
    if (params?.search) searchParams.set('search', params.search);

    const response = await fetch(`/api/v2/scopes?${searchParams.toString()}`, {
      headers: getAuthHeaders(),
    });
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
    status?: 'SUCCESS' | 'FAILURE' | '';
    startDate?: string;
    endDate?: string;
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
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.sort) searchParams.set('sort', params.sort);

    const response = await fetch(`/api/v2/audit-logs?${searchParams.toString()}`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse(response);

    // 转换响应格式：从 pagination 到 meta
    return adaptPaginationToMeta(data);
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
