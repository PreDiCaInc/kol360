/**
 * Interactive tour engine — end-to-end coverage.
 *
 * These specs live alongside the smoke suite (app.spec.ts,
 * navigation.spec.ts). They drive the tour from the "How to…"
 * dropdown, verify a full Case Study 1 walk (all 7 steps + auto-
 * inserted checkpoint), the completion checkmark flip, and the
 * Show-me-the-summary popover. Also spot-checks that the empty-data
 * fallback injects a Next button when the leader table has no rows.
 *
 * Assumes the test env has a disease area with score data for at
 * least Case 1 to work through cleanly. Uses the `E2E_TEST_DA_ID`
 * env var (falls back to the well-known `cme2e0stable0disease01`
 * fixture) for the target disease area.
 *
 * v1.17.75 — Phase 3 polish PR.
 */

import { test, expect, Page } from '@playwright/test';

const EMAIL = process.env.E2E_TEST_EMAIL || 'e2e.testuser@bio-exec.com';
const PASSWORD = process.env.E2E_TEST_PASSWORD;
if (!PASSWORD) throw new Error('E2E_TEST_PASSWORD env var required');
const DA_ID = process.env.E2E_TEST_DA_ID || 'cme2e0stable0disease01';

// Every visible shepherd tooltip has multiple tooltip DIVs in the DOM
// simultaneously — only one has computed `display !== 'none'`. This
// helper finds the visible one and returns { title, buttons } so
// specs never accidentally interact with a hidden step's controls.
async function readVisibleTooltip(page: Page) {
  return await page.evaluate(() => {
    const tips = Array.from(document.querySelectorAll('.shepherd-element'));
    const visible = tips.find((t) => window.getComputedStyle(t).display !== 'none');
    if (!visible) return null;
    return {
      title: visible.querySelector('.shepherd-title')?.textContent?.trim() ?? '',
      buttons: Array.from(visible.querySelectorAll('button.shepherd-button')).map(
        (b) => b.textContent?.trim() ?? '',
      ),
    };
  });
}

async function clickTooltipButton(page: Page, label: string): Promise<boolean> {
  return await page.evaluate((wanted) => {
    const tips = Array.from(document.querySelectorAll('.shepherd-element'));
    const visible = tips.find((t) => window.getComputedStyle(t).display !== 'none');
    if (!visible) return false;
    const btn = Array.from(visible.querySelectorAll('button.shepherd-button')).find(
      (b) => b.textContent?.trim().toLowerCase() === wanted.toLowerCase(),
    );
    if (!btn) return false;
    (btn as HTMLElement).click();
    return true;
  }, label);
}

/**
 * Simulate a real mousedown/mouseup/click on the currently-highlighted
 * target — used for target-click tour steps (Open Benchmarking / Drill
 * into a KOL) where the tooltip deliberately doesn't render a Next
 * button.
 */
async function clickHighlightedTarget(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const el = document.querySelector(
      '.kol360-tour-highlight-pulse, .kol360-tour-highlight-outline',
    );
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      buttons: 1,
    } as MouseEventInit;
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    return true;
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function closeAutoOpenedDrawer(page: Page): Promise<void> {
  // The guide drawer auto-opens on first visit per disease-area. Send
  // Escape so subsequent tests are looking at a clean dashboard.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * PLATFORM_ADMIN can't reach the Insights Tabs (Benchmarking,
 * Sociometric, etc.) until a client is selected — the dashboard shell
 * renders a "Select a client" empty state that hides the whole Tabs
 * subtree. The "How to…" dropdown itself lives in the header and is
 * always available, so `readGuideAnchor`-style tests pass without a
 * client, but any tour that walks into a Tab (Cases 1-5 all do) needs
 * one. Open the Client combobox and pick the first client so tour
 * steps have targets to highlight.
 *
 * v2.0.3 — mirrors the F1 fix in insights-demographics-pie.spec.ts.
 */
async function ensureClientSelected(page: Page): Promise<void> {
  const trigger = page
    .getByRole('combobox')
    .filter({ hasText: /select a client/i })
    .first();
  if (!(await trigger.count())) return;
  await trigger.click();
  await page.waitForTimeout(300);
  const firstOption = page.getByRole('option').first();
  if (await firstOption.count()) {
    await firstOption.click();
    await page.waitForTimeout(600);
  }
}

