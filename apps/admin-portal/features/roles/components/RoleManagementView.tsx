'use client';

import React, { useMemo } from 'react';
import { DataTable, Button, ColumnDef, Skeleton } from '@repo/ui';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@repo/ui';
import { useRoleManagement } from '../hooks/use-role-management';
import { RoleFormDialog } from '@/components/admin/roles/RoleFormDialog';
import { RolePermissionsDialog } from '@/components/admin/roles/RolePermissionsDialog';
import { DeleteConfirmDialog } from '@/components/common/DeleteConfirmDialog';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import type { Role } from '@/types/auth';

const columns = (
  openEditModal: (role: Role) => void,
  openPermissionsModal: (role: Role) => void,
  openDeleteModal: (role: Role) => void
): ColumnDef<Role>[] => [
  { accessorKey: 'name', header: '角色名称' },
  { accessorKey: 'displayName', header: '显示名称' },
  { accessorKey: 'description', header: '描述' },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className="space-x-2">
        <Button variant="outline" size="sm" onClick={() => openPermissionsModal(row.original)}>
          权限
        </Button>
        <Button variant="outline" size="sm" onClick={() => openEditModal(row.original)}>
          编辑
        </Button>
        <Button variant="destructive" size="sm" onClick={() => openDeleteModal(row.original)}>
          删除
        </Button>
      </div>
    ),
  },
];

export const RoleManagementView = () => {
  const { hasPermission } = useAuth();
  const {
    roles,
    meta,
    isLoading,
    isFetching,
    error,
    openCreateModal,
    openEditModal,
    openPermissionsEditor,
    openDeleteConfirm,
    isModalOpen,
    isDeleteConfirmOpen,
    isPermissionsEditorOpen,
    selectedRole,
    saveRole,
    deleteRole,
    savePermissions,
    closeModal,
    page,
    setPage,
    limit,
    setLimit,
  } = useRoleManagement();

  const roleColumns = useMemo(
    () => columns(openEditModal, openPermissionsEditor, openDeleteConfirm),
    [openEditModal, openPermissionsEditor, openDeleteConfirm]
  );

  if (isLoading && !roles.length) {
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

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">角色管理</h2>
        {hasPermission('role:create') && (
          <Button onClick={openCreateModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> 添加角色
          </Button>
        )}
      </div>

      <DataTable
        columns={roleColumns}
        data={roles}
        pageCount={meta?.totalPages ?? 0}
        pagination={{
          pageIndex: meta ? meta.currentPage - 1 : 0,
          pageSize: limit,
        }}
        onPaginationChange={(updater) => {
          if (typeof updater === 'function') {
            const newPagination = updater({
              pageIndex: meta ? meta.currentPage - 1 : 0,
              pageSize: limit,
            });
            setPage(newPagination.pageIndex + 1);
            setLimit(newPagination.pageSize);
          } else {
            setPage(updater.pageIndex + 1);
            setLimit(updater.pageSize);
          }
        }}
        isLoading={isFetching}
      />

      <RoleFormDialog
        isOpen={isModalOpen}
        onOpenChange={(open) => !open && closeModal()}
        onSubmit={async (roleData) => {
          saveRole(roleData);
          return Promise.resolve();
        }}
        role={selectedRole}
        isLoading={false}
      />

      <RolePermissionsDialog
        isOpen={isPermissionsEditorOpen}
        onOpenChange={(open) => !open && closeModal()}
        role={selectedRole}
        onSave={async (roleId, permissionIds) => {
          savePermissions(permissionIds);
          return Promise.resolve();
        }}
        isLoading={false}
        allPermissions={[]}
        isFetchingPermissions={false}
      />

      <DeleteConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={closeModal}
        onConfirm={deleteRole}
        isProcessing={false}
        itemName={selectedRole?.name || '该角色'}
        itemType="角色"
      />
    </div>
  );
};
