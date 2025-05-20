'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X, CheckSquare, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MultiSelectProps {
  label: string;
  options: string[];
  placeholder?: string;
  onChange?: (selectedOptions: string[]) => void;
  maxDisplay?: number;
  className?: string;
}

export function MultiSelect({
  label,
  options,
  placeholder = '请选择选项',
  onChange,
  maxDisplay = 2,
  className,
}: MultiSelectProps) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  // 使用 useEffect 监听 selectedOptions 变化并触发 onChange
  useEffect(() => {
    onChange?.(selectedOptions);
  }, [selectedOptions, onChange]);

  // 选择或取消选择一个选项
  const toggleOption = (value: string) => {
    setSelectedOptions((current) => {
      const isSelected = current.includes(value);
      return isSelected ? current.filter((item) => item !== value) : [...current, value];
    });
  };

  // 清除所有选择
  const clearOptions = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOptions([]);
  };

  // 选择全部选项
  const selectAllOptions = () => {
    setSelectedOptions(options);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && <Label className="text-sm whitespace-nowrap">{label}:</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[280px] h-9 justify-between relative"
          >
            <div className="flex-1 flex items-center justify-between overflow-hidden">
              {selectedOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1 max-w-[300px] overflow-hidden">
                  {selectedOptions.length <= maxDisplay ? (
                    selectedOptions.map((option) => (
                      <Badge key={option} variant="secondary" className="mr-1 text-xs py-0 px-2">
                        {option}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-xs py-0 px-2">
                      已选 {selectedOptions.length} 项
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
              <div className="flex items-center gap-1 ml-1">
                {selectedOptions.length > 0 && (
                  <span
                    className="h-5 w-5 p-0 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                    onClick={clearOptions}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">清除</span>
                  </span>
                )}
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </div>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command className="rounded-lg border-none">
            <CommandInput placeholder="搜索选项..." />
            <CommandList>
              <CommandEmpty>未找到结果</CommandEmpty>
              <ScrollArea className="max-h-[300px]">
                <CommandGroup>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-sm text-muted-foreground">选项 ({options.length})</span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={selectAllOptions}
                      >
                        <CheckSquare className="h-3.5 w-3.5 mr-1" />
                        全选
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearOptions(e);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        清空
                      </Button>
                    </div>
                  </div>
                  <CommandSeparator />
                  {options.map((option) => (
                    <CommandItem
                      key={option}
                      onSelect={() => toggleOption(option)}
                      className="flex items-center cursor-pointer hover:bg-slate-50"
                    >
                      <div
                        className={cn(
                          'mr-2 flex h-4 w-4 items-center justify-center rounded border',
                          selectedOptions.includes(option)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted'
                        )}
                      >
                        {selectedOptions.includes(option) && (
                          <Check className="h-3 w-3" strokeWidth={3} />
                        )}
                      </div>
                      <span>{option}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </ScrollArea>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
