# prod-rel-4.1.38 — Soak Checks (v1.17.58)

Tag at the merge commit on `main`. Two production-code fixes (HCP importer race + HCP list export full-list) + two UX changes (Benchmarking (i) right-align, Demographics Chart/Table toggle) + 3 e2e test fixups. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.58", ... }
```

### A2. HCP importer — partial UPDATE concurrency-safe

The fix removes the stale-snapshot fallback. Solo full-row CSV uploads should still work identically.

1. Pick an existing prod HCP. Capture their current values via API or admin UI: `firstName`, `lastName`, `email`, `specialty`, `city`, `state`.
2. Build a `NPI,City,State` partial CSV with new city + state for that HCP. Upload via Admin → HCPs → Import.
3. Re-read via API. **Expected**: city + state updated; firstName/lastName/email/specialty preserved exactly.
4. Build a `NPI,Specialty` CSV. Upload. **Expected**: specialty changed; city/state from step 2 preserved.
5. Build a full-row `NPI,First Name,Last Name,Email,Specialty,Sub-specialty,City,State` CSV with all 8 fields different. Upload. **Expected**: all 8 fields updated.

### A3. HCP list export — full filtered list

The export button on `/admin/hcps` should download up to 5,000 rows matching the active filter set, not just the visible page.

1. Go to Admin → HCPs.
2. Apply a filter that yields > 50 results (e.g. a common specialty). Note the total count badge.
3. Click Export. The button should briefly show "Exporting…" then trigger a CSV download.
4. Open the CSV. **Expected**: row count matches the total badge (capped at 5,000), not 50.
5. With no filter applied, repeat — confirms unfiltered export works too.

### A4. Concurrent-write smoke (optional but valuable)

If you want to confirm the importer race fix:

1. Open two browser tabs, both logged in as admins.
2. Tab A: prepare `NPI,City,State` CSV for HCP X.
3. Tab B: prepare `NPI,Specialty` CSV for HCP X.
4. Click Upload in both tabs as close to simultaneously as possible.
5. **Expected**: city + state from A AND specialty from B both land on HCP X. Pre-fix, whichever uploaded second would have clobbered the other's changes with the snapshot value.

### A5. Existing HCP import behaviors unchanged

- New NPI with full required columns → still creates a new HCP.
- New NPI with only partial columns → still errors with CREATE-path message.
- Invalid NPI format → still errors regardless of branch.
- HcpAlias-matched merge (NPI doesn't match; full name does) → still routes to MERGE with strict requirements.

### A6. Demographics Chart/Table toggle (new affordance)

Open any insights analysis → Demographics tab. Each chart card with a toggle:

1. Default view is Chart (unchanged).
2. Click Table. Chart replaced with a tabular list (capped at 50 rows; filtered to non-empty + sorted by count desc).
3. Click Chart. Back to chart view, same underlying data.

The 10 cards with toggles: Role pie, Treatment Decile, Monthly Patients, DED Patients, Years in Practice, Core Focus × Avg Patients (table shows both metrics), Valuable Content, Objectivity Rating, Topics Discussed pie + bar. State bar chart (existing toggle from v1.17.5) should look unchanged but is now driven by the shared component.

### A7. Benchmarking (i) right-alignment

Open any Benchmarking colored-title-bar table. **Expected**: the (i) info popover sits at the right corner of the title bar (was previously next to the title text). Clicking it still shows the survey question. No data change.

### A8. Other Insights surfaces unchanged

Spot-check Sociometric Summary, KOL Explorer, Demographics filter Apply, Benchmarking Apply, KOL Profile drill-down on a customer dashboard (Sun Pharma → Dry Eye). All numbers match 4.1.36 — this release didn't touch any aggregation code.

## Phase B — Functional smoke (≤30 min)

### B1. Lite-client journey unchanged

sam@bio-exec.com / Bio-Exec: full lite-client journey still works end-to-end. The 4.1.36 KOL Profile drill-down filters still apply on lite-client analyses.

### B2. WTD seg-only HCPs still surfaced

The 4.1.36 recalc behavior is preserved (no change to the scoring pipeline in 4.1.38). WTD on customer dashboards should still show seg-only HCPs with their segment-driven composite scores.

### B3. Other export surfaces unchanged

Quick check that the v1.17.32 / v1.17.47 full-list exports still work:

- Sociometric Summary → Export CSV (full filtered set).
- KOL Explorer score table → Export Excel.
- KOL Explorer → Nominators table → Export.
- Leader Rankings → any panel → Export.
- Survey Status (campaign) → Export.
- Payments (campaign) → Export.

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
- `importFromFile` errors — would indicate a TypeScript / Prisma edge case in the per-field UPDATE shape.
- `/api/v1/hcps` 500s with `limit=5000` — would indicate the export re-fetch is timing out or hitting a query-plan issue on large filtered sets.

## Rollback gate

If A1–A3 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.36` (v1.17.56). HCP importer reverts to the stale-snapshot fallback; HCP list export reverts to current-page-only.

No data destruction.
