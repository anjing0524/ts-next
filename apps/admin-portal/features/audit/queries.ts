/**
 * 审计日志 React Query Hooks (Audit Log React Query Hooks)
 *
 * 提供获取审计日志数据的 React Query Hook
 * Provides React Query Hooks for fetching audit log data
 */

import { useQuery } from '@tanstack/react-query';
import type { AuditLog, AuditLogFilters } from './domain/audit';

/**
 * 审计日志查询键工厂 (Audit Log Query Keys)
 */
const auditKeys = {
  all: ['audit'] as const,
  logs: () => [...auditKeys.all, 'logs'] as const,
  logsWithFilters: (filters: AuditLogFilters) => [...auditKeys.logs(), filters] as const,
};

/**
 * 审计日志查询响应类型 (Audit Log Query Response)
 */
export interface AuditLogsQueryResponse {
  data: AuditLog[];
  meta?: {
    total: number;
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * 审计日志查询参数类型 (Audit Log Query Parameters)
 */
export interface AuditLogsQueryParams extends AuditLogFilters {
  page?: number;
  limit?: number;
}

/**
 * 获取审计日志的 React Query Hook (Get Audit Logs Hook)
 *
 * 用于在组件中获取审计日志数据
 * Used to fetch audit logs in components
 *
 * @param params - 查询参数 (Query parameters)
 * @returns React Query Hook 结果 (React Query Hook result)
 */
export const useAuditLogsQuery = (params: AuditLogsQueryParams) => {
  return useQuery<AuditLogsQueryResponse, Error>({
    queryKey: auditKeys.logsWithFilters(params),
    queryFn: async () => {
      // 注意：目前这是一个占位符实现
      // 实际实现应该调用后端 API
      // Note: This is currently a placeholder implementation
      // Actual implementation should call the backend API
      console.warn(
        'useAuditLogsQuery: 调用了占位符实现，应该实现真实的 API 调用 (Called placeholder implementation, should implement real API call)'
      );

      return {
        data: [],
        meta: {
          total: 0,
          currentPage: params.page || 1,
          pageSize: params.limit || 15,
          totalPages: 0,
        },
      };
    },
    // 禁用自动重新获取，避免频繁的网络请求
    // Disable automatic refetch to avoid frequent requests
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
};
