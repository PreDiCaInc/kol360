"use client";

import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  SURVEY_SCORE_TOOLTIP,
  COMPOSITE_SCORE_TOOLTIP,
  PER_CATEGORY_SCORE_TOOLTIP,
} from '@kol360/shared';

type ScoreType = 'survey' | 'composite' | 'category';

const TOOLTIP_BY_TYPE: Record<ScoreType, string> = {
  survey: SURVEY_SCORE_TOOLTIP,
  composite: COMPOSITE_SCORE_TOOLTIP,
  category: PER_CATEGORY_SCORE_TOOLTIP,
};

/**
 * v1.17.40 — explainer (i) icon for every score column on Insights
 * surfaces. Pulls text from @kol360/shared/score-methodology so the
 * tooltip and the backend formula are anchored to the same list of
 * counted nomination types.
 *
 * Use:
 *   <th>Survey Score <ScoreTooltip type="survey" /></th>
 */
export function ScoreTooltip({ type }: { type: ScoreType }) {
  const text = TOOLTIP_BY_TYPE[type];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${type} score methodology`}
            data-score-tooltip={type}
            className="ml-1 inline-flex items-center align-middle text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-md whitespace-pre-line text-xs leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
