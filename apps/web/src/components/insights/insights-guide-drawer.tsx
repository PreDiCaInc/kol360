'use client';

// v1.17.63 — Side-drawer wrapper around InsightsGuideContent. Opens
// from the "Use Cases" button in the Insights dashboard header.
// Drawer takes the right side of the viewport (up to 720px wide); the
// dashboard stays usable on the left so users can read steps + perform
// them in the same browser window without losing context.
//
// Also handles the first-visit auto-open behavior via localStorage:
// users who land on /admin/dashboards/* for the first time see the
// drawer pop once. Dismissing it records a flag so it never re-fires.
// Ticket: docs/findings/insights-use-case-guide-presentation-2026-06-24.md

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { InsightsGuideContent } from './insights-guide-content';

const SEEN_STORAGE_KEY = 'kol360.insightsGuideSeenAt';

interface InsightsGuideDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InsightsGuideDrawer({ open, onOpenChange }: InsightsGuideDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-start justify-between pr-8">
            <div>
              <SheetTitle>Insights — Use Cases</SheetTitle>
              <SheetDescription>
                Worked examples + practice scenarios. Read here, click around in
                the dashboard on the left.
              </SheetDescription>
            </div>
            <Link href="/admin/dashboards/guide" target="_blank" rel="noopener">
              <Button variant="ghost" size="sm" className="shrink-0">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Open full page
              </Button>
            </Link>
          </div>
        </SheetHeader>
        <SheetBody>
          <InsightsGuideContent />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Hook that owns the drawer-open state + the first-visit auto-open
 * behavior. Call once at the top of the Insights dashboard.
 *
 * Returns:
 *   - open: current drawer open state (bind to InsightsGuideDrawer)
 *   - setOpen: imperative setter (wire up "Use Cases" button)
 *   - hasBeenSeen: true once the user has dismissed the drawer at
 *     least once. UI can use this to decide whether to autoshow
 *     follow-up nudges elsewhere (we don't today).
 */
export function useInsightsGuideAutoOpen() {
  const [open, setOpen] = useState(false);
  const [hasBeenSeen, setHasBeenSeen] = useState<boolean | null>(null);

  // Read the seen flag once on mount. Auto-open the drawer if absent.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(SEEN_STORAGE_KEY);
    } catch {
      // localStorage might be unavailable (incognito + storage blocked).
      // Treat as "already seen" — don't autopop in that case.
      setHasBeenSeen(true);
      return;
    }
    if (stored) {
      setHasBeenSeen(true);
    } else {
      setHasBeenSeen(false);
      setOpen(true);
    }
  }, []);

  // Record the dismissal when the drawer closes for the first time.
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next && !hasBeenSeen) {
      try {
        window.localStorage.setItem(SEEN_STORAGE_KEY, new Date().toISOString());
      } catch {
        // ignore — we just lose the persistence, not the behavior
      }
      setHasBeenSeen(true);
    }
  }, [hasBeenSeen]);

  return { open, setOpen: handleOpenChange, hasBeenSeen };
}
