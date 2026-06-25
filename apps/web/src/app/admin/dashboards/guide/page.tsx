'use client';

// v1.17.63 — Standalone Insights Use Cases guide page. Same content
// as the side-drawer; this page exists so the guide is bookmarkable
// + deep-linkable (e.g. share a Case Study URL with a teammate).
// Per pteam decision the entry point in the Insights dashboard
// header opens the drawer; this page is the print-friendly /
// full-screen fallback.
// Ticket: docs/findings/insights-use-case-guide-presentation-2026-06-24.md

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button } from '@/components/ui/button';
import { InsightsGuideContent } from '@/components/insights/insights-guide-content';

export default function InsightsGuidePage() {
  return (
    <RequireAuth allowedRoles={['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']}>
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin/dashboards">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboards
            </Button>
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Insights — Use Cases
          </h1>
          <p className="mt-2 text-muted-foreground">
            How to use the Insights dashboards to answer common questions about
            your KOL universe.
          </p>
        </header>

        <InsightsGuideContent />
      </div>
    </RequireAuth>
  );
}
