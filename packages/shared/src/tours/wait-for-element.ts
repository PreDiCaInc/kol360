/**
 * waitForElement — bounded DOM wait for a tour anchor to appear.
 *
 * The load-bearing helper for cross-route + Suspense-boundary
 * transitions. When Next.js App Router transitions between routes
 * (e.g. Benchmarking → KOL Profile drill in Case 1 Deep dive), the
 * new page's Suspense boundaries render loading states before the
 * target element mounts. Attaching a tooltip synchronously on route
 * change misses the target and the tour silently breaks.
 *
 * Uses `MutationObserver` when available (subtree-scoped, cheap on
 * modern browsers) and falls back to `setTimeout` polling. Bounded by
 * caller-supplied timeout; caller decides fallback behavior
 * (typically: log `tour.anchor_missing`, degrade to static screenshot
 * link, advance to next step's Next control).
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 * §"Architecture / 4. Cross-tab and cross-route handling —
 * waitForElement() is load-bearing".
 */

export interface WaitForElementOptions {
  /**
   * Max wait, in ms, before returning null. Callers typically use:
   *   - 3000 for same-page / tab-change transitions
   *   - 5000 for route-change transitions (cold App Runner + slow
   *     network can burn the first few seconds on the RSC roundtrip)
   */
  timeout?: number;
  /**
   * Poll interval for the setTimeout-based fallback (unused when
   * MutationObserver path is available). Kept small so short-timeout
   * calls don't miss a fast-appearing element by one tick.
   */
  poll?: number;
}

/**
 * Resolve when a matching element appears in the DOM, or null when
 * the timeout expires. Safe to call server-side (returns null
 * immediately when `document` is undefined).
 */
export async function waitForElement(
  selector: string,
  { timeout = 3000, poll = 50 }: WaitForElementOptions = {},
): Promise<Element | null> {
  if (typeof document === 'undefined') return null;

  // Fast path — already in the tree.
  const existing = document.querySelector(selector);
  if (existing) return existing;

  // MutationObserver path — cheaper than polling on modern browsers.
  // We watch document.body's subtree since tour anchors can appear
  // anywhere in the render output (dashboard tabs, drawer, dialog).
  if (typeof MutationObserver !== 'undefined') {
    return new Promise<Element | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          if (timer) clearTimeout(timer);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // setTimeout polling fallback — older environments or JSDOM without
  // full MutationObserver support.
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, poll));
  }
  return null;
}

/**
 * Timeout tuned per advance mode. `route-change` gets the longer
 * window; everything else uses the same-page default. Kept as a helper
 * so the tuning lives in one place and can be revisited in Phase 3 if
 * telemetry says the 5s cross-route window is still too short.
 */
export function timeoutForAdvanceMode(
  advanceOn: 'next-button' | 'target-click' | 'tab-change' | 'route-change' | undefined,
): number {
  // v1.17.72 — tighter defaults so a missing anchor doesn't stall the
  // tour with a 3+s silent gap between tooltip transitions. If the
  // required element hasn't rendered in ~1s after a tab switch it's
  // almost certainly missing entirely (empty data / feature-flagged
  // off), and we're better off surfacing the tooltip immediately than
  // stalling. Route-change gets a longer window for cross-page
  // navigation + Suspense.
  return advanceOn === 'route-change' ? 3000 : 1000;
}
