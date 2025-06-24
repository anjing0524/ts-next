'use client';

import { useState, useEffect } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      // or redirect to login
      setError('You must be logged in to view this page.');
      setIsLoading(false);
      return;
    }

    if (user) {
      const fetchUsers = async () => {
        try {
          const response = await adminApi.getUsers();
          setData(response.data);
        } catch (err) {
          setError('Failed to load users.');
        } finally {
          setIsLoading(false);
        }
      };

      fetchUsers();
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
      <h1 className="text-3xl font-bold mb-6">User Management</h1>
      <DataTable columns={columns} data={data} searchKey="username" searchPlaceholder="Search users..." />
    </div>
  );
}