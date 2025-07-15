// This file needs to be refactored to not use email.
// For now, we will comment out the parts that use email.
'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';
import type { User } from '@/types/auth';

export const columns = (
  openEditDialog: (user: User) => void,
  openDeleteDialog: (user: User) => void
): ColumnDef<User>[] => [
  {
    accessorKey: 'username',
    header: 'Username',
  },
  {
    accessorKey: 'displayName',
    header: 'Display Name',
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => (row.getValue('isActive') ? 'Active' : 'Inactive'),
  },
  {
    accessorKey: 'lastLogin',
    header: 'Last Login',
    cell: ({ row }) => {
      const date = new Date(row.getValue('lastLogin'));
      return date.toLocaleString();
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const user = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(user.id)}>
              Copy user ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openEditDialog(user)}>Edit user</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openDeleteDialog(user)} className="text-red-600">
              Delete user
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

