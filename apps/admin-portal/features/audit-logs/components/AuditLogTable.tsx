'use client';
export function AuditLogTable({ logs, total, page, limit }: any) {
  const totalPages = Math.ceil(total / limit);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium">操作</th>
              <th className="px-6 py-3 text-left text-sm font-medium">用户</th>
              <th className="px-6 py-3 text-left text-sm font-medium">时间</th>
            </tr>
          </thead>
          <tbody>{logs.length === 0 && <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">无数据</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">第 {page} 页，共 {totalPages} 页</div>
      </div>
    </div>
  );
}
