'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns'; // Assuming columns are defined in a separate file
import { adminApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

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
  const { user, isLoading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      setError('You must be logged in to view this page.');
      setIsLoading(false);
      return;
    }

    if (user) {
      const fetchAuditLogs = async () => {
        try {
          // Assuming an API method exists to fetch audit logs
          const response = await adminApi.getAuditLogs(); 
          setLogs(response.data);
        } catch (err) { 
          setError('Failed to load audit logs');
        } finally {
          setIsLoading(false);
        }
      };

      fetchAuditLogs();
    }
  }, [user, authLoading]);

  if (isLoading || authLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">Audit Logs</h1>
      <p className="text-gray-600 mb-6">Review system and user activities.</p>
      <DataTable
        columns={columns}
        data={logs}
        searchKey="action"
        searchPlaceholder="Search actions..."
      />
    </div>
  );
}