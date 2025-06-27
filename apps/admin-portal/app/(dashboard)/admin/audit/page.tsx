'use client';

import { useState, useEffect, useMemo } from 'react';
import { adminApi } from '@/lib/api';
import { PermissionGuard } from '@/components/auth/permission-guard';
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
import { DataTable } from '@repo/ui';
import type { AuditLog, PaginatedResponse } from '@/types/admin-entities';
import { usePaginatedResource } from '@/hooks/usePaginatedResource';

// 定义 ColumnDef 类型（简化版本）
type ColumnDef<T> = {
  accessorKey?: keyof T | string;
  header: string;
  id?: string;
  cell?: ({ row }: { row: { original: T; getValue: (key: string) => any } }) => React.ReactNode;
};

// 定义 AuditLog API 的参数类型，需要与 usePaginatedResource 和 adminApi.getAuditLogs 匹配
interface AuditLogApiParams {
  offset: number;
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
    offset,
    limit,
    totalItems,
    canLoadMore,
    searchTerm,
    searchParams,
    setOffset,
    setLimit,
    setSearchTerm: setHookSearchTerm,
    setSearchParams: setHookSearchParams,
    applyFiltersAndReset,
    loadMore,
    refreshData,
  } = usePaginatedResource<AuditLog, AuditLogApiParams>(adminApi.getAuditLogs, {
    initialLimit: INITIAL_PAGE_LIMIT,
    initialSearchParams: { action: '', status: '', sort: 'timestamp:desc' },
  });

  // Local state for filter inputs before applying them via the hook
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm || '');
  const [localActionFilter, setLocalActionFilter] = useState(searchParams.action || '');
  const [localStatusFilter, setLocalStatusFilter] = useState<'SUCCESS' | 'FAILURE' | ''>(
    searchParams.status || ''
  );

  // Detail Dialog State
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedLogForDetail, setSelectedLogForDetail] = useState<AuditLog | null>(null);

  const openDetailDialog = (log: AuditLog) => {
    setSelectedLogForDetail(log);
    setIsDetailDialogOpen(true);
  };

  // Sync local filter states to hook's searchParams when they change, then call applyFilters
  const handleApplyFiltersFromUI = () => {
    setHookSearchTerm(localSearchTerm);
    setHookSearchParams({
      action: localActionFilter,
      status: localStatusFilter,
      sort: 'timestamp:desc',
    });
    applyFiltersAndReset();
  };

  useEffect(() => {
    setLocalSearchTerm(searchTerm || '');
    setLocalActionFilter(searchParams.action || '');
    setLocalStatusFilter(searchParams.status || '');
  }, [searchTerm, searchParams]);

  // Calculate current page for display
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(totalItems / limit);

  // DataTable 列定义
  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: '时间戳',
        cell: ({ row }: { row: any }) => new Date(row.getValue('timestamp')).toLocaleString(),
      },
      {
        accessorKey: 'userDisplay',
        header: '操作用户',
        cell: ({ row }: { row: any }) => row.original.userDisplay || row.original.userId,
      },
      { accessorKey: 'action', header: '操作类型' },
      { accessorKey: 'resource', header: '资源类型' },
      { accessorKey: 'resourceId', header: '资源ID' },
      {
        accessorKey: 'status',
        header: '状态',
        cell: ({ row }: { row: any }) => (
          <Badge variant={row.original.status === 'FAILURE' ? 'destructive' : 'default'}>
            {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: 'ipAddress', header: 'IP 地址' },
      {
        id: 'details',
        header: '详情',
        cell: ({ row }: { row: any }) => (
          <Button variant="outline" size="sm" onClick={() => openDetailDialog(row.original)}>
            查看
          </Button>
        ),
      },
    ],
    []
  );

  if (isLoading && offset === 0 && logs.length === 0) {
    return <div className="p-6 text-center">加载审计日志数据中...</div>;
  }

  if (error && logs.length === 0) {
    return <div className="p-6 text-red-600 text-center">错误: {error}</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">审计日志</h1>
          <p className="text-muted-foreground mt-1">查看系统中的所有重要操作记录。</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={isLoading}
            title="刷新数据"
          >
            刷新
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg shadow-sm">
        <Input
          placeholder="搜索用户,资源,IP..."
          value={localSearchTerm}
          onChange={(e) => setLocalSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleApplyFiltersFromUI()}
          className="lg:col-span-2"
        />
        <div>
          <Select value={localActionFilter} onValueChange={(value) => setLocalActionFilter(value)}>
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
            value={localStatusFilter}
            onValueChange={(value: 'SUCCESS' | 'FAILURE' | '') => setLocalStatusFilter(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="按状态过滤" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">所有状态</SelectItem>
              <SelectItem value="SUCCESS">成功</SelectItem>
              <SelectItem value="FAILURE">失败</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleApplyFiltersFromUI} disabled={isLoading}>
          应用过滤
        </Button>
      </div>

      <DataTable columns={columns as any} data={logs} />

      <div className="py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">
          已显示 {logs.length} 条，共 {totalItems} 条记录。当前第 {currentPage} 页，共 {totalPages}{' '}
          页。
        </span>
        {canLoadMore && (
          <Button onClick={loadMore} disabled={isLoading}>
            {isLoading ? '加载中...' : '加载更多'}
          </Button>
        )}
      </div>

      {logs.length === 0 && !isLoading && !error && (
        <div className="text-center py-10 text-muted-foreground">没有找到符合条件的审计日志。</div>
      )}

      {/* 审计日志详情对话框 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>审计日志详情</DialogTitle>
            <DialogDescription>查看详细的操作记录信息</DialogDescription>
          </DialogHeader>
          {selectedLogForDetail && (
            <ScrollArea className="max-h-96">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <strong>操作时间:</strong>
                    <p>{new Date(selectedLogForDetail.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <strong>操作用户:</strong>
                    <p>{selectedLogForDetail.userDisplay || selectedLogForDetail.userId}</p>
                  </div>
                  <div>
                    <strong>操作类型:</strong>
                    <p>{selectedLogForDetail.action}</p>
                  </div>
                  <div>
                    <strong>操作状态:</strong>
                    <Badge
                      variant={
                        selectedLogForDetail.status === 'FAILURE' ? 'destructive' : 'default'
                      }
                    >
                      {selectedLogForDetail.status}
                    </Badge>
                  </div>
                  <div>
                    <strong>资源类型:</strong>
                    <p>{selectedLogForDetail.resource || 'N/A'}</p>
                  </div>
                  <div>
                    <strong>IP 地址:</strong>
                    <p>{selectedLogForDetail.ipAddress || 'N/A'}</p>
                  </div>
                </div>
                {selectedLogForDetail.details && (
                  <div>
                    <strong>详细信息:</strong>
                    <pre className="bg-gray-100 p-2 rounded text-sm">
                      {JSON.stringify(selectedLogForDetail.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button>关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function GuardedAuditLogPage() {
  return (
    <PermissionGuard requiredPermission={REQUIRED_PERMISSIONS}>
      <AuditLogPageContent />
    </PermissionGuard>
  );
}
