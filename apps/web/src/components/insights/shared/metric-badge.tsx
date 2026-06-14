'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricBadgeProps {
  label: string;
  value: string;
  color: string;
  /**
   * v1.17.40 — optional methodology tooltip next to the label.
   * Used by the KOL Profile / KOL Explorer "Total Weighted Score" and
   * any future score-block badges so admins can see the formula
   * without leaving the page.
   */
  labelExtra?: ReactNode;
}

export function MetricBadge({ label, value, color, labelExtra }: MetricBadgeProps) {
  return (
    <div className={cn('rounded-xl px-6 py-4 text-white shadow-md', color)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80 flex items-center gap-1">
        <span>{label}</span>
        {labelExtra}
      </div>
      <div className="text-xl font-extrabold mt-1 truncate">{value}</div>
    </div>
  );
}
