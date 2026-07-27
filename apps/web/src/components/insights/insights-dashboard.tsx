'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Users, UserCheck, MessageSquare, BookOpen, Play, Check } from 'lucide-react';
import { useSidebarContext } from '@/components/layout/sidebar-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInsightsSummary, useDashboardDiseaseAreas } from '@/hooks/use-insights-report';
import { useClients } from '@/hooks/use-clients';
import { useAuth } from '@/lib/auth/auth-provider';
import { useViewAs } from '@/lib/view-as-context';
import { tourAnchor } from '@kol360/shared';
import { useTourContext } from '@/components/tours/tour-context';
import { CASE_STUDIES } from '@/content/insights-guide/guide-content';

// Tab components
import { IntroductionTab } from '@/components/insights/tabs/introduction-tab';
import { LeaderRankingsTab } from '@/components/insights/tabs/leader-rankings';
import { SociometricSummaryTab } from '@/components/insights/tabs/sociometric-summary';
import { KolExplorerTab } from '@/components/insights/tabs/kol-explorer';
import { DemographicsTab } from '@/components/insights/tabs/demographics-tab';
import {
  InsightsGuideDrawer,
  useInsightsGuideAutoOpen,
} from '@/components/insights/insights-guide-drawer';
import { TabHelpPopover } from '@/components/insights/tab-help-popover';

import '@/components/insights/print-styles.css';

/**
 * "How to..." dropdown — primary entry point for the interactive
 * tour system. Lists every case study whose tour is authored (each
 * launches the walkthrough on click) + a bottom link into the static
 * documentation drawer.
 *
 * Split out as a sibling component so the tour context (which reads
 * completion state from localStorage) mounts lazily — the dashboard
 * shell doesn't pull the tour engine in until the user opens the
 * menu.
 */
// v1.17.75 — one-time first-visit ring around the "How to…" button so
// new users notice it without a disruptive auto-launched modal. Runs
// once per device (localStorage-gated), fades after ~3 seconds, and
// clears the flag immediately if the user clicks the button so the
// ring never fires again for them.
const HOW_TO_RING_STORAGE_KEY = 'kol360.how-to-cta-shown-at';
const HOW_TO_RING_DURATION_MS = 3200;

