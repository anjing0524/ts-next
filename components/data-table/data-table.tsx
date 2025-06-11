'use client';

import * as React from 'react';

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

import { DataTablePagination } from './table-pagination';
import { DataTableBodyProps, DataTableProps, PaginationState, TableHeaderCellProps } from './types';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table as UITable,
} from '../ui/table';

// 修改 TableHeaderCell 组件，参考 AG Grid 的表头样式
function TableHeaderCell<TData>({ header, enableDragging }: TableHeaderCellProps<TData>) {
  const { attributes, listeners, transform, setNodeRef, isDragging } = useSortable({
    id: header.column.id,
  });

  const style = React.useMemo(
    () => ({
      opacity: isDragging ? 0.8 : 1,
      position: 'relative' as const,
      transform: CSS.Translate.toString(transform),
      transition: 'width transform 0.2s ease-in-out',
      width: header.column.getSize(),
      minWidth: header.column.getSize(),
      zIndex: isDragging ? 1 : 0,
    }),
    [transform, header.column, isDragging]
  );

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className={cn(
        'h-10 px-3 text-left align-middle font-medium bg-muted/30 border-b border-r border-border',
        isDragging && 'opacity-80 shadow-lg z-[1]',
        // 修复：确保最后一列没有右边框
        header.column.id ===
          header.headerGroup.headers[header.headerGroup.headers.length - 1].column.id &&
          'border-r-0'
      )}
    >
      <div className="flex items-center justify-between h-full">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-sm">
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
        </div>
        {enableDragging && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing flex-shrink-0 ml-2"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
          </button>
        )}
      </div>
    </TableHead>
  );
}

// 修改 DataTable 组件，确保列顺序变化时表格主体也能正确响应
export function DataTable<TData>({
  data,
  columns,
  defaultPageSize = 500,
  pageSizeOptions = [100, 200, 500],
  onPageChange,
  onPageSizeChange,
  onColumnOrderChange,
  enableColumnDragging = false,
  enableVirtualization = false,
  rowHeight = 40,
  containerHeight = 600,
}: DataTableProps<TData>) {
  const [columnOrder, setColumnOrder] = React.useState<string[]>(
    columns.map((column) => column.id as string)
  );
  const [{ pageIndex, pageSize: currentPageSize }, setPagination] = React.useState<PaginationState>(
    {
      pageIndex: 0,
      pageSize: defaultPageSize,
    }
  );

  const pagination = React.useMemo(
    () => ({
      pageIndex,
      pageSize: currentPageSize,
    }),
    [pageIndex, currentPageSize]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      columnOrder, // 确保将 columnOrder 传递给表格状态
    },
    onColumnOrderChange: setColumnOrder, // 添加列顺序变化的回调
    onPaginationChange: (updater) => {
      const newPagination = typeof updater === 'function' ? updater(pagination) : updater;
      setPagination(newPagination);
      onPageChange?.(newPagination.pageIndex);
      onPageSizeChange?.(newPagination.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = columnOrder.indexOf(active.id as string);
    const newIndex = columnOrder.indexOf(over.id as string);
    const newOrder = arrayMove(columnOrder, oldIndex, newIndex);

    // 更新列顺序
    setColumnOrder(newOrder);

    // 调用外部回调
    onColumnOrderChange?.(newOrder);

    // 确保表格状态也更新了列顺序
    table.setColumnOrder(newOrder);
  };

  // 创建一个引用用于同步滚动
  const headerRef = React.useRef<HTMLDivElement>(null);
  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis]}
    >
      <div className="space-y-2">
        <div
          className="rounded-md border border-border shadow-sm overflow-hidden"
          ref={tableContainerRef}
        >
          <div className="relative">
            <div
              ref={headerRef}
              className="w-full overflow-hidden "
              style={{
                backgroundColor: 'var(--background)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <UITable className="w-full border-collapse">
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="flex w-full">
                      <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                        {headerGroup.headers.map((header) => (
                          <TableHeaderCell
                            key={header.id}
                            header={header}
                            enableDragging={enableColumnDragging}
                          />
                        ))}
                      </SortableContext>
                    </TableRow>
                  ))}
                </TableHeader>
              </UITable>
            </div>

            <DataTableBody
              rows={table.getRowModel().rows}
              rowHeight={rowHeight}
              containerHeight={containerHeight}
              enableVirtualization={enableVirtualization}
              columnOrder={columnOrder}
              headerRef={headerRef}
            />
          </div>
        </div>

        {/* 分页组件 - AG Grid 风格 */}
        <div className="bg-muted/20 border border-border rounded-md overflow-hidden">
          <DataTablePagination
            pageIndex={table.getState().pagination.pageIndex}
            pageSize={table.getState().pagination.pageSize}
            pageCount={table.getPageCount()}
            pageSizeOptions={pageSizeOptions}
            onPageChange={(page) => table.setPageIndex(page)}
            onPageSizeChange={(size) => table.setPageSize(size)}
          />
        </div>
      </div>
    </DndContext>
  );
}

// 修改 DataTableBody 组件，确保使用表格的列顺序
// 修改 DataTableBody 组件中的单元格渲染
function DataTableBody<TData>({
  rows,
  rowHeight = 40,
  containerHeight = 400,
  enableVirtualization = false,
  headerRef,
}: DataTableBodyProps<TData>) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  if (!enableVirtualization) {
    return (
      <UITable className="w-full border-collapse">
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow
              key={row.id}
              className={cn(
                'flex w-full hover:bg-muted/30 transition-colors',
                rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/10'
              )}
            >
              {row.getVisibleCells().map((cell, cellIndex) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    'p-3 overflow-hidden text-ellipsis whitespace-nowrap text-sm',
                    // 修复：确保最后一列没有右边框
                    cellIndex < row.getVisibleCells().length - 1 ? 'border-r border-border' : ''
                  )}
                  style={{
                    width: cell.column.getSize(),
                    minWidth: cell.column.getSize(),
                    height: `${rowHeight}px`,
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </UITable>
    );
  }

  // 虚拟列表版本也需要修改
  return (
    <div
      className="w-full relative overflow-auto"
      style={{ height: containerHeight }}
      ref={parentRef}
      onScroll={(e) => {
        if (headerRef?.current) {
          headerRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
        className="min-w-full w-fit"
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={row.id}
              className={cn(
                'absolute left-0 right-0 flex border-b border-border hover:bg-muted/30 transition-colors',
                virtualRow.index % 2 === 0 ? 'bg-background' : 'bg-muted/10'
              )}
              style={{
                height: `${rowHeight}px`,
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
              }}
            >
              {row.getVisibleCells().map((cell, cellIndex) => (
                <div
                  key={cell.id}
                  className={cn(
                    'px-3 py-1 flex items-center overflow-hidden text-ellipsis whitespace-nowrap text-sm',
                    // 修复：确保最后一列没有右边框
                    cellIndex < row.getVisibleCells().length - 1 ? 'border-r border-border' : ''
                  )}
                  style={{
                    width: cell.column.getSize(),
                    minWidth: cell.column.getSize(),
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
