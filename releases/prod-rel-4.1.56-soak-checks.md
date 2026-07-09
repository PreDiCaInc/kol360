# prod-rel-4.1.56 — Soak Checks (v1.17.76)

Tag at the merge commit on `main`. Two-line hotfix for the Insights Demographics pie chart. **No migration.**

## Phase A — Version + sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.76", ... }
```

### A2. Nothing else broken

- Log into a client that has a real disease-area with demographic data.
- Open `/admin/dashboards/<da>` → Demographics tab.
- All bar-chart cards render as before (Treatment Decile, Monthly Patients, DED Patients, Years in Practice, State, Practice Setting, Core Focus × Avg Monthly Patients, Educational Resources × 3, Social Media × 2, Valuable Content, Objectivity Rating, Topics Discussed Counts).

## Phase B — The fix

### B1. Respondent Role pie renders on first paint

- Log into `koltest.bio-exec.com` (fresh incognito to avoid cached state).
- Navigate directly to `/admin/dashboards/<da>?clientId=<client>` for a client + DA with real data (Sun Pharma → Dry Eye is the flagged case).
- Click the Demographics tab.
- **The Respondent Role card (first card on the tab) should show the pie chart immediately.** Not blank.
- Should visibly display the role distribution (e.g. Optometry 58%, Ophthalmology 42%).

### B2. Topics Discussed (Distribution) pie renders on first paint

- Same setup as B1.
- Scroll to the "Topics Discussed (Distribution)" card (may not appear if the DA has no topics data).
- **Pie chart renders correctly on Chart view.** No blank state.

### B3. Chart ↔ Table toggle works both ways

- On the Respondent Role card, click the Table icon in the toggle.
- Table renders with rows (Optometry / Ophthalmology).
- Click the Chart icon.
- Pie renders again. No flicker, no blank state.

### B4. Bar chart cards unaffected

- Scroll through all bar-chart cards on the Demographics tab.
- Each renders as it did in 4.1.55. No visual regression.

## Phase C — Playwright regression

### C1. New regression spec runs against test env

```bash
cd e2e
E2E_TEST_DEMOGRAPHICS_DA_ID=<data-rich-da-id> E2E_TEST_DEMOGRAPHICS_CLIENT_ID=<client-id> pnpm test:web:test insights-demographics-pie
```

Expected: `insights-demographics-pie.spec.ts` — 2 tests pass. The regression spec asserts the Respondent Role card's `<svg>` has non-zero width + height on first paint.

If the spec skips (says "DA has no demographic data"), that DA has empty demographic data; try a different one with `E2E_TEST_DEMOGRAPHICS_DA_ID`.

## Phase D — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch customer support channel for any "Demographics is blank" reports. Should drop to zero.

## Rollback gate

If B1 fails, redeploy 4.1.55. The pie chart goes blank again, but nothing else regresses.
