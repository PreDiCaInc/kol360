# prod-rel-5.0.4 — Soak Checks (v2.0.4)

Tag at the merge commit on `main`. This is a hotfix on top of 5.0.3
— the 5.0.3 pie-chart fix compiled and ran but didn't fire on the
real async data path. 5.0.4 swaps the pie to inline SVG (no Recharts
for this one component). See handoff for the post-mortem.

**No migrations.** One TS file rewritten.

---

## On pull, run

Nothing. TS-only change. Skip `pnpm install`, skip
`npx playwright install`, skip `npx prisma generate`.

---

## Phase A — Version deployed

### A1. Version returned by `/health`

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "2.0.4", ... }
```

If the version doesn't flip within ~5 min of merge, trigger a manual
deploy per the `tdct` runbook.

There are **no migrations** to verify — skip the `_prisma_migrations`
query.

---

## Phase B — Insights Demographics Respondent Role pie renders (the P1 gate)

**This is the primary green gate.** Do this on a real data-rich
(client, DA) pair — Sun Pharma / Dry Eye works (778 completed
responses).

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

**How to confirm the swap actually shipped (not the old Recharts
version cached in a browser somewhere):** open browser devtools →
Elements panel → find the pie card → inspect its DOM. On 5.0.4 you
should see:

- A plain `<svg viewBox="0 0 240 240" ...>` element
- Direct `<path>` children of the SVG (one per slice) with `fill`
  set to the slice color
- Each `<path>` has a `<title>` child for hover text
- **Absent:** any `.recharts-wrapper`, `.recharts-responsive-container`,
  `.recharts-surface`, or Recharts-generated `<g>` grouping classes

If you see Recharts classes on the pie card, the deploy did not take
— cache-busting reload or check App Runner status.

**Contrast with 5.0.3 (the failure mode):** on 5.0.3 the pie card had
Recharts DOM (`.recharts-responsive-container` wrapper, nested `<g>`
groups) but the inner `<svg>` measured 0×0 and rendered blank. On
5.0.4 there is no Recharts DOM for the pie at all — the SVG is
authored by hand and cannot be blank unless the data array is empty.

If the pie is still blank on this path with data present: **rollback
trigger.** Capture the pie card's outerHTML from devtools before
rolling back so dev has the DOM state.

### B2. Hard refresh (F5)

The primary complaint that motivated this hotfix. On 5.0.3, F5 on the
Demographics tab reproduced the blank pie every time.

1. On the same Demographics tab, hit F5 (or Cmd+R).
2. **Green gate:** pie re-renders on the F5-reloaded page.

### B3. Chart ↔ Table toggle round-trip

1. Click the **Table** toggle on the Respondent Role card. Tabular
   view renders.
2. Click **Chart** to flip back. Pie re-renders. (This should be
   instant on 5.0.4 — no lifecycle, no observer, just a re-render.)
3. Also verify the **Topics Distribution** pie card renders on both
   the first-visit path and the toggle round-trip.

### B4. Cross-tab navigation → back to Demographics

1. On Demographics, click over to **Benchmarking**.
2. Click back to **Demographics** — pie re-renders fresh, no blank
   state.

If pie is blank on this repeat mount: unexpected — the inline SVG has
no mount-timing dependency. Report to dev with the pie card's
outerHTML before rollback.

### B5. KOL Explorer specialty pie (free ride, same component)

The same `PieDistributionChart` is used by the KOL Explorer specialty
distribution card. Verify it also renders as inline SVG (same DOM
signature as B1: plain `<svg viewBox="0 0 240 240">` with direct
`<path>` children, no Recharts classes).

---

## Phase C — E2E web spec

The `insights-demographics-pie.spec.ts` first-paint test — note this
spec was written against the Recharts DOM. On 5.0.4 the SVG shape
changed (no Recharts wrapper). The spec may need updating; check
whether it still passes as-is.

```bash
cd e2e
E2E_WEB_URL=https://kol360.bio-exec.com \
E2E_TEST_PASSWORD=<from .env> \
npx playwright test web/insights-demographics-pie.spec.ts --reporter=line 2>&1 | tail -20
```

**Expected:** if the spec asserts on `.recharts-*` classes, it will
fail — not a regression, just an assertion that no longer matches the
new DOM. Report to dev; the spec should be updated to look for
`svg[viewBox="0 0 240 240"] > path` (or similar). Pie rendering
itself is verified visually in Phase B.

---

## Phase D — 24h light watch

Same posture as 5.0.3.

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for:
- Any unexpected client-side error-signature spike on
  `/admin/dashboards/*` (React errors, unhandled promise rejections).
  Baseline is ~0 today.
- Any customer report of "the pie is still blank" — report immediately
  for dev; this is the fifth attempt at the F5 fix and the user is
  actively watching.

No new API endpoints; API error baseline should remain flat.

Note: the `TabHelpPopover` nested-`<button>` hydration warning is
still in prod (deliberately not fixed in this PR — see handoff
"Known-unfixed hygiene"). CloudWatch may still show the associated
React warning; that's expected and not a rollback trigger.

---

## Rollback gate

Roll back if any of the following fail:

- **A1** — `/health` doesn't return 2.0.4 within the deployment window
  → App Runner issue; check CloudWatch + redeploy or revert the tag.
- **B1 (P1 gate)** — Respondent Role pie renders blank on fresh
  browser session → the inline-SVG swap didn't take. Roll back one
  step — but note that 5.0.3 has the same broken symptom; you're
  rolling back to a known-broken state either way. Report to dev
  before deciding whether to roll further back to 5.0.2.
- **B2 (F5 gate)** — Pie blank on hard refresh → same as B1.

**Rollback shape:** revert the PR on `main` → App Runner auto-redeploys
to v2.0.3. No schema to unwind, no infra state to unwind. Reverting
to v2.0.3 does NOT restore a working pie — 5.0.3's pie is broken too.

---

## See also

- Handoff: [`prod-rel-5.0.4-handoff.md`](prod-rel-5.0.4-handoff.md)
- Pteam root-cause finding:
  [`docs/findings/prod-rel-5.0.3-pie-fix-didnt-take-2026-07-28.md`](../docs/findings/prod-rel-5.0.3-pie-fix-didnt-take-2026-07-28.md)
- Predecessor (5.0.3 no-op fix): [`prod-rel-5.0.3-handoff.md`](prod-rel-5.0.3-handoff.md)
- Original pie-chart fix (also regressed): [`prod-rel-4.1.56-handoff.md`](prod-rel-4.1.56-handoff.md)
