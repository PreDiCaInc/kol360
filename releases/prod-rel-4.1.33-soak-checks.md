# prod-rel-4.1.33 — Soak Checks (v1.17.53)

Tag at the merge commit on `main`. Pure UI release: Apply Filters button + live "N match" indicator on 4 Insights tabs. No migrations. No backend behavior changes.

## Phase A — Sanity

### A00. Benchmarking + Demographics survey-question popovers

Open the Benchmarking tab on a customer dashboard (Sun Pharma → Dry Eye). Expected: each of the 7 LeaderRankingPanel headers shows a small "(i) Survey question" badge above the per-panel search input. Click it; a popover renders the actual question text + the campaign it was sourced from. Verify:
- The text matches what's in the SurveyQuestion table for one of the included campaigns.
- On dimensions where multiple campaigns have slightly different text (rare), the popover shows the text from the MOST RECENT campaign.

Open Demographics. Expected: the 6 main chart cards (Respondent Role, Total Monthly Patients, Monthly DED Patients, Years in Practice, Practice Setting, Core Focus by Avg Monthly Patients) each have an (i) icon next to their title. Same popover behavior.

If a dimension has no matching question in the included campaigns, the (i) is hidden — no broken/empty popover.

### A0. Sociometric Leaders tab — duplicate block gone

Open the Sociometric Leaders tab. Expected:
- Top: the master Sociometric Summary matrix (unchanged, now with Apply Filters).
- Below the matrix: **nothing**. Previously a "Per-Category Leader Tables" section rendered here with 7 leader-ranking panels — that block has been removed (it duplicated Benchmarking).
- For the per-category leader tables, customers go to the **Benchmarking** tab.

### A0a. Influencer Type filter dropdown reflects actual data

Open any of: Sociometric Summary, KOL Explorer (Total Weighted Score), Benchmarking. Find the Influencer Type filter dropdown. Expected:
- On prod (Dry Eye): dropdown shows **National Leaders, Pre-Emergent, Regional Leaders, Rising Stars** (4 values, in alpha order). "Regional Influencers" should NOT appear.
- Pick "Regional Leaders" → live count should show ~1,291 (not 0).
- Pick "Pre-Emergent" → live count should show ~2,261.
- Other DAs / non-Dry-Eye: dropdown reflects whatever the data team has uploaded for that DA.

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.53", ... }
```

### A2. Apply flow works end-to-end on each of the 4 tabs

For Sociometric Summary, KOL Explorer, Demographics, and Leader Rankings:

1. Open the tab. Default unfiltered view loads. Apply button is **muted (outline)** and **disabled**. Live count shows the unfiltered total.
2. Change a filter dropdown. Apply button transitions to **primary / colored**. Live count updates (debounced ~250ms) to the pending match count.
3. Confirm the table/charts have NOT changed yet (still showing the previous applied result).
4. Click Apply. Spinner + "Applying…" briefly; then table/charts refresh; Apply button transitions back to muted.
5. Click Reset. All filters clear; heavy query refires immediately to the unfiltered baseline.
6. Repeat 2 — press **Enter** inside the search input instead of clicking Apply. Same result.

### A3. Live count parity

The displayed "N matches" indicator MUST agree with what the user will see after clicking Apply. Pick a filter combination on Sociometric Summary; note the live count before clicking Apply; click Apply; confirm the resulting page's total === the count you saw before. The 4.1.32 backend already enforces this parity in E2E, but UI smoke is the customer-visible signal.

### A4. Chip removal stages pending

Set a few filters → Apply → table updates. Click the × on one of the active-filter chips. Confirm:
- Apply button transitions back to dirty (chip removal is a pending edit).
- Table still shows the previous applied result.
- Clicking Apply commits the chip removal.

(This is a behavioral shift from 4.1.32 where chip removal auto-fired. Confirm it doesn't feel broken — if customer feedback says "I clicked the X, why didn't it work?" we may need to revisit and make chip removal auto-apply.)

## Phase B — Functional smoke (≤30 min)

### B1. Existing data unchanged

For Sun Pharma / B+L on Dry Eye: open each of the 4 tabs unfiltered. Numbers MUST match what they showed on 4.1.32. (No backend changes; the apiFilters shape is identical when applied state matches the previous behavior's live state.)

### B2. Sort + pagination still fire immediately

The Apply pattern only governs filter dimensions. Confirm:
- Clicking a column header to sort → heavy query refires immediately (not gated on Apply).
- Changing page or limit → same; immediate refire.

### B3. Lite-client journey unchanged

sam@bio-exec.com / Bio-Exec: confirm the lite-client journey (4.1.29 + 4.1.30 fixes) still works end-to-end with the new Apply UX.

## Phase C — 24h watch

### C1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-web/9fe5595685ad4ab89cdb29333ab1f5f6" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### C2. No new error patterns

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-web/9fe5595685ad4ab89cdb29333ab1f5f6/service" \
  --filter-pattern '?ERROR ?error ?Error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Look for any React error boundaries / failed React Query calls. The new `useFilters` + `useMatchCount` hooks are scoped to the 4 Insights tabs — errors should be isolated to that surface.

### C3. Match-count endpoint traffic

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern 'match-count' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -20
```

After deploy, `match-count` endpoint traffic should pick up substantially (no traffic existed pre-4.1.33; the 4.1.32 release shipped the BE without an FE caller). Latency MUST stay sub-50ms per call — if it doesn't, the live indicator becomes laggy.

## Rollback gate

If A1–A2 don't pass on any of the 4 tabs within 30 min of deploy, redeploy `prod-rel-4.1.32` (v1.17.52). The match-count endpoint stays harmlessly; the UI reverts to the auto-fire pattern.

If customer feedback flags chip removal as confusing (Phase A4 above), that's a UX iteration not a rollback — flag for next PR to make chip removal auto-apply.
