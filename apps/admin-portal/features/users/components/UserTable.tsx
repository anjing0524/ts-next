/**
 * 用户表格组件 (User Table Component)
 *
 * 客户端组件 - 纯展示逻辑，零业务逻辑
 * Client Component - Pure display logic with zero business logic
 */

'use client';

interface User {
  id: string;
  username: string;
  display_name?: string;
  is_active: boolean;
  created_at: string;
}

interface UserTableProps {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 用户表格
 * @param users - 用户列表
 * @param total - 总数
 * @param page - 当前页
 * @param limit - 每页数量
 */
export function UserTable({ users, total, page, limit }: UserTableProps) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* 表格 */}
      <div className="overflow-x-auto border rounded">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium">用户名</th>
              <th className="px-6 py-3 text-left text-sm font-medium">显示名称</th>
              <th className="px-6 py-3 text-left text-sm font-medium">状态</th>
              <th className="px-6 py-3 text-left text-sm font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  无用户数据
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">{user.username}</td>
                  <td className="px-6 py-4 text-sm">{user.display_name || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                      user.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.is_active ? '激活' : '禁用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {new Date(user.created_at).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页信息 */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          显示 {users.length > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, total)} 的 {total} 条
        </div>
        <div className="text-sm text-gray-600">
          第 {page} 页，共 {totalPages} 页
        </div>
      </div>
    </div>
  );
}
