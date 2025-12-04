/**
 * 权限管理页面 (Permission Management Page)
 *
 * SSR 页面 - 服务器端渲染，使用 Suspense 处理异步数据加载
 * SSR Page with Suspense for async data loading
 */

import { Suspense } from 'react';
import { PermissionListContainer } from '@/features/permissions/components/PermissionListContainer';
import { PermissionListSkeleton } from '@/features/permissions/components/skeletons';

/**
 * 权限管理页面 (Permission Management Page)
 *
 * @param props - 页面 props，包含搜索参数
 */
export default async function PermissionsPage(props: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const searchParams = await props.searchParams;
  const page = parseInt(searchParams.page || '1');
  const limit = parseInt(searchParams.limit || '10');

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">权限管理</h1>
        <p className="text-muted-foreground mt-1">
          查看和管理系统中定义的所有权限。
        </p>
      </header>

      <Suspense fallback={<PermissionListSkeleton />}>
        <PermissionListContainer page={page} limit={limit} />
      </Suspense>
    </div>
  );
}
