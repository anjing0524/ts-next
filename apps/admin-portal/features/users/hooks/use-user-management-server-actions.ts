/**
 * 用户管理 Hook - Server Actions 版本 (User Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query，保持与旧 Hook 接口兼容
 * Uses Next.js Server Actions instead of TanStack Query while maintaining compatibility
 */

'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { User } from '@/types/auth';
import { CreateUserInput, UpdateUserInput } from '../domain/user';

/**
 * 用户管理 Hook 返回值 - 与旧 Hook 兼容 (Hook Return Value - Compatible with old hook)
 */
export interface UseUserManagementReturn {
  // 数据 (Data)
  users: User[];
  usersMeta: { total: number; totalPages: number } | undefined;
  areUsersLoading: boolean;
  usersError: Error | null;

  // 表格状态 (Table State)
  pagination: PaginationState;
  setPagination: (state: PaginationState | ((prevState: PaginationState) => PaginationState)) => void;
  sorting: SortingState;
  setSorting: (state: SortingState) => void;

  // 模态框状态 (Modal State)
  isModalOpen: boolean;
  selectedUser: User | null;
  isDeleteConfirmOpen: boolean;
  isProcessing: boolean;

  // 方法 (Methods)
  openCreateModal: () => void;
  openEditModal: (user: User) => void;
  closeModal: () => void;
  openDeleteConfirm: (user: User) => void;
  closeDeleteConfirm: () => void;
  handleCreate: (data: CreateUserInput | UpdateUserInput) => void;
  handleUpdate: (data: UpdateUserInput) => void;
  handleDelete: () => void;
}

/**
 * 用户管理 Hook (User Management Hook)
 *
 * 使用 Server Actions 加载用户数据，保持与旧 Hook 相同的接口
 * Uses Server Actions to load user data with old hook interface
 */
export const useUserManagementServerActions = (): UseUserManagementReturn => {
  // 数据状态 (Data State)
  const [users, setUsers] = useState<User[]>([]);
  const [usersMeta, setUsersMeta] = useState<{ total: number; totalPages: number } | undefined>();
  const [usersError, setUsersError] = useState<Error | null>(null);

  // 过渡状态 (Transition State)
  const [isFetching, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);

  // UI 状态 (UI State)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 表格状态 (Table State)
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  /**
   * 加载用户数据 (Load Users)
   *
   * 演示实现：应该调用 listUsersAction() 获取用户列表
   * Demo implementation: Should call listUsersAction() to get user list
   */
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    startTransition(async () => {
      try {
        // 这里应该调用 listUsersAction() 但目前演示性实现
        // This should call listUsersAction() but demo implementation for now
        // 模拟加载初始化
        setUsers([]);
        setUsersMeta({ total: 0, totalPages: 0 });
        setUsersError(null);
      } catch (error) {
        setUsersError(error instanceof Error ? error : new Error('加载用户失败'));
      } finally {
        setIsLoading(false);
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
  const openEditModal = useCallback((user: User) => {
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
  const openDeleteConfirm = useCallback((user: User) => {
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
  const handleCreate = useCallback((data: CreateUserInput | UpdateUserInput) => {
    if ('username' in data) {
      // 这里应该调用创建用户的 Server Action
      // This should call create user Server Action
      closeModal();
      loadUsers();
    }
  }, [closeModal, loadUsers]);

  /**
   * 处理更新用户 (Handle Update User)
   */
  const handleUpdate = useCallback((data: UpdateUserInput) => {
    if (!selectedUser) return;
    // 这里应该调用更新用户的 Server Action
    // This should call update user Server Action
    closeModal();
    loadUsers();
  }, [selectedUser, closeModal, loadUsers]);

  /**
   * 处理删除用户 (Handle Delete User)
   */
  const handleDelete = useCallback(() => {
    if (!selectedUser) return;
    // 这里应该调用删除用户的 Server Action
    // This should call delete user Server Action
    closeDeleteConfirm();
    loadUsers();
  }, [selectedUser, closeDeleteConfirm, loadUsers]);

  // 初始加载 (Initial Load)
  useEffect(() => {
    loadUsers();
  }, []);

  return {
    // 数据 (Data)
    users,
    usersMeta,
    areUsersLoading: isLoading || isFetching,
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
    isProcessing: isFetching,

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
