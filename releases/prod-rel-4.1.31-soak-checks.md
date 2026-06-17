# prod-rel-4.1.31 — Soak Checks (v1.17.51)

Tag at the merge commit on `main`. **One idempotent migration** + service-layer rewrite (shared respondent-filter pipeline → single SQL `$queryRaw`). Parity-critical: filter result counts must match v1.17.50 row-for-row.

## Phase A — Sanity

### A1. Apply migration FIRST

App Runner does not auto-run migrations. **Run this BEFORE letting the App Runner deploy serve traffic** (or immediately after, since the new code is correct without the index — just slower):

```bash
# Test env (already applied during dev, but verify it picked up cleanly)
PGPASSWORD=RDS4Bioexec2025 psql \
  -h localhost -p 5432 -U kol360admin -d kol360 \
  -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/migrations/20260616_add_survey_response_campaign_status_index/migration.sql

# Prod env (via the prod SSH tunnel — port 5433)
PGPASSWORD=RDS4Bioexec2025 psql \
  -h localhost -p 5433 -U kol360admin -d kol360 \
  -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/migrations/20260616_add_survey_response_campaign_status_index/migration.sql
```

Verify:

```sql
\d "SurveyResponse"
-- Expected new line:
-- "SurveyResponse_campaignId_status_idx" btree ("campaignId", status)
```

Idempotent — safe to re-run; a NOTICE skipping line is fine.

### A2. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.51", ... }
```

### A3. Insights tabs render for an existing customer (Sun Pharma)

1. Log in as a Sun Pharma CLIENT_ADMIN (or PLATFORM_ADMIN impersonating).
2. Open Dry Eye → Sociometric Summary tab.
3. **Expected**: KOL list populates (same data as 4.1.30); no error toast; no empty state.
4. Same for Leader Rankings + Demographics + KOL Explorer + KOL Profile drill-down.

### A4. Lite-client journey still works (regression check on 4.1.30)

1. Log in as sam@bio-exec.com (TEAM_MEMBER on Bio-Exec lite client).
2. Land on `/admin/dashboards` → Dry Eye tile.
3. **Expected**: Insights tabs all render with real data (the resolveAccessibleCampaignIds fix from 4.1.30 is unaffected by perf-pass-C).

## Phase B — Parity-critical: filter result counts match v1.17.50

This is THE critical soak step. Pick one or two customer dashboards and run a few filter sets — totals + per-row counts MUST match what the same filter set produced under v1.17.50 row-for-row.

### B1. Demographics totalRespondents

1. Sun Pharma → Dry Eye → Demographics tab.
2. Set respondent filters: e.g. `respondentRoles=Optometry`, `coreFocuses=Dry Eye (including OSD, MGD, and NK)`. Note the totalRespondents on the page header.
3. Switch to the production /health URL to confirm 1.17.51 is live, then re-load with the same filter set in a fresh window/incognito.
4. **Expected**: totalRespondents in the new window === pre-deploy snapshot. If different, **rollback per option B in the handoff**.

### B2. Sociometric Summary total + per-row counts

1. Sun Pharma → Dry Eye → Sociometric Summary tab.
2. Set respondent filters (same combo as B1). Note: `total` from the response, and the top 3 rows' Discussion Leader counts.
3. Re-load (similar to B1) and compare.
4. **Expected**: identical numbers.

### B3. Leader Rankings under filter

1. Same DA, Benchmarking / Leader Rankings tab. Pick a nomination type (e.g. National Leader).
2. Set the same filters. Note: top 10 KOLs + their counts.
3. Re-load and compare.
4. **Expected**: identical ordering + counts.

### B4. No-filter baseline (smoke)

1. Without any filters set, the same 3 tabs should produce IDENTICAL numbers to 4.1.30 (the no-filter fast path is bypassed by the rewrite — the perf rewrite ONLY runs when filters are active).

## Phase C — Latency check (informational, not pass/fail)

The combined optimization (helper rewrite + composite index) should noticeably reduce response time on the FILTER-active paths. Capture latency before/after for one or two demo screens — useful for the next pteam ticket.

```bash
# Example: time a filtered Sociometric Summary call
time curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/<da-id>/sociometric-summary?clientId=<sun-pharma-id>&respondentRoles=Optometry&coreFocuses=Dry%20Eye%20%28including%20OSD%2C%20MGD%2C%20and%20NK%29&limit=5000" \
  > /dev/null
```

Pre-deploy reference: 2-9s observed by pteam. Post-deploy target: well under 1s on the same call (test-DB SQL alone is sub-100ms; the rest is network + serialization).

## Phase D — 24h watch

### D1. App Runner deploy health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### D2. No new error patterns

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?ERROR ?error ?Error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Look for any new `prisma`, `$queryRaw`, or SQL-related errors. The rewrite SHOULD NOT introduce new error classes — but if it does, the `$queryRaw` would emit Prisma errors visible in CloudWatch.

## Rollback gate

If A2–B3 don't pass within 30 min of deploy, use **rollback Option A** from the handoff (redeploy 4.1.30, leave the index). The index is harmless additive and can stay.

If you observe drift in filter counts (B1-B3 fail), that's the silent-semantic-bug class — rollback immediately and we'll diagnose the specific filter dimension that drifted.
