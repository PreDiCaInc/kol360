'use client';

import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * v1.17.53 — Small (i) button that reveals the underlying survey
 * question text for an Insights chart / leader panel. Used on:
 *
 *   - Benchmarking tab: one per LeaderRankingPanel (powered by
 *     `/insights/:da/nomination-questions`).
 *   - Demographics tab: one per chart card (powered by
 *     `/insights/:da/demographic-questions`).
 *
 * Renders nothing if `text` is undefined or empty — lets callers
 * gate the trigger on data availability without a wrapping ternary.
 *
 * Visual: muted info icon button, hover-darkens. Click opens a
 * popover showing the question text + the campaign it was sourced
 * from. The "Source" line is shown only when `campaignName` is
 * provided.
 */
export interface QuestionInfoPopoverProps {
  text: string | undefined;
  campaignName?: string;
  /** Optional heading shown inside the popover, e.g. "Survey question". */
  title?: string;
  /** Optional tweak to the trigger's size (default: 3.5). */
  iconSize?: number;
  className?: string;
}

export function QuestionInfoPopover({
  text,
  campaignName,
  title = 'Survey question',
  iconSize = 3.5,
  className,
}: QuestionInfoPopoverProps) {
  if (!text) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          className={cn(
            'inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
            className,
          )}
        >
          <Info className={`h-${iconSize} w-${iconSize}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>
        {campaignName && (
          <p className="text-xs text-muted-foreground pt-1.5 border-t border-border/50">
            Source: {campaignName}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
