'use client';

/**
 * Admin dashboards route-group layout — scoped exclusively to the
 * Insights surface (`/admin/dashboards/*`). Mounts the tour engine
 * here (not at the top-level admin layout) so:
 *   - Non-Insights admin pages (Users, Clients, Campaigns, etc.) don't
 *     pay for the tour engine's context provider render cost.
 *   - The shepherd.js dynamic import only kicks in when a user is
 *     already on Insights (and thus more likely to launch a tour).
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 */

import { ReactNode, Suspense } from 'react';
import { TourProvider } from '@/components/tours/tour-provider';
import 'shepherd.js/dist/css/shepherd.css';
import '@/components/tours/tour-styles.css';

interface Props {
  children: ReactNode;
}

export default function DashboardsLayout({ children }: Props) {
  // Suspense boundary defends against `useSearchParams` bailing the
  // whole subtree out of static rendering in Next.js App Router.
  // TourProvider is a client component and reads searchParams, so
  // wrap it defensively.
  return (
    <Suspense fallback={null}>
      <TourProvider>{children}</TourProvider>
    </Suspense>
  );
}
