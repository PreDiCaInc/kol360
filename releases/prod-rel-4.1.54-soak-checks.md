# prod-rel-4.1.54 — Soak Checks (v1.17.74)

Tag at the merge commit on `main`. Small Tier-1 polish on top of the tour walkthroughs. **No migration.**

## Phase A — Version + sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.74", ... }
```

### A2. Everything Phase-1 tour still works

- `/admin/dashboards/<disease-area-id>` → "How to…" dropdown at top-right of Insights header.
- Case Study 1 launches its walkthrough.
- Modal overlay dims, target pulses, tooltip shows.

## Phase B — Tier 1 muscle-memory check

### B1. Step 1 (Open Benchmarking) has no Next button

- Launch Case Study 1's tour.
- Step 1 tooltip: title = "STEP 1 OF 7 — Open Benchmarking". Body ends with dashed-separator hint: "Click the highlighted element to continue."
- **Buttons in the tooltip: Skip + Prev only. NO Next.**
- Prev is disabled (first step). Skip cancels the tour.

### B2. Clicking the highlighted Benchmarking tab auto-advances

- Click Benchmarking tab (highlighted with pulse).
- Tour transitions to Step 2 ("Pick your states"). Step 2 tooltip has all 3 buttons (Skip / Prev / Next).

### B3. Step 5 (Drill into a KOL) has no Next button

- Advance through checkpoint into deep dive.
- Step 5 tooltip: same shape as Step 1 — Skip + Prev only, hint under body.
- Click any KOL row → tour advances to Step 6 (Read the Nominations table).

### B4. Empty-data fallback injects Next

- Pick a DA with no scored HCPs so the leader table is empty.
- Reach Step 5 (Drill into a KOL).
- After ~1 second (the `waitForElement` timeout), a Next button appears in the tooltip. Clicking it advances to Step 6.
- Look in the browser console for `tour-telemetry` event with `event: "tour.anchor_missing", expectedAnchor: "kol-row-first"`.

## Phase C — Automated e2e regression

### C1. `canada-hcp-isolation.test.ts` back to passing

- `pnpm test:workflow:test`.
- Prior release (4.1.52 soak run): 1 failure — `Leader Rankings for a US client omits the CA HCP` (400 from missing `nominationType` query param).
- 4.1.53 expected: 0 failures on this test (or the same suite-level count minus that one).

## Phase D — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for any spike in `tour.anchor_missing` telemetry — would indicate a data-shape drift in the Insights UI relative to the tour anchors, since the Tier 1 injection path only triggers on that signal.

## Rollback gate

If B1–B4 don't pass, redeploy `prod-rel-4.1.52` (v1.17.72). Two target-click steps get their Next buttons back; every other tour behavior identical.
