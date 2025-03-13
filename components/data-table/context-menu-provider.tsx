'use client';

import { Menu, Item, Separator, Submenu } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import { Copy, Filter, Download, Clipboard, ArrowUpDown, Settings } from 'lucide-react';

export const MENU_ID = 'data-table-context-menu';

interface ContextMenuProviderProps {
  onCopyRow: (row: unknown) => void;
  onCopyCell: (value: unknown) => void;
  onFilterByValue?: (column: string, value: unknown, type?: string) => void;
  onExportData?: () => void;
  onResetFilters?: () => void;
  onColumnSettings?: () => void;
}

export function ContextMenuProvider({
  onCopyRow,
  onCopyCell,
  onFilterByValue,
  onExportData,
  onResetFilters,
  onColumnSettings,
}: ContextMenuProviderProps) {
  return (
    <Menu id={MENU_ID} animation={false}>
      <Item onClick={({ props }) => onCopyRow(props.row)}>
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4" />
          <span>复制行</span>
        </div>
      </Item>
      <Item onClick={({ props }) => onCopyCell(props.cellValue)}>
        <div className="flex items-center gap-2">
          <Clipboard className="h-4 w-4" />
          <span>复制单元格</span>
        </div>
      </Item>
      <Item
        onClick={({ props }) => {
          navigator.clipboard.writeText(props.row.getValue(props.column.id));
        }}
      >
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4" />
          <span>复制列</span>
        </div>
      </Item>
      {onFilterByValue && (
        <Submenu
          label={
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>筛选</span>
            </div>
          }
        >
          <Item
            onClick={({ props }) => {
              if (props.column && props.cellValue !== undefined) {
                onFilterByValue(props.column, props.cellValue);
              }
            }}
          >
            等于此值
          </Item>
          <Item
            onClick={({ props }) => {
              if (props.column && props.cellValue !== undefined) {
                onFilterByValue(props.column, props.cellValue, 'not');
              }
            }}
          >
            不等于此值
          </Item>
          <Item
            onClick={({ props }) => {
              if (props.column && props.cellValue !== undefined) {
                onFilterByValue(props.column, props.cellValue, 'contains');
              }
            }}
          >
            包含此值
          </Item>
        </Submenu>
      )}
      <Separator />
      {onExportData && (
        <Item onClick={onExportData}>
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span>导出数据</span>
          </div>
        </Item>
      )}
      {onResetFilters && (
        <Item onClick={onResetFilters}>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" />
            <span>重置排序和筛选</span>
          </div>
        </Item>
      )}
      {onColumnSettings && (
        <Item onClick={onColumnSettings}>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>列设置</span>
          </div>
        </Item>
      )}
    </Menu>
  );
}
