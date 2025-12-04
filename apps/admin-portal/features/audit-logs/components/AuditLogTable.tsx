'use client';

/**
 * 审计日志数据表 (Audit Log Data Table)
 *
 * Client Component - 纯展示组件，无业务逻辑
 * Client Component - Pure display component, no business logic
 */

import type { AuditLog } from '@/app/actions/types';

interface AuditLogTableProps {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 获取事件类型的样式 (Get event type styling)
 */
function getEventTypeBadge(eventType: string) {
  const typeMap: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
    LOGIN: { bg: 'bg-blue-100', text: 'text-blue-700', label: '登录' },
    LOGOUT: { bg: 'bg-gray-100', text: 'text-gray-700', label: '登出' },
    CREATE: { bg: 'bg-green-100', text: 'text-green-700', label: '创建' },
    UPDATE: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '更新' },
    DELETE: { bg: 'bg-red-100', text: 'text-red-700', label: '删除' },
    PERMISSION_CHANGE: {
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      label: '权限变更',
    },
    ROLE_CHANGE: {
      bg: 'bg-indigo-100',
      text: 'text-indigo-700',
      label: '角色变更',
    },
  };

  return (
    typeMap[eventType] || {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      label: eventType,
    }
  );
}

export function AuditLogTable({ logs, total, page, limit }: AuditLogTableProps) {
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
              <th className="px-4 py-3 text-left font-semibold">时间</th>
              <th className="px-4 py-3 text-left font-semibold">用户</th>
              <th className="px-4 py-3 text-left font-semibold">事件类型</th>
              <th className="px-4 py-3 text-left font-semibold">资源</th>
              <th className="px-4 py-3 text-left font-semibold">操作</th>
              <th className="px-4 py-3 text-left font-semibold">状态</th>
              <th className="px-4 py-3 text-left font-semibold">详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const badgeStyle = getEventTypeBadge(log.event_type);
              return (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-600 font-mono">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleString('zh-CN')
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900">
                        {log.user_id}
                      </div>
                      <div className="text-xs text-gray-500">
                        {log.username || 'System'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded text-xs ${badgeStyle.bg} ${badgeStyle.text}`}>
                      {badgeStyle.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">
                    {log.resource_type || '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {log.action || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs ${
                        log.status === 'SUCCESS'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {log.status === 'SUCCESS' ? '成功' : '失败'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                    <div className="truncate">{log.details || '-'}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页信息 (Pagination info) */}
      <div className="flex justify-between items-center text-sm text-gray-600">
        <div>
          共 <span className="font-semibold">{total}</span> 条日志 | 第{' '}
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
