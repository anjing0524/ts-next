/**
 * 审计日志列表容器 (Audit Log List Container)
 *
 * Server Component - 数据获取和缓存
 * Server Component for data fetching and caching
 */

import { unstable_cache } from 'next/cache';
import { listAuditLogsAction } from '@/app/actions';
import { AuditLogTable } from './AuditLogTable';

/**
 * 获取审计日志列表 (Fetch Audit Logs List)
 */
async function fetchAuditLogsList(page: number, limit: number) {
  const result = await listAuditLogsAction({ page, page_size: limit });
  if (!result.success) {
    throw new Error(result.error || '获取审计日志失败');
  }
  return result.data;
}

/**
 * 缓存的审计日志列表获取 (Cached Audit Logs List Fetcher)
 * 使用 'audit-logs' 标签以便通过 revalidateTag 重新验证
 * Uses 'audit-logs' tag for revalidation via revalidateTag
 */
const getCachedAuditLogsList = unstable_cache(
  fetchAuditLogsList,
  ['audit-logs-list'],
  { tags: ['audit-logs'] }
);

/**
 * 审计日志列表容器 (Audit Log List Container)
 *
 * @param page - 当前页码 (Current page number)
 * @param limit - 每页条数 (Items per page)
 */
export async function AuditLogListContainer({
  page,
  limit,
}: {
  page: number;
  limit: number;
}) {
  const data = await getCachedAuditLogsList(page, limit);

  return (
    <AuditLogTable
      logs={data.items}
      total={data.total}
      page={page}
      limit={limit}
    />
  );
}
