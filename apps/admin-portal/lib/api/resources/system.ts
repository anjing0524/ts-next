/**
 * 系统资源API
 * 提供系统配置、审计日志、统计信息等系统级操作
 */

import type { PaginatedResponse, SystemConfiguration, AuditLog } from '../index';
import type { ConfigValue, SystemLog } from '../types/request-response';
import { HttpClientFactory } from '../client/http-client';
import { cacheClient } from '../../cache/cache-client';

/**
 * 审计日志过滤器接口
 */
export interface AuditLogFilter {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 系统配置更新请求
 */
export interface SystemConfigUpdateRequest {
  [key: string]: ConfigValue;
}

/**
 * 系统统计摘要
 */
export interface SystemStatsSummary {
  totalUsers: number;
  activeUsers: number;
  totalClients: number;
  activeClients: number;
  totalRoles: number;
  totalPermissions: number;
  auditLogsToday: number;
  auditLogsThisWeek: number;
  systemUptime: number; // 秒
  lastBackupTime?: Date;
  databaseSize: number; // MB
  cacheHitRate: number; // 百分比
}

/**
 * 系统资源API
 */
export class SystemResource {
  private readonly client;

  constructor(baseUrl?: string) {
    this.client = HttpClientFactory.createFullFeaturedClient(baseUrl);
  }

  /**
   * 获取系统配置
   */
  async getSystemConfig(): Promise<SystemConfiguration[]> {
    const response = await this.client.get<SystemConfiguration[]>('/api/system/config');
    return response.data;
  }

  /**
   * 更新系统配置
   */
  async updateSystemConfig(data: SystemConfigUpdateRequest): Promise<void> {
    await this.client.put('/api/system/config', data);
  }

  /**
   * 获取单个系统配置项
   */
  async getSystemConfigItem(key: string): Promise<SystemConfiguration> {
    const response = await this.client.get<SystemConfiguration>(`/api/system/config/${key}`);
    return response.data;
  }

  /**
   * 更新单个系统配置项
   */
  async updateSystemConfigItem(key: string, value: ConfigValue, type?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON'): Promise<void> {
    await this.client.put(`/api/system/config/${key}`, { value, type });
  }

  /**
   * 获取审计日志列表（带缓存）
   */
  async getAuditLogs(params?: AuditLogFilter): Promise<PaginatedResponse<AuditLog>> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    // 生成缓存key
    const cacheKey = `audit:logs:${queryParams.toString()}`;

    // 尝试从缓存获取
    const cached = await cacheClient.get<PaginatedResponse<AuditLog>>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，从API获取
    const url = `/api/audit-logs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<AuditLog>>(url);

    // 缓存结果（5分钟TTL，标签为'audit'方便批量清除）
    await cacheClient.set(cacheKey, response.data, {
      ttl: 300,
      tags: ['audit'],
    });

    return response.data;
  }

  /**
   * 获取单个审计日志
   */
  async getAuditLog(id: string): Promise<AuditLog> {
    const response = await this.client.get<AuditLog>(`/api/audit-logs/${id}`);
    return response.data;
  }

  /**
   * 搜索审计日志
   */
  async searchAuditLogs(query: string, params?: Omit<AuditLogFilter, 'search'>): Promise<PaginatedResponse<AuditLog>> {
    const queryParams = new URLSearchParams({ q: query });

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/audit-logs/search${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<AuditLog>>(url);
    return response.data;
  }

  /**
   * 获取统计摘要
   */
  async getStatsSummary(): Promise<SystemStatsSummary> {
    const response = await this.client.get<SystemStatsSummary>('/api/stats/summary');
    return response.data;
  }

  /**
   * 获取详细统计信息
   */
  async getDetailedStats(): Promise<{
    userStats: {
      total: number;
      active: number;
      inactive: number;
      locked: number;
      byRole: Record<string, number>;
    };
    clientStats: {
      total: number;
      active: number;
      inactive: number;
      byType: Record<string, number>;
    };
    roleStats: {
      total: number;
      system: number;
      custom: number;
      byType: Record<string, number>;
    };
    permissionStats: {
      total: number;
      byType: Record<string, number>;
      byResource: Record<string, number>;
    };
    auditStats: {
      today: number;
      thisWeek: number;
      thisMonth: number;
      byAction: Record<string, number>;
      byStatus: Record<string, number>;
    };
    systemStats: {
      uptime: number;
      memoryUsage: number;
      cpuUsage: number;
      databaseSize: number;
      cacheHitRate: number;
    };
  }> {
    const response = await this.client.get('/api/stats/detailed');
    return response.data;
  }

  /**
   * 导出审计日志
   */
  async exportAuditLogs(params?: AuditLogFilter): Promise<Blob> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/audit-logs/export${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<Blob>(url, {
      headers: {
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * 清理审计日志
   */
  async cleanupAuditLogs(daysToKeep: number): Promise<{ deletedCount: number }> {
    const response = await this.client.post<{ deletedCount: number }>('/api/audit-logs/cleanup', { daysToKeep });
    return response.data;
  }

  /**
   * 获取系统健康状态
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      database: { status: 'up' | 'down'; latency?: number };
      cache: { status: 'up' | 'down'; hitRate?: number };
      authService: { status: 'up' | 'down'; latency?: number };
      fileStorage: { status: 'up' | 'down'; availableSpace?: number };
    };
    lastCheck: Date;
  }> {
    const response = await this.client.get('/api/system/health');
    return response.data;
  }

  /**
   * 获取系统信息
   */
  async getSystemInfo(): Promise<{
    version: string;
    buildTime: Date;
    environment: 'development' | 'staging' | 'production';
    nodeVersion: string;
    platform: string;
    uptime: number;
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  }> {
    const response = await this.client.get('/api/system/info');
    return response.data;
  }

  /**
   * 执行系统备份
   */
  async performBackup(): Promise<{ backupId: string; timestamp: Date; size: number }> {
    const response = await this.client.post<{ backupId: string; timestamp: Date; size: number }>('/api/system/backup');
    return response.data;
  }

  /**
   * 获取备份列表
   */
  async getBackupList(): Promise<Array<{ id: string; timestamp: Date; size: number; status: 'completed' | 'failed' | 'in_progress' }>> {
    const response = await this.client.get('/api/system/backups');
    return response.data;
  }

  /**
   * 恢复系统备份
   */
  async restoreBackup(backupId: string): Promise<{ success: boolean; message?: string }> {
    const response = await this.client.post<{ success: boolean; message?: string }>(`/api/system/backups/${backupId}/restore`);
    return response.data;
  }

  /**
   * 清除缓存
   */
  async clearCache(cacheType?: 'all' | 'user' | 'config' | 'permission'): Promise<{ cleared: number }> {
    const response = await this.client.post<{ cleared: number }>('/api/system/cache/clear', { cacheType });
    return response.data;
  }

  /**
   * 获取系统日志
   */
  async getSystemLogs(params?: {
    level?: 'error' | 'warn' | 'info' | 'debug';
    service?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<SystemLog>> {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const url = `/api/system/logs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await this.client.get<PaginatedResponse<SystemLog>>(url);
    return response.data;
  }
}

/**
 * 默认系统资源实例
 */
export const systemResource = new SystemResource();

/**
 * 向后兼容的API助手函数
 */
export const systemApi = {
  getSystemConfig: () => systemResource.getSystemConfig(),
  updateSystemConfig: (data: SystemConfigUpdateRequest) => systemResource.updateSystemConfig(data),
  getAuditLogs: (params?: AuditLogFilter) => systemResource.getAuditLogs(params),
  getStatsSummary: () => systemResource.getStatsSummary(),
};
