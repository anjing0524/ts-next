'use client';

import { MoreHorizontal } from 'lucide-react';
import { type Row } from '@tanstack/react-table';

import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  actions: {
    label: string;
    onClick: (row: TData) => void;
  }[];
  customMenuItems?: React.ReactNode;
}

export function DataTableRowActions<TData>({
  row,
  actions,
  customMenuItems,
}: DataTableRowActionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        {actions.map((action, index) => (
          <DropdownMenuItem key={index} onClick={() => action.onClick(row.original)}>
            {action.label}
          </DropdownMenuItem>
        ))}
        {customMenuItems && (
          <>
            <DropdownMenuSeparator />
            {customMenuItems}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
