'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button, AnimatedBadge, DataTableColumnHeader } from '@repo/ui';
import { User } from '@/types/auth';
import { UserStatus } from '../domain/user';
import { format } from 'date-fns';

// 定义操作的回调函数类型
type UserActions = {
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
};

export const getUserColumns = ({ onEdit, onDelete }: UserActions): ColumnDef<User>[] => [
  {
    accessorKey: 'username',
    header: ({ column }) => <DataTableColumnHeader column={column} title="用户名" />,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => <DataTableColumnHeader column={column} title="邮箱" />,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="状态" />,
    cell: ({ row }) => {
      const status = row.getValue('status') as UserStatus;
      const variant: 'default' | 'outline' | 'destructive' =
        status === UserStatus.ACTIVE
          ? 'default'
          : status === UserStatus.INACTIVE
            ? 'outline'
            : 'destructive';
      const text =
        status === UserStatus.ACTIVE ? '活动' : status === UserStatus.INACTIVE ? '禁用' : '封禁';
      return <AnimatedBadge variant={variant} shimmer pulse>{text}</AnimatedBadge>;
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="创建时间" />,
    cell: ({ row }) => {
      return format(new Date(row.getValue('createdAt')), 'yyyy-MM-dd HH:mm:ss');
    },
  },
  {
    id: 'actions',
    header: '操作',
    cell: ({ row }) => (
      <div className="space-x-2">
        <Button variant="ghost" size="sm" onClick={() => onEdit(row.original)}>
          编辑
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(row.original)}>
          删除
        </Button>
      </div>
    ),
  },
];
