/**
 * 角色权限管理 Hook - Server Actions 版本 (Role Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query
 * Uses Next.js Server Actions instead of TanStack Query
 */

'use client';

import { useState, useCallback, useTransition } from 'react';
import { PaginationState, SortingState } from '@tanstack/react-table';
import {
  listPermissionsAction,
  listRolesAction,
  assignRoleToUserAction,
  revokeRoleFromUserAction,
} from '@/app/actions';
import { Permission, Role } from '@/app/actions/types';

/**
 * 角色管理 Hook 返回值 (Hook Return Value)
 */
export interface UseRoleManagementReturn {
  // 权限数据 (Permission Data)
  permissions: Permission[];
  permissionsMeta: { total: number } | null;
  arePermissionsLoading: boolean;

  // 角色数据 (Role Data)
  roles: Role[];
  rolesMeta: { total: number } | null;
  areRolesLoading: boolean;

  // 错误状态 (Error State)
  error: Error | null;

  // 表格状态 (Table State)
  pagination: PaginationState;
  setPagination: (state: PaginationState) => void;
  sorting: SortingState;
  setSorting: (state: SortingState) => void;

  // 加载/处理状态 (Processing State)
  isProcessing: boolean;

  // 方法 (Methods)
  refreshPermissions: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  assignRoleToUser: (userId: string, roleId: string) => Promise<void>;
  revokeRoleFromUser: (userId: string, roleId: string) => Promise<void>;
}

/**
 * 角色管理 Hook (Role Management Hook)
 *
 * 使用 Server Actions 管理角色和权限
 * Uses Server Actions to manage roles and permissions
 */
export const useRoleManagementServerActions = (): UseRoleManagementReturn => {
  // 权限数据 (Permission Data)
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionsMeta, setPermissionsMeta] = useState<{ total: number } | null>(null);

  // 角色数据 (Role Data)
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesMeta, setRolesMeta] = useState<{ total: number } | null>(null);

  // 错误状态 (Error State)
  const [error, setError] = useState<Error | null>(null);

  // 加载状态 (Loading State)
  const [isLoading, startTransition] = useTransition();

  // 表格状态 (Table State)
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  /**
   * 刷新权限列表 (Refresh Permissions)
   */
  const refreshPermissions = useCallback(async () => {
    startTransition(async () => {
      try {
        const result = await listPermissionsAction({
          page: pageIndex + 1,
          page_size: pageSize,
        });

        if (result.success && result.data) {
          setPermissions(result.data.items);
          setPermissionsMeta({ total: result.data.total });
          setError(null);
        } else {
          setError(new Error(result.error || '加载权限列表失败'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('未知错误'));
      }
    });
  }, [pageIndex, pageSize]);

  /**
   * 刷新角色列表 (Refresh Roles)
   */
  const refreshRoles = useCallback(async () => {
    startTransition(async () => {
      try {
        const result = await listRolesAction({
          page: pageIndex + 1,
          page_size: pageSize,
        });

        if (result.success && result.data) {
          setRoles(result.data.items);
          setRolesMeta({ total: result.data.total });
          setError(null);
        } else {
          setError(new Error(result.error || '加载角色列表失败'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('未知错误'));
      }
    });
  }, [pageIndex, pageSize]);

  /**
   * 为用户分配角色 (Assign Role to User)
   */
  const assignRole = useCallback(async (userId: string, roleId: string) => {
    startTransition(async () => {
      try {
        const result = await assignRoleToUserAction(userId, roleId);
        if (result.success) {
          setError(null);
          // 分配成功后可以刷新角色列表
          // Can refresh roles after successful assignment
          await refreshRoles();
        } else {
          setError(new Error(result.error || '分配角色失败'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('分配角色失败'));
      }
    });
  }, [refreshRoles]);

  /**
   * 撤销用户角色 (Revoke Role from User)
   */
  const revokeRole = useCallback(async (userId: string, roleId: string) => {
    startTransition(async () => {
      try {
        const result = await revokeRoleFromUserAction(userId, roleId);
        if (result.success) {
          setError(null);
          // 撤销成功后可以刷新角色列表
          // Can refresh roles after successful revocation
          await refreshRoles();
        } else {
          setError(new Error(result.error || '撤销角色失败'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('撤销角色失败'));
      }
    });
  }, [refreshRoles]);

  return {
    // 权限数据 (Permission Data)
    permissions,
    permissionsMeta,
    arePermissionsLoading: isLoading,

    // 角色数据 (Role Data)
    roles,
    rolesMeta,
    areRolesLoading: isLoading,

    // 错误状态 (Error State)
    error,

    // 表格状态 (Table State)
    pagination: { pageIndex, pageSize },
    setPagination,
    sorting,
    setSorting,

    // 加载状态 (Processing State)
    isProcessing: isLoading,

    // 方法 (Methods)
    refreshPermissions,
    refreshRoles,
    assignRoleToUser: assignRole,
    revokeRoleFromUser: revokeRole,
  };
};
