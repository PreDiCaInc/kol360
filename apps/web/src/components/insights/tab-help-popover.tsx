'use client';

// v1.17.63 — small ? info button rendered next to each Insights tab
// label. Clicking it opens a Radix Popover with a one-liner + a
// short bullet list of what the tab is good for + deep-link CTAs into
// the relevant case studies in the guide drawer.
//
// Intentionally NOT a tooltip: tooltips dismiss on hover-out, which
// is hostile when the user wants to click a "See case study" link.
// Popover persists until explicitly closed.
//
// v2.1.0 — this component is now rendered as a positioned SIBLING
// of the surrounding `TabsTrigger` (see `insights-dashboard.tsx`),
// not as a child. Prior versions nested the popover's `<button>`
// inside the tab's `<button>`, which is invalid HTML and caused a
// React 18 hydration bailout on the whole tab bar. Pteam's
// 2026-07-28 diagnostic pinned this as the underlying cause of the
// pie-chart re-render race + `-1/-1` bar-chart warnings. The parent
// now wraps each (tab, popover) pair in a `relative` div; the ?
// icon is visually inside the tab via `absolute` positioning but
// DOM-adjacent to the tab button rather than nested inside it —
// so this file can keep its natural `<button>` trigger without a
// hydration warning.
//
// Ticket: docs/findings/insights-use-case-guide-presentation-2026-06-24.md

import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CASE_STUDIES,
  TAB_HELP,
  type TabHelpEntry,
} from '@/content/insights-guide/guide-content';

interface TabHelpPopoverProps {
  tab: TabHelpEntry['tab'];
  /** Called when the user clicks one of the "See case study →" links —
   *  parent should open the guide drawer scrolled to that anchor. */
  onOpenGuide: (slug?: string) => void;
}

export function TabHelpPopover({ tab, onOpenGuide }: TabHelpPopoverProps) {
  const help = TAB_HELP.find((h) => h.tab === tab);
  if (!help) return null;

  const linkedCases = help.caseStudySlugs
    .map((slug) => CASE_STUDIES.find((c) => c.slug === slug))
    .filter((c): c is (typeof CASE_STUDIES)[number] => !!c);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Defense-in-depth stopPropagation: the parent wrapper is a
          // plain <div>, not a TabsTrigger, so this button no longer
          // sits inside a clickable ancestor — but if a future refactor
          // ever slides it back under something interactive, the guard
          // keeps clicks scoped to the popover trigger.
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Help for ${tab}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-sm">{help.tab}</p>
            <p className="mt-1 text-xs text-muted-foreground">{help.oneLiner}</p>
          </div>

          <ul className="space-y-1 text-xs">
            {help.bullets.map((b) => (
              <li key={b} className="flex items-start gap-1.5">
                <span className="mt-0.5 text-muted-foreground">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {linkedCases.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground">
                See case studies:
              </p>
              <ul className="mt-1 space-y-0.5">
                {linkedCases.map((c) => (
                  <li key={c.slug}>
                    <button
                      type="button"
                      onClick={() => onOpenGuide(c.slug)}
                      className="text-left text-xs text-primary hover:underline"
                    >
                      {c.title} →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => onOpenGuide()}
            className="block w-full text-left text-xs text-primary hover:underline pt-1"
          >
            Open full guide →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
