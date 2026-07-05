'use client';

/**
 * TourProvider — runtime engine for the interactive tour layer.
 *
 * Responsibilities:
 *  - URL-based state (`?tour={slug}&step={N}`) with tampering-safe
 *    validation on read (unknown slug or out-of-range step → silently
 *    stripped, no error).
 *  - Dynamic import of shepherd.js so the ~30KB engine only ships
 *    when a tour actually launches. Zero cost for the ~90% of users
 *    who never engage a tour.
 *  - Auto-inserted checkpoint tooltip between the last 'intro' and
 *    first 'deep-dive' step of the current tour.
 *  - `waitForElement` on every attach — the target's data-tour-id may
 *    not be mounted yet when a step activates (drawer opening, tab
 *    changing, cross-route transition). Timeout per advance mode.
 *  - Missing-anchor graceful degradation: log `tour.anchor_missing`
 *    telemetry, degrade to a text-only fallback tooltip.
 *  - `useReducedMotion` respect (pulse → outline).
 *  - Keyboard: ESC exits, → / Space advances, ← reverses. Shepherd
 *    handles most of this; we wire ESC ourselves because we own the
 *    cancel semantics (need to clear the URL).
 *  - Fires the 7 tour telemetry events from `types.ts` via the
 *    injected TourTelemetry impl.
 *
 * The provider mounts once at the admin-dashboards layout level; every
 * page under `/admin/dashboards/*` reads context via `useTourContext`.
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 */

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  InsightsTab,
  LocalStorageTourCompletionStore,
  LoggingTourTelemetry,
  TourAnchor,
  TourCompletionStore,
  TourTelemetry,
  waitForElement,
  timeoutForAdvanceMode,
  tourAnchorSelector,
  TourStep,
} from '@kol360/shared';
import { CASE_STUDIES, CaseStudy } from '@/content/insights-guide/guide-content';
import { TourContext, TourContextValue } from './tour-context';
import { useReducedMotion } from './use-reduced-motion';

interface TourProviderProps {
  children: ReactNode;
  /**
   * Optional test injection points. Production leaves both undefined
   * and the provider constructs `LocalStorageTourCompletionStore` +
   * `LoggingTourTelemetry`. E2E tests can inject `SpyTourTelemetry`
   * to assert on events.
   */
  completionStore?: TourCompletionStore;
  telemetry?: TourTelemetry;
}

/**
 * Slug → CaseStudy map. Rebuilt on module load (CASE_STUDIES is a
 * static const), not on every render.
 */
const CASE_STUDIES_BY_SLUG = new Map<string, CaseStudy>(
  CASE_STUDIES.map((c) => [c.slug, c] as const),
);

/**
 * Map from `InsightsTab` value (the string used by insights-dashboard's
 * `<Tabs value={activeTab}>`) to its tour anchor id. Used when a step
 * declares a `requiredTab` — the provider clicks that tab for the user
 * before waiting for the step's target anchor.
 *
 * Keeps the mapping in one place so anchor renames stay compile-safe.
 */
const TAB_VALUE_TO_ANCHOR: Record<InsightsTab, TourAnchor> = {
  'introduction': 'tab-introduction',
  'demographics': 'tab-demographics',
  'dynamic-benchmarking': 'tab-benchmarking',
  'sociometric-leaders': 'tab-sociometric-leaders',
  'total-weighted-score': 'tab-total-weighted-score',
};

/**
 * Manual smooth scroll to center an element in the viewport. Uses
 * requestAnimationFrame with easeInOutCubic so users can visually
 * track the page moving — native `behavior: 'smooth'` speed is
 * browser-dependent and often too abrupt on long jumps. Returns when
 * the animation completes (or immediately if the target is already
 * close to centered) so tooltip positioning waits for the scroll.
 */
