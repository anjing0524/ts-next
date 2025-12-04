/**
 * 用户资源API
 * 提供用户相关的CRUD操作
 */

import type { PaginatedResponse, User, UserCreateRequest, UserUpdateRequest, UserFilter } from '../index';
import type { ProfileUpdateRequest, PasswordUpdateRequest } from '../types/request-response';
import { HttpClientFactory } from '../client/http-client';

/**
 * 用户资源API
 */
export class UsersResource {
  private readonly client;

  constructor(baseUrl?: string) {
    this.client = HttpClientFactory.createFullFeaturedClient(baseUrl);
  }

  /**
   * 获取用户列表
   */
  async list(params?: UserFilter): Promise<PaginatedResponse<User>> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<User>>(url);
    return response.data;
  }

  /**
   * 获取单个用户
   */
  async get(id: string): Promise<User> {
    const response = await this.client.get<User>(`/api/users/${id}`);
    return response.data;
  }

  /**
   * 创建用户
   */
  async create(data: UserCreateRequest): Promise<User> {
    const response = await this.client.post<User>('/api/users', data);
    return response.data;
  }

  /**
   * 更新用户
   */
  async update(id: string, data: UserUpdateRequest): Promise<User> {
    const response = await this.client.put<User>(`/api/users/${id}`, data);
    return response.data;
  }

  /**
   * 删除用户
   */
  async delete(id: string): Promise<void> {
    await this.client.delete(`/api/users/${id}`);
  }

  /**
   * 批量删除用户
   */
  async batchDelete(ids: string[]): Promise<void> {
    await this.client.post('/api/users/batch-delete', { ids });
  }

  /**
   * 启用用户
   */
  async enable(id: string): Promise<void> {
    await this.client.post(`/api/users/${id}/enable`);
  }

  /**
   * 禁用用户
   */
  async disable(id: string): Promise<void> {
    await this.client.post(`/api/users/${id}/disable`);
  }

  /**
   * 重置用户密码
   */
  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.client.post(`/api/users/${id}/reset-password`, { newPassword });
  }

  /**
   * 更新用户角色
   */
  async updateRoles(id: string, roleIds: string[]): Promise<void> {
    await this.client.put(`/api/users/${id}/roles`, { roleIds });
  }

  /**
   * 搜索用户
   */
  async search(query: string, params?: Omit<UserFilter, 'search'>): Promise<PaginatedResponse<User>> {
    const queryParams = new URLSearchParams({ q: query });

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/users/search${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<User>>(url);
    return response.data;
  }

  /**
   * 导出用户列表
   */
  async export(params?: UserFilter): Promise<Blob> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/users/export${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<Blob>(url, {
      headers: {
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * 导入用户
   */
  async import(file: File): Promise<{ success: number; failed: number; errors?: string[] }> {
    const response = await this.client.upload<{ success: number; failed: number; errors?: string[] }>(
      '/api/users/import',
      file
    );
    return response.data;
  }

  /**
   * 获取用户统计信息
   */
  async stats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    locked: number;
    byRole: Record<string, number>;
  }> {
    const response = await this.client.get<{
      total: number;
      active: number;
      inactive: number;
      locked: number;
      byRole: Record<string, number>;
    }>('/api/users/stats');
    return response.data;
  }

  /**
   * 更新用户个人资料
   */
  async updateProfile(data: ProfileUpdateRequest): Promise<User> {
    const response = await this.client.put<User>('/api/users/me/profile', data);
    return response.data;
  }

  /**
   * 更新密码
   */
  async updatePassword(data: PasswordUpdateRequest): Promise<void> {
    await this.client.put('/api/users/me/password', data);
  }

  /**
   * 获取当前用户个人资料
   */
  async getProfile(): Promise<User> {
    const response = await this.client.get<User>('/api/users/me/profile');
    return response.data;
  }
}

/**
 * 默认用户资源实例
 */
export const usersResource = new UsersResource();

/**
 * 向后兼容的API助手函数
 */
export const usersApi = {
  getUsers: (params?: UserFilter) => usersResource.list(params),
  getUserById: (id: string) => usersResource.get(id),
  createUser: (data: UserCreateRequest) => usersResource.create(data),
  updateUser: (id: string, data: UserUpdateRequest) => usersResource.update(id, data),
  deleteUser: (id: string) => usersResource.delete(id),
  updateUserProfile: (data: ProfileUpdateRequest) => usersResource.updateProfile(data),
  updatePassword: (data: PasswordUpdateRequest) => usersResource.updatePassword(data),
  fetchUserProfile: () => usersResource.getProfile(),
};
