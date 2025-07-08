import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

export interface DataTableProps<TData, TValue> {
  /**
   * The columns definition for the table.
   */
  columns: ColumnDef<TData, TValue>[];

  /**
   * The data for the table.
   */
  data: TData[];

  /**
   * The number of pages in the table.
   */
  pageCount: number;

  /**
   * The pagination state of the table.
   */
  pagination: PaginationState;

  /**
   * Callback for when the pagination state changes.
   */
  onPaginationChange: OnChangeFn<PaginationState>;

  /**
   * The sorting state of the table.
   */
  sorting?: SortingState;

  /**
   * Callback for when the sorting state changes.
   */
  onSortingChange?: OnChangeFn<SortingState>;

  /**
   * The column filters state of the table.
   */
  columnFilters?: ColumnFiltersState;

  /**
   * Callback for when the column filters state changes.
   */
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;

  /**
   * The column visibility state of the table.
   */
  columnVisibility?: VisibilityState;

  /**
   * Callback for when the column visibility state changes.
   */
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;

  /**
   * The row selection state of the table.
   */
  rowSelection?: RowSelectionState;

  /**
   * Callback for when the row selection state changes.
   */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  /**
   * The class name for the container element.
   */
  className?: string;

  /**
   * Whether the table is in a loading state.
   */
  isLoading?: boolean;

  /**
   * Options for page size selection.
   */
  pageSizeOptions?: number[];

  /**
   * Callback for copying a row.
   */
  onCopyRow?: (row: TData) => void;

  /**
   * Callback for copying a cell's value.
   */
  onCopyCell?: (value: unknown) => void;

  /**
   * Callback for filtering by a specific value.
   */
  onFilterByValue?: (column: Column<TData, unknown>, value: unknown, type?: string) => void;

  /**
   * Callback for exporting data.
   */
  onExportData?: () => void;

  /**
   * Callback for resetting filters.
   */
  onResetFilters?: () => void;

  /**
   * Callback for opening column settings.
   */
  onColumnSettings?: () => void;
}
