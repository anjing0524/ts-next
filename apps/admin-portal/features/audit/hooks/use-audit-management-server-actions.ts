/**
 * 审计日志管理 Hook - Server Actions 版本 (Audit Log Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query，保持与旧 Hook 接口兼容
 * Uses Next.js Server Actions instead of TanStack Query while maintaining compatibility
 */

'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { listAuditLogsAction, listUserAuditLogsAction } from '@/app/actions';
import type { AuditLog as ActionAuditLog } from '@/app/actions/types';
import type { AuditLog } from '../domain/audit';

/**
 * 审计日志过滤器类型 (Audit Log Filters Type)
 */
export interface AuditLogFilters {
  search?: string;
  action?: string;
  status?: 'SUCCESS' | 'FAILURE';
  startDate?: string;
  endDate?: string;
}

/**
 * 审计日志管理 Hook 返回值 - 与旧 Hook 兼容 (Hook Return Value - Compatible with old hook)
 */
export interface UseAuditManagementReturn {
  // 数据 (Data)
  logs: AuditLog[];
  meta: { total: number; totalPages: number; currentPage: number } | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;

  // 过滤状态 (Filter State)
  filters: AuditLogFilters;
  setFilters: (filters: AuditLogFilters) => void;
  handleApplyFilters: () => void;

  // 分页状态 (Pagination State)
  page: number;
  setPage: (page: number) => void;
  limit: number;
  setLimit: (limit: number) => void;
}

/**
 * 审计日志管理 Hook (Audit Log Management Hook)
 *
 * 使用 Server Actions 加载审计日志，保持与旧 Hook 相同的接口
 * Uses Server Actions to load audit logs with old hook interface
 */
export const useAuditManagementServerActions = (): UseAuditManagementReturn => {
  // 数据状态 (Data State)
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [meta, setMeta] = useState<{ total: number; totalPages: number; currentPage: number } | undefined>();
  const [error, setError] = useState<Error | null>(null);

  // 过渡状态 (Transition State)
  const [isLoading, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(false);

  // 分页状态 (Pagination State)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);

  // 过滤状态 (Filter State)
  const [filters, setFilters] = useState<AuditLogFilters>({
    search: '',
    action: '',
    status: undefined,
    startDate: undefined,
    endDate: undefined,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  /**
   * 加载审计日志 (Load Audit Logs)
   */
  const loadLogs = useCallback(async () => {
    setIsFetching(true);
    startTransition(async () => {
      try {
        const result = await listAuditLogsAction({
          page,
          page_size: limit,
        });

        if (result.success && result.data) {
          setLogs(result.data.items as unknown as AuditLog[]);
          setMeta({
            total: result.data.total,
            totalPages: Math.ceil((result.data.total || 0) / limit),
            currentPage: page,
          });
          setError(null);
        } else {
          setError(new Error(result.error || '加载审计日志失败'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('加载审计日志失败'));
      } finally {
        setIsFetching(false);
      }
    });
  }, [page, limit]);

  /**
   * 应用过滤器 (Apply Filters)
   */
  const handleApplyFilters = useCallback(() => {
    setPage(1);
    setAppliedFilters(filters);
  }, [filters]);

  // 在分页或过滤器变化时重新加载 (Reload when pagination or filters change)
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return {
    logs,
    meta,
    isLoading,
    isFetching,
    error,
    filters,
    setFilters,
    handleApplyFilters,
    page,
    setPage,
    limit,
    setLimit,
  };
};
