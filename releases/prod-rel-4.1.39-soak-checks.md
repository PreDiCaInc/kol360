# prod-rel-4.1.39 — Soak Checks (v1.17.59)

Tag at the merge commit on `main`. One FE one-liner follow-up to v1.17.58. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.59", ... }
```

### A2. HCP list export uncaps the 5k limit

1. Go to Admin → HCPs with no filter applied.
2. Note the total count badge — should be > 5,000 in prod.
3. Click Export. Button shows "Exporting…" briefly.
4. Open the CSV. **Expected**: row count matches the total badge exactly. No 5,000-row truncation.

### A3. Filtered export still works

1. Apply a filter that yields < 5,000 results (e.g. a specific state).
2. Note total badge.
3. Click Export. CSV row count == filtered total.

### A4. Other Insights surfaces unchanged

Quick smoke that no other export was touched: Sociometric Summary, KOL Explorer (score table + nominators), Leader Rankings, Survey Status, Payments. Each should still export the full filtered list.

## Phase B — 24h watch

### B1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### B2. No new error patterns

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?ERROR ?error ?Error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Watch for `/api/v1/hcps` 500s or timeout patterns — would indicate the parallel-pages export is overloading the API path.

## Rollback gate

If A1–A2 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.38` (v1.17.58). Export reverts to the 5k cap.

No data destruction.
