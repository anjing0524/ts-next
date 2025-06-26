'use client';


import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface DataTablePaginationProps {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

// 修改分页组件，解决图标遮挡和文本换行问题
export function DataTablePagination({
  pageIndex,
  pageSize,
  pageCount,
  pageSizeOptions = [10, 20, 30, 40, 50],
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  return (
    <div className="flex flex-wrap md:flex-nowrap items-center justify-between px-4 py-2 border-t gap-2">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <p className="text-sm text-muted-foreground">每页</p>
        <Select
          value={`${pageSize}`}
          onValueChange={(value) => {
            onPageSizeChange(Number(value));
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder={pageSize} />
          </SelectTrigger>
          <SelectContent side="top" align="start">
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={`${size}`}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">条</p>
      </div>
      <div className="flex items-center space-x-2 flex-wrap md:flex-nowrap gap-2">
        <Button
          variant="outline"
          className="h-8 px-2 text-sm"
          onClick={() => onPageChange(0)}
          disabled={pageIndex === 0}
        >
          首页
        </Button>
        <Button
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(pageIndex - 1)}
          disabled={pageIndex === 0}
        >
          <span className="sr-only">上一页</span>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-[120px] items-center justify-center text-sm font-medium whitespace-nowrap">
          {pageIndex * pageSize + 1}-{Math.min((pageIndex + 1) * pageSize, pageCount * pageSize)}{' '}
          条，共 {pageCount * pageSize} 条
        </div>
        <Button
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(pageIndex + 1)}
          disabled={pageIndex === pageCount - 1}
        >
          <span className="sr-only">下一页</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          className="h-8 px-2 text-sm"
          onClick={() => onPageChange(pageCount - 1)}
          disabled={pageIndex === pageCount - 1}
        >
          末页
        </Button>
      </div>
    </div>
  );
}
