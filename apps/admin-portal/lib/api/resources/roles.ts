/**
 * 角色资源API
 * 提供角色相关的CRUD操作
 */

import type { PaginatedResponse, Role, RoleCreateRequest, RoleUpdateRequest, RoleFilter } from '../index';
import { HttpClientFactory } from '../client/http-client';

/**
 * 角色资源API
 */
export class RolesResource {
  private readonly client;

  constructor(baseUrl?: string) {
    this.client = HttpClientFactory.createFullFeaturedClient(baseUrl);
  }

  /**
   * 获取角色列表
   */
  async list(params?: RoleFilter): Promise<PaginatedResponse<Role>> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/roles${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<Role>>(url);
    return response.data;
  }

  /**
   * 获取单个角色
   */
  async get(roleId: string): Promise<Role> {
    const response = await this.client.get<Role>(`/api/roles/${roleId}`);
    return response.data;
  }

  /**
   * 创建角色
   */
  async create(data: RoleCreateRequest): Promise<Role> {
    const response = await this.client.post<Role>('/api/roles', data);
    return response.data;
  }

  /**
   * 更新角色
   */
  async update(roleId: string, data: RoleUpdateRequest): Promise<Role> {
    const response = await this.client.put<Role>(`/api/roles/${roleId}`, data);
    return response.data;
  }

  /**
   * 删除角色
   */
  async delete(roleId: string): Promise<void> {
    await this.client.delete(`/api/roles/${roleId}`);
  }

  /**
   * 批量删除角色
   */
  async batchDelete(roleIds: string[]): Promise<void> {
    await this.client.post('/api/roles/batch-delete', { roleIds });
  }

  /**
   * 更新角色权限
   */
  async updatePermissions(roleId: string, permissions: string[]): Promise<void> {
    await this.client.put(`/api/roles/${roleId}/permissions`, { permissions });
  }

  /**
   * 获取角色权限
   */
  async getPermissions(roleId: string): Promise<string[]> {
    const response = await this.client.get<{ permissions: string[] }>(`/api/roles/${roleId}/permissions`);
    return response.data.permissions;
  }

  /**
   * 分配角色给用户
   */
  async assignToUser(roleId: string, userId: string): Promise<void> {
    await this.client.post(`/api/roles/${roleId}/assign/${userId}`);
  }

  /**
   * 从用户移除角色
   */
  async removeFromUser(roleId: string, userId: string): Promise<void> {
    await this.client.delete(`/api/roles/${roleId}/assign/${userId}`);
  }

  /**
   * 获取角色用户列表
   */
  async getUsers(roleId: string, params?: any): Promise<PaginatedResponse<any>> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/roles/${roleId}/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<any>>(url);
    return response.data;
  }

  /**
   * 获取角色统计信息
   */
  async stats(): Promise<{
    total: number;
    system: number;
    custom: number;
    byType: Record<string, number>;
  }> {
    const response = await this.client.get<{
      total: number;
      system: number;
      custom: number;
      byType: Record<string, number>;
    }>('/api/roles/stats');
    return response.data;
  }

  /**
   * 导出角色列表
   */
  async export(params?: RoleFilter): Promise<Blob> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/roles/export${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<Blob>(url, {
      headers: {
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * 导入角色
   */
  async import(file: File): Promise<{ success: number; failed: number; errors?: string[] }> {
    const response = await this.client.upload<{ success: number; failed: number; errors?: string[] }>(
      '/api/roles/import',
      file
    );
    return response.data;
  }
}

/**
 * 默认角色资源实例
 */
export const rolesResource = new RolesResource();

/**
 * 向后兼容的API助手函数
 */
export const rolesApi = {
  getRoles: (params?: any) => rolesResource.list(params),
  getRoleById: (roleId: string) => rolesResource.get(roleId),
  createRole: (roleData: any) => rolesResource.create(roleData),
  updateRole: (id: string, data: any) => rolesResource.update(id, data),
  deleteRole: (id: string) => rolesResource.delete(id),
  updateRolePermissions: (id: string, permissions: string[]) => rolesResource.updatePermissions(id, permissions),
};
