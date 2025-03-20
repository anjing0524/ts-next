'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  Row,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { TaskConfState, TaskStateDetailType } from '@/app/(dashboard)/flow/types/type';
import { useFlowStore } from '@/app/(dashboard)/flow/store/flow-store';
import { useShallow } from 'zustand/react/shallow';
import { format } from 'date-fns';
import { useVirtualizer, VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import { getTaskDetails } from '@/app/actions/flow-actions';
import { TaskStateDetail } from './task-state-detail';
import { TASK_STATE_MAP } from '../cons';

// 表格行组件接口
interface TableBodyRowProps {
  row: Row<TaskStateDetailType>;
  virtualRow: VirtualItem;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  handleRowClick: (taskPk: string) => void;
}

// 表格行组件
function TableBodyRow({ row, virtualRow, rowVirtualizer, handleRowClick }: TableBodyRowProps) {
  // 获取当前行的task_pk
  const taskPk = row.original.task_pk;
  return (
    <tr
      data-index={virtualRow.index}
      ref={(node) => rowVirtualizer.measureElement(node)}
      key={row.id}
      style={{
        display: 'flex',
        position: 'absolute',
        transform: `translateY(${virtualRow.start}px)`,
        width: '100%',
        height: '32px', // 降低行高
      }}
      className="hover:bg-muted/50"
      onClick={() => taskPk && handleRowClick(taskPk)}
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          style={{
            display: 'flex',
            width: cell.column.getSize(),
            alignItems: 'center',
            padding: '4px 8px', // 减小内边距
          }}
          className="border-r last:border-r-0 border-border text-sm"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

export function TaskDetailsDialog() {
  // 从 store 中获取任务详情对话框状态
  const { isOpen, redate, planId, planDesc, exeId, closeTaskDetail } = useFlowStore(
    useShallow((state) => ({
      isOpen: state.taskDetail.isOpen,
      planId: state.taskDetail.planId,
      planDesc: state.taskDetail.planDesc,
      redate: state.taskDetail.redateTimestamp,
      exeId: state.taskDetail.exeId,
      closeTaskDetail: state.closeTaskDetail,
    }))
  );
  const [tasks, setTasks] = useState<TaskStateDetailType[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [loading, setLoading] = useState(false);
  // 移除tableHeight状态，改为使用shouldScroll状态
  const [shouldScroll, setShouldScroll] = useState(false);

  // 创建表格容器引用
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 添加状态管理选中的任务PK和详情弹窗状态
  const [selectedTaskPk, setSelectedTaskPk] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // 处理行点击事件
  const handleRowClick = (taskPk: string) => {
    setSelectedTaskPk(taskPk);
    setIsDetailOpen(true);
  };

  useEffect(() => {
    async function fetchData() {
      if (!planId || !exeId || !redate) {
        return;
      }

      try {
        setLoading(true);
        console.log('Fetching task details:', planId, format(redate, 'yyyy-MM-dd'), exeId);
        const ret = await getTaskDetails(planId, format(redate, 'yyyy-MM-dd'), exeId);
        console.log('Task details received:', ret);

        if (ret && Array.isArray(ret)) {
          setTasks(
            ret.map(
              (item) =>
                ({
                  ...item,
                  redate: item.redateFormatted,
                  start_time: item.startTimeFormatted,
                  end_time: item.endTimeFormatted,
                }) as TaskStateDetailType
            )
          );
        } else {
          console.error('Invalid task details response:', ret);
          setTasks([]);
        }
      } catch (error) {
        console.error('Error fetching task details:', error);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    }

    if (isOpen) {
      fetchData();
    }
  }, [isOpen, redate, planId, exeId]);

  // 添加一个新的 useEffect 来计算表格高度
  useEffect(() => {
    if (tasks.length === 0) {
      setShouldScroll(false);
      return;
    }

    // 计算内容高度
    const rowHeight = 32; // 行高
    const headerHeight = 40; // 表头高度
    const contentHeight = rowHeight * tasks.length + headerHeight;

    // 如果内容高度超过400px，则需要滚动条
    setShouldScroll(contentHeight > 400);
  }, [tasks]);

  // 定义表格列，使用 useMemo 优化性能
  const columns = useMemo<ColumnDef<TaskStateDetailType>[]>(
    () => [
      {
        id: 'index',
        header: '序号',
        cell: ({ row }) => row.index + 1,
        size: 60,
      },
      {
        id: 'redate',
        accessorKey: 'redate',
        header: '调度日期',
        size: 120,
      },
      {
        id: 'task_id',
        accessorKey: 'task_id',
        header: '调度任务',
        size: 180,
        cell: ({ row }) => {
          const taskId = row.getValue('task_id') as string;
          return (
            <div className="max-w-[180px] truncate" title={taskId}>
              {taskId}
            </div>
          );
        },
      },
      {
        id: 'plan_id',
        accessorKey: 'plan_id',
        header: '调度计划',
        size: 150,
      },
      {
        id: 'exec_cmd',
        accessorKey: 'exec_cmd',
        header: '执行命令',
        size: 200,
        cell: ({ row }) => {
          const cmd = row.getValue('exec_cmd') as string;
          return (
            <div className="max-w-[200px] truncate" title={cmd}>
              {cmd}
            </div>
          );
        },
      },
      {
        id: 'exe_id',
        accessorKey: 'exe_id',
        header: '轮次',
        size: 60,
      },
      {
        id: 'task_state',
        accessorKey: 'task_state',
        header: '任务状态',
        size: 100,
        cell: ({ row }) => {
          const state = row.getValue('task_state') as string;
          const stateInfo = TASK_STATE_MAP[state] || { label: state, variant: 'default' };
          return <Badge variant={stateInfo.variant}>{stateInfo.label || state}</Badge>;
        },
      },
      {
        id: 'start_time',
        accessorKey: 'start_time',
        header: '开始时间',
        size: 160,
      },
      {
        id: 'end_time',
        accessorKey: 'end_time',
        header: '结束时间',
        size: 160,
      },
      {
        id: 'cost_time',
        accessorKey: 'cost_time',
        header: '耗时(秒)',
        size: 100,
      },
      {
        id: 'exec_desc',
        accessorKey: 'exec_desc',
        header: '执行信息',
        size: 200,
        cell: ({ row }) => {
          const desc = row.getValue('exec_desc') as string;
          return desc ? (
            <div className="max-w-[300px] truncate" title={desc}>
              {desc}
            </div>
          ) : null;
        },
      },
      {
        id: 'ret_value',
        accessorKey: 'ret_value',
        header: '返回值',
        size: 80,
      },
    ],
    []
  );

  // 创建表格实例
  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
  });

  // 计算表格总宽度
  const tableWidth = useMemo(() => {
    return table.getAllColumns().reduce((acc, column) => {
      return acc + (column.getSize() || 150);
    }, 0);
  }, [table]);

  // 使用虚拟列表优化表格渲染
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 32, // 行高估计值
    getScrollElement: () => tableContainerRef.current,
    overscan: 40, // 预渲染行数
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && closeTaskDetail()}>
        <DialogContent className="p-0 overflow-hidden w-auto min-w-7xl">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>计划任务详情</DialogTitle>
            <DialogDescription>
              计划ID: {planId} - {planDesc || ''}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-0 w-full overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex justify-center items-center h-[400px] text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <div className="border rounded-md" style={{ height: '400px' }}>
                <div
                  ref={tableContainerRef}
                  className={`relative h-[400px] ${shouldScroll ? 'overflow-auto' : 'overflow-y-hidden'}`}
                  style={{
                    width: '100%',
                  }}
                >
                  <table
                    style={{
                      width: tableWidth,
                      tableLayout: 'fixed',
                    }}
                  >
                    <thead
                      className="bg-muted/98 sticky top-0 z-10 grid"
                      style={{
                        display: 'grid',
                        position: 'sticky',
                      }}
                    >
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id} style={{ display: 'flex' }}>
                          {headerGroup.headers.map((header) => (
                            <th
                              key={header.id}
                              style={{
                                width: header.getSize(),
                                display: 'flex',
                                alignItems: 'center',
                                padding: '8px',
                                cursor: header.column.getCanSort() ? 'pointer' : 'default',
                              }}
                              className="border-r last:border-r-0 border-border text-sm font-medium hover:bg-muted/80 transition-colors"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {header.isPlaceholder ? null : (
                                <div className="flex items-center gap-1">
                                  {flexRender(header.column.columnDef.header, header.getContext())}
                                  {{
                                    asc: <span className="opacity-50">↑</span>,
                                    desc: <span className="opacity-50">↓</span>,
                                  }[header.column.getIsSorted() as string] ?? null}
                                </div>
                              )}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody
                      style={{
                        display: 'grid',
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        position: 'relative',
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        return (
                          <TableBodyRow
                            key={row.id}
                            row={row}
                            virtualRow={virtualRow}
                            rowVirtualizer={rowVirtualizer}
                            handleRowClick={handleRowClick}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <TaskStateDetail
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        taskPk={selectedTaskPk}
      />
    </>
  );
}
