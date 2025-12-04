/**
 * 客户端列表容器 (Client List Container)
 *
 * Server Component - 数据获取和缓存
 * Server Component for data fetching and caching
 */

import { unstable_cache } from 'next/cache';
import { listClientsAction } from '@/app/actions';
import { ClientTable } from './ClientTable';

/**
 * 获取客户端列表 (Fetch Clients List)
 */
async function fetchClientsList(page: number, limit: number) {
  const result = await listClientsAction({ page, page_size: limit });
  if (!result.success) {
    throw new Error(result.error || '获取客户端列表失败');
  }
  return result.data;
}

/**
 * 缓存的客户端列表获取 (Cached Clients List Fetcher)
 * 使用 'clients' 标签以便通过 revalidateTag 重新验证
 * Uses 'clients' tag for revalidation via revalidateTag
 */
const getCachedClientsList = unstable_cache(
  fetchClientsList,
  ['clients-list'],
  { tags: ['clients'] }
);

/**
 * 客户端列表容器 (Client List Container)
 *
 * @param page - 当前页码 (Current page number)
 * @param limit - 每页条数 (Items per page)
 */
export async function ClientListContainer({
  page,
  limit,
}: {
  page: number;
  limit: number;
}) {
  const data = await getCachedClientsList(page, limit);

  return (
    <ClientTable
      clients={data.items}
      total={data.total}
      page={page}
      limit={limit}
    />
  );
}
