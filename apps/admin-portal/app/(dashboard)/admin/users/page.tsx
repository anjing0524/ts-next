/**
 * 用户管理页面 (Users Management Page)
 *
 * SSR 页面 - 服务器端渲染，使用 Suspense 处理异步数据加载
 * SSR Page with Suspense for async data loading
 */

import { Suspense } from 'react';
import { UserListContainer } from '@/features/users/components/UserListContainer';
import { UserListSkeleton } from '@/features/users/components/skeletons';

/**
 * 用户管理页面 (Users Management Page)
 *
 * @param props - 页面 props，包含搜索参数
 */
export default async function UsersPage(props: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const searchParams = await props.searchParams;
  const page = parseInt(searchParams.page || '1');
  const limit = parseInt(searchParams.limit || '10');

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">用户管理</h1>
        <p className="text-muted-foreground mt-1">
          管理系统中所有用户及其权限。
        </p>
      </header>

      <Suspense fallback={<UserListSkeleton />}>
        <UserListContainer page={page} limit={limit} />
      </Suspense>
    </div>
  );
}
