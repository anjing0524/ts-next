'use client';

import { useEffect } from 'react'; // Removed useState as it's managed by the hook
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/useAuth'; // Ensure useAuth is imported
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { User } from '@/types/admin-entities';
import { usePaginatedResource } from '@/hooks/usePaginatedResource';
import { PlusCircle, RefreshCw } from 'lucide-react';

const REQUIRED_PERMISSIONS = ['menu:system:user:view', 'users:list'];
const CAN_CREATE_USER = 'users:create';

function UsersPageContent() {
  const { hasPermission } = useAuth();

  const {
    data: usersData,
    isLoading,
    error,
    offset,
    limit,
    totalItems,
    canLoadMore,
    searchTerm,
    // setSearchParams, // Not using complex searchParams for users list for now
    setSearchTerm,
    applyFiltersAndReset,
    loadMore,
    refreshData,
  } = usePaginatedResource<User, { offset: number; limit: number; search?: string }>(
    adminApi.getUsers,
    { initialLimit: 10 }
  );

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSearchSubmit = () => {
    applyFiltersAndReset();
  };

  // Calculate current page and total pages if needed for display or a traditional paginator
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(totalItems / limit);

  if (isLoading && offset === 0 && usersData.length === 0) { // Initial load state
    return <div className="p-6 text-center">加载用户数据中...</div>;
  }

  if (error && usersData.length === 0) { // Error when no data is available
    return <div className="p-6 text-red-600 text-center">错误: {error}</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">用户管理</h1>
          <p className="text-muted-foreground mt-1">
            查看、创建、编辑和管理系统用户。
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading} title="刷新数据">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          {hasPermission(CAN_CREATE_USER) && (
            <Button> {/* TODO: Implement Add User Modal/Page */}
              <PlusCircle className="mr-2 h-4 w-4" />
              添加用户
            </Button>
          )}
        </div>
      </header>

      <div className="flex items-center gap-2 p-4 border rounded-lg shadow-sm">
        <Input
          placeholder="按用户名、邮箱搜索..."
          value={searchTerm}
          onChange={handleSearchInputChange}
          onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
          className="flex-grow"
        />
        <Button onClick={handleSearchSubmit} disabled={isLoading}>搜索</Button>
      </div>

      <DataTable
        columns={columns}
        data={usersData}
        isLoading={isLoading && usersData.length > 0}
        // For manual pagination with offset/limit, DataTable might need different props
        // or we handle pagination/load more outside of it.
        // For now, assuming DataTable just displays current `usersData`.
        // If DataTable has its own pagination, it needs to be configured for manual server-side data.
        // TanStack Table's manualPagination setup:
        // pageCount: totalPages,
        // manualPagination: true,
        // state: { pagination: { pageIndex: currentPage - 1, pageSize: limit } },
        // onPaginationChange: (updater) => {
        //   if (typeof updater === 'function') {
        //     const newPaginationState = updater({ pageIndex: currentPage - 1, pageSize: limit });
        //     setLimit(newPaginationState.pageSize);
        //     setOffset(newPaginationState.pageIndex * newPaginationState.pageSize);
        //   } else {
        //      setLimit(updater.pageSize);
        //      setOffset(updater.pageIndex * updater.pageSize);
        //   }
        // },
        // For this example, we'll use a "Load More" button instead of complex DataTable pagination setup.
      />
      <div className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">
          已显示 {usersData.length} 条，共 {totalItems} 条记录。
        </span>
        {canLoadMore && (
          <Button onClick={loadMore} disabled={isLoading}>
            {isLoading ? '加载中...' : '加载更多'}
          </Button>
        )}
      </div>
      {usersData.length === 0 && !isLoading && !error && (
           <div className="text-center py-10 text-muted-foreground">没有找到符合条件的用户。</div>
      )}
    </div>
  );
}

export default function GuardedUsersPage() {
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS}>
      <UsersPageContent />
    </PermissionGuard>
  );
}