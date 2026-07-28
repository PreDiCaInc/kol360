# prod-rel-5.0.3 — Soak Checks (v2.0.3)

Tag at the merge commit on `main`. Closes the prod-rel-5.0.2 post-soak
punch-list end-to-end (1 P1 + 4 P3s; F3 informational skipped).
**No migrations** in this release. Pie-chart mount path is the only
runtime code path that moved — everything else is e2e / hook / URL-init
only.

---

## On pull, run

Nothing. No deps changed, no pretest hooks changed. Skip
`pnpm install`, skip `npx playwright install`, skip `npx prisma
generate`. `git pull` is sufficient.

---

## Phase A — Version deployed

### A1. Version returned by `/health`

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "2.0.3", ... }
```

If the version doesn't flip within ~5 min of merge, trigger a manual
deploy per the `tdct` runbook.

There are **no migrations** to verify — skip the `_prisma_migrations`
query.

---

## Phase B — Insights Demographics Respondent Role pie renders (F5, the P1)

**This is the primary green gate for the release.** The bug is 100%
first-paint measurement race, so the check is: cold navigation → tab
click → pie must show up. Do this on a real data-rich (client, DA)
pair — pteam used Sun Pharma / Dry Eye during the 7-26 diagnostic
(778 completed responses, 756 with roles). Any client with > ~50
respondents on Demographics is fine.

### B1. Fresh browser session — first-visit pie render

1. Open a NEW incognito / private tab (or clear site data on
   `kol360.bio-exec.com`).
2. Log in as any PLATFORM_ADMIN.
3. Navigate to Insights Dashboard → pick a real client → pick a
   data-rich disease area.
4. Click the **Demographics** tab.
5. **Green gate:** the "Respondent Role" pie card renders a colored
   donut with legend and hover tooltips within ~2s. No blank white
   area between the toggle and the legend.
6. Simultaneously, open browser devtools console. **Zero** occurrences
   of Recharts' `width(-1) and height(-1)` warning is the ideal
   signal. If the warning appears once but the pie still renders,
   that means the mount-key remount fired (working as designed —
   Recharts logs the failed first mount, then the observer bumps
   `mountKey` and the second mount succeeds).

If the pie is still blank on this path: **rollback trigger.** The
mount-key hook didn't fire (browser without `ResizeObserver` support
— shouldn't happen on any target browser today, but check console for
`typeof ResizeObserver === 'undefined'` messaging), OR the wrapper
`<div>` never received a non-zero width (parent still measures 0).
Capture a Recharts console dump + a `document.querySelector('.recharts-responsive-container').getBoundingClientRect()`
snapshot before rolling back so dev has diagnostic data.

### B2. Chart ↔ Table toggle round-trip

The bug's recovery-path regression from 4.1.56 was that Chart → Table
→ Chart did NOT restore the pie (Table view was the only user
workaround). Verify the toggle cycle now works.

1. On the same tab from B1, click the **Table** toggle on the
   Respondent Role card. A tabular view should render.
2. Click **Chart** to flip back. The pie should re-render (this
   remount was already working on 4.1.56 — it's the FIRST mount that
   was broken — but verify anyway).
3. Also verify the **Topics Distribution** pie card (further down the
   Demographics tab) renders on both the first-visit path and the
   toggle round-trip. Same fix covers both card sites.

### B3. Cross-tab navigation → back-to-Demographics

Verify the mount-key resets correctly on the tab-hidden / tab-visible
cycle.

1. On Demographics, click over to **Benchmarking** (Radix TabsContent
   unmounts Demographics).
2. Click back to **Demographics** — pie should re-render fresh, no
   blank state.

If pie is blank on this repeat mount: the latch reset isn't firing;
report to dev with a Recharts console dump before rollback.

---

## Phase C — E2E web specs (F1 + F2)

Both fixed specs live in `e2e/web/`. Run against prod (vanity domain,
not the raw App Runner URL — see F3 skip).

```bash
cd e2e
E2E_WEB_URL=https://kol360.bio-exec.com \
E2E_TEST_PASSWORD=<from .env> \
npx playwright test web/insights-demographics-pie.spec.ts web/tour.spec.ts 2>&1 | tail -60
```

**Path C1 (expected, green):**
- `insights-demographics-pie.spec.ts` — both tests pass. The
  `ensureClientSelected` fallback in `beforeEach` unsticks the client
  gate (F1), and F5's ResizeObserver-driven remount lets the SVG-size
  assertion in the first test find non-zero dimensions.
- `tour.spec.ts` — all 6 tests pass. The new locator
  `/organizing a doctor dinner in florida/i` matches exactly 1
  menuitem (F2); the mirrored `ensureClientSelected` in `beforeEach`
  lets Case 1 tour reach the Benchmarking tab.

**Path C2 (contingency):** if either spec fails, the failure output
tells you which fix regressed:

- Pie spec times out on `getByRole('tab', {name:/demographics/i})` →
  client-select fallback didn't fire (F1 gap). Check the picker's
  accessible-name text ("Select a client…") matches the regex the
  helper filters on.
- Pie spec finds SVG but width/height ≤ 100 → F5 fix didn't ship or
  the ResizeObserver didn't fire (report as rollback candidate; grab
  the Playwright trace).
- Tour spec fails on `strict-mode violation` — locator change didn't
  ship; verify tour.spec.ts contains no `/florida|dinner in florida/i`
  occurrences (`grep -c 'florida|dinner in florida' e2e/web/tour.spec.ts`
  should be `0`).

---

## Phase D — Deep-link `?clientId=` auto-populates picker (F6)

Verify the URL param wires into the client picker on mount.

1. Grab a real client id from the picker — click through it once,
   then look at the URL bar (nothing appears there today; the picker
   doesn't push clientId into the URL) OR pick one from `/admin/clients`
   list.
2. Construct a URL: `https://kol360.bio-exec.com/admin/dashboards/<da>?clientId=<clientId>`
3. Open in an incognito tab, log in.
4. **Green gate:** client picker shows the selected client's name (not
   "Select a client…"), and the dashboard renders data (not the
   empty-state gate). All tabs (Introduction, Demographics, Benchmarking,
   etc.) are visible + clickable.

