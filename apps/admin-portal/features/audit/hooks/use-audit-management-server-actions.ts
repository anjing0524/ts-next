/**
 * 审计日志管理 Hook - Server Actions 版本 (Audit Log Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query
 * Uses Next.js Server Actions instead of TanStack Query
 */

'use client';

import { useState, useCallback, useTransition } from 'react';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { listAuditLogsAction, listUserAuditLogsAction } from '@/app/actions';
import { AuditLog } from '@/app/actions/types';

/**
 * 审计日志管理 Hook 返回值 (Hook Return Value)
 */
export interface UseAuditManagementReturn {
  // 数据 (Data)
  auditLogs: AuditLog[];
  auditLogsMeta: {
    total: number;
    totalPages: number;
  } | null;
  areLogsLoading: boolean;
  logsError: Error | null;

  // 表格状态 (Table State)
  pagination: PaginationState;
  setPagination: (state: PaginationState) => void;
  sorting: SortingState;
  setSorting: (state: SortingState) => void;

  // 过滤状态 (Filter State)
  selectedUserId: string | null;
  setSelectedUserId: (userId: string | null) => void;

  // 方法 (Methods)
  refreshLogs: () => Promise<void>;
  refreshUserLogs: (userId: string) => Promise<void>;
}

/**
 * 审计日志管理 Hook (Audit Log Management Hook)
 *
 * 使用 Server Actions 加载审计日志
 * Uses Server Actions to load audit logs
 */
export const useAuditManagementServerActions = (): UseAuditManagementReturn => {
  // 数据状态 (Data State)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsMeta, setAuditLogsMeta] = useState<{
    total: number;
    totalPages: number;
  } | null>(null);
  const [logsError, setLogsError] = useState<Error | null>(null);

  // 加载状态 (Loading State)
  const [isLoading, startTransition] = useTransition();

  // 表格状态 (Table State)
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  // 过滤状态 (Filter State)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  /**
   * 刷新所有审计日志 (Refresh All Audit Logs)
   */
  const refreshLogs = useCallback(async () => {
    startTransition(async () => {
      try {
        const result = await listAuditLogsAction({
          page: pageIndex + 1,
          page_size: pageSize,
        });

        if (result.success && result.data) {
          setAuditLogs(result.data.items);
          setAuditLogsMeta({
            total: result.data.total,
            totalPages: Math.ceil(result.data.total / pageSize),
          });
          setLogsError(null);
        } else {
          setLogsError(new Error(result.error || '加载审计日志失败'));
        }
      } catch (error) {
        setLogsError(error instanceof Error ? error : new Error('未知错误'));
      }
    });
  }, [pageIndex, pageSize]);

  /**
   * 刷新用户的审计日志 (Refresh User Audit Logs)
   */
  const refreshUserLogs = useCallback(
    async (userId: string) => {
      startTransition(async () => {
        try {
          const result = await listUserAuditLogsAction(userId, {
            page: pageIndex + 1,
            page_size: pageSize,
          });

          if (result.success && result.data) {
            setAuditLogs(result.data.items);
            setAuditLogsMeta({
              total: result.data.total,
              totalPages: Math.ceil(result.data.total / pageSize),
            });
            setLogsError(null);
          } else {
            setLogsError(new Error(result.error || '加载用户审计日志失败'));
          }
        } catch (error) {
          setLogsError(error instanceof Error ? error : new Error('未知错误'));
        }
      });
    },
    [pageIndex, pageSize],
  );

  /**
   * 处理用户过滤 (Handle User Filter)
   */
  const handleUserFilterChange = useCallback(
    (userId: string | null) => {
      setSelectedUserId(userId);
      setPagination({ pageIndex: 0, pageSize });

      if (userId) {
        refreshUserLogs(userId);
      } else {
        refreshLogs();
      }
    },
    [pageSize, refreshLogs, refreshUserLogs, setPagination],
  );

  return {
    // 数据 (Data)
    auditLogs,
    auditLogsMeta,
    areLogsLoading: isLoading,
    logsError,

    // 表格状态 (Table State)
    pagination: { pageIndex, pageSize },
    setPagination,
    sorting,
    setSorting,

    // 过滤状态 (Filter State)
    selectedUserId,
    setSelectedUserId: handleUserFilterChange,

    // 方法 (Methods)
    refreshLogs,
    refreshUserLogs,
  };
};
