'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { FlowStage, useFlowStore } from '@/app/(dashboard)/flow/store/flow-store';

interface QueryProps {
  options: string[];
  onSearch?: (date: Date | null, selectedOptions: string[] | null) => Promise<FlowStage[] | null>;
}

export function Query({ options, onSearch }: QueryProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const { setProjects, setStages } = useFlowStore();

  const handleSearch = async () => {
    if (!onSearch) return;
    // 简化逻辑，直接传递选中的选项
    const selectdOptions = selectedOptions.length > 0 ? selectedOptions : null;
    setProjects(selectdOptions || []);
    const result = await onSearch(date, selectdOptions);
    console.log(result);
    if (result) {
      setStages(result);
    }
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-white rounded-md shadow-sm">
      <div className="flex items-center gap-2">
        <Label className="text-sm whitespace-nowrap">日期:</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-[180px] justify-start text-left font-normal h-9',
                !date && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, 'PPP', { locale: zhCN }) : '选择日期'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(value) => value && setDate(value)}
              initialFocus
              locale={zhCN}
              defaultMonth={date} // 添加这一行，使日历默认显示当前选择的日期所在月份
            />
          </PopoverContent>
        </Popover>
      </div>

      <MultiSelect
        label="项目平台"
        options={options}
        placeholder="选择项目平台"
        onChange={setSelectedOptions}
        className="flex"
      />

      <Button className="h-9" onClick={handleSearch}>
        查询
      </Button>
    </div>
  );
}
