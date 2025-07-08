'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../../../lib/api';
import { useAuth } from '@repo/ui/hooks';
import { PermissionGuard } from '@repo/ui';
import {
  DataTable,
  Badge,
  Input,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import type { AuditLog } from '@/types/auth';
import { format } from 'date-fns';

type ColumnDef<T> = {
  accessorKey?: keyof T | string;
  header: string;
  id?: string;
  cell?: ({ row }: { row: { original: T } }) => React.ReactNode;
};

type AuditLogFilters = {
  search: string;
  action: string;
  status: '' | 'SUCCESS' | 'FAILURE';
  startDate: string;
  endDate: string;
};

const REQUIRED_PERMISSIONS = ['menu:system:audit:view', 'audit:list'];

function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [filters, setFilters] = useState<AuditLogFilters>({
    search: '',
    action: '',
    status: '',
    startDate: '',
    endDate: '',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const queryParams = useMemo(() => ({ page, limit, ...appliedFilters }), [page, limit, appliedFilters]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['auditLogs', queryParams],
    queryFn: () => adminApi.getAuditLogs({
      ...queryParams,
      startDate: queryParams.startDate ? new Date(queryParams.startDate) : undefined,
      endDate: queryParams.endDate ? new Date(queryParams.endDate) : undefined,
    }),
    placeholderData: (prev) => prev,
  });

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

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
    {
      id: 'details',
      header: 'Details',
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => setSelectedLog(row.original)}>
          View
        </Button>
      ),
    },
  ];

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  if (isLoading) return <div>Loading audit logs...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const logs = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="container mx-auto py-10 space-y-4">
      <h1 className="text-2xl font-bold">Audit Logs</h1>
      <div className="flex flex-wrap gap-2 items-end">
        {/* Filter inputs */}
      </div>
      <DataTable
        columns={columns as ColumnDef<any>[]}
        data={logs}
        isLoading={isFetching}
        pageCount={meta?.totalPages ?? 0}
        pagination={{
          pageIndex: meta ? meta.currentPage - 1 : 0,
          pageSize: limit,
        }}
        onPaginationChange={(updater) => {
          if (typeof updater === 'function') {
            const newPagination = updater({ pageIndex: meta ? meta.currentPage - 1 : 0, pageSize: limit });
            setPage(newPagination.pageIndex + 1);
            setLimit(newPagination.pageSize);
          } else {
            setPage(updater.pageIndex + 1);
            setLimit(updater.pageSize);
          }
        }}
      />
      {/* Dialog for details */}
    </div>
  );
}

export default function GuardedAuditLogsPage() {
  const { user, isLoading } = useAuth();
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS} user={user} isLoading={isLoading}>
      <AuditLogsPage />
    </PermissionGuard>
  );
}
