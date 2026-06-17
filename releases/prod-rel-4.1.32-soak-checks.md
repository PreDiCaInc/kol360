# prod-rel-4.1.32 — Soak Checks (v1.17.52)

Tag at the merge commit on `main`. Backend-only release: two new `match-count` endpoints powering the live "N match" indicator that the upcoming Apply Filters UX will display. No migrations. No UI changes ship in this release.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.52", ... }
```

### A2. New endpoints respond 200

Paste a valid Cognito access token + a configured `(diseaseAreaId, clientId)` pair:

```bash
TOKEN="<paste>"
DA="<da-id>"
CLIENT="<client-id>"

curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/match-count?type=kols&clientId=$CLIENT"
# Expected: { "count": <number> } + 200

curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/match-count?type=respondents&clientId=$CLIENT"
# Expected: { "count": <number> } + 200
```

### A3. Parity contract (CRITICAL)

The live "N match" indicator is going to display these counts to users next to the Apply Filters button. If the count is wrong, the indicator lies before users click Apply — exactly the "page recomputed mid-thought" footgun the design eliminates.

Run the two parity probes from the handoff doc:

- `match-count?type=kols` MUST equal `sociometric-summary.total` for the same filter set.
- `match-count?type=respondents` MUST equal `demographics.totalRespondents` for the same filter set.

E2E tests in [`e2e/api/insights-match-count.test.ts`](../e2e/api/insights-match-count.test.ts) cover this for the no-filter case; the soak should also probe with at least one active filter (e.g. `&respondentRoles=Optometry`) to confirm parity under filtering.

### A4. kol-profile/:hcpId/match-count for a known KOL

Pick the top KOL from sociometric-summary and probe their nominator count:

```bash
HCP_ID="<from sociometric-summary first item>"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/kol-profile/$HCP_ID/match-count?clientId=$CLIENT"
# Expected: { "count": <number > 0 if HCP has nominators> }
```

## Phase B — Functional smoke (≤30 min)

### B1. Existing Insights endpoints unchanged

Spot-check Sociometric Summary, Demographics, Leader Rankings, KOL Explorer, KOL Profile drill-down on a customer dashboard. All numbers MUST match what they showed on v1.17.51 (this release adds new endpoints; it does NOT touch any existing endpoint).

### B2. New endpoints under filter

Pick a few real filter sets and run them against both `match-count` and the corresponding full-aggregation endpoint. Numbers must agree at every probed point. Document any drift — that's the silent-semantic-bug class.

## Phase C — 24h watch

### C1. App Runner deploy health

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
  --filter-pattern '?match-count ?ERROR ?error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

Look for any `match-count`-related errors. Since the FE doesn't wire to these endpoints in this release, traffic should be effectively zero until the next FE release lands — but if anyone curls them, the only error class expected is a misconfigured-analysis 400 (same as the rest of the analysis-backed endpoints).

## Rollback gate

If A1–A2 don't pass or A3 parity drifts, redeploy `prod-rel-4.1.31` (v1.17.51). The two new endpoints will 404; no other surface affected.
