'use client';

import { useState, useEffect, useMemo } from 'react';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PermissionGuard } from '@/components/auth/permission-guard'; // 引入 PermissionGuard
import {
  Badge,
  Input,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  ScrollArea,
} from '@repo/ui';
// import { DateRangePicker } from '@repo/ui'; // DateRangePicker 暂时注释
import { DataTable, type ColumnDef } from '@repo/ui';
// import { type DateRange } from 'react-day-picker';
import type { AuditLog, PaginatedResponse } from '@/types/admin-entities'; // 引入共享类型
import { usePaginatedResource } from '@/hooks/usePaginatedResource'; // Import the hook

// 定义 AuditLog API 的参数类型，需要与 usePaginatedResource 和 adminApi.getAuditLogs 匹配
interface AuditLogApiParams {
  page: number;
  limit: number;
  search?: string;
  action?: string;
  status?: 'SUCCESS' | 'FAILURE' | '';
  startDate?: string;
  endDate?: string;
  sort?: string;
}

const INITIAL_PAGE_LIMIT = 10;
const REQUIRED_PERMISSIONS = ['menu:system:audit:view', 'audit:list'];

function AuditLogPageContent() {
  const {
    data: logs,
    isLoading,
    error,
    page,
    limit,
    totalItems,
    totalPages,
    searchTerm, // Hook's generic searchTerm
    searchParams, // Hook's generic searchParams for more complex filters
    setPage,
    setLimit,
    setSearchTerm: setHookSearchTerm, // Rename to avoid conflict with local state if any
    setSearchParams: setHookSearchParams, // Rename
    applyFilters,
    // refreshData: fetchAuditLogs, // Can be used if needed
  } = usePaginatedResource<AuditLog, AuditLogApiParams>(adminApi.getAuditLogs, {
    initialLimit: INITIAL_PAGE_LIMIT,
    initialSearchParams: { action: '', status: '', sort: 'timestamp:desc' }, // Default sort
  });

  // Local state for filter inputs before applying them via the hook
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm || '');
  const [localActionFilter, setLocalActionFilter] = useState(searchParams.action || '');
  const [localStatusFilter, setLocalStatusFilter] = useState<'SUCCESS' | 'FAILURE' | ''>(
    searchParams.status || ''
  );
  // const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>(undefined); // For DatePicker

  // Detail Dialog State
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedLogForDetail, setSelectedLogForDetail] = useState<AuditLog | null>(null);

  const openDetailDialog = (log: AuditLog) => {
    setSelectedLogForDetail(log);
    setIsDetailDialogOpen(true);
  };

  // Sync local filter states to hook's searchParams when they change, then call applyFilters
  const handleApplyFiltersFromUI = () => {
    // Renamed to avoid conflict with hook's applyFilters
    setHookSearchTerm(localSearchTerm);
    setHookSearchParams({
      action: localActionFilter,
      status: localStatusFilter,
      // startDate: localDateRange?.from?.toISOString(),
      // endDate: localDateRange?.to?.toISOString(),
      sort: 'timestamp:desc',
    });
    applyFilters();
  };

  useEffect(() => {
    setLocalSearchTerm(searchTerm || '');
    setLocalActionFilter(searchParams.action || '');
    setLocalStatusFilter(searchParams.status || '');
  }, [searchTerm, searchParams]);

  // DataTable 列定义
  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: '时间戳',
        cell: ({ row }) => new Date(row.getValue('timestamp')).toLocaleString(),
      },
      {
        accessorKey: 'userDisplay',
        header: '操作用户',
        cell: ({ row }) => row.original.userDisplay || row.original.userId,
      },
      { accessorKey: 'action', header: '操作类型' },
      { accessorKey: 'resource', header: '资源类型' },
      { accessorKey: 'resourceId', header: '资源ID' },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }) => (
          <Badge variant={row.original.status === 'FAILURE' ? 'destructive' : 'default'}>
            {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: 'ipAddress', header: 'IP 地址' },
      {
        id: 'details',
        header: '详情',
        cell: ({ row }) => (
          <Button variant="outline" size="sm" onClick={() => openDetailDialog(row.original)}>
            查看
          </Button>
        ),
      },
    ],
    []
  ); // Removed handlePageChange, handleLimitChange, handleApplyFilters, pageState as they are not direct dependencies or managed by hook

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">审计日志</h1>
        <p className="text-muted-foreground mt-1">查看系统中的所有重要操作记录。</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg shadow-sm">
        <Input
          placeholder="搜索用户,资源,IP..."
          value={localSearchTerm} // Use local state for input value
          onChange={(e) => setLocalSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleApplyFiltersFromUI()}
          className="lg:col-span-2"
        />
        <div>
          <Select
            value={localActionFilter} // Use local state
            onValueChange={(value) => setLocalActionFilter(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="按操作类型过滤" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">所有操作</SelectItem>
              <SelectItem value="USER_LOGIN">用户登录</SelectItem>
              <SelectItem value="USER_LOGOUT">用户登出</SelectItem>
              <SelectItem value="USER_CREATE">用户创建</SelectItem>
              <SelectItem value="USER_UPDATE">用户更新</SelectItem>
              <SelectItem value="USER_DELETE">用户删除</SelectItem>
              <SelectItem value="ROLE_CREATE">角色创建</SelectItem>
              <SelectItem value="ROLE_UPDATE">角色更新</SelectItem>
              <SelectItem value="ROLE_DELETE">角色删除</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select
            value={localStatusFilter} // Use local state
            onValueChange={(value: 'SUCCESS' | 'FAILURE' | '') => setLocalStatusFilter(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="按操作类型过滤" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">所有操作</SelectItem>
              <SelectItem value="USER_LOGIN">用户登录</SelectItem>
              <SelectItem value="USER_LOGOUT">用户登出</SelectItem>
              <SelectItem value="USER_CREATE">用户创建</SelectItem>
              <SelectItem value="USER_UPDATE">用户更新</SelectItem>
              <SelectItem value="USER_DELETE">用户删除</SelectItem>
              <SelectItem value="ROLE_CREATE">角色创建</SelectItem>
              <SelectItem value="ROLE_UPDATE">角色更新</SelectItem>
              <SelectItem value="ROLE_DELETE">角色删除</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select
            value={statusFilter}
            onValueChange={(value: 'SUCCESS' | 'FAILURE' | '') =>
              setPageState((prev) => ({ ...prev, statusFilter: value, page: 1 }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="按状态过滤" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">所有状态</SelectItem>
              <SelectItem value="SUCCESS">成功 (SUCCESS)</SelectItem>
              <SelectItem value="FAILURE">失败 (FAILURE)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleApplyFilters} className="lg:col-start-4">
          应用筛选
        </Button>
      </div>

      {isLoading && !logs.length && pageState.page === 1 ? (
        <div className="text-center py-10">加载中...</div>
      ) : error && !logs.length ? (
        <div className="text-center py-10 text-red-600">错误: {error}</div>
      ) : (
        <DataTable
          columns={columns}
          data={logs}
          isLoading={isLoading && logs.length > 0}
          pageCount={totalPages}
          pageIndex={page - 1}
          pageSize={limit}
          onPageChange={(newPageIndex) => handlePageChange(newPageIndex + 1)}
          onPageSizeChange={handleLimitChange}
        />
      )}
      {(totalItems > 0 || page > 1) && !isLoading && !error && (
        <div className="flex items-center justify-between mt-4 py-2 border-t">
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页 (共 {totalItems} 条记录)
          </span>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
      {logs.length === 0 && !isLoading && !error && (
        <div className="text-center py-10 text-muted-foreground">没有找到符合条件的审计日志。</div>
      )}
    </div>
  );
}

// 用 PermissionGuard 包裹页面内容
export default function GuardedAuditLogPage() {
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS}>
      <AuditLogPageContent />
    </PermissionGuard>
  );
}
