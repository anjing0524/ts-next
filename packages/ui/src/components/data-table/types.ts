import { Cell, ColumnDef, Header, HeaderGroup, Row } from '@tanstack/react-table';

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  pageSize?: number;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSortChange?: (sortBy: { id: string; desc: boolean }[]) => void;
  onColumnOrderChange?: (columnOrder: string[]) => void;
  enableColumnDragging?: boolean;
  enableVirtualization?: boolean;
  rowHeight?: number;
  containerHeight?: number;
}

export interface TableHeaderCellProps<TData, TValue = unknown> {
  header: Header<TData, TValue>;
  enableDragging?: boolean;
}

export interface DataTableCellProps<TData, TValue = unknown> {
  cell: Cell<TData, TValue>;
}

export interface DataTableHeaderProps<TData> {
  headerGroup: HeaderGroup<TData>;
  enableColumnDragging?: boolean;
  columnOrder: string[];
}

export interface DataTableCellProps<TData, TValue> {
  cell: Cell<TData, TValue>;
}

// 在 DataTableBodyProps 接口中添加 headerRef
export interface DataTableBodyProps<TData> {
  rows: Row<TData>[];
  rowHeight?: number;
  containerHeight?: number;
  enableVirtualization?: boolean;
  columnOrder?: string[];
  headerRef?: React.RefObject<HTMLDivElement | null>; // 添加这一行
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

export interface ColumnOrderState {
  columnOrder: string[];
}
