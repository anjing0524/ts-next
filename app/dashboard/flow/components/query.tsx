'use client';

import { useState, useRef, useEffect } from 'react';

import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';

import { FlowStage, useFlowStore } from '@/app/dashboard/flow/store/flow-store';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface QueryProps {
  options: string[];
  onSearch?: (date: Date | null, selectedOptions: string[] | null) => Promise<FlowStage[] | null>;
}

export function Query({ options, onSearch }: QueryProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { setProjects, setStages } = useFlowStore();

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const paramsRef = useRef<{ date: Date; selectedOptions: string[] }>({ date, selectedOptions });

  useEffect(() => {
    paramsRef.current = { date, selectedOptions };
  }, [date, selectedOptions]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 1. 查询逻辑抽离
  const doSearch = async () => {
    if (!onSearch) return;
    const { date, selectedOptions } = paramsRef.current;
    const opts = selectedOptions.length > 0 ? selectedOptions : null;
    setProjects(opts || []);
    const result = await onSearch(date, opts);
    if (result) setStages(result);
  };

  // 2. 用户点击查询
  const handleSearch = async () => {
    setIsLoading(true);
    try {
      // 先清理旧定时器
      if (timerRef.current) clearInterval(timerRef.current);
      // 立即查一次
      await doSearch();
      // 启动定时器
      timerRef.current = setInterval(doSearch, 2000);
    } catch (error) {
      console.error('查询出错:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-4 p-4">
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

      <Button className="h-9" onClick={handleSearch} disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            查询中...
          </>
        ) : (
          '查询'
        )}
      </Button>
    </div>
  );
}
