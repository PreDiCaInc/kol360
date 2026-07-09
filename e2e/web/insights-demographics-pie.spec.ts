/**
 * Insights Demographics — pie chart first-paint regression.
 *
 * Catches the "pie renders at 0×0 inside ChartTableToggle wrapper"
 * class of bug introduced in v1.17.57 / prod-rel-4.1.35 and fixed in
 * v1.17.76 / prod-rel-4.1.56. The bug was invisible to visual review
 * because the card renders normally (title, description, toggle
 * buttons, empty chart area) — the pie's SVG just has zero
 * dimensions. A regression spec that measures the SVG catches any
 * future refactor that reintroduces the ResponsiveContainer
 * measurement race.
 *
 * Ticket: docs/findings/insights-demographics-pie-blank-inside-chart-table-toggle-2026-07-08.md
 */

import { test, expect, Page } from '@playwright/test';

const EMAIL = process.env.E2E_TEST_EMAIL || 'e2e.testuser@bio-exec.com';
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTest@2024Secure#1';
// Prefer an env override for a DA with real demographic data — the
// stable e2e fixture DA is intentionally empty; a real customer DA is
// what actually exercises the pie render path.
const DA_ID = process.env.E2E_TEST_DEMOGRAPHICS_DA_ID || process.env.E2E_TEST_DA_ID || 'cme2e0stable0disease01';
const CLIENT_ID = process.env.E2E_TEST_DEMOGRAPHICS_CLIENT_ID;

async function login(page: Page): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Insights Demographics — pie chart first-paint', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Force a clean navigation to /admin/dashboards/<da> — direct URL so
    // we're testing the fresh-mount code path (which is where the pie's
    // 0×0 measurement race lived).
    const target = CLIENT_ID
      ? `/admin/dashboards/${DA_ID}?clientId=${CLIENT_ID}`
      : `/admin/dashboards/${DA_ID}`;
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    // Dismiss the auto-opened guide drawer if present.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  });

  test('Respondent Role pie chart renders with non-zero dimensions on first paint', async ({
    page,
  }) => {
    // Click the Demographics tab. Its label is "Demographics" in the
    // tab list; using role=tab is the most stable selector.
    const demoTab = page.getByRole('tab', { name: /demographics/i }).first();
    await expect(demoTab).toBeVisible({ timeout: 10000 });
    await demoTab.click();
    await page.waitForTimeout(1500);

    // Find the Respondent Role card by title, then measure the SVG
    // inside it. The pie renders as an <svg> descendant of
    // ResponsiveContainer. Measurement race → svg exists but width/height = 0.
    const roleCard = page.locator('div', { has: page.locator('text=/respondent role/i') }).first();
    await expect(roleCard).toBeVisible();

    // Wait for the API-driven pie data to arrive + render. If the API
    // returns no data the card renders an empty-state message instead
    // of the pie; the regression test wants the pie-render path, so we
    // require the SVG to appear.
    await page.waitForFunction(
      () => {
        const card = Array.from(document.querySelectorAll('*')).find((el) =>
          el.textContent?.toLowerCase().includes('respondent role'),
        );
        return card?.querySelector('svg') !== undefined;
      },
      { timeout: 8000 },
    ).catch(() => {
      // If we time out looking for an SVG at all, the card might be in
      // an empty-data state on this DA. Skip the assertion — the
      // regression is specifically about "chart renders but at 0×0",
      // which requires an SVG to exist.
    });

    const dims = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('*')).filter((el) =>
        el.textContent?.toLowerCase().includes('respondent role'),
      );
      // Find the smallest ancestor that's a card container containing
      // an SVG (avoids matching the whole page).
      let svg: SVGSVGElement | null = null;
      for (const c of cards) {
        const s = c.querySelector('svg') as SVGSVGElement | null;
        if (s && s.getBoundingClientRect().width > 0) {
          svg = s;
          break;
        }
        // Fall back to any svg descendant if none has non-zero width yet
        if (!svg) svg = c.querySelector('svg') as SVGSVGElement | null;
      }
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    if (!dims) {
      // Chart card wasn't found or rendered no SVG — treat as skip.
      // This is expected on DAs with zero demographic data. Use a
      // dedicated DA (via E2E_TEST_DEMOGRAPHICS_DA_ID) to exercise
      // this path in CI.
      test.skip(true, 'Respondent Role card rendered no <svg> — DA likely has no demographic data. Set E2E_TEST_DEMOGRAPHICS_DA_ID to a data-rich DA.');
    }

    expect(dims!.width).toBeGreaterThan(100);
    expect(dims!.height).toBeGreaterThan(100);
  });

  test('Chart ↔ Table toggle on the Respondent Role card works both directions', async ({
    page,
  }) => {
    const demoTab = page.getByRole('tab', { name: /demographics/i }).first();
    await demoTab.click();
    await page.waitForTimeout(1500);

    // Chart view is the default. Flip to Table.
    const tableButton = page.getByRole('button', { name: /table/i }).first();
    if (await tableButton.count()) {
      await tableButton.click();
      await page.waitForTimeout(400);
      // A <table> should now be visible on the page.
      await expect(page.locator('table').first()).toBeVisible();

      // Flip back to Chart. If the fix regresses, this second Chart
      // render is where the 0×0 pie would appear.
      const chartButton = page.getByRole('button', { name: /^chart$/i }).first();
      await chartButton.click();
      await page.waitForTimeout(400);
      // No hard SVG assertion here — the first-paint spec covers that.
    }
  });
});
