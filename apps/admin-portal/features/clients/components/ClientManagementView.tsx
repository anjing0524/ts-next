'use client';

import React, { useMemo } from 'react';
import { DataTable, Button } from '@repo/ui';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@repo/ui';
import { useClientManagement } from '../hooks/use-client-management';
import type { Client } from '@/types/auth';

const columns = (openEditModal: (client: Client) => void, openDeleteModal: (client: Client) => void, rotateSecret: (clientId: string) => void) => [
  { accessorKey: 'clientName', header: 'Client Name' },
  { accessorKey: 'clientId', header: 'Client ID' },
  {
    id: 'actions',
    cell: ({ row }: { row: { original: Client } }) => (
      <div className="space-x-2">
        <Button variant="outline" size="sm" onClick={() => rotateSecret(row.original.id)}>Rotate Secret</Button>
        <Button variant="outline" size="sm" onClick={() => openEditModal(row.original)}>Edit</Button>
        <Button variant="destructive" size="sm" onClick={() => openDeleteModal(row.original)}>Delete</Button>
      </div>
    ),
  },
];

export const ClientManagementView = () => {
  const { hasPermission } = useAuth();
  const {
    clients,
    meta,
    isLoading,
    isFetching,
    error,
    openCreateModal,
    openEditModal,
    openDeleteConfirm,
    rotateSecret,
  } = useClientManagement();

  const clientColumns = useMemo(() => columns(openEditModal, openDeleteConfirm, rotateSecret), [openEditModal, openDeleteConfirm, rotateSecret]);

  if (isLoading) return <div>Loading clients...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="container mx-auto py-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">OAuth Client Management</h1>
        {hasPermission('clients:create') && (
          <Button onClick={openCreateModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Client
          </Button>
        )}
      </header>
      
      <DataTable
        columns={clientColumns}
        data={clients}
        isLoading={isFetching}
        pageCount={meta?.totalPages ?? 0}
      />
    </div>
  );
};
