# prod-rel-4.1.46 — Soak Checks (v1.17.66)

Tag at the merge commit on `main`. Two guide screenshot updates. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.66", ... }
```

### A2. CS1 Step 5 shows the new Profile drill-down

1. Open the Insights guide (drawer via Use Cases button, or standalone at `/admin/dashboards/guide`).
2. Scroll to Case Study 1 Step 5 ("Click any KOL's name to open the KOL Profile drill-down…").
3. **Expected**: image shows Eric Donnenfeld's full KOL Profile with:
   - Bio-Exec branded chrome
   - Total Weighted Score = 26.9
   - Respondent Filters bar with "224 nominations match" + Apply Filters button
   - Score Breakdown (9 dimensions) + Nomination Counts by Type
   - Nominations by Respondent Role (donut) + Nominations by State (bar)
   - Nominations table with ~25 of 224 rows visible
   - 6 demographic sub-charts

### A3. CS3 Step 2 renders text-only

1. Scroll to Case Study 3 Step 2 ("Apply the same filters as Case Study 2… click the sort arrow…").
2. **Expected**: no screenshot below the step body. Text renders cleanly.

### A4. CS1 Step 3 image unchanged

1. Scroll to Case Study 1 Step 3 ("filter further by setting the Respondent Role to 'Optometrist'").
2. **Expected**: image still shows the Respondent Role filter set to Optometrist (unchanged from 4.1.45).

### A5. All 11 other steps still render their images

Quick scroll-through: no broken image icons anywhere in the guide (drawer + standalone). All remaining 10 screenshots load.

## Phase B — 24h watch

### B1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

## Rollback gate

If A1–A4 don't pass, redeploy `prod-rel-4.1.45` (v1.17.65). Old CS1 Step 5 score-table image + CS3 Step 2 sort-arrow image return; new consolidated Profile capture disappears.

No data destruction.