async function smoothScrollToCenter(el: HTMLElement, durationMs = 900): Promise<void> {
  if (typeof window === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const targetY = window.scrollY + rect.top - (window.innerHeight / 2 - rect.height / 2);
  const startY = window.scrollY;
  const distance = targetY - startY;
  if (Math.abs(distance) < 20) return; // Already close enough — skip.
  const startTime = performance.now();
  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // easeInOutCubic — slow start, fast middle, slow end.
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      window.scrollTo(0, startY + distance * eased);
      if (progress < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/**
 * Ensure the required Insights tab is active before showing a step.
 * If it's already active, no-op. Otherwise finds the TabsTrigger via
 * its tour anchor and simulates a full pointerdown → pointerup → click
 * sequence. HTMLElement.click() alone does NOT work here — Radix UI's
 * TabsTrigger (which shadcn wraps) listens on `onMouseDown`/pointer
 * events, not `onClick`, for pointer-based activation. A plain
 * `.click()` fires the click handler but the tab state never updates.
 */
async function ensureRequiredTabActive(requiredTab: InsightsTab | null | undefined): Promise<void> {
  if (typeof document === 'undefined' || !requiredTab) return;
  const anchor = TAB_VALUE_TO_ANCHOR[requiredTab];
  if (!anchor) return;
  const trigger = document.querySelector<HTMLElement>(tourAnchorSelector(anchor));
  if (!trigger) return;
  // shadcn/Radix Tabs put `data-state="active" | "inactive"` on the trigger.
  if (trigger.getAttribute('data-state') === 'active') return;
  const rect = trigger.getBoundingClientRect();
  const opts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
    buttons: 1,
  } as MouseEventInit;
  // Radix TabsTrigger handles pointerdown / mousedown to activate the
  // tab; the click event is a secondary trigger. Fire the full mouse
  // sequence so both handler shapes fire.
  trigger.dispatchEvent(new MouseEvent('mousedown', opts));
  trigger.dispatchEvent(new MouseEvent('mouseup', opts));
  trigger.dispatchEvent(new MouseEvent('click', opts));
  // Give React two ticks — one for the event handler + state set, one
  // for the resulting re-render + Suspense fallback to resolve.
  await new Promise((r) => setTimeout(r, 150));
}

/**
 * Parse + validate the URL `?tour=&step=` pair. Returns null when
 * unknown slug, missing tour on the case study, or out-of-range step.
 * Never throws — a tampered URL just no-ops.
 */
function readTourFromUrl(
  searchParams: URLSearchParams | null,
): { slug: string; step: number; caseStudy: CaseStudy; steps: TourStep[] } | null {
  if (!searchParams) return null;
  const slug = searchParams.get('tour');
  if (!slug) return null;
  const caseStudy = CASE_STUDIES_BY_SLUG.get(slug);
  if (!caseStudy || !caseStudy.tour || caseStudy.tour.length === 0) return null;
  const stepRaw = searchParams.get('step');
  const step = stepRaw == null ? 0 : Number.parseInt(stepRaw, 10);
  if (!Number.isFinite(step) || step < 0 || step >= caseStudy.tour.length) return null;
  return { slug, step, caseStudy, steps: caseStudy.tour };
}

export function TourProvider({
  children,
  completionStore: completionStoreProp,
  telemetry: telemetryProp,
}: TourProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();

  // Store + telemetry singletons — memoized to survive re-renders.
  const completionStore = useMemo<TourCompletionStore>(
    () => completionStoreProp ?? new LocalStorageTourCompletionStore(),
    [completionStoreProp],
  );
  const telemetry = useMemo<TourTelemetry>(
    () => telemetryProp ?? new LoggingTourTelemetry(),
    [telemetryProp],
  );

  // Live shepherd tour instance — kept in a ref so effects can access
  // the current tour without becoming re-render dependencies.
  const shepherdTourRef = useRef<{ cancel: () => void; complete: () => void } | null>(null);
  // Guard against double-launches (e.g. StrictMode dev remount).
  const launchInFlightRef = useRef<boolean>(false);
  // For `tour.abandoned` telemetry: track last activity + fire on next
  // page-focus if idle > 10 min. Kept simple in Phase 1 (deferred
  // Phase 3+ analytics can improve).
  const lastActivityRef = useRef<number>(Date.now());
  const launchedAtRef = useRef<number>(0);

  // Local mirror of URL state — kept as separate React state so
  // downstream consumers can react to changes without re-parsing URL.
  const [activeTour, setActiveTour] = useState<{ slug: string; step: number } | null>(null);

  // ── URL → local state sync ─────────────────────────────────────────
  useEffect(() => {
    const parsed = readTourFromUrl(searchParams);
    if (!parsed) {
      // URL doesn't describe an active tour. If we thought one was
      // active, cancel + drop local state (user hit Back, or URL was
      // hand-tampered).
      if (activeTour) {
        shepherdTourRef.current?.cancel();
        shepherdTourRef.current = null;
        setActiveTour(null);
      }
      return;
    }
    // URL describes an active tour. If our local state agrees, no-op.
    if (activeTour?.slug === parsed.slug && activeTour.step === parsed.step) return;
    setActiveTour({ slug: parsed.slug, step: parsed.step });
    // Actual shepherd instantiation happens in the launch effect below,
    // which is keyed off `activeTour`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── URL writers ────────────────────────────────────────────────────
  const writeUrl = useCallback(
    (slug: string | null, step: number | null) => {
      // Preserve any other query params (e.g. clientId, filters) — the
      // tour toggle is one of several concerns on this URL.
      const next = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      if (slug == null) {
        next.delete('tour');
        next.delete('step');
      } else {
        next.set('tour', slug);
        next.set('step', String(step ?? 0));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  // ── Shepherd wire-up (dynamic import — code-split) ─────────────────
  useEffect(() => {
    if (!activeTour) return;
    const caseStudy = CASE_STUDIES_BY_SLUG.get(activeTour.slug);
    if (!caseStudy?.tour || caseStudy.tour.length === 0) return;
    if (launchInFlightRef.current) return;
    launchInFlightRef.current = true;

    let cancelled = false;
    let observerCleanup: (() => void) | null = null;

    // Structure: dynamic-import shepherd + its CSS side-by-side, build
    // a Shepherd.Tour with each TourStep translated into a shepherd
    // step config, add a checkpoint tooltip between intro and
    // deep-dive segments, kick off at `activeTour.step`. On cancel /
    // complete, clear the URL + fire telemetry.
    void (async () => {
      // Dynamic import — ~30KB engine only ships when a tour launches.
      // Shepherd's base CSS is imported statically in the layout file
      // so TS resolves cleanly + it's tiny either way. Also pull the
      // offset middleware from Floating UI (which shepherd depends on)
      // so we can push the tooltip further from the highlighted target
      // — the pulse ring needs breathing room.
      const [{ default: Shepherd }, { offset, flip, shift }] = await Promise.all([
        import('shepherd.js'),
        import('@floating-ui/dom'),
      ]);
      if (cancelled) return;

      const tourSteps: TourStep[] = caseStudy.tour!;
      // Where to insert the checkpoint: after the LAST intro step's
      // index. If no intro or no deep-dive, no checkpoint.
      const lastIntroIdx = tourSteps.map((s) => s.segment).lastIndexOf('intro');
      const firstDeepIdx = tourSteps.findIndex((s) => s.segment === 'deep-dive');
      const insertCheckpointAfter =
        lastIntroIdx >= 0 && firstDeepIdx > lastIntroIdx ? lastIntroIdx : -1;

      const shepherdTour = new Shepherd.Tour({
        // v1.17.72 — modal overlay dims the rest of the page and cuts
        // a hole around the highlighted target. The hole is generous
        // so popovers/dropdowns that open from the target (State
        // filter, Respondent Role, etc.) fall within the un-dimmed
        // area rather than getting greyed out.
        useModalOverlay: true,
        defaultStepOptions: {
          cancelIcon: { enabled: true },
          classes: 'kol360-tour-step',
          // Explicitly disable Shepherd's built-in scroll — we do it
          // in beforeShowPromise so we can guarantee the target is
          // centered BEFORE Shepherd positions the tooltip, and so
          // the scroll settles before positioning maths runs.
          scrollTo: false,
          arrow: true,
          // Larger padding + rounded corners give room for popovers to
          // open inside the un-dimmed area.
          modalOverlayOpeningPadding: 8,
          modalOverlayOpeningRadius: 8,
          // Override Floating UI middleware to give the tooltip more
          // breathing room from the target's pulse ring (default is
          // 8px which sits INSIDE our outline-offset:4px + outline:3px
          // + a bit of shadow). 18px leaves the full highlight visible
          // then a comfortable gap before the tip.
          floatingUIOptions: {
            middleware: [
              offset(18),
              flip(),
              shift({ padding: 8 }),
            ],
          },
        },
      });

      const highlightClass = (h: TourStep['highlight']) => {
        if (h === 'none') return '';
        if (h === 'outline' || reducedMotion) return 'kol360-tour-highlight-outline';
        return 'kol360-tour-highlight-pulse';
      };

      // Highlight is applied directly on the target element (shepherd's
      // built-in `classes` config only reaches the tooltip). We DON'T
      // track state — instead, every apply first sweeps the DOM for
      // any lingering highlight from an earlier step. Belt-and-
      // suspenders against Shepherd event-ordering quirks where hide
      // occasionally lags show and leaves the prior target ringed.
      const sweepHighlights = () => {
        if (typeof document === 'undefined') return;
        document
          .querySelectorAll('.kol360-tour-highlight-pulse, .kol360-tour-highlight-outline')
          .forEach((el) => {
            el.classList.remove('kol360-tour-highlight-pulse');
            el.classList.remove('kol360-tour-highlight-outline');
          });
      };
      const applyTargetHighlight = (el: Element | null, step: TourStep) => {
        sweepHighlights();
        if (!el) return;
        const cls = highlightClass(step.highlight ?? 'pulse');
        if (!cls) return;
        el.classList.add(cls);
      };
      const clearTargetHighlight = () => {
        sweepHighlights();
      };

      const activityBump = () => {
        lastActivityRef.current = Date.now();
      };

      const stepIndexToShepherd: number[] = [];

      // Total = real steps + 1 for the checkpoint if inserted, so the
      // counter shown on each tooltip is accurate. Checkpoint uses its
      // own count line so it doesn't need to be in this total.
      const totalUserSteps = tourSteps.length;
      const renderStepCounter = (n: number, total: number) =>
        `<div class="kol360-tour-step-counter">Step ${n} of ${total}</div>`;

      // Factory for the Next/Done button — reused to inject a fallback
      // Next on target-click steps whose anchor is missing (empty data).
      const buildNextButton = (i: number, step: TourStep, selector: string, isLast: boolean) => ({
        text: isLast ? 'Done' : 'Next',
        action() {
          sweepHighlights();
          if (isLast) {
            telemetry.track('tour.completed', {
              tourSlug: activeTour.slug,
              totalSteps: tourSteps.length,
              durationMs: Date.now() - launchedAtRef.current,
            });
            void completionStore.markCompleted(activeTour.slug);
            shepherdTour.complete();
            return;
          }
          telemetry.track('tour.step_advanced', {
            tourSlug: activeTour.slug,
            fromStep: i,
            toStep: i + 1,
            advanceMethod: 'next-button',
          });
          activityBump();
          writeUrl(activeTour.slug, i + 1);
          // For target-click steps, click the target so Shepherd's own
          // advanceOn takes over. If target missing, just manually
          // advance.
          if (step.advanceOn === 'target-click') {
            const target = document.querySelector<HTMLElement>(selector);
            if (target) {
              const rect = target.getBoundingClientRect();
              const opts = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
                button: 0,
                buttons: 1,
              } as MouseEventInit;
              target.dispatchEvent(new MouseEvent('mousedown', opts));
              target.dispatchEvent(new MouseEvent('mouseup', opts));
              target.dispatchEvent(new MouseEvent('click', opts));
              return;
            }
          }
          shepherdTour.next();
        },
      });

      for (let i = 0; i < tourSteps.length; i++) {
        const step = tourSteps[i];
        const selector = tourAnchorSelector(step.target);
        const isLast = i === tourSteps.length - 1;
        // v1.17.72 (Tier 1) — target-click steps hide Next so the user
        // MUST click the actual UI element to advance (muscle memory).
        // Shepherd's own advanceOn handles the transition on click. If
        // the anchor turns out to be missing at show-time (empty data),
        // beforeShowPromise injects a fallback Next so users can still
        // continue.
        const hideNext = step.advanceOn === 'target-click';
        const bodyWithHint = hideNext
          ? `${step.body}<div class="kol360-tour-action-hint">Click the highlighted element to continue.</div>`
          : step.body;

        shepherdTour.addStep({
          id: `step-${i}`,
          title: `${renderStepCounter(i + 1, totalUserSteps)}<span class="kol360-tour-step-title-text">${step.title}</span>`,
          text: bodyWithHint,
          attachTo: { element: selector, on: step.placement ?? 'auto' },
          // Highlight class applies to the TARGET only via
          // applyTargetHighlight; the tooltip just carries the base
          // card class.
          classes: 'kol360-tour-step',
          beforeShowPromise: async () => {
            // v1.17.72 — if the step declares a required Insights tab,
            // programmatically click that tab first so the target
            // anchor mounts. This is what makes the tour a "how to"
            // walkthrough: the app navigates FOR the user rather than
            // instructing them to navigate themselves.
            await ensureRequiredTabActive(step.requiredTab);
            // Wait for the anchor to mount. Timeout tuned per advance
            // mode — cross-route gets 5s, everything else 3s.
            const el = await waitForElement(selector, {
              timeout: timeoutForAdvanceMode(step.advanceOn),
            });
            if (!el) {
              telemetry.track('tour.anchor_missing', {
                tourSlug: activeTour.slug,
                step: i,
                expectedAnchor: step.target,
                timeoutMs: timeoutForAdvanceMode(step.advanceOn),
              });
              // Tier 1 fallback — the anchor's gone (empty data / feature
              // flagged off). If this is a target-click step, Next was
              // hidden; without it the user's only escape is Skip. Inject
              // a Next button so they can continue.
              if (hideNext) {
                const stepInstance = shepherdTour.getById(`step-${i}`);
                if (stepInstance) {
                  const currentButtons =
                    (stepInstance.options.buttons as Array<Record<string, unknown>>) ?? [];
                  stepInstance.updateStepOptions({
                    buttons: [
                      ...currentButtons,
                      buildNextButton(i, step, selector, isLast),
                    ],
                  });
                }
              }
              return;
            }
            // Apply the pulse/outline highlight directly on the target
            // element (Shepherd's step-level `classes` only spray on the
            // tooltip, not the anchor). Ensures the user actually sees
            // which UI element is the tour's next target.
            applyTargetHighlight(el, step);
            // Manually animate scroll to the target — slow easing (900ms)
            // so users visually track the page moving. Native `smooth`
            // varies in speed by browser and is often too abrupt; a
            // controlled animation is more forgiving on long jumps
            // (e.g. Nominations → demographics on the KOL Profile).
            await smoothScrollToCenter(el as HTMLElement, 900);
          },
          advanceOn:
            step.advanceOn === 'target-click'
              ? { selector, event: 'click' }
              : undefined,
          buttons: [
            {
              text: 'Skip',
              classes: 'shepherd-button-secondary',
              action() {
                telemetry.track('tour.skipped', {
                  tourSlug: activeTour.slug,
                  atStep: i,
                  method: 'skip-button',
                });
                shepherdTour.cancel();
              },
            },
            {
              text: 'Prev',
              classes: 'shepherd-button-secondary',
              disabled: i === 0,
              action() {
                sweepHighlights();
                telemetry.track('tour.step_advanced', {
                  tourSlug: activeTour.slug,
                  fromStep: i,
                  toStep: Math.max(0, i - 1),
                  advanceMethod: 'next-button',
                });
                activityBump();
                writeUrl(activeTour.slug, Math.max(0, i - 1));
                shepherdTour.back();
              },
            },
            ...(hideNext ? [] : [buildNextButton(i, step, selector, isLast)]),
          ],
        });
        stepIndexToShepherd.push(shepherdTour.steps.length - 1);

        // Insert checkpoint tooltip between segments — Case Study 1's
        // "You've got the basics" moment.
        if (i === insertCheckpointAfter && insertCheckpointAfter !== -1) {
          shepherdTour.addStep({
            id: 'checkpoint',
            title: `<div class="kol360-tour-step-counter kol360-tour-checkpoint-badge">Checkpoint</div><span class="kol360-tour-step-title-text">You've got the basics</span>`,
            text: 'Continue for a deeper look, or exit and try it yourself.',
            classes: 'kol360-tour-step kol360-tour-checkpoint',
            buttons: [
              {
                text: 'Exit',
                classes: 'shepherd-button-secondary',
                action() {
                  telemetry.track('tour.skipped', {
                    tourSlug: activeTour.slug,
                    atStep: i,
                    method: 'skip-button',
                  });
                  shepherdTour.cancel();
                },
              },
              {
                text: 'Continue',
                action() {
                  sweepHighlights();
                  telemetry.track('tour.checkpoint_reached', {
                    tourSlug: activeTour.slug,
                    checkpointStep: i,
                  });
                  activityBump();
                  shepherdTour.next();
                },
              },
            ],
          });
        }
      }

      // Clear target highlight whenever a step hides (Next / Prev /
      // cancel / complete all fire this). Prevents stale pulses lingering
      // on old targets after the tour moves on.
      shepherdTour.on('hide', () => {
        clearTargetHighlight();
      });

      // Cancel handler: clear URL + drop refs + fire skip telemetry if
      // not already fired from a button click.
      const teardown = () => {
        clearTargetHighlight();
        delete document.body.dataset.tourActive;
        writeUrl(null, null);
        shepherdTourRef.current = null;
        launchInFlightRef.current = false;
        setActiveTour(null);
      };
      shepherdTour.on('cancel', teardown);
      shepherdTour.on('complete', teardown);

      // v1.17.72 — mark the body while a tour is active so CSS can
      // boost portal-rendered popovers (Radix Select / Popover /
      // Dropdown) above the modal overlay. Without this, opening a
      // filter dropdown inside a tour step lands the options BELOW
      // the dimming layer and users can't see or click them.
      document.body.dataset.tourActive = 'true';

      // Announce this tour is live to consumers + start.
      shepherdTourRef.current = {
        cancel: () => shepherdTour.cancel(),
        complete: () => shepherdTour.complete(),
      };
      // If the URL says step 3, start at that shepherd index (accounts
      // for the checkpoint insertion).
      const shepherdStart =
        activeTour.step <= (insertCheckpointAfter === -1 ? Infinity : insertCheckpointAfter)
          ? activeTour.step
          : activeTour.step + 1;
      launchedAtRef.current = Date.now();
      shepherdTour.start();
      if (shepherdStart > 0 && shepherdTour.steps[shepherdStart]) {
        shepherdTour.show(shepherdTour.steps[shepherdStart].id);
      }

      // ESC to exit. Shepherd handles arrow keys / Space itself for
      // Next/Prev where wired via keyboard config, but the cancel
      // semantics belong to us because we own URL cleanup.
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          telemetry.track('tour.skipped', {
            tourSlug: activeTour.slug,
            atStep: activeTour.step,
            method: 'esc',
          });
          shepherdTour.cancel();
        }
      };
      document.addEventListener('keydown', onKey);
      observerCleanup = () => document.removeEventListener('keydown', onKey);
    })();

    return () => {
      cancelled = true;
      if (observerCleanup) observerCleanup();
      shepherdTourRef.current?.cancel();
      shepherdTourRef.current = null;
      launchInFlightRef.current = false;
    };
    // Intentionally NOT depending on writeUrl / telemetry / completionStore —
    // they're refs-ish singletons; re-running this effect would tear down + re-
    // launch shepherd mid-tour every time a parent re-rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTour?.slug]);

  // ── startTour / cancelTour context handlers ────────────────────────
  const startTour = useCallback(
    (slug: string) => {
      const caseStudy = CASE_STUDIES_BY_SLUG.get(slug);
      if (!caseStudy?.tour || caseStudy.tour.length === 0) return;
      telemetry.track('tour.launched', { tourSlug: slug, source: 'button' });
      writeUrl(slug, 0);
    },
    [telemetry, writeUrl],
  );

  const cancelTour = useCallback(() => {
    shepherdTourRef.current?.cancel();
    writeUrl(null, null);
  }, [writeUrl]);

  const value: TourContextValue = useMemo(
    () => ({
      startTour,
      cancelTour,
      isTourActive: activeTour !== null,
      activeTourSlug: activeTour?.slug ?? null,
      activeStepIndex: activeTour?.step ?? null,
      completionStore,
      telemetry,
    }),
    [activeTour, startTour, cancelTour, completionStore, telemetry],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
