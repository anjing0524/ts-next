/**
 * 客户端资源API
 * 提供OAuth客户端相关的CRUD操作
 */

import type { PaginatedResponse, OAuthClient, ClientCreateRequest, ClientUpdateRequest, ClientFilter } from '../index';
import { HttpClientFactory } from '../client/http-client';

/**
 * 客户端资源API
 */
export class ClientsResource {
  private readonly client;

  constructor(baseUrl?: string) {
    this.client = HttpClientFactory.createFullFeaturedClient(baseUrl);
  }

  /**
   * 获取客户端列表
   */
  async list(params?: ClientFilter): Promise<PaginatedResponse<OAuthClient>> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/clients${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<OAuthClient>>(url);
    return response.data;
  }

  /**
   * 获取单个客户端
   */
  async get(clientId: string): Promise<OAuthClient> {
    const response = await this.client.get<OAuthClient>(`/api/clients/${clientId}`);
    return response.data;
  }

  /**
   * 创建客户端
   */
  async create(data: ClientCreateRequest): Promise<OAuthClient> {
    const response = await this.client.post<OAuthClient>('/api/clients', data);
    return response.data;
  }

  /**
   * 更新客户端
   */
  async update(clientId: string, data: ClientUpdateRequest): Promise<OAuthClient> {
    const response = await this.client.put<OAuthClient>(`/api/clients/${clientId}`, data);
    return response.data;
  }

  /**
   * 删除客户端
   */
  async delete(clientId: string): Promise<void> {
    await this.client.delete(`/api/clients/${clientId}`);
  }

  /**
   * 批量删除客户端
   */
  async batchDelete(clientIds: string[]): Promise<void> {
    await this.client.post('/api/clients/batch-delete', { clientIds });
  }

  /**
   * 旋转客户端密钥
   */
  async rotateSecret(clientId: string): Promise<{ clientSecret: string }> {
    const response = await this.client.post<{ client_secret: string }>(`/api/clients/${clientId}/secret`);
    // 转换字段名以匹配前端期望的类型
    return { clientSecret: response.data.client_secret };
  }

  /**
   * 注册客户端
   */
  async register(data: any): Promise<OAuthClient> {
    const response = await this.client.post<OAuthClient>('/api/clients/register', data);
    return response.data;
  }

  /**
   * 验证客户端
   */
  async validate(clientId: string, clientSecret: string): Promise<{ valid: boolean }> {
    const response = await this.client.post<{ valid: boolean }>('/api/clients/validate', {
      client_id: clientId,
      client_secret: clientSecret,
    });
    return response.data;
  }

  /**
   * 获取客户端统计信息
   */
  async stats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: Record<string, number>;
  }> {
    const response = await this.client.get<{
      total: number;
      active: number;
      inactive: number;
      byType: Record<string, number>;
    }>('/api/clients/stats');
    return response.data;
  }

  /**
   * 导出客户端列表
   */
  async export(params?: ClientFilter): Promise<Blob> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/clients/export${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<Blob>(url, {
      headers: {
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * 导入客户端
   */
  async import(file: File): Promise<{ success: number; failed: number; errors?: string[] }> {
    const response = await this.client.upload<{ success: number; failed: number; errors?: string[] }>(
      '/api/clients/import',
      file
    );
    return response.data;
  }
}

/**
 * 默认客户端资源实例
 */
export const clientsResource = new ClientsResource();

/**
 * 向后兼容的API助手函数
 */
export const clientsApi = {
  getClients: (params?: any) => clientsResource.list(params),
  getClientById: (clientId: string) => clientsResource.get(clientId),
  createClient: (clientData: any) => clientsResource.create(clientData),
  updateClient: (clientId: string, clientData: any) => clientsResource.update(clientId, clientData),
  deleteClient: (clientId: string) => clientsResource.delete(clientId),
  rotateClientSecret: (clientId: string) => clientsResource.rotateSecret(clientId),
  registerClient: (data: any) => clientsResource.register(data),
};
