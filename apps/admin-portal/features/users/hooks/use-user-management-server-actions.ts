/**
 * 用户管理 Hook - Server Actions 版本 (User Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query
 * 简化的架构，无需复杂的中间层
 * Uses Next.js Server Actions instead of TanStack Query
 * Simplified architecture without complex middleware layers
 */

'use client';

import { useState, useCallback, useTransition } from 'react';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { getUserInfoAction } from '@/app/actions';
import { UserInfo } from '@/app/actions/types';

/**
 * 用户管理 Hook 返回值 (Hook Return Value)
 */
export interface UseUserManagementReturn {
  // 数据 (Data)
  users: UserInfo[];
  usersMeta: {
    totalPages: number;
    total: number;
  } | null;
  areUsersLoading: boolean;
  usersError: Error | null;

  // 表格状态 (Table State)
  pagination: PaginationState;
  setPagination: (state: PaginationState) => void;
  sorting: SortingState;
  setSorting: (state: SortingState) => void;

  // 模态框状态 (Modal State)
  isModalOpen: boolean;
  selectedUser: UserInfo | null;
  isDeleteConfirmOpen: boolean;
  isProcessing: boolean;

  // 方法 (Methods)
  openCreateModal: () => void;
  openEditModal: (user: UserInfo) => void;
  closeModal: () => void;
  openDeleteConfirm: (user: UserInfo) => void;
  closeDeleteConfirm: () => void;
  handleCreate: (data: Partial<UserInfo>) => Promise<void>;
  handleUpdate: (data: Partial<UserInfo>) => Promise<void>;
  handleDelete: () => Promise<void>;
}

/**
 * 用户管理 Hook (User Management Hook)
 *
 * 使用 Server Actions 进行数据操作
 * 提供与原有 hook 兼容的接口
 * Uses Server Actions for data operations
 * Provides interface compatible with original hook
 */
export const useUserManagementServerActions = (): UseUserManagementReturn => {
  // 数据状态 (Data State)
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [usersError, setUsersError] = useState<Error | null>(null);

  // 加载和处理状态 (Loading & Processing State)
  const [isLoading, startTransition] = useTransition();

  // UI 状态 (UI State)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 表格状态 (Table State)
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  /**
   * 加载用户数据 (Load User Data)
   *
   * 目前演示实现 - 实际应该从 Server Actions 获取列表
   * Demo implementation - actual should fetch from Server Actions
   */
  const loadUsers = useCallback(async () => {
    startTransition(async () => {
      try {
        // 演示：获取当前用户信息
        // Demo: Get current user info
        const result = await getUserInfoAction();
        if (result.success && result.data) {
          // 在实际应用中，这里应该调用 listUsersAction()
          // 但由于 OAuth Service 可能不提供用户列表 API，
          // 这里展示如何集成 Server Actions
          // In production, this should call listUsersAction()
          // But since OAuth Service might not provide user list API,
          // this shows how to integrate Server Actions
          setUsers([result.data]);
          setUsersError(null);
        } else {
          setUsersError(new Error(result.error || '加载用户失败'));
        }
      } catch (error) {
        setUsersError(error instanceof Error ? error : new Error('未知错误'));
      }
    });
  }, []);

  /**
   * 打开创建模态框 (Open Create Modal)
   */
  const openCreateModal = useCallback(() => {
    setSelectedUser(null);
    setIsModalOpen(true);
  }, []);

  /**
   * 打开编辑模态框 (Open Edit Modal)
   */
  const openEditModal = useCallback((user: UserInfo) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  }, []);

  /**
   * 关闭模态框 (Close Modal)
   */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedUser(null);
  }, []);

  /**
   * 打开删除确认对话框 (Open Delete Confirm Dialog)
   */
  const openDeleteConfirm = useCallback((user: UserInfo) => {
    setSelectedUser(user);
    setDeleteConfirmOpen(true);
  }, []);

  /**
   * 关闭删除确认对话框 (Close Delete Confirm Dialog)
   */
  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmOpen(false);
    setSelectedUser(null);
  }, []);

  /**
   * 处理创建用户 (Handle Create User)
   */
  const handleCreate = useCallback(
    async (data: Partial<UserInfo>) => {
      startTransition(async () => {
        try {
          // 在这里应该调用创建用户的 Server Action
          // 如果 OAuth Service 支持此操作
          // Here should call create user Server Action
          // If OAuth Service supports this operation

          // 演示：调用更新用户信息 Action
          // Demo: Call update user profile action
          const result = await getUserInfoAction();
          if (result.success) {
            closeModal();
            // 可以在这里重新加载列表或更新状态
            // Can reload list or update state here
          } else {
            setUsersError(new Error(result.error || '创建失败'));
          }
        } catch (error) {
          setUsersError(error instanceof Error ? error : new Error('创建用户失败'));
        }
      });
    },
    [closeModal],
  );

  /**
   * 处理更新用户 (Handle Update User)
   */
  const handleUpdate = useCallback(
    async (data: Partial<UserInfo>) => {
      if (!selectedUser) return;

      startTransition(async () => {
        try {
          // 在这里应该调用更新用户的 Server Action
          // Here should call update user Server Action
          const result = await getUserInfoAction();
          if (result.success) {
            closeModal();
          } else {
            setUsersError(new Error(result.error || '更新失败'));
          }
        } catch (error) {
          setUsersError(error instanceof Error ? error : new Error('更新用户失败'));
        }
      });
    },
    [selectedUser, closeModal],
  );

  /**
   * 处理删除用户 (Handle Delete User)
   */
  const handleDelete = useCallback(async () => {
    if (!selectedUser) return;

    startTransition(async () => {
      try {
        // 在这里应该调用删除用户的 Server Action
        // Here should call delete user Server Action

        // 演示：删除后关闭对话框
        // Demo: Close dialog after delete
        closeDeleteConfirm();
      } catch (error) {
        setUsersError(error instanceof Error ? error : new Error('删除用户失败'));
      }
    });
  }, [selectedUser, closeDeleteConfirm]);

  return {
    // 数据 (Data)
    users,
    usersMeta: {
      totalPages: Math.ceil(users.length / pageSize),
      total: users.length,
    },
    areUsersLoading: isLoading,
    usersError,

    // 表格状态 (Table State)
    pagination: { pageIndex, pageSize },
    setPagination,
    sorting,
    setSorting,

    // 模态框状态 (Modal State)
    isModalOpen,
    selectedUser,
    isDeleteConfirmOpen,
    isProcessing: isLoading,

    // 方法 (Methods)
    openCreateModal,
    openEditModal,
    closeModal,
    openDeleteConfirm,
    closeDeleteConfirm,
    handleCreate,
    handleUpdate,
    handleDelete,
  };
};
