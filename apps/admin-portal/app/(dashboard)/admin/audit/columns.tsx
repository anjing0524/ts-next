'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  timestamp: string;
  ipAddress: string;
}

export const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: 'timestamp',
    header: 'Timestamp',
    cell: ({ row }) => new Date(row.getValue('timestamp')).toLocaleString(),
  },
  {
    accessorKey: 'userId',
    header: 'User ID',
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => {
      const action = row.getValue('action') as string;
      let variant: 'default' | 'destructive' | 'outline' | 'secondary' = 'default';
      if (action.includes('DELETE') || action.includes('REMOVE')) {
        variant = 'destructive';
      } else if (action.includes('CREATE') || action.includes('ADD')) {
        variant = 'default';
      } else if (action.includes('UPDATE') || action.includes('EDIT')) {
        variant = 'secondary';
      }
      return <Badge variant={variant}>{action}</Badge>;
    },
  },
  {
    accessorKey: 'resource',
    header: 'Resource',
  },
  {
    accessorKey: 'ipAddress',
    header: 'IP Address',
  },
];