/**
 * 权限管理 Hook - Server Actions 版本 (Permission Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query，保持与旧 Hook 接口兼容
 * Uses Next.js Server Actions instead of TanStack Query while maintaining compatibility
 */

'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { listPermissionsAction } from '@/app/actions';
import type { Permission as ActionPermission } from '@/app/actions/types';
import type { Permission } from '../domain/permission';

/**
 * 权限管理 Hook 返回值 - 与旧 Hook 兼容 (Hook Return Value - Compatible with old hook)
 */
export interface UseRoleManagementReturn {
  // 权限数据 (Permission Data)
  permissions: Permission[];
  meta: { total: number; totalPages: number; currentPage: number } | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;

  // 分页状态 (Pagination State)
  page: number;
  setPage: (page: number) => void;
  limit: number;
  setLimit: (limit: number) => void;

  // 搜索状态 (Search State)
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  handleSearchSubmit: () => void;
}

/**
 * 权限管理 Hook (Permission Management Hook)
 *
 * 使用 Server Actions 加载权限数据，保持与旧 Hook 相同的接口
 * Uses Server Actions to load permission data with old hook interface
 */
export const useRoleManagementServerActions = (): UseRoleManagementReturn => {
  // 数据状态 (Data State)
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [meta, setMeta] = useState<{ total: number; totalPages: number; currentPage: number } | undefined>();
  const [error, setError] = useState<Error | null>(null);

  // 过渡状态 (Transition State)
  const [isLoading, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(false);

  // 分页状态 (Pagination State)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);

  // 搜索状态 (Search State)
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');

  /**
   * 加载权限列表 (Load Permissions List)
   */
  const loadPermissions = useCallback(async () => {
    setIsFetching(true);
    startTransition(async () => {
      try {
        const result = await listPermissionsAction({
          page,
          page_size: limit,
        });

        if (result.success && result.data) {
          // 转换 ActionPermission 到 Permission 格式
          // Convert ActionPermission to Permission format
          const convertedPermissions: Permission[] = result.data.items.map((item: any) => ({
            id: item.id || item.permission_id,
            name: item.name,
            description: item.description || '',
            resource: item.resource,
            action: item.action,
            type: item.type || 'custom',
            createdAt: item.created_at ? new Date(item.created_at) : new Date(),
            updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
          } as any));

          setPermissions(convertedPermissions);
          setMeta({
            total: result.data.total,
            totalPages: Math.ceil((result.data.total || 0) / limit),
            currentPage: page,
          });
          setError(null);
        } else {
          setError(new Error(result.error || '加载权限失败'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('加载权限失败'));
      } finally {
        setIsFetching(false);
      }
    });
  }, [page, limit]);

  /**
   * 处理搜索 (Handle Search)
   */
  const handleSearchSubmit = useCallback(() => {
    setPage(1);
    setAppliedSearchTerm(searchTerm);
  }, [searchTerm]);

  // 在分页或搜索变化时重新加载 (Reload when pagination or search changes)
  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  return {
    permissions,
    meta,
    isLoading,
    isFetching,
    error,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    handleSearchSubmit,
  };
};
