import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PaginationState, SortingState } from '@tanstack/react-table';
import {
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} from '../queries';
import { User, CreateUserInput, UpdateUserInput } from '../domain/user';

export const useUserManagement = () => {
  const queryClient = useQueryClient();

  // UI State for modals and selections
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // TanStack Table State
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  const paginationParams = useMemo(
    () => ({
      offset: pageIndex * pageSize,
      limit: pageSize,
    }),
    [pageIndex, pageSize]
  );

  // Data fetching using our custom query hooks
  const {
    data: usersData,
    isLoading: areUsersLoading,
    isFetching,
    error: usersError,
  } = useUsersQuery(paginationParams);

  // Mutations from our custom mutation hooks
  const { mutate: createUser, isPending: isCreatingUser } = useCreateUserMutation();
  const { mutate: updateUser, isPending: isUpdatingUser } = useUpdateUserMutation();
  const { mutate: deleteUser, isPending: isDeletingUser } = useDeleteUserMutation();

  const openCreateModal = () => {
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const openDeleteConfirm = (user: User) => {
    setSelectedUser(user);
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setSelectedUser(null);
  };

  const handleCreate = (data: CreateUserInput | UpdateUserInput) => {
    if ('username' in data) {
      createUser(data as CreateUserInput, {
        onSuccess: () => closeModal(),
      });
    }
  };

  const handleUpdate = (data: UpdateUserInput) => {
    if (!selectedUser) return;
    updateUser(
      { userId: selectedUser.id, userData: data },
      {
        onSuccess: () => closeModal(),
      }
    );
  };

  const handleDelete = () => {
    if (!selectedUser) return;
    deleteUser(selectedUser.id, {
      onSuccess: () => closeDeleteConfirm(),
    });
  };

  const isProcessing = isCreatingUser || isUpdatingUser || isDeletingUser;

  return {
    // Data
    users: usersData?.data ?? [],
    usersMeta: usersData?.meta,
    areUsersLoading: areUsersLoading || isFetching,
    usersError,

    // Table State
    pagination: { pageIndex, pageSize },
    setPagination,
    sorting,
    setSorting,

    // Modal State
    isModalOpen,
    selectedUser,
    isDeleteConfirmOpen,
    isProcessing,

    // Methods
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
