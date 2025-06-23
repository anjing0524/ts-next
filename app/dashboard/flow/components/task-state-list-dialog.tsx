'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  Row,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer, VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import { format } from 'date-fns';
import { useShallow } from 'zustand/react/shallow';

import { useFlowStore } from '@/app/dashboard/flow/store/flow-store';
import { TaskStateDetailType } from '@/app/dashboard/flow/types/type';
import { getTaskDetails } from '@/app/actions/flow-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { TASK_STATE_MAP } from '../cons';
import { TaskStateDetail } from './task-state-detail';

type StateInfo = { label: string; variant: string; color?: string };

// 表格行组件接口
interface TableBodyRowProps {
  row: Row<TaskStateDetailType>;
  virtualRow: VirtualItem;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  handleRowClick: (taskPk: string) => void;
}

// 使用 memo 优化表格行组件，避免不必要的重渲染
const TableBodyRow = React.memo(function TableBodyRow({
  row,
  virtualRow,
  rowVirtualizer,
  handleRowClick,
}: TableBodyRowProps) {
  // 获取当前行的task_pk
  const taskPk = row.original.task_pk;

  // 使用 useCallback 优化点击处理函数
  const onClick = useCallback(() => {
    if (taskPk) handleRowClick(taskPk);
  }, [taskPk, handleRowClick]);

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
      onClick={onClick}
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
});

// 恢复 TruncateCell 组件
const TruncateCell: React.FC<{ value: string; maxWidth: string }> = React.memo(
  function TruncateCell({ value, maxWidth }) {
    return (
      <div className="truncate" style={{ maxWidth }} title={value}>
        {value}
      </div>
    );
  }
);
TruncateCell.displayName = 'TruncateCell';

// 极致性能 FastBadge 组件
const FastBadge: React.FC<{ state: string }> = React.memo(function FastBadge({ state }) {
  const info: StateInfo = TASK_STATE_MAP[state] || { label: state || '', variant: 'default' };
  let color = 'bg-gray-100 text-gray-800';
  if (info.color) {
    color = info.color;
  } else if (info.variant === 'success') {
    color = 'bg-green-100 text-green-800';
  } else if (info.variant === 'destructive') {
    color = 'bg-red-100 text-red-800';
  } else if (info.variant === 'warning') {
    color = 'bg-yellow-100 text-yellow-800';
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {info.label || state}
    </span>
  );
});
FastBadge.displayName = 'FastBadge';

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
  // 添加任务状态过滤状态
  const [taskStateFilter, setTaskStateFilter] = useState<string | null>(null);

  // 创建表格容器引用
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // 添加状态管理选中的任务PK和详情弹窗状态
  const [selectedTaskPk, setSelectedTaskPk] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // 处理任务状态过滤变化
  const handleTaskStateFilterChange = (value: string) => {
    setTaskStateFilter(value === 'all' ? null : value);
  };

  // 根据任务状态过滤任务列表
  const filteredTasks = useMemo(() => {
    if (!taskStateFilter) return tasks;

    // 根据选择的状态过滤任务
    return tasks.filter((task) => {
      const state = task.task_state;

      // 根据状态分类过滤
      switch (taskStateFilter) {
        case 'success':
          // 成功状态：D, K
          return state === 'D' || state === 'K';
        case 'failed':
          // 失败状态：F, Z, C, T
          return state === 'F' || state === 'Z' || state === 'C' || state === 'T';
        case 'running':
          // 运行中状态：R, W
          return state === 'R' || state === 'W';
        case 'not_run':
          // 未运行状态：N, P
          return state === 'N' || state === 'P';
        default:
          return true;
      }
    });
  }, [tasks, taskStateFilter]);

  useEffect(() => {
    async function fetchData() {
      if (!planId || !exeId || !redate) {
        return;
      }

      try {
        setLoading(true);
        const ret = await getTaskDetails(planId, format(redate, 'yyyy-MM-dd'), exeId);

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
          setTasks([]);
        }
      } catch (err) {
        // 使用 err 变量或移除它
        console.error('Failed to fetch task details:', err);
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
    if (filteredTasks.length === 0) {
      setShouldScroll(false);
      return;
    }

    // 计算内容高度
    const rowHeight = 32; // 行高
    const headerHeight = 40; // 表头高度
    const contentHeight = rowHeight * filteredTasks.length + headerHeight;

    // 如果内容高度超过400px，则需要滚动条
    setShouldScroll(contentHeight > 400);
  }, [filteredTasks]);

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
        cell: ({ row }) => (
          <TruncateCell value={row.getValue('task_id') as string} maxWidth="180px" />
        ),
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
        cell: ({ row }) => (
          <TruncateCell value={row.getValue('exec_cmd') as string} maxWidth="200px" />
        ),
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
        cell: ({ row }) => <FastBadge state={row.getValue('task_state') as string} />,
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
          return desc ? <TruncateCell value={desc} maxWidth="300px" /> : null;
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
    data: filteredTasks, // 使用过滤后的数据
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

  // 优化虚拟列表配置
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: useCallback(() => 32, []),
    getScrollElement: () => tableContainerRef.current,
    overscan: 5, // 进一步降低 overscan
    initialRect: { width: 0, height: 32 },
  });

  // 只在 filteredTasks 变化时 measure
  useEffect(() => {
    rowVirtualizer.measure();
  }, [filteredTasks, rowVirtualizer]);

  // 使用 useCallback 优化行点击处理函数
  const handleRowClickCallback = useCallback((taskPk: string) => {
    setSelectedTaskPk(taskPk);
    setIsDetailOpen(true);
  }, []);

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
                {/* 添加任务状态过滤下拉框 */}
                <div className="p-2 border-b flex items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">任务状态:</span>
                    <Select
                      value={taskStateFilter || 'all'}
                      onValueChange={handleTaskStateFilterChange}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-sm">
                        <SelectValue placeholder="选择状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="success">成功</SelectItem>
                        <SelectItem value="failed">失败</SelectItem>
                        <SelectItem value="running">执行中</SelectItem>
                        <SelectItem value="not_run">未运行</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {taskStateFilter && (
                    <div className="ml-2 text-xs text-muted-foreground">
                      已过滤: {filteredTasks.length}/{tasks.length} 条记录
                    </div>
                  )}
                </div>
                <div
                  ref={tableContainerRef}
                  className={`relative h-[360px] ${shouldScroll ? 'overflow-auto' : 'overflow-y-hidden'}`}
                  style={{
                    width: '100%',
                    willChange: 'transform', // 提示浏览器优化渲染
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
                      {rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
                        const row = rows[virtualRow.index];
                        return (
                          <TableBodyRow
                            key={row.id}
                            row={row}
                            virtualRow={virtualRow}
                            rowVirtualizer={rowVirtualizer}
                            handleRowClick={handleRowClickCallback}
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
        redate={format(new Date(redate as number), 'yyyy-MM-dd')}
      />
    </>
  );
}
