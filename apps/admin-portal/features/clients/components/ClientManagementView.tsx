'use client';

import React, { useMemo } from 'react';
import { DataTable, Button, ColumnDef, Skeleton } from '@repo/ui';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@repo/ui';
import { useClientManagement } from '../hooks/use-client-management';
import { ClientFormDialog } from '@/components/admin/clients/ClientFormDialog';
import { DeleteConfirmDialog } from '@/components/common/DeleteConfirmDialog';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import type { Client } from '@/types/auth';

const columns = (
  openEditModal: (client: Client) => void,
  openDeleteModal: (client: Client) => void,
  rotateSecret: (clientId: string) => void
): ColumnDef<Client>[] => [
  { accessorKey: 'name', header: '客户端名称' },
  { accessorKey: 'clientId', header: '客户端ID' },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className="space-x-2">
        <Button variant="outline" size="sm" onClick={() => rotateSecret(row.original.id)}>
          重置密钥
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
    isModalOpen,
    isDeleteConfirmOpen,
    selectedClient,
    saveClient,
    deleteClient,
    closeModal,
    page,
    setPage,
    limit,
    setLimit,
  } = useClientManagement();

  const clientColumns = useMemo(
    () => columns(openEditModal, openDeleteConfirm, rotateSecret),
    [openEditModal, openDeleteConfirm, rotateSecret]
  );


  if (isLoading && !clients.length) {
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
        <h2 className="text-2xl font-bold">客户端管理</h2>
        {hasPermission('clients:create') && (
          <Button onClick={openCreateModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> 添加客户端
          </Button>
        )}
      </div>

      <DataTable
        columns={clientColumns}
        data={clients}
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

      <ClientFormDialog
        isOpen={isModalOpen}
        onOpenChange={(open) => !open && closeModal()}
        onSubmit={async (clientData) => {
          saveClient(clientData as any);
          return Promise.resolve();
        }}
        client={selectedClient}
        isLoading={false}
      />

      <DeleteConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={closeModal}
        onConfirm={deleteClient}
        isProcessing={false}
        itemName={selectedClient?.name || '该客户端'}
        itemType="客户端"
      />
    </div>
  );
};
