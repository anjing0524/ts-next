'use client';

import React, { useMemo } from 'react';
import {
  DataTable,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  ColumnDef,
} from '@repo/ui';
import { useAuditLogManagement } from '../hooks/use-audit-log-management';
import type { AuditLog } from '@/types/auth';
import { format } from 'date-fns';

const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: 'timestamp',
    header: 'Timestamp',
    cell: ({ row }) => format(new Date(row.original.timestamp), 'yyyy-MM-dd HH:mm:ss'),
  },
  { accessorKey: 'userId', header: 'User ID' },
  { accessorKey: 'action', header: 'Action' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.status === 'SUCCESS' ? 'success' : 'destructive'}>
        {row.original.status}
      </Badge>
    ),
  },
];

export const AuditLogView = () => {
  const {
    logs,
    meta,
    isLoading,
    isFetching,
    error,
    filters,
    setFilters,
    handleApplyFilters,
    page,
    setPage,
    limit,
    setLimit,
  } = useAuditLogManagement();

  const auditColumns = useMemo(() => columns, []);

  if (isLoading) return <div>Loading audit logs...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="container mx-auto py-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
      </header>

      {/* Filter controls */}

      <DataTable
        columns={auditColumns}
        data={logs}
        isLoading={isFetching}
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
      />
    </div>
  );
};
