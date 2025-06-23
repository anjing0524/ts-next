'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table';
// import { v4 as uuidv4 } from 'uuid'; // No longer needed for mock data

import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

// 与后端API响应匹配的用户接口 (User interface matching backend API response)
// 参考 prisma.user select 和 /api/v2/users GET 响应
interface User {
  id: string;
  username: string; // Changed from name
  email: string | null;
  displayName: string | null;
  // role: string; // Role is more complex, will be handled via user.roles or a formatted string
  isActive: boolean; // Changed from status
  lastLoginAt: string | null; // Changed from lastLogin, and it's a Date string
  createdAt: string; // This is a Date string
  // TODO: Add roles display logic if API returns roles
}


const columns: ColumnDef<User>[] = [
  {
    id: 'username', // Changed from 'name'
    accessorKey: 'username',
    header: '姓名',
    size: 120,
  },
  {
    id: 'email',
    accessorKey: 'email',
    header: '邮箱',
    size: 200,
  },
  // { // Role column needs more complex data fetching or formatting if roles are nested
  //   id: 'role',
  //   accessorKey: 'role', // This would need to be derived
  //   header: '角色',
  //   size: 100,
  //   cell: ({ row }) => {
  //     const role = row.getValue('role') as string; // Placeholder
  //     return (
  //       <Badge
  //         variant={role === '管理员' ? 'destructive' : role === '编辑' ? 'default' : 'outline'}
  //       >
  //         {role}
  //       </Badge>
  //     );
  //   },
  // },
  {
    id: 'isActive', // Changed from 'status'
    accessorKey: 'isActive',
    header: '状态',
    size: 100,
    cell: ({ row }) => {
      const isActive = row.getValue('isActive') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'destructive'}>
          {isActive ? '活跃' : '禁用'}
        </Badge>
      );
    },
  },
  {
    id: 'lastLoginAt', // Changed from 'lastLogin'
    accessorKey: 'lastLoginAt',
    header: '最后登录',
    size: 150,
    cell: ({ row }) => {
      const lastLoginAt = row.getValue('lastLoginAt') as string | null;
      if (!lastLoginAt) return <span>N/A</span>;
      const date = new Date(lastLoginAt);
      return <span>{date.toLocaleString('zh-CN')}</span>;
    },
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: '创建时间',
    size: 150,
    cell: ({ row }) => {
      const date = new Date(row.getValue('createdAt') as string);
      return <span>{date.toLocaleString('zh-CN')}</span>;
    },
  },
];

export default function DashboardPage() {
  const { user, token, isLoading: authIsLoading, error: authError } = useAuth();
  const [data, setData] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0, // DataTable is 0-indexed
    pageSize: 10,
  });
  const [totalRows, setTotalRows] = useState(0);

  // Sorting State
  const [sorting, setSorting] = useState<SortingState>([]);


  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

  useEffect(() => {
    if (authIsLoading) return; // Wait for auth check to complete

    if (!user || !token) {
      setIsLoading(false);
      // Auth hook will handle redirect to login if necessary
      return;
    }

    // Permission check
    if (!user.permissions.includes('users:list')) {
      setError('您没有权限查看用户列表。(You do not have permission to view the user list.)');
      setIsLoading(false);
      return;
    }

    const fetchUsers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: (pageIndex + 1).toString(), // API is 1-indexed for page
          pageSize: pageSize.toString(),
        });
        if (sorting.length > 0) {
            params.append('sortBy', sorting[0].id);
            params.append('sortOrder', sorting[0].desc ? 'desc' : 'asc');
        }

        const response = await fetch(`${API_BASE_URL}/api/v2/users?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error?.message || `Failed to fetch users: ${response.statusText}`);
        }
        const result = await response.json();
        setData(result.data.users || []);
        setTotalRows(result.data.total || 0);
      } catch (err: any) {
        console.error('Failed to fetch users:', err);
        setError(err.message || '获取用户数据时发生未知错误。(An unknown error occurred while fetching user data.)');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [token, user, pageIndex, pageSize, sorting, authIsLoading, API_BASE_URL]);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );

  const pageCount = Math.ceil(totalRows / pageSize);

  if (authIsLoading || (isLoading && data.length === 0)) {
    return (
      <div className="container mx-auto py-10 flex justify-center items-center h-full">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg">正在加载用户数据... (Loading user data...)</p>
      </div>
    );
  }

  if (authError) {
    return (
       <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertTitle>认证错误 (Authentication Error)</AlertTitle>
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
     // This case should ideally be handled by a top-level redirect in layout or auth hook if not on login page
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertTitle>未认证 (Not Authenticated)</AlertTitle>
          <AlertDescription>请先登录以访问此页面。(Please log in to access this page.)</AlertDescription>
        </Alert>
      </div>
    );
  }


  if (error) {
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertTitle>加载错误 (Loading Error)</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }


  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">用户管理 (User Management)</h1>
      <div className="bg-card rounded-lg shadow">
        <DataTable
          data={data}
          columns={columns}
          pageCount={pageCount}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          // enableColumnDragging={true} // Optional: re-enable if needed
          // enableVirtualization={true} // Optional: re-enable if needed for very large local datasets
          // containerHeight={600} // Example height
          // rowHeight={32}
          // defaultPageSize={10} // Controlled by state now
          // pageSizeOptions={[10, 20, 50, 100]} // Controlled by state now
        />
      </div>
    </div>
  );
}
