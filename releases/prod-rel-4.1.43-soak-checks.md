# prod-rel-4.1.43 — Soak Checks (v1.17.63)

Tag at the merge commit on `main`. Pure additive UI — Insights Use Cases guide. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.63", ... }
```

### A2. Standalone guide page renders

Open `https://kol360.bio-exec.com/admin/dashboards/guide` in a logged-in browser.

- Header "Insights — Use Cases" visible.
- Table of contents lists 5 case studies + the practice section.
- Each case study renders with title, scenario, step-by-step body, and screenshots.
- 12 screenshots load under `/help/insights-guide/`.
- `<img>` paths return 200 (browser network tab).

### A3. Use Cases button + drawer

1. Open `/admin/dashboards/[any DA]`.
2. Verify a "Use Cases" button is visible in the header (right side, next to the Disease Area selector).
3. Click it. Side-drawer opens from the right (~50% viewport).
4. Drawer header shows "Insights — Use Cases" + an "Open full page" link.
5. Body matches the standalone page content.
6. Click X. Drawer closes. Dashboard remains usable.

### A4. First-visit auto-open

1. In an incognito / private window, sign in.
2. Go to `/admin/dashboards/[any DA]`.
3. **Expected**: drawer auto-opens once.
4. Dismiss it.
5. Reload. **Expected**: drawer stays closed.
6. DevTools console: `localStorage.getItem('kol360.insightsGuideSeenAt')` → returns an ISO timestamp.

### A5. Per-tab `?` popovers

1. On the Insights dashboard, locate the `?` icon next to each tab label:
   - Demographics
   - Benchmarking
   - Sociometric Leaders
   - Total Weighted Score
2. Click each. Popover appears with:
   - Tab name + one-line description
   - 2-3 bullet uses
   - "See case studies" links (if any apply) + an "Open full guide →" link
3. Click a case-study link in the Benchmarking popover. **Expected**: drawer opens and scrolls to the named case study (e.g. "Case Study 1: Organizing a Doctor Dinner in Florida").

### A6. Cross-role + cross-client visibility

- Sign in as a CLIENT_ADMIN (not PLATFORM_ADMIN). Confirm the Use Cases button + drawer + popovers all work.
- Sign in as a Bio-Exec lite-client (sam@bio-exec.com). Same checks.

### A7. Print + a11y spot check

- Press print preview on the dashboard. Confirm the Use Cases button is hidden (already inside `print:hidden`).
- Tab through the dashboard with keyboard only — Use Cases button + `?` icons are focusable; popover/drawer can be dismissed with Escape.

## Phase B — Functional smoke (≤30 min)

### B1. Existing Insights flows unchanged

The drawer + button + popovers are pure additions. Quick smoke that nothing else regressed:

- Sociometric Summary loads and renders.
- KOL Explorer (Total Weighted Score tab) loads + KOL Profile drill-down works.
- Demographics renders charts.
- Benchmarking ranks + filters apply.

### B2. Existing Introduction tab still present

The existing Introduction tab is intentionally kept. Verify it still appears as the leftmost tab and that its content renders. No behavioral change vs. 4.1.42.

## Phase C — 24h watch

### C1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### C2. No new error patterns

Watch CloudWatch for any `/admin/dashboards/guide` 5xx — would indicate the new route choked on auth. No 5xx expected on the guide route since it's a static client-side render after `RequireAuth`.

## Rollback gate

If A1–A5 don't pass, redeploy `prod-rel-4.1.42` (v1.17.62). Guide infrastructure disappears; existing dashboard unchanged.

No data destruction.