For an e2e-fixture-style repro, `?clientId=cme2e0test0client00001` on
test env should populate to "E2E Test Pharma".

**If picker stays on "Select a client…":** F6 fix didn't ship; check
`insights-dashboard.tsx` for the `useSearchParams` import + effect.

---

## Phase E — 24h light watch

Very low bar — no new endpoints, no new persisted state, no schema.

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for:
- Any unexpected client-side error-signature spike on
  `/admin/dashboards/*` (React errors, Recharts warnings, unhandled
  promise rejections). Baseline is ~0 today. F5's `ResizeObserver`
  path is well-supported (Chrome ≥64 / Safari ≥13.1 / Firefox ≥69),
  but if a customer is on a very old browser + the observer isn't
  available, the fallback is "no remount happens, pie stays exactly
  as it was on v2.0.2" (broken on that browser only).
- Any customer report of "the pie is still blank." Report immediately
  for dev — F5 has zero user-facing workaround if the fix didn't take.

No new API endpoints; API error baseline should remain flat.

---

## Rollback gate

Roll back if any of the following fail:

- **A1** — `/health` doesn't return 2.0.3 within the deployment window
  → App Runner issue; check CloudWatch + redeploy or revert the tag.
- **B1 (P1 gate)** — Respondent Role pie renders blank on fresh browser
  session → F5 regression not fixed on prod; roll back so users have
  the same broken-but-known state as 5.0.2 (Table view workaround
  remains).
- **C1 (test gate)** — either e2e spec times out with a NEW failure
  mode (not the pre-fix `strict-mode violation` or `getByRole tab
  not visible`) → something else regressed in the release; investigate
  before deciding.

**Rollback shape:** revert the PR on `main` → App Runner auto-redeploys
to v2.0.2. No schema to unwind, no infra state to unwind.

---

## See also

- Handoff: [`prod-rel-5.0.3-handoff.md`](prod-rel-5.0.3-handoff.md)
- Source finding doc: [`docs/findings/prod-rel-5.0.2-post-soak-notes-2026-07-26.md`](../docs/findings/prod-rel-5.0.2-post-soak-notes-2026-07-26.md)
- Original pie-chart fix (regressed): [`prod-rel-4.1.56-handoff.md`](prod-rel-4.1.56-handoff.md)
