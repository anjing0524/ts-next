'use client';

import React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useContextMenu } from 'react-contexify';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { DataTablePagination } from './table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import { type DataTableProps } from './types';
import { ContextMenuProvider, MENU_ID } from './context-menu-provider';

export function DataTable<TData, TValue>({
  columns,
  data,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  columnVisibility,
  onColumnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  className,
  isLoading = false,
  pageSizeOptions,
  onCopyRow,
  onCopyCell,
  onFilterByValue,
  onExportData,
  onResetFilters,
  onColumnSettings,
}: DataTableProps<TData, TValue>) {
  const { show } = useContextMenu({
    id: MENU_ID,
  });

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      pagination,
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    onPaginationChange,
    onSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  const handleCopyRow = onCopyRow ?? ((row: TData) => navigator.clipboard.writeText(JSON.stringify(row, null, 2)));
  const handleCopyCell = onCopyCell ?? ((value: unknown) => navigator.clipboard.writeText(String(value)));

  return (
    <div className={className}>
      <DataTableToolbar table={table} />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: `${header.getSize()}px` }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            onContextMenu={(e) => {
              // This is a generic context menu for the body, can be customized
            }}
          >
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onContextMenu={(e) => show({ event: e, props: { row: row.original } })}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      onContextMenu={(e) =>
                        show({
                          event: e,
                          props: {
                            row: row.original,
                            cellValue: cell.getValue(),
                            column: cell.column,
                          },
                        })
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
      <ContextMenuProvider
        onCopyRow={handleCopyRow}
        onCopyCell={handleCopyCell}
        onFilterByValue={onFilterByValue}
        onExportData={onExportData}
        onResetFilters={onResetFilters}
        onColumnSettings={onColumnSettings}
      />
    </div>
  );
}

export type { ColumnDef } from '@tanstack/react-table';

