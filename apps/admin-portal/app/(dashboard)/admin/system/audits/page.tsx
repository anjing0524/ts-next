'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';
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
import type { AuditLogsResponse } from '../../../../../lib/api';
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
  status: '' | 'SUCCESS' | 'FAILURE' | 'PENDING' | 'ACCESS_DENIED';
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

  const queryParams = useMemo(
    () => ({ page, limit, ...appliedFilters }),
    [page, limit, appliedFilters]
  );

  const { data, isLoading, error, isFetching } = useQuery<AuditLogsResponse>({
    queryKey: ['auditLogs', queryParams],
    queryFn: () =>
      api.getAuditLogs({
        ...queryParams,
        startDate: queryParams.startDate ? new Date(queryParams.startDate).toISOString() : undefined,
        endDate: queryParams.endDate ? new Date(queryParams.endDate).toISOString() : undefined,
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
        <Input
          placeholder="Search logs..."
          value={filters.search || ''}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="min-w-[200px]"
        />

        <Select
          value={filters.action || ''}
          onValueChange={(value) => setFilters({ ...filters, action: value || '' })}
        >
          <SelectItem value="">All Actions</SelectItem>
          <SelectItem value="CREATE">Create</SelectItem>
          <SelectItem value="UPDATE">Update</SelectItem>
          <SelectItem value="DELETE">Delete</SelectItem>
          <SelectItem value="READ">Read</SelectItem>
          <SelectItem value="EXPORT">Export</SelectItem>
        </Select>

        <Select
          value={filters.status || ''}
          onValueChange={(value) => setFilters({ ...filters, status: (value || '') as typeof filters.status })}
        >
          <SelectItem value="">All Status</SelectItem>
          <SelectItem value="SUCCESS">Success</SelectItem>
          <SelectItem value="FAILURE">Failure</SelectItem>
          <SelectItem value="PENDING">Pending</SelectItem>
          <SelectItem value="ACCESS_DENIED">Access Denied</SelectItem>
        </Select>

        <div className="flex gap-2">
          <Input
            type="date"
            value={filters.startDate ? new Date(filters.startDate).toISOString().split('T')[0] : ''}
            onChange={(e) => setFilters({
              ...filters,
              startDate: e.target.value ? new Date(e.target.value).toISOString() : ''
            })}
            placeholder="From"
          />
          <Input
            type="date"
            value={filters.endDate ? new Date(filters.endDate).toISOString().split('T')[0] : ''}
            onChange={(e) => setFilters({
              ...filters,
              endDate: e.target.value ? new Date(e.target.value).toISOString() : ''
            })}
            placeholder="To"
          />
        </div>

        <Button
          onClick={() => {
            const emptyFilters = { search: '', action: '', status: '' as typeof filters.status, startDate: '', endDate: '' };
            setPage(1);
            setFilters(emptyFilters);
            setAppliedFilters(emptyFilters);
          }}
          variant="outline"
        >
          Reset
        </Button>

        <Button onClick={() => setAppliedFilters(filters)}>Apply Filters</Button>
      </div>
      <DataTable
        columns={columns as ColumnDef<AuditLog>[]}
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
