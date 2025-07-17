'use client';

import { type Table } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { DataTableViewOptions } from './data-table-view-options';
// import { DataTableFacetedFilter } from './data-table-faceted-filter';
// import { priorities, statuses } from '../data/data';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  filterColumn?: string;
}

export function DataTableToolbar<TData>({
  table,
  filterColumn = 'title',
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex flex-1 items-center space-x-2">
        <Input
          placeholder={`Filter by ${filterColumn}...`}
          value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn(filterColumn)?.setFilterValue(event.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        {/* {table.getColumn('status') && (
          <DataTableFacetedFilter
            column={table.getColumn('status')}
            title="Status"
            options={statuses}
          />
        )}
        {table.getColumn('priority') && (
          <DataTableFacetedFilter
            column={table.getColumn('priority')}
            title="Priority"
            options={priorities}
          />
        )} */}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  );
}
