'use client';

import React from 'react';
import { DataTable, type ColumnDef, Input, Button, Badge } from '@repo/ui';
import { usePermissionManagement } from '../hooks/use-permission-management';
import type { Permission } from '../domain/permission';

export function PermissionManagementView() {
  const {
    permissions,
    meta,
    isLoading,
    isFetching,
    error,
    page,
    setPage,
    limit,
    setLimit,
    searchTerm,
    setSearchTerm,
    handleSearchSubmit,
  } = usePermissionManagement();

  const columns: ColumnDef<Permission>[] = [
    {
      accessorKey: 'name',
      header: '权限名称',
      cell: ({ row }) => <Badge variant="secondary">{row.original.name}</Badge>,
    },
    { 
      accessorKey: 'description', 
      header: '描述' 
    },
    {
      accessorKey: 'resource',
      header: '资源',
      cell: ({ row }) =>
        row.original.resource || <span className="text-muted-foreground">无</span>,
    },
    {
      accessorKey: 'action',
      header: '操作',
      cell: ({ row }) =>
        row.original.action || <span className="text-muted-foreground">无</span>,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p>正在加载权限数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-destructive">
          <p>加载权限数据时出错</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">权限管理</h1>
        <p className="text-muted-foreground mt-1">查看和管理系统中定义的所有权限。</p>
      </header>

      <div className="flex items-center gap-2">
        <Input
          placeholder="按名称或描述搜索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
          className="flex-grow"
        />
        <Button onClick={handleSearchSubmit} disabled={isFetching}>
          搜索
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={permissions}
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
}