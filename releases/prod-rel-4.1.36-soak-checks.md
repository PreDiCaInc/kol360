# prod-rel-4.1.36 — Soak Checks (v1.17.56)

Tag at the merge commit on `main`. Three bundled items. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.56", ... }
```

### A2. Item 2 — Recalculate each analysis to backfill seg-only HCPs

**This is a mandatory rollout step.** App Runner deploy alone does NOT populate the new seg-only `HcpAnalysisScore` rows; the change only takes effect on the next `recalculateAnalysis` run.

For each configured analysis on prod (Sun Pharma → Dry Eye, B+L → Dry Eye, Bio-Exec → Dry Eye, and any others):

1. Log in as PLATFORM_ADMIN.
2. Navigate to Admin → KOL Analysis → click the analysis row → click **Recalculate**.
3. Wait for `calcStatus` to flip from `running` → `done`.
4. Note the row count delta (the recalc response includes `processed: N`).

Spot-check via DB (prod tunnel on port 5433):

```sql
-- Before/after row count per analysis. Run before+after the recalc.
SELECT a.id, c.name AS client, d.name AS disease_area,
       COUNT(s.id) AS scored_hcps
FROM "KolAnalysis" a
JOIN "Client" c ON c.id = a."clientId"
JOIN "DiseaseArea" d ON d.id = a."diseaseAreaId"
LEFT JOIN "HcpAnalysisScore" s ON s."analysisId" = a.id
GROUP BY a.id, c.name, d.name
ORDER BY scored_hcps DESC;
```

Row counts should grow on analyses where the data team has uploaded segment scores beyond the nominated set.

### A3. Item 2 — WTD shows seg-only HCPs

1. Open the KOL Explorer ("Total Weighted Score") tab on a customer dashboard (Sun Pharma → Dry Eye is the largest seg-data set).
2. Sort by Composite Score descending. Scroll through the list.
3. **Expected**: HCPs with non-null composite scores but `0` in every nomination-type column (National, Discussion, Advice, etc.) — these are the new seg-only rows.
4. Pick one such HCP, click into their profile.
5. **Expected**: profile loads. Score breakdown chart shows segment dimensions (Publications, Trade Pubs, Org Leadership, etc.) populated; survey score is `0` or `—`; nomination counts are all `0`; Nominators table is empty.

### A4. Item 1 — KOL Profile Apply Filters

1. From the WTD tab, click into a KOL who HAS nominators (sort by Composite, pick the top of the list).
2. **Expected**: new "Respondent Filters" bar between the score chart and the demographic charts. Apply button on the right; Reset button left of Apply; live "N nominators match" count.
3. Set a respondent filter (e.g., Role = Optometry). Apply button transitions to primary/colored. Live count updates within 250ms.
4. Click Apply. Nominators table re-renders to only the nominators whose response passes the filter. Demographic sub-charts (Specialty pie, State bar, Type chart) also re-scope.
5. Click Reset. Filters clear; Nominators + charts revert to unfiltered.

### A5. Item 3 — HCP importer accepts partials

1. Log in as PLATFORM_ADMIN. Navigate to Admin → HCPs → click the Upload icon → HCPs Import.
2. Pick an existing HCP from the list (note their current city + state from the table).
3. Create a CSV locally with header `NPI,City,State` and one row containing that HCP's NPI + a new city + a new state.
4. Upload.
5. **Expected**: row counts show `updated: 1`, `created: 0`, `errors: []`. The HCP's city + state update; name, email, specialty unchanged.

Try a partial CSV with a NEW NPI (not in the DB) and only `NPI,City,State`:

6. **Expected**: row errors with `"First and last name required"` (or similar CREATE-path message). The strict rules still apply when the NPI doesn't match.

## Phase B — Functional smoke (≤30 min)

### B1. No regressions on existing surfaces

- The other 4 Insights tabs (Demographics, Sociometric, Benchmarking, KOL Explorer score table) render unchanged data on customer dashboards.
- Existing HCP imports (full-row CSVs) still process correctly. The campaign-scoped `/campaigns/:id/import-hcps` route works the same.

### B2. Lite-client journey unchanged

sam@bio-exec.com / Bio-Exec lite client: lite journey still works. The KOL Profile drill-down filter bar should render on lite-client analyses too.

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

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?ERROR ?error ?Error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Watch for:
- `recalculateAnalysis` errors (Item 2 path).
- `importFromFile` errors (Item 3 path).
- `getKolProfile` errors with respondent-filter params (Item 1 path).

## Rollback gate

If A1–A5 don't pass within 30 min, redeploy `prod-rel-4.1.35` (v1.17.55). Effects:
- KOL Profile filter bar disappears.
- HCP importer reverts to strict-on-all-rows.
- Seg-only `HcpAnalysisScore` rows stay until the next recalc (which would drop them under the old code).

No data destruction.
