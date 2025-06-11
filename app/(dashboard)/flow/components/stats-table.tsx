'use client';

import * as React from 'react';

import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useShallow } from 'zustand/react/shallow'; // 添加 shallow 导入

import { useFlowStore, FlowStats } from '@/app/(dashboard)/flow/store/flow-store';
import { Badge } from '@/components/ui/badge';
import {
  Table as UITable,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';

export function StatsTable() {
  // 使用 shallow 比较优化状态选择，同时获取 currentStage 和 setCurrentStage
  const { stages, currentStage, setCurrentStage } = useFlowStore(
    useShallow((state) => ({
      stages: state.stages,
      currentStage: state.currentStage,
      setCurrentStage: state.setCurrentStage,
    }))
  );

  // 计算所有阶段的统计数据
  const stats = React.useMemo(() => {
    const stats = stages.map((stage) => stage.stats);
    return stats.sort((a, b) => a.name.localeCompare(b.name));
  }, [stages]);

  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  // 处理双击事件
  const handleRowDoubleClick = React.useCallback(
    (stageName: string) => {
      // 如果当前已选中该阶段，则取消选中；否则选中该阶段
      if (currentStage === stageName) {
        setCurrentStage('');
      } else {
        setCurrentStage(stageName);
      }
    },
    [currentStage, setCurrentStage]
  );

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

  return (
    <div className="rounded-md border mx-4 bg-white">
      <div className="relative w-full overflow-auto" ref={tableContainerRef}>
        <UITable>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{
                      width: header.getSize(),
                    }}
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getValue('name') === currentStage ? 'selected' : undefined}
                  className={
                    row.getValue('name') === currentStage
                      ? 'bg-blue-700 hover:bg-blue-800 cursor-pointer'
                      : 'hover:bg-muted/30 cursor-pointer'
                  }
                  onDoubleClick={() => handleRowDoubleClick(row.getValue('name'))}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{
                        width: cell.column.getSize(),
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </UITable>
      </div>
    </div>
  );
}
