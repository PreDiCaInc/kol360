# prod-rel-4.1.37 — Soak Checks (v1.17.57)

Tag at the merge commit on `main`. One production-code fix + 3 e2e test fixups. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.57", ... }
```

### A2. HCP importer — partial UPDATE concurrency-safe

The fix removes the stale-snapshot fallback. Solo full-row CSV uploads should still work identically.

1. Pick an existing prod HCP. Capture their current values via API or admin UI: `firstName`, `lastName`, `email`, `specialty`, `city`, `state`.
2. Build a `NPI,City,State` partial CSV with new city + state for that HCP. Upload via Admin → HCPs → Import.
3. Re-read via API. **Expected**: city + state updated; firstName/lastName/email/specialty preserved exactly.
4. Build a `NPI,Specialty` CSV. Upload. **Expected**: specialty changed; city/state from step 2 preserved.
5. Build a full-row `NPI,First Name,Last Name,Email,Specialty,Sub-specialty,City,State` CSV with all 8 fields different. Upload. **Expected**: all 8 fields updated.

### A3. Concurrent-write smoke (optional but valuable)

If you want to confirm the race fix:

1. Open two browser tabs, both logged in as admins.
2. Tab A: prepare `NPI,City,State` CSV for HCP X.
3. Tab B: prepare `NPI,Specialty` CSV for HCP X.
4. Click Upload in both tabs as close to simultaneously as possible.
5. **Expected**: city + state from A AND specialty from B both land on HCP X. Pre-fix, whichever uploaded second would have clobbered the other's changes with the snapshot value.

### A4. Existing HCP import behaviors unchanged

- New NPI with full required columns → still creates a new HCP.
- New NPI with only partial columns → still errors with CREATE-path message.
- Invalid NPI format → still errors regardless of branch.
- HcpAlias-matched merge (NPI doesn't match; full name does) → still routes to MERGE with strict requirements.

### A5. Existing Insights surfaces unchanged

Spot-check Sociometric Summary, KOL Explorer, Demographics, Benchmarking, KOL Profile drill-down on a customer dashboard (Sun Pharma → Dry Eye). All numbers match 4.1.36 — 4.1.37 didn't touch any aggregation code.

## Phase B — Functional smoke (≤30 min)

### B1. Lite-client journey unchanged

sam@bio-exec.com / Bio-Exec: full lite-client journey still works end-to-end. The 4.1.36 KOL Profile drill-down filters still apply on lite-client analyses.

### B2. WTD seg-only HCPs still surfaced

The 4.1.36 recalc behavior is preserved (no change to the scoring pipeline in 4.1.37). WTD on customer dashboards should still show seg-only HCPs with their segment-driven composite scores.

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

Watch for any `importFromFile` errors — they'd be the new failure mode if the per-field UPDATE shape has any TypeScript / Prisma edge case I missed.

## Rollback gate

If A1–A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.36` (v1.17.56). HCP importer reverts to the stale-snapshot fallback; partial-row CSV uploads still work for solo admins.

No data destruction.
