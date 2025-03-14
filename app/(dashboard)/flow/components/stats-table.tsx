'use client';

import * as React from 'react';
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useFlowStore, FlowStats } from '@/app/(dashboard)/flow/store/flow-store';
import { useShallow } from 'zustand/react/shallow'; // 添加 shallow 导入
import {
  Table as UITable,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export function StatsTable() {
  // 使用 shallow 比较优化状态选择
  const stages = useFlowStore(useShallow((state) => state.stages));

  // 计算所有阶段的统计数据
  const stats = React.useMemo(() => {
    const stats = stages.map((stage) => stage.stats);
    return stats.sort((a, b) => a.name.localeCompare(b.name));
  }, [stages]);

  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  // 定义表格列
  const columns: ColumnDef<FlowStats>[] = React.useMemo(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: '阶段名称',
        size: 150,
      },
      {
        id: 'total',
        accessorKey: 'total',
        header: '总任务数',
        size: 100,
      },
      {
        id: 'success',
        accessorKey: 'success',
        header: '成功',
        size: 100,
        cell: ({ row }) => {
          const value = row.getValue('success') as number;
          const total = row.getValue('total') as number;
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

          return (
            <div className="flex items-center gap-2">
              <Badge variant="success" className="bg-green-500">
                {value}
              </Badge>
              <span className="text-xs text-gray-500">{percentage}%</span>
            </div>
          );
        },
      },
      {
        id: 'failed',
        accessorKey: 'failed',
        header: '失败',
        size: 100,
        cell: ({ row }) => {
          const value = row.getValue('failed') as number;
          const total = row.getValue('total') as number;
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

          return (
            <div className="flex items-center gap-2">
              <Badge variant="destructive">{value}</Badge>
              <span className="text-xs text-gray-500">{percentage}%</span>
            </div>
          );
        },
      },
      {
        id: 'running',
        accessorKey: 'running',
        header: '运行中',
        size: 100,
        cell: ({ row }) => {
          const value = row.getValue('running') as number;
          const total = row.getValue('total') as number;
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

          return (
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-blue-500">
                {value}
              </Badge>
              <span className="text-xs text-gray-500">{percentage}%</span>
            </div>
          );
        },
      },
      {
        id: 'waiting',
        accessorKey: 'waiting',
        header: '等待中',
        size: 100,
        cell: ({ row }) => {
          const value = row.getValue('waiting') as number;
          const total = row.getValue('total') as number;
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

          return (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                {value}
              </Badge>
              <span className="text-xs text-gray-500">{percentage}%</span>
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: stats,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (stats.length === 0) {
    return (
      <div className="rounded-md border p-4 text-center">
        <p className="text-sm text-gray-500">暂无统计数据</p>
      </div>
    );
  }

  // 使用标准表格渲染而不是虚拟列表，先确认基本功能正常
  return (
    <div className="rounded-md border main">
      <div
        ref={tableContainerRef}
        className="overflow-auto"
        style={{
          position: 'relative',
          height: Math.min(stats.length * 50 + 40, 400),
        }}
      >
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="bg-muted/50"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className={row.index % 2 ? 'bg-muted/10' : 'bg-background'}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </UITable>
      </div>
    </div>
  );
}
