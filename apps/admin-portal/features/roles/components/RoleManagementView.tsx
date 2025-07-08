'use client';

import React, { useMemo } from 'react';
import { DataTable, Button } from '@repo/ui';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@repo/ui';
import { useRoleManagement } from '../hooks/use-role-management';
import type { Role } from '@/types/auth';

const columns = (openEditModal: (role: Role) => void, openPermissionsModal: (role: Role) => void, openDeleteModal: (role: Role) => void) => [
  { accessorKey: 'name', header: 'Role Name' },
  { accessorKey: 'description', header: 'Description' },
  {
    id: 'actions',
    cell: ({ row }: { row: { original: Role } }) => (
      <div className="space-x-2">
        <Button variant="outline" size="sm" onClick={() => openPermissionsModal(row.original)}>Permissions</Button>
        <Button variant="outline" size="sm" onClick={() => openEditModal(row.original)}>Edit</Button>
        <Button variant="destructive" size="sm" onClick={() => openDeleteModal(row.original)}>Delete</Button>
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
  } = useRoleManagement();

  const roleColumns = useMemo(() => columns(openEditModal, openPermissionsEditor, openDeleteConfirm), [openEditModal, openPermissionsEditor, openDeleteConfirm]);

  if (isLoading) return <div>Loading roles...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="container mx-auto py-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Role Management</h1>
        {hasPermission('roles:create') && (
          <Button onClick={openCreateModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Role
          </Button>
        )}
      </header>
      
      <DataTable
        columns={roleColumns}
        data={roles}
        isLoading={isFetching}
        pageCount={meta?.totalPages ?? 0}
      />
    </div>
  );
};
