'use client';

/**
 * 客户端数据表 (Client Data Table)
 *
 * Client Component - 纯展示组件，无业务逻辑
 * Client Component - Pure display component, no business logic
 */

import type { ClientInfoPublic } from '@/app/actions/types';

interface ClientTableProps {
  clients: ClientInfoPublic[];
  total: number;
  page: number;
  limit: number;
}

export function ClientTable({ clients, total, page, limit }: ClientTableProps) {
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
              <th className="px-4 py-3 text-left font-semibold">客户端 ID</th>
              <th className="px-4 py-3 text-left font-semibold">客户端名称</th>
              <th className="px-4 py-3 text-left font-semibold">重定向 URI</th>
              <th className="px-4 py-3 text-left font-semibold">授权类型</th>
              <th className="px-4 py-3 text-left font-semibold">创建时间</th>
              <th className="px-4 py-3 text-left font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.client_id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {client.client_id.substring(0, 8)}...
                </td>
                <td className="px-4 py-3 font-medium">{client.client_name}</td>
                <td className="px-4 py-3 text-xs">
                  <div className="max-w-xs truncate text-gray-600">
                    {client.redirect_uris?.[0] || '-'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {client.grant_types && client.grant_types.length > 0 ? (
                      client.grant_types.slice(0, 2).map((type) => (
                        <span
                          key={type}
                          className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                        >
                          {type}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400">无</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {client.created_at
                    ? new Date(client.created_at).toLocaleDateString('zh-CN')
                    : '-'}
                </td>
                <td className="px-4 py-3 space-x-2">
                  <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
                    查看
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

      {/* 分页信息和导航 (Pagination info and navigation) */}
      <div className="flex justify-between items-center text-sm text-gray-600">
        <div>
          共 <span className="font-semibold">{total}</span> 个客户端 | 第{' '}
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
