'use client';

import { useState, useCallback, useEffect } from 'react';
import { Check, ChevronsUpDown, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface KolOption {
  id: string;
  name: string;
  specialty?: string | null;
  state?: string | null;
}

interface KolComboboxProps {
  options: KolOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  onSearchChange: (search: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function KolCombobox({
  options,
  value,
  onValueChange,
  onSearchChange,
  isLoading = false,
  placeholder = 'Search for a KOL...',
  className,
}: KolComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, onSearchChange]);

  const selectedOption = options.find((opt) => opt.id === value);

  const handleSelect = useCallback(
    (id: string) => {
      onValueChange(id === value ? null : id);
      setOpen(false);
      setSearch('');
    },
    [value, onValueChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          {selectedOption ? (
            <span className="truncate">
              {selectedOption.name}
              {selectedOption.specialty && (
                <span className="text-muted-foreground ml-2">
                  - {selectedOption.specialty}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 h-8 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {options.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {isLoading ? 'Loading...' : search ? 'No KOLs found' : 'Type to search'}
            </div>
          ) : (
            <div className="p-1">
              {options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 px-3 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                    value === option.id && 'bg-accent'
                  )}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{option.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.specialty || 'Unknown specialty'}
                      {option.state && ` • ${option.state}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
