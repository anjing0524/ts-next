/**
 * 客户端管理 Hook - Server Actions 版本 (Client Management Hook - Server Actions Version)
 *
 * 使用 Next.js Server Actions 替代 TanStack Query，保持与旧 Hook 接口兼容
 * Uses Next.js Server Actions instead of TanStack Query while maintaining compatibility
 */

'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { listClientsAction } from '@/app/actions';
import type { OAuthClient as Client, ClientFormInput } from '../domain/client';

/**
 * 客户端管理 Hook 返回值 - 与旧 Hook 兼容 (Hook Return Value - Compatible with old hook)
 */
export interface UseClientManagementReturn {
  // 数据 (Data)
  clients: Client[];
  meta: { total: number; totalPages: number; currentPage: number } | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;

  // UI 状态 (UI State)
  isModalOpen: boolean;
  isDeleteConfirmOpen: boolean;
  isSecretModalOpen: boolean;
  selectedClient: Client | null;
  newSecret: string | null;

  // 方法 (Methods)
  openCreateModal: () => void;
  openEditModal: (client: Client) => void;
  openDeleteConfirm: (client: Client) => void;
  closeModal: () => void;
  saveClient: (clientData: ClientFormInput) => void;
  deleteClient: () => void;
  rotateSecret: (clientId: string) => void;

  // 分页状态 (Pagination State)
  page: number;
  setPage: (page: number) => void;
  limit: number;
  setLimit: (limit: number) => void;

  // 搜索状态 (Search State)
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  handleSearch: () => void;
}

/**
 * 客户端管理 Hook (Client Management Hook)
 *
 * 使用 Server Actions 加载客户端数据，保持与旧 Hook 相同的接口
 * Uses Server Actions to load client data with old hook interface
 */
export const useClientManagementServerActions = (): UseClientManagementReturn => {
  // 数据状态 (Data State)
  const [clients, setClients] = useState<Client[]>([]);
  const [meta, setMeta] = useState<{ total: number; totalPages: number; currentPage: number } | undefined>();
  const [error, setError] = useState<Error | null>(null);

  // 过渡状态 (Transition State)
  const [isLoading, startTransition] = useTransition();
  const [isFetching, setIsFetching] = useState(false);

  // UI 状态 (UI State)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // 分页状态 (Pagination State)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // 搜索状态 (Search State)
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearchTerm, setAppliedSearchTerm] = useState('');

  /**
   * 加载客户端列表 (Load Clients List)
   */
  const loadClients = useCallback(async () => {
    setIsFetching(true);
    startTransition(async () => {
      try {
        const result = await listClientsAction({
          page,
          page_size: limit,
        });

        if (result.success && result.data) {
          // 转换 ClientInfoPublic 到 OAuthClient 格式
          // Convert ClientInfoPublic to OAuthClient format
          const convertedClients: Client[] = result.data.items.map((item: any) => ({
            id: item.client_id,
            clientId: item.client_id,
            name: item.client_name,
            clientType: item.clientType || 'public',
            redirectUris: item.redirect_uris || [],
            grantTypes: item.grant_types || [],
            createdAt: item.created_at ? new Date(item.created_at) : new Date(),
            updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
            isActive: item.isActive !== false,
            clientSecret: '',
            clientSecretExpiresAt: null,
          } as any));

          setClients(convertedClients);
          setMeta({
            total: result.data.total,
            totalPages: Math.ceil((result.data.total || 0) / limit),
            currentPage: page,
          });
          setError(null);
        } else {
          setError(new Error(result.error || '加载客户端失败'));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('加载客户端失败'));
      } finally {
        setIsFetching(false);
      }
    });
  }, [page, limit]);

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
  const openEditModal = useCallback((client: Client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  }, []);

  /**
   * 打开删除确认对话框 (Open Delete Confirm Dialog)
   */
  const openDeleteConfirm = useCallback((client: Client) => {
    setSelectedClient(client);
    setIsDeleteConfirmOpen(true);
  }, []);

  /**
   * 关闭模态框和确认对话框 (Close All Modals)
   */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setIsDeleteConfirmOpen(false);
    setIsSecretModalOpen(false);
    setSelectedClient(null);
    setNewSecret(null);
  }, []);

  /**
   * 保存客户端 (Save Client - Create or Update)
   */
  const saveClient = useCallback(
    (clientData: ClientFormInput) => {
      // 这里应该调用创建或更新客户端的 Server Action
      // This should call create or update client Server Action
      // 目前仅示意，需要后续实现
      closeModal();
      loadClients();
    },
    [closeModal, loadClients],
  );

  /**
   * 删除客户端 (Delete Client)
   */
  const deleteClient = useCallback(() => {
    if (!selectedClient) return;
    // 这里应该调用删除客户端的 Server Action
    // This should call delete client Server Action
    // 目前仅示意，需要后续实现
    closeModal();
    loadClients();
  }, [selectedClient, closeModal, loadClients]);

  /**
   * 旋转客户端密钥 (Rotate Client Secret)
   */
  const rotateSecret = useCallback((clientId: string) => {
    // 这里应该调用旋转密钥的 Server Action
    // This should call rotate secret Server Action
    // 目前仅示意，需要后续实现
  }, []);

  /**
   * 处理搜索 (Handle Search)
   */
  const handleSearch = useCallback(() => {
    setPage(1);
    setAppliedSearchTerm(searchTerm);
  }, [searchTerm]);

  // 在分页或搜索变化时重新加载 (Reload when pagination or search changes)
  useEffect(() => {
    loadClients();
  }, [loadClients]);

  return {
    clients,
    meta,
    isLoading,
    isFetching,
    error,
    isModalOpen,
    isDeleteConfirmOpen,
    isSecretModalOpen,
    selectedClient,
    newSecret,
    openCreateModal,
    openEditModal,
    openDeleteConfirm,
    closeModal,
    saveClient,
    deleteClient,
    rotateSecret,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    handleSearch,
  };
};
