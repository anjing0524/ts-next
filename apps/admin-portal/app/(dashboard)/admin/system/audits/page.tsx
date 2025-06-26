'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@repo/ui';
import { Badge } from '@repo/ui';
import { adminApi } from '@/lib/api';

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  details?: Record<string, any>;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        const response = await adminApi.getAuditLogs();
        setLogs(response.data);
      } catch (err) {
        setError('Failed to load audit logs');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAuditLogs();
  }, []);

  const columns = [
    {
      accessorKey: 'timestamp',
      header: '时间戳',
    },
    {
      accessorKey: 'userId',
      header: '用户ID',
    },
    {
      accessorKey: 'action',
      header: '操作',
    },
    {
      accessorKey: 'resource',
      header: '资源',
    },
    {
      accessorKey: 'ipAddress',
      header: 'IP地址',
    },
    {
      accessorKey: 'userAgent',
      header: '用户代理',
    },
  ];

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">审计日志</h1>
      <DataTable columns={columns} data={logs} />
    </div>
  );
}
