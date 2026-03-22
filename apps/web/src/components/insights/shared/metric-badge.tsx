'use client';

import { cn } from '@/lib/utils';

interface MetricBadgeProps {
  label: string;
  value: string;
  color: string;
}

export function MetricBadge({ label, value, color }: MetricBadgeProps) {
  return (
    <div className={cn('rounded-xl px-6 py-4 text-white shadow-md', color)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-xl font-extrabold mt-1 truncate">{value}</div>
    </div>
  );
}
