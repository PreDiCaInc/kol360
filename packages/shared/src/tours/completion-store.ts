/**
 * TourCompletionStore — swap-safe contract for tracking which tours a
 * user has finished.
 *
 * Phase 1 ships the localStorage impl. Phase 3 can flip to a DB-backed
 * impl via a config flag without touching any tour consumer — the
 * interface is the seam. Both the store AND the completion-checkmark
 * render land in Phase 1 (no dead writes waiting on Phase 3).
 *
 * See docs/findings/insights-use-case-tours-interactive-walkthroughs-2026-07-04.md
 * §"Phasing / Phase 1" and §"Phase 3 / DB-persisted completion".
 */

export interface TourCompletionStore {
  /** True when the user has completed the given tour at least once. */
  isCompleted(tourSlug: string): Promise<boolean>;
  /** Idempotent — safe to call multiple times per tour. */
  markCompleted(tourSlug: string): Promise<void>;
  /** All tours the user has completed, in no particular order. */
  getAllCompleted(): Promise<string[]>;
}

/**
 * Key convention: single top-level array of tour slugs. Small, so we
 * don't fragment localStorage; simple to inspect via devtools.
 *
 * Key namespacing: `kol360.` prefix reserved for tour-related state
 * across the app. Avoid collisions with recharts / other libraries
 * that write into localStorage without namespacing.
 */
const STORAGE_KEY = 'kol360.tour-completed';

export class LocalStorageTourCompletionStore implements TourCompletionStore {
  async isCompleted(tourSlug: string): Promise<boolean> {
    const all = this.readAll();
    return all.includes(tourSlug);
  }

  async markCompleted(tourSlug: string): Promise<void> {
    const all = this.readAll();
    if (all.includes(tourSlug)) return; // idempotent
    all.push(tourSlug);
    this.writeAll(all);
  }

  async getAllCompleted(): Promise<string[]> {
    return this.readAll();
  }

  private readAll(): string[] {
    if (typeof window === 'undefined') return []; // SSR-safe
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Defensive — a hand-edited devtools value could be any shape.
      // Keep only string entries; drop everything else silently.
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      // Malformed JSON in localStorage (very rare — user tampering).
      // Nuking the key is safer than throwing on every drawer render.
      return [];
    }
  }

  private writeAll(all: string[]): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Quota exceeded / disabled storage in some private-browsing
      // modes. Silently drop — completion tracking is nice-to-have,
      // not load-bearing for the tour to function.
    }
  }
}
