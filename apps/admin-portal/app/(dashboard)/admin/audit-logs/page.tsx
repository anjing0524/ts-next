/**
 * 审计日志页面 (Audit Log Page)
 *
 * SSR 页面 - 服务器端渲染，使用 Suspense 处理异步数据加载
 * SSR Page with Suspense for async data loading
 */

import { Suspense } from 'react';
import { AuditLogListContainer } from '@/features/audit-logs/components/AuditLogListContainer';
import { AuditLogListSkeleton } from '@/features/audit-logs/components/skeletons';

/**
 * 审计日志页面 (Audit Log Page)
 *
 * @param props - 页面 props，包含搜索参数
 */
export default async function AuditLogsPage(props: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const searchParams = await props.searchParams;
  const page = parseInt(searchParams.page || '1');
  const limit = parseInt(searchParams.limit || '10');

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">审计日志</h1>
        <p className="text-muted-foreground mt-1">
          查看系统中所有的审计日志和用户操作记录。
        </p>
      </header>

      <Suspense fallback={<AuditLogListSkeleton />}>
        <AuditLogListContainer page={page} limit={limit} />
      </Suspense>
    </div>
  );
}