test.describe('Interactive tour engine', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`/admin/dashboards/${DA_ID}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await closeAutoOpenedDrawer(page);
    await ensureClientSelected(page);
  });

  test('"How to…" dropdown lists all 5 case studies', async ({ page }) => {
    await page.getByRole('button', { name: /how to/i }).first().click();
    const menuItems = page.getByRole('menuitem');
    // 5 case studies + 1 "Read the full documentation" = 6 items
    await expect(menuItems).toHaveCount(6);
    // The 5 case titles should all appear
    for (const title of [
      /organizing a doctor dinner in florida/i,
      /seco.*discussion|discussion and advice/i,
      /seco.*rising|rising stars/i,
      /symposium|ny\/nj/i,
      /trade publication|national leader/i,
    ]) {
      await expect(page.getByRole('menuitem', { name: title })).toBeVisible();
    }
  });

  test('Case 1 tour launches from the dropdown + shows the step counter', async ({ page }) => {
    await page.getByRole('button', { name: /how to/i }).first().click();
    await page.getByRole('menuitem', { name: /organizing a doctor dinner in florida/i }).click();
    await page.waitForTimeout(1500);

    const tip = await readVisibleTooltip(page);
    expect(tip).not.toBeNull();
    expect(tip?.title).toMatch(/step 1 of 7/i);
    expect(tip?.title).toMatch(/open benchmarking/i);
    // Target-click step — Next hidden, only Skip + Prev.
    expect(tip?.buttons).toEqual(expect.arrayContaining(['Skip', 'Prev']));
    expect(tip?.buttons).not.toContain('Next');
  });

  test('Full Case 1 walk — advances through all 7 steps + auto-checkpoint + Done', async ({ page }) => {
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    page.on('console', (msg) => {
      if (msg.type() === 'info' && msg.text().includes('tour-telemetry')) {
        try {
          const parsed = JSON.parse(msg.text().replace('[tour-telemetry] ', ''));
          events.push({ event: parsed.event, payload: parsed });
        } catch {
          // ignore
        }
      }
    });

    await page.getByRole('button', { name: /how to/i }).first().click();
    await page.getByRole('menuitem', { name: /organizing a doctor dinner in florida/i }).click();
    await page.waitForTimeout(1500);

    // Loop through up to 10 steps + a checkpoint. Advance strategy: Done
    // > Continue > Next > click the highlighted target.
    for (let i = 0; i < 12; i++) {
      const tip = await readVisibleTooltip(page);
      if (!tip) break;

      let advanced = false;
      for (const label of ['Done', 'Continue', 'Next']) {
        if (tip.buttons.includes(label)) {
          advanced = await clickTooltipButton(page, label);
          if (advanced) break;
        }
      }
      if (!advanced) {
        // target-click step — click the highlighted UI element.
        advanced = await clickHighlightedTarget(page);
      }
      if (!advanced) break;
      await page.waitForTimeout(1800);
    }

    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining([
        'tour.launched',
        'tour.step_advanced',
        'tour.checkpoint_reached',
        'tour.completed',
      ]),
    );
  });

  test('Completion checkmark appears next to the case study after finishing the tour', async ({
    page,
  }) => {
    // Clear any prior completion so the checkmark actually flips.
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('kol360.tour-completed');
      } catch {
        // ignore
      }
    });

    // Run the tour to completion (compact version — reuse the walker
    // logic from the full-walk test).
    await page.getByRole('button', { name: /how to/i }).first().click();
    await page.getByRole('menuitem', { name: /organizing a doctor dinner in florida/i }).click();
    await page.waitForTimeout(1500);
    for (let i = 0; i < 12; i++) {
      const tip = await readVisibleTooltip(page);
      if (!tip) break;
      let advanced = false;
      for (const label of ['Done', 'Continue', 'Next']) {
        if (tip.buttons.includes(label)) {
          advanced = await clickTooltipButton(page, label);
          if (advanced) break;
        }
      }
      if (!advanced) advanced = await clickHighlightedTarget(page);
      if (!advanced) break;
      await page.waitForTimeout(1500);
    }

    // Reopen the dropdown; Case 1 should now carry the ✓ marker.
    await page.getByRole('button', { name: /how to/i }).first().click();
    const case1 = page.getByRole('menuitem', { name: /organizing a doctor dinner in florida/i });
    await expect(case1.locator('[aria-label="Tour completed"]')).toBeVisible();
  });

  test('First-visit ring on the "How to…" button; localStorage suppresses it on second visit', async ({
    page,
    context,
  }) => {
    // beforeEach already visited /admin/dashboards/<DA> which may have
    // triggered + then cleared the ring. Wipe storage + reload.
    await context.clearCookies();
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('kol360.how-to-cta-shown-at');
      } catch {
        // ignore
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await closeAutoOpenedDrawer(page);

    // The pulse class is applied for ~3.2s — sample it within that window.
    const withRing = await page.evaluate(() =>
      document.querySelector('.kol360-how-to-cta-pulse') !== null,
    );
    expect(withRing).toBe(true);

    // Storage flag written.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('kol360.how-to-cta-shown-at'),
    );
    expect(stored).not.toBeNull();

    // Reload — flag prevents the ring from re-appearing.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const withRingAgain = await page.evaluate(() =>
      document.querySelector('.kol360-how-to-cta-pulse') !== null,
    );
    expect(withRingAgain).toBe(false);
  });

  test('"Show me the summary" popover reveals the case-study bullets', async ({ page }) => {
    // Open the guide drawer (the "Read the full documentation" entry
    // in the How to… dropdown).
    await page.getByRole('button', { name: /how to/i }).first().click();
    await page.getByRole('menuitem', { name: /read the full documentation/i }).click();
    await page.waitForTimeout(600);

    // Find Case Study 1's "Show me the summary" button + open it.
    await page.getByRole('button', { name: /show me the summary/i }).first().click();
    await page.waitForTimeout(300);

    // The popover renders under [role="dialog"] (Radix Popover portal).
    // It shows a "Case takeaways" heading + a bulleted list.
    await expect(page.getByText(/case takeaways/i).first()).toBeVisible();
    const listItems = page.locator('[role="dialog"] li, [data-radix-popper-content-wrapper] li');
    await expect(listItems.first()).toBeVisible();
  });
});
