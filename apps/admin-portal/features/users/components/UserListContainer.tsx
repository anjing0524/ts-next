/**
 * 用户列表容器 (User List Container)
 *
 * 服务器组件 - 获取数据并传递给展示组件
 * Server Component - fetches data and passes to display component
 */

import { listUsersAction } from '@/app/actions/user';
import { unstable_cache } from 'next/cache';
import { UserTable } from './UserTable';

/**
 * 获取用户列表的缓存函数
 * Cached function to fetch user list
 */
const getCachedUsers = unstable_cache(
  async (page: number, limit: number) => {
    return listUsersAction(page, limit);
  },
  ['users-list'],
  { revalidate: 60 } // 缓存 60 秒
);

interface UserListContainerProps {
  page: number;
  limit: number;
}

/**
 * 用户列表容器
 * @param page - 页码
 * @param limit - 每页数量
 */
export async function UserListContainer({ page, limit }: UserListContainerProps) {
  try {
    const result = await getCachedUsers(page, limit);

    return <UserTable users={result.users || []} total={result.total || 0} page={page} limit={limit} />;
  } catch (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-800">
          加载用户列表时出错。请稍后重试。
        </p>
      </div>
    );
  }
}
