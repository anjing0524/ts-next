'use client';

/**
 * 权限数据表 (Permission Data Table)
 *
 * Client Component - 纯展示组件，无业务逻辑
 * Client Component - Pure display component, no business logic
 */

import type { Permission } from '@/app/actions/types';

interface PermissionTableProps {
  permissions: Permission[];
  total: number;
  page: number;
  limit: number;
}

export function PermissionTable({
  permissions,
  total,
  page,
  limit,
}: PermissionTableProps) {
  // 计算分页信息 (Calculate pagination info)
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit + 1;
  const endIndex = Math.min(page * limit, total);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">权限名称</th>
              <th className="px-4 py-3 text-left font-semibold">描述</th>
              <th className="px-4 py-3 text-left font-semibold">资源</th>
              <th className="px-4 py-3 text-left font-semibold">操作</th>
              <th className="px-4 py-3 text-left font-semibold">类型</th>
              <th className="px-4 py-3 text-left font-semibold">创建时间</th>
              <th className="px-4 py-3 text-left font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-blue-600">
                  {permission.name}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div className="max-w-xs truncate">
                    {permission.description || '-'}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {permission.resource || '-'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {permission.action || '-'}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                    {permission.type || 'custom'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {permission.created_at
                    ? new Date(permission.created_at).toLocaleDateString(
                        'zh-CN'
                      )
                    : '-'}
                </td>
                <td className="px-4 py-3 space-x-2">
                  <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
                    编辑
                  </button>
                  <button className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition">
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页信息 (Pagination info) */}
      <div className="flex justify-between items-center text-sm text-gray-600">
        <div>
          共 <span className="font-semibold">{total}</span> 个权限 | 第{' '}
          <span className="font-semibold">{page}</span> 页 (每页{' '}
          <span className="font-semibold">{limit}</span> 条) | 显示{' '}
          <span className="font-semibold">
            {startIndex}-{endIndex}
          </span>
        </div>
        <div className="space-x-2">
          <span>
            第 {page} / {totalPages} 页
          </span>
        </div>
      </div>
    </div>
  );
}
