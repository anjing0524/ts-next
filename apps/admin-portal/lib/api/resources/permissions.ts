/**
 * 权限资源API
 * 提供权限相关的CRUD操作
 */

import type { PaginatedResponse, Permission } from '../index';
import { HttpClientFactory } from '../client/http-client';

/**
 * 权限过滤器接口
 */
export interface PermissionFilter {
  type?: 'API' | 'MENU' | 'DATA';
  resource?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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

/**
 * 权限资源API
 */
export class PermissionsResource {
  private readonly client;

  constructor(baseUrl?: string) {
    this.client = HttpClientFactory.createFullFeaturedClient(baseUrl);
  }

  /**
   * 获取权限列表
   */
  async list(params?: PermissionFilter): Promise<PaginatedResponse<Permission>> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/permissions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<Permission>>(url);
    return response.data;
  }

  /**
   * 获取单个权限
   */
  async get(permissionId: string): Promise<Permission> {
    const response = await this.client.get<Permission>(`/api/permissions/${permissionId}`);
    return response.data;
  }

  /**
   * 创建权限
   */
  async create(data: PermissionCreateRequest): Promise<Permission> {
    const response = await this.client.post<Permission>('/api/permissions', data);
    return response.data;
  }

  /**
   * 更新权限
   */
  async update(permissionId: string, data: PermissionUpdateRequest): Promise<Permission> {
    const response = await this.client.put<Permission>(`/api/permissions/${permissionId}`, data);
    return response.data;
  }

  /**
   * 删除权限
   */
  async delete(permissionId: string): Promise<void> {
    await this.client.delete(`/api/permissions/${permissionId}`);
  }

  /**
   * 批量删除权限
   */
  async batchDelete(permissionIds: string[]): Promise<void> {
    await this.client.post('/api/permissions/batch-delete', { permissionIds });
  }

  /**
   * 搜索权限
   */
  async search(query: string, params?: Omit<PermissionFilter, 'search'>): Promise<PaginatedResponse<Permission>> {
    const queryParams = new URLSearchParams({ q: query });

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/permissions/search${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<Permission>>(url);
    return response.data;
  }

  /**
   * 获取权限统计信息
   */
  async stats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byResource: Record<string, number>;
  }> {
    const response = await this.client.get<{
      total: number;
      byType: Record<string, number>;
      byResource: Record<string, number>;
    }>('/api/permissions/stats');
    return response.data;
  }

  /**
   * 导出权限列表
   */
  async export(params?: PermissionFilter): Promise<Blob> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/permissions/export${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<Blob>(url, {
      headers: {
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * 导入权限
   */
  async import(file: File): Promise<{ success: number; failed: number; errors?: string[] }> {
    const response = await this.client.upload<{ success: number; failed: number; errors?: string[] }>(
      '/api/permissions/import',
      file
    );
    return response.data;
  }

  /**
   * 获取角色权限
   */
  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const response = await this.client.get<Permission[]>(`/api/roles/${roleId}/permissions`);
    return response.data;
  }

  /**
   * 获取用户权限
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const response = await this.client.get<Permission[]>(`/api/users/${userId}/permissions`);
    return response.data;
  }

  /**
   * 验证权限
   */
  async validate(permissionName: string, userId?: string): Promise<{ hasPermission: boolean }> {
    const response = await this.client.post<{ hasPermission: boolean }>('/api/permissions/validate', {
      permission: permissionName,
      userId,
    });
    return response.data;
  }
}

/**
 * 默认权限资源实例
 */
export const permissionsResource = new PermissionsResource();

/**
 * 向后兼容的API助手函数
 */
export const permissionsApi = {
  getPermissions: (params?: any) => permissionsResource.list(params),
  getPermissionById: (permissionId: string) => permissionsResource.get(permissionId),
  createPermission: (data: any) => permissionsResource.create(data),
  updatePermission: (id: string, data: any) => permissionsResource.update(id, data),
  deletePermission: (id: string) => permissionsResource.delete(id),
};
