# prod-rel-4.1.57 — Soak Checks (v1.17.77)

Tag at the merge commit on `main`. Insights guide v1.1 image sweep + Case 5 tour anchor fix + drawer secondary-image render. **No migration.**

## Phase A — Version + sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.77", ... }
```

### A2. Nothing else broken

- Load `/admin/dashboards/<disease-area-id>`.
- Cases 1-5 all launchable from the "How to…" dropdown (no "coming soon" tags on any).
- Modal overlay + step counter + Skip/Prev/Next behaviour identical to 4.1.56.

## Phase B — Static guide image alignment (v1.1 sweep)

### B1. Case 1 static guide has 4 images (not 6)

- Open "How to…" → "Read the full documentation".
- Case Study 1: verify **6 steps** are rendered.
- Images should appear on Steps 1, 2, 3, **and 5** — **Steps 4 and 6 render as text-only**.
- Step 5 renders **TWO images stacked**:
  1. National Leaders + Discussion Leaders panels (all filters applied) with red "Click to view KOL full profile" arrow
  2. Full KOL Profile drill-down for Eric Donnenfeld

### B2. Case 3 Step 2 image restored

- Case Study 3 Step 2 should render an image: **Sociometric Leaders table with a red "Click to sort list" arrow on the Rising Star column header**.
- Previously (4.1.56) this step was text-only.

### B3. Case 5 image moved from Step 1 to Step 2

- Case Study 5 Step 1 renders as **text-only**.
- Case Study 5 Step 2 renders a screenshot: **Total Weighted Score results sorted by Trade Publication descending**.
- Previously (4.1.56) the image was at Step 1; per v1.1 it belongs at Step 2.

### B4. All 11 image files present + rendering

- Open browser devtools → Network tab.
- Refresh the drawer. Verify no 404s on any `.png` under `/help/insights-guide/`.
- Expected loaded files: `case-1-step-1.png`, `case-1-step-2.png`, `case-1-step-3.png`, `case-1-step-5.png`, `case-1-step-5b.png`, `case-2-step-1.png`, `case-2-step-2.png`, `case-3-step-1.png`, `case-3-step-2.png`, `case-4-step-1.png`, `case-5-step-2.png` (11 files total).

## Phase C — Case 5 tour anchor fix

### C1. Case 5 deep-dive steps now highlight the table

- From the "How to…" dropdown, launch the "Trade Publication + National Leader composite" tour.
- Walk through the intro steps (Open Total Weighted Score, State filter, Respondent Role, Apply).
- Cross the checkpoint into the Deep dive.
- **"Sort by Trade Pubs" step**: the KOL Explorer scores table (the table below the filters) should be **highlighted with a teal outline**.
- **"Read the composite" step**: same table highlighted (no highlight per the step's `highlight: 'none'` config — this is expected, the tooltip attaches without a ring).
- Previously (4.1.56) neither step showed a highlight because the `leader-table` anchor doesn't exist on the Total Weighted Score tab.

### C2. `tour.anchor_missing` telemetry stops firing for Case 5

Open browser devtools → Console. Filter for `tour-telemetry`. Run through Case 5 tour end-to-end.

- Expected: `tour.launched` → 5-6× `tour.step_advanced` → `tour.checkpoint_reached` → `tour.completed`.
- **NO `tour.anchor_missing` events for `expectedAnchor: 'leader-table'` on step 4 or 5.** Previously these fired silently.

## Phase D — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch `tour.anchor_missing` telemetry counts. Should drop meaningfully (Case 5's silent misfires stop).

## Rollback gate

If B1–B4 fail (images 404 or steps show wrong content), or C1–C2 fail (Case 5 highlight missing / telemetry keeps firing), redeploy `prod-rel-4.1.56`. Static images revert; Case 5 tour goes back to the silent anchor_missing state. Cases 1-4 unaffected.
