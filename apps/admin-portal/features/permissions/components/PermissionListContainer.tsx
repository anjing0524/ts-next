/**
 * 权限列表容器 (Permission List Container)
 *
 * Server Component - 数据获取和缓存
 * Server Component for data fetching and caching
 */

import { unstable_cache } from 'next/cache';
import { listPermissionsAction } from '@/app/actions';
import { PermissionTable } from './PermissionTable';

/**
 * 获取权限列表 (Fetch Permissions List)
 */
async function fetchPermissionsList(page: number, limit: number) {
  const result = await listPermissionsAction({ page, page_size: limit });
  if (!result.success) {
    throw new Error(result.error || '获取权限列表失败');
  }
  return result.data;
}

/**
 * 缓存的权限列表获取 (Cached Permissions List Fetcher)
 * 使用 'permissions' 标签以便通过 revalidateTag 重新验证
 * Uses 'permissions' tag for revalidation via revalidateTag
 */
const getCachedPermissionsList = unstable_cache(
  fetchPermissionsList,
  ['permissions-list'],
  { tags: ['permissions'] }
);

/**
 * 权限列表容器 (Permission List Container)
 *
 * @param page - 当前页码 (Current page number)
 * @param limit - 每页条数 (Items per page)
 */
export async function PermissionListContainer({
  page,
  limit,
}: {
  page: number;
  limit: number;
}) {
  const data = await getCachedPermissionsList(page, limit);

  return (
    <PermissionTable
      permissions={data.items}
      total={data.total}
      page={page}
      limit={limit}
    />
  );
}
