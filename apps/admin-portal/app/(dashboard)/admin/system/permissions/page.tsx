'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import useAuth from '@/hooks/useAuth';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { DataTable, type ColumnDef } from '@repo/ui';
import { Input, Button, toast, Badge } from '@repo/ui';
import type { Permission, PaginatedResponse } from '@/types/admin-entities'; // 引入共享类型

// --- 页面状态和常量 ---
const INITIAL_PAGE_LIMIT = 15; // Permissions list might be longer
const REQUIRED_PERMISSIONS_VIEW = ['menu:system:permission:view', 'permissions:list'];

import { usePaginatedResource } from '@/hooks/usePaginatedResource'; // Import the hook

// --- 权限管理页面核心内容 ---
function PermissionsPageContent() {
  const {
    data: permissions,
    isLoading,
    error,
    page,
    limit,
    totalItems,
    totalPages,
    searchTerm,
    setPage,
    setLimit,
    setSearchTerm,
    applyFilters,
    // refreshData: fetchPermissions, // Not typically needed for a read-only list unless manual refresh button
  } = usePaginatedResource<Permission, { page: number; limit: number; search?: string }>(
    adminApi.getPermissions,
    { initialLimit: INITIAL_PAGE_LIMIT }
  );

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSearchSubmit = () => {
    applyFilters();
  };

  // --- DataTable Columns ---
  const columns = useMemo<ColumnDef<Permission>[]>(
    () => [
      {
        accessorKey: 'name',
        header: '权限名称',
        cell: ({ row }) => <Badge variant="secondary">{row.original.name}</Badge>,
      },
      { accessorKey: 'description', header: '描述' },
      {
        accessorKey: 'group',
        header: '分组',
        cell: ({ row }) => row.original.group || <span className="text-muted-foreground">N/A</span>,
      },
      // No actions column usually, as permissions are typically system-defined
      // {
      //   id: 'actions',
      //   header: '操作',
      //   cell: ({ row }) => (
      //     <div className="space-x-2">
      //       {/* Placeholder for any potential future actions */}
      //     </div>
      //   ),
      // },
    ],
    []
  );

  if (isLoading && !permissions.length && page === 1) {
    return <div className="p-6 text-center">加载权限数据中...</div>;
  }
  if (error && !permissions.length) {
    return <div className="p-6 text-red-600 text-center">错误: {error}</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">系统权限管理</h1>
        <p className="text-muted-foreground mt-1">查看系统中所有已定义的权限及其描述。</p>
      </header>

      <div className="flex items-center gap-2 p-4 border rounded-lg shadow-sm">
        <Input
          placeholder="按权限名称或描述搜索..."
          value={searchTerm}
          onChange={handleSearchInputChange}
          onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
          className="flex-grow"
        />
        <Button onClick={handleSearchSubmit}>搜索</Button>
      </div>

      <DataTable
        columns={columns}
        data={permissions}
        isLoading={isLoading && permissions.length > 0}
        pageCount={totalPages}
        pageIndex={page - 1}
        pageSize={limit}
        onPageChange={(newPageIndex) => setPage(newPageIndex + 1)}
        onPageSizeChange={(newPageSize) => {
          setLimit(newPageSize);
          setPage(1);
        }}
      />
      {(totalItems > 0 || page > 1) && !isLoading && !error && (
        <div className="flex items-center justify-between mt-4 py-2 border-t">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页 (共 {totalItems} 条记录)
          </span>
          {/* Pagination buttons could be part of DataTable or separate */}
        </div>
      )}
      {permissions.length === 0 && !isLoading && !error && (
        <div className="text-center py-10 text-muted-foreground">没有找到权限。</div>
      )}
    </div>
  );
}

// --- Main Export with PermissionGuard ---
export default function GuardedPermissionsPage() {
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS_VIEW}>
      <PermissionsPageContent />
    </PermissionGuard>
  );
}
