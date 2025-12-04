/**
 * 客户端管理页面 (Client Management Page)
 *
 * SSR 页面 - 服务器端渲染，使用 Suspense 处理异步数据加载
 * SSR Page with Suspense for async data loading
 */

import { Suspense } from 'react';
import { ClientListContainer } from '@/features/clients/components/ClientListContainer';
import { ClientListSkeleton } from '@/features/clients/components/skeletons';

/**
 * 客户端管理页面 (Client Management Page)
 *
 * @param props - 页面 props，包含搜索参数
 */
export default async function ClientsPage(props: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const searchParams = await props.searchParams;
  const page = parseInt(searchParams.page || '1');
  const limit = parseInt(searchParams.limit || '10');

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">客户端管理</h1>
        <p className="text-muted-foreground mt-1">
          管理 OAuth 客户端应用和授权设置。
        </p>
      </header>

      <Suspense fallback={<ClientListSkeleton />}>
        <ClientListContainer page={page} limit={limit} />
      </Suspense>
    </div>
  );
}
