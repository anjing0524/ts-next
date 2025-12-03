/**
 * 客户端管理 Hook - Server Actions 版本 (Client Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query
 * Uses Next.js Server Actions instead of TanStack Query
 */

'use client';

import { useState, useCallback, useTransition } from 'react';
import { PaginationState, SortingState } from '@tanstack/react-table';
import { listClientsAction, getClientAction } from '@/app/actions';
import { ClientInfoPublic } from '@/app/actions/types';

/**
 * 客户端管理 Hook 返回值 (Hook Return Value)
 */
export interface UseClientManagementReturn {
  // 数据 (Data)
  clients: ClientInfoPublic[];
  clientsMeta: {
    totalPages: number;
    total: number;
  } | null;
  areClientsLoading: boolean;
  clientsError: Error | null;

  // 表格状态 (Table State)
  pagination: PaginationState;
  setPagination: (state: PaginationState) => void;
  sorting: SortingState;
  setSorting: (state: SortingState) => void;

  // 模态框状态 (Modal State)
  isModalOpen: boolean;
  selectedClient: ClientInfoPublic | null;
  isDeleteConfirmOpen: boolean;
  isProcessing: boolean;

  // 方法 (Methods)
  openCreateModal: () => void;
  openEditModal: (client: ClientInfoPublic) => void;
  closeModal: () => void;
  openDeleteConfirm: (client: ClientInfoPublic) => void;
  closeDeleteConfirm: () => void;
  handleCreate: (data: Partial<ClientInfoPublic>) => Promise<void>;
  handleUpdate: (data: Partial<ClientInfoPublic>) => Promise<void>;
  handleDelete: () => Promise<void>;
  refreshClients: () => Promise<void>;
}

/**
 * 客户端管理 Hook (Client Management Hook)
 *
 * 使用 Server Actions 加载客户端数据
 * Uses Server Actions to load client data
 */
export const useClientManagementServerActions = (): UseClientManagementReturn => {
  // 数据状态 (Data State)
  const [clients, setClients] = useState<ClientInfoPublic[]>([]);
  const [clientsError, setClientsError] = useState<Error | null>(null);

  // 加载和处理状态 (Loading & Processing State)
  const [isLoading, startTransition] = useTransition();

  // UI 状态 (UI State)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientInfoPublic | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 表格状态 (Table State)
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  /**
   * 刷新客户端数据 (Refresh Client Data)
   */
  const refreshClients = useCallback(async () => {
    startTransition(async () => {
      try {
        const result = await listClientsAction({
          page: pageIndex + 1,
          page_size: pageSize,
        });

        if (result.success && result.data) {
          setClients(result.data.items);
          setClientsError(null);
        } else {
          setClientsError(new Error(result.error || '加载客户端失败'));
        }
      } catch (error) {
        setClientsError(error instanceof Error ? error : new Error('未知错误'));
      }
    });
  }, [pageIndex, pageSize]);

  /**
   * 打开创建模态框 (Open Create Modal)
   */
  const openCreateModal = useCallback(() => {
    setSelectedClient(null);
    setIsModalOpen(true);
  }, []);

  /**
   * 打开编辑模态框 (Open Edit Modal)
   */
  const openEditModal = useCallback((client: ClientInfoPublic) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  }, []);

  /**
   * 关闭模态框 (Close Modal)
   */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedClient(null);
  }, []);

  /**
   * 打开删除确认对话框 (Open Delete Confirm Dialog)
   */
  const openDeleteConfirm = useCallback((client: ClientInfoPublic) => {
    setSelectedClient(client);
    setDeleteConfirmOpen(true);
  }, []);

  /**
   * 关闭删除确认对话框 (Close Delete Confirm Dialog)
   */
  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmOpen(false);
    setSelectedClient(null);
  }, []);

  /**
   * 处理创建客户端 (Handle Create Client)
   */
  const handleCreate = useCallback(
    async (data: Partial<ClientInfoPublic>) => {
      startTransition(async () => {
        try {
          // 在这里应该调用创建客户端的 Server Action
          // Here should call create client Server Action
          // 成功后刷新列表
          // Refresh list after success
          await refreshClients();
          closeModal();
        } catch (error) {
          setClientsError(error instanceof Error ? error : new Error('创建客户端失败'));
        }
      });
    },
    [closeModal, refreshClients],
  );

  /**
   * 处理更新客户端 (Handle Update Client)
   */
  const handleUpdate = useCallback(
    async (data: Partial<ClientInfoPublic>) => {
      if (!selectedClient) return;

      startTransition(async () => {
        try {
          // 在这里应该调用更新客户端的 Server Action
          // Here should call update client Server Action
          await refreshClients();
          closeModal();
        } catch (error) {
          setClientsError(error instanceof Error ? error : new Error('更新客户端失败'));
        }
      });
    },
    [selectedClient, closeModal, refreshClients],
  );

  /**
   * 处理删除客户端 (Handle Delete Client)
   */
  const handleDelete = useCallback(async () => {
    if (!selectedClient) return;

    startTransition(async () => {
      try {
        // 在这里应该调用删除客户端的 Server Action
        // Here should call delete client Server Action
        await refreshClients();
        closeDeleteConfirm();
      } catch (error) {
        setClientsError(error instanceof Error ? error : new Error('删除客户端失败'));
      }
    });
  }, [selectedClient, closeDeleteConfirm, refreshClients]);

  return {
    // 数据 (Data)
    clients,
    clientsMeta: {
      totalPages: Math.ceil(clients.length / pageSize),
      total: clients.length,
    },
    areClientsLoading: isLoading,
    clientsError,

    // 表格状态 (Table State)
    pagination: { pageIndex, pageSize },
    setPagination,
    sorting,
    setSorting,

    // 模态框状态 (Modal State)
    isModalOpen,
    selectedClient,
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
    refreshClients,
  };
};