function HowToMenu({ onOpenGuide }: { onOpenGuide: () => void }) {
  const { startTour, completionStore } = useTourContext();
  const [completed, setCompleted] = useState<string[]>([]);
  const [ringOn, setRingOn] = useState(false);

  // Read + reactively refresh completion state so the ✓ appears the
  // instant a tour finishes.
  useEffect(() => {
    void completionStore.getAllCompleted().then(setCompleted);
  }, [completionStore]);

  // First-visit attention ring — three quick pulses, then dismiss.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(HOW_TO_RING_STORAGE_KEY)) return;
      window.localStorage.setItem(HOW_TO_RING_STORAGE_KEY, String(Date.now()));
    } catch {
      // Private-browsing mode or storage disabled — skip the ring, no
      // point risking a runtime.
      return;
    }
    setRingOn(true);
    const t = window.setTimeout(() => setRingOn(false), HOW_TO_RING_DURATION_MS);
    return () => window.clearTimeout(t);
  }, []);

  const dismissRing = () => {
    if (ringOn) setRingOn(false);
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && dismissRing()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={ringOn ? 'kol360-how-to-cta-pulse' : undefined}
          onClick={dismissRing}
        >
          <Play className="mr-2 h-4 w-4" />
          How to…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Interactive walkthroughs
        </DropdownMenuLabel>
        {CASE_STUDIES.map((cs) => {
          const hasTour = (cs.tour?.length ?? 0) > 0;
          const isDone = completed.includes(cs.slug);
          return (
            <DropdownMenuItem
              key={cs.slug}
              disabled={!hasTour}
              onSelect={() => hasTour && startTour(cs.slug)}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <div className="flex items-center gap-1.5 w-full">
                <span className="font-medium truncate">{cs.title}</span>
                {isDone && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" aria-label="Tour completed" />}
                {!hasTour && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                    coming soon
                  </span>
                )}
              </div>
              {cs.scenario && (
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {cs.scenario}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenGuide}>
          <BookOpen className="mr-2 h-4 w-4" />
          Read the full documentation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface InsightsDashboardProps {
  diseaseAreaId: string;
  onDiseaseAreaChange: (id: string) => void;
  onBack: () => void;
}

export function InsightsDashboard({ diseaseAreaId, onDiseaseAreaChange, onBack }: InsightsDashboardProps) {
  const [activeTab, setActiveTab] = useState('introduction');
  const [selectedKolId, setSelectedKolId] = useState<string | null>(null);

  // v1.17.63 — Insights Use Cases guide. The hook owns the drawer
  // open state + the first-visit auto-open via localStorage. Per-tab
  // ? popovers (TabHelpPopover) call openGuideAt() to deep-link into
  // the right case study.
  const insightsGuide = useInsightsGuideAutoOpen();
  const openGuideAt = useCallback(
    (slug?: string) => {
      insightsGuide.setOpen(true);
      if (slug && typeof window !== 'undefined') {
        // Defer until the drawer has rendered + content has mounted
        // so the anchor target exists. Two RAFs is enough.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = document.getElementById(slug);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }
    },
    [insightsGuide],
  );
  // Insights is analysis-backed: one curated analysis per (client, disease
  // area). PLATFORM_ADMIN must pick a client (no "all"); a cross-client view
  // is a dedicated aggregate-client analysis.
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  // v2.0.3 — deep-link support: `/admin/dashboards/<da>?clientId=<id>`
  // should auto-populate the client picker so bookmarks, shared
  // dashboard links, and emailed reports land on data instead of the
  // "Select a client" empty-state gate. Reads the URL param on mount;
  // only fires when `selectedClientId` is still empty so a user's
  // subsequent picker interaction isn't clobbered by param drift.
  // See docs/findings/prod-rel-5.0.2-post-soak-notes-2026-07-26.md #F6.
  const searchParams = useSearchParams();
  useEffect(() => {
    const urlClientId = searchParams?.get('clientId');
    if (urlClientId && !selectedClientId) {
      setSelectedClientId(urlClientId);
    }
    // Intentionally depend only on searchParams: this effect exists to
    // seed the initial value from the URL, not to keep them in sync
    // afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  // v1.17.21: auto-collapse the sidebar when this dashboard mounts so
  // insights take most of the viewport. Restore the user's prior state
  // on unmount. The sidebar already has a 300ms ease-out transition,
  // so we get the animation free.
  const { collapsed, setCollapsed } = useSidebarContext();
  useEffect(() => {
    const priorCollapsed = collapsed;
    setCollapsed(true);
    return () => setCollapsed(priorCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch clients for PLATFORM_ADMIN client selector
  const { data: clientsData } = useClients();
  const clients = clientsData?.items || [];

  // v1.17.41 — when a PLATFORM_ADMIN picks a client in Insights, surface
  // that client's branding (logo, primaryColor) in the sidebar + brand
  // stripe via the view-as context. Display-only — no impersonation, no
  // API-header change, perms unchanged. Cleared when this dashboard
  // unmounts (the platform admin is back in BioExec-default context).
  const { setViewAs } = useViewAs();
  useEffect(() => {
    if (!isPlatformAdmin) return;
    if (!selectedClientId) {
      setViewAs(null);
      return;
    }
    const selected = clients.find((c) => c.id === selectedClientId);
    if (!selected) return;
    setViewAs({
      id: selected.id,
      name: selected.name,
      logoUrl: selected.logoUrl ?? null,
      primaryColor: selected.primaryColor ?? null,
    });
  }, [isPlatformAdmin, selectedClientId, clients, setViewAs]);
  useEffect(() => {
    return () => setViewAs(null);
  }, [setViewAs]);

  // Fetch disease areas for selector (scoped to user's access)
  const { data: diseaseAreasData } = useDashboardDiseaseAreas();
  const diseaseAreas = diseaseAreasData?.items || [];
  const currentDiseaseArea = diseaseAreas.find((da) => da.id === diseaseAreaId);

  // Determine effective clientId for campaign-scoped data
  // PLATFORM_ADMIN: uses selected client (undefined if "all")
  // CLIENT_ADMIN: uses their own tenantId (always set)
  const effectiveClientId = isPlatformAdmin
    ? (selectedClientId || undefined)
    : user?.tenantId;

  // PLATFORM_ADMIN with no client chosen yet — prompt selection.
  const needsClientSelection = isPlatformAdmin && !selectedClientId;

  // Fetch summary stats
  const { data: summary, isLoading: summaryLoading } = useInsightsSummary(diseaseAreaId, effectiveClientId);

  // Cross-tab KOL navigation: switches to KOL Insights tab and opens profile view
  const handleKolSelect = useCallback((kolId: string) => {
    setSelectedKolId(kolId);
    setActiveTab('total-weighted-score');
  }, []);

  // Reset selected KOL when switching away from KOL Insights tab
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab !== 'total-weighted-score') {
      setSelectedKolId(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Print Header */}
      <div className="print-header print-only">
        <h1>KOL 360 Insights Report</h1>
        <p className="print-date">
          {currentDiseaseArea?.name || 'Disease Area'} - Generated on {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Insights Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive KOL analytics and leader rankings
            </p>
          </div>
        </div>

        {/* Selectors */}
        <div className="flex items-center gap-4">
          {/* Client Selector (PLATFORM_ADMIN only) */}
          {isPlatformAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Client:</span>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select a client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Disease Area Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Disease Area:</span>
            <Select value={diseaseAreaId} onValueChange={onDiseaseAreaChange}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select disease area" />
              </SelectTrigger>
              <SelectContent>
                {diseaseAreas.map((da) => (
                  <SelectItem key={da.id} value={da.id}>
                    {da.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* v1.17.72 — "How to..." dropdown: primary entry to the
              interactive tours. Lists the 5 case studies (each launches
              its walkthrough) with a bottom link that opens the full
              static-screenshot documentation drawer. Replaces the old
              "Use Cases" button (which opened the drawer directly). */}
          <HowToMenu onOpenGuide={() => insightsGuide.setOpen(true)} />
        </div>
      </div>

      {needsClientSelection ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-semibold">Select a client</h3>
            <p className="text-muted-foreground mt-1">
              Insights are scoped to a curated KOL analysis per client &amp;
              disease area. Choose a client above to view its dashboard.
            </p>
          </CardContent>
        </Card>
      ) : !summaryLoading && summary?.notConfigured ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <h3 className="text-lg font-semibold">No analysis configured</h3>
            <p className="text-muted-foreground mt-1">
              There is no KOL analysis for this client &amp; disease area yet.
              Create one and add campaigns in{' '}
              <Link href="/admin/kol-analysis" className="text-blue-600 hover:underline">
                KOL Analyses
              </Link>
              , then recalculate.
            </p>
          </CardContent>
        </Card>
      ) : (
      <>
      {/* v1.17.21: Summary cards reshaped from a vertical (header/value)
          stack to a single-row horizontal layout — icon + label + value
          on one line. Cuts the cards' vertical footprint roughly in
          half so more of the actual content (filters + tabs + charts)
          fits above the laptop fold. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-shadow rounded-xl">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950">
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total KOLs</span>
            <span className="ml-auto text-2xl font-extrabold text-blue-600 dark:text-blue-400">
              {summaryLoading ? '...' : (summary?.totalKols ?? 0).toLocaleString()}
            </span>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 shadow-md hover:shadow-lg transition-shadow rounded-xl">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950">
              <UserCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Respondents</span>
            <span className="ml-auto text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {summaryLoading ? '...' : (summary?.totalRespondents ?? 0).toLocaleString()}
            </span>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-md hover:shadow-lg transition-shadow rounded-xl">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="p-1.5 rounded-md bg-amber-50 dark:bg-amber-950">
              <MessageSquare className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Total Nominations</span>
            <span className="ml-auto text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {summaryLoading ? '...' : (summary?.totalNominations ?? 0).toLocaleString()}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-5 print:hidden h-12">
          <TabsTrigger value="introduction" {...tourAnchor('tab-introduction')}>Introduction</TabsTrigger>
          <TabsTrigger value="demographics" {...tourAnchor('tab-demographics')}>
            Demographics
            <TabHelpPopover tab="Demographics" onOpenGuide={openGuideAt} />
          </TabsTrigger>
          <TabsTrigger value="dynamic-benchmarking" {...tourAnchor('tab-benchmarking')}>
            Benchmarking
            <TabHelpPopover tab="Benchmarking" onOpenGuide={openGuideAt} />
          </TabsTrigger>
          <TabsTrigger value="sociometric-leaders" {...tourAnchor('tab-sociometric-leaders')}>
            Sociometric Leaders
            <TabHelpPopover tab="Sociometric Leaders" onOpenGuide={openGuideAt} />
          </TabsTrigger>
          <TabsTrigger value="total-weighted-score" {...tourAnchor('tab-total-weighted-score')}>
            Total Weighted Score
            <TabHelpPopover tab="Total Weighted Score" onOpenGuide={openGuideAt} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="introduction" className="mt-6">
          <IntroductionTab
            diseaseAreaId={diseaseAreaId}
            onOpenGuide={() => openGuideAt()}
          />
        </TabsContent>

        <TabsContent value="demographics" className="mt-6">
          <DemographicsTab diseaseAreaId={diseaseAreaId} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="dynamic-benchmarking" className="mt-6">
          <LeaderRankingsTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="sociometric-leaders" className="mt-6">
          {/* v1.17.53: dropped the per-category "Sociometric Tables"
              block that used to render below the matrix — those 7 panels
              were a feature-equivalent subset of the Benchmarking tab
              (same useLeaderRankings hook, same component shape) minus
              the filter bar. Customers always had two routes to the same
              data; Benchmarking is the canonical one. */}
          <SociometricSummaryTab diseaseAreaId={diseaseAreaId} onKolSelect={handleKolSelect} clientId={effectiveClientId} />
        </TabsContent>

        <TabsContent value="total-weighted-score" className="mt-6">
          <KolExplorerTab diseaseAreaId={diseaseAreaId} initialKolId={selectedKolId} clientId={effectiveClientId} />
        </TabsContent>
      </Tabs>
      </>
      )}

      {/* v1.17.63 — Insights Use Cases guide drawer. Portals out to
          body so it overlays the dashboard from the right edge.
          Auto-opens on first visit (per-user localStorage flag);
          reachable on demand via the Use Cases button + per-tab ?
          popovers. */}
      <InsightsGuideDrawer
        open={insightsGuide.open}
        onOpenChange={insightsGuide.setOpen}
      />
    </div>
  );
}
