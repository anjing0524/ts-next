'use client';

import React, { useMemo } from 'react';
import { DataTable, Button, Skeleton } from '@repo/ui';
import { useAuth } from '@repo/ui/hooks';
import { PlusCircle } from 'lucide-react';
import { useUserManagement } from '../hooks/use-user-management';
import { getUserColumns } from './UserTableColumns'; // Corrected import name
import { UserFormDialog } from './UserFormDialog';
import { DeleteConfirmDialog } from '../../../components/common/DeleteConfirmDialog'; // Corrected import path
import { ErrorDisplay } from '../../../components/common/ErrorDisplay'; // Corrected import path

export function UserManagementView() {
  const { hasPermission } = useAuth();
  const {
    users,
    usersMeta,
    areUsersLoading,
    setPagination,
    pagination,
    setSorting,
    sorting,
    openCreateModal,
    openEditModal,
    closeModal,
    isModalOpen,
    selectedUser,
    isProcessing,
    handleCreate,
    handleUpdate,
    openDeleteConfirm,
    closeDeleteConfirm,
    isDeleteConfirmOpen,
    handleDelete,
  } = useUserManagement();

  const columns = useMemo(
    () => getUserColumns({ onEdit: openEditModal, onDelete: openDeleteConfirm }),
    [openEditModal, openDeleteConfirm]
  );

  if (areUsersLoading && !usersMeta) { // Initial load
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-28" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">用户管理</h2>
        {hasPermission('users:create') && (
          <Button onClick={openCreateModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> 添加用户
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={users}
        pageCount={usersMeta?.totalPages ?? 0}
        pagination={pagination}
        onPaginationChange={setPagination}
        isLoading={areUsersLoading}
      />

      <UserFormDialog
        isOpen={isModalOpen}
        onClose={closeModal}
        user={selectedUser}
        isProcessing={isProcessing}
        onSubmit={selectedUser ? handleUpdate : handleCreate}
      />
      
      <DeleteConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={closeDeleteConfirm}
        onConfirm={handleDelete}
        isProcessing={isProcessing}
        itemName={selectedUser?.username || '该用户'}
        itemType="用户"
      />
    </div>
  );
}
