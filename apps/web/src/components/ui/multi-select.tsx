'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between h-auto min-h-10', className)}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : selected.length <= 2 ? (
              selected.map((value) => (
                <Badge key={value} variant="secondary" className="text-xs">
                  {value}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary" className="text-xs">
                {selected.length} selected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {selected.length > 0 && (
              <X
                className="h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="max-h-60 overflow-auto p-1">
          {options.map((option) => (
            <div
              key={option}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent',
                selected.includes(option) && 'bg-accent'
              )}
              onClick={() => handleToggle(option)}
            >
              <div
                className={cn(
                  'h-4 w-4 border rounded flex items-center justify-center',
                  selected.includes(option)
                    ? 'bg-primary border-primary'
                    : 'border-input'
                )}
              >
                {selected.includes(option) && (
                  <Check className="h-3 w-3 text-primary-foreground" />
                )}
              </div>
              <span>{option}</span>
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              No options
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
