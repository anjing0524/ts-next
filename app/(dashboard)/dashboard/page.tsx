'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { v4 as uuidv4 } from 'uuid';
import React from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
  createdAt: string;
}

// 生成模拟数据
const generateMockData = (count: number): User[] => {
  'use client';

  const roles = ['管理员', '编辑', '用户', '访客', '审核员'];
  const statuses = ['活跃', '离线', '已禁用', '待验证'];

  // 使用固定的基准时间来避免服务端和客户端的差异
  const baseTime = new Date('2024-01-01').getTime();

  return Array.from({ length: count }).map((_, i) => {
    // 使用确定性的时间偏移，基于索引而不是随机数
    const dayOffset = i % 30; // 0-29天的偏移
    const monthOffset = Math.floor(i / 30) % 12; // 0-11月的偏移

    return {
      id: uuidv4(),
      name: `用户${i + 1}`,
      email: `user${i + 1}@example.com`,
      role: roles[i % roles.length],
      status: statuses[i % statuses.length],
      lastLogin: new Date(baseTime - dayOffset * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(
        baseTime - (dayOffset + monthOffset * 30) * 24 * 60 * 60 * 1000
      ).toISOString(),
    };
  });
};

const columns: ColumnDef<User>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: '姓名',
    size: 120,
  },
  {
    id: 'email',
    accessorKey: 'email',
    header: '邮箱',
    size: 200,
  },
  {
    id: 'role',
    accessorKey: 'role',
    header: '角色',
    size: 100,
    cell: ({ row }) => {
      const role = row.getValue('role') as string;
      return (
        <Badge
          variant={role === '管理员' ? 'destructive' : role === '编辑' ? 'default' : 'outline'}
        >
          {role}
        </Badge>
      );
    },
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: '状态',
    size: 100,
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      return (
        <Badge
          variant={
            status === '活跃'
              ? 'default'
              : status === '离线'
                ? 'secondary'
                : status === '已禁用'
                  ? 'destructive'
                  : 'outline'
          }
        >
          {status}
        </Badge>
      );
    },
  },
  {
    id: 'lastLogin',
    accessorKey: 'lastLogin',
    header: '最后登录',
    size: 150,
    cell: ({ row }) => {
      const date = new Date(row.getValue('lastLogin') as string);
      return <span>{date.toLocaleString('zh-CN')}</span>;
    },
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: '创建时间',
    size: 150,
    cell: ({ row }) => {
      const date = new Date(row.getValue('createdAt') as string);
      return <span>{date.toLocaleString('zh-CN')}</span>;
    },
  },
];

// 生成更多的模拟数据
const data = generateMockData(10000); // 增加到 10000 条数据

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">用户管理</h1>
      <div className="bg-card rounded-lg shadow">
        <DataTable
          data={data}
          columns={columns}
          enableColumnDragging={true}
          enableVirtualization={true}
          containerHeight={300}
          rowHeight={32} // 明确指定行高
          defaultPageSize={200}
          pageSizeOptions={[100, 200, 500, 1000]} // 调整分页大小选项
        />
      </div>
    </div>
  );
}
