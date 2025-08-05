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
import { useAuditLogManagement } from '../../audit/hooks/use-audit-log-management';
import type { AuditLog } from '../../audit/domain/audit';
import { format } from 'date-fns';

const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: 'timestamp',
    header: '时间',
    cell: ({ row }) => format(new Date(row.original.timestamp), 'yyyy-MM-dd HH:mm:ss'),
  },
  {
    accessorKey: 'action',
    header: '操作',
    cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
  },
  {
    accessorKey: 'resource',
    header: '资源',
  },
  {
    accessorKey: 'userId',
    header: '用户ID',
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => (
      <Badge variant={row.original.status === 'SUCCESS' ? 'default' : 'destructive'}>
        {row.original.status === 'SUCCESS' ? '成功' : '失败'}
      </Badge>
    ),
  },
  {
    accessorKey: 'details',
    header: '详情',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate max-w-xs">
        {typeof row.original.details === 'string' 
          ? row.original.details 
          : row.original.details 
            ? JSON.stringify(row.original.details) 
            : '无'
        }
      </span>
    ),
  },
];

export const AuditManagementView = () => {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p>正在加载审计日志...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-destructive">
          <p>加载审计日志时出错</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">审计日志</h1>
        <p className="text-muted-foreground mt-1">查看和分析系统操作的审计记录。</p>
      </header>

      {/* 过滤器 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg">
        <div>
          <label className="text-sm font-medium mb-2 block">搜索</label>
          <Input
            placeholder="搜索用户ID、操作或资源..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        
        <div>
          <label className="text-sm font-medium mb-2 block">操作类型</label>
          <Select
            value={filters.action}
            onValueChange={(value) => setFilters({ ...filters, action: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择操作类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部</SelectItem>
              <SelectItem value="CREATE">创建</SelectItem>
              <SelectItem value="UPDATE">更新</SelectItem>
              <SelectItem value="DELETE">删除</SelectItem>
              <SelectItem value="LOGIN">登录</SelectItem>
              <SelectItem value="LOGOUT">登出</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">状态</label>
          <Select
            value={filters.status || ''}
            onValueChange={(value) => setFilters({ ...filters, status: value as any })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部</SelectItem>
              <SelectItem value="SUCCESS">成功</SelectItem>
              <SelectItem value="FAILURE">失败</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <Button onClick={handleApplyFilters} disabled={isFetching} className="w-full">
            应用过滤器
          </Button>
        </div>
      </div>

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