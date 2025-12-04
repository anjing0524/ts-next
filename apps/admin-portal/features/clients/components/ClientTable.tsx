'use client';
export function ClientTable({ clients, total, page, limit }: any) {
  const totalPages = Math.ceil(total / limit);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium">客户端</th>
              <th className="px-6 py-3 text-left text-sm font-medium">名称</th>
              <th className="px-6 py-3 text-left text-sm font-medium">类型</th>
              <th className="px-6 py-3 text-left text-sm font-medium">状态</th>
            </tr>
          </thead>
          <tbody>{clients.length === 0 && <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">无数据</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">第 {page} 页，共 {totalPages} 页</div>
      </div>
    </div>
  );
}
