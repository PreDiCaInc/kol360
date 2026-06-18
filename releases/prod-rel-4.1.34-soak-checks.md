# prod-rel-4.1.34 — Soak Checks (v1.17.54)

Tag at the merge commit on `main`. Three small Insights polish items bundled. No migrations.

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.54", ... }
```

### A2. Sociometric Leaders tab — duplicate block gone (Item 1)

1. Open the **Sociometric Leaders** tab on a customer dashboard (Sun Pharma → Dry Eye).
2. **Expected**: see the master Sociometric Summary matrix at the top (with the v1.17.53 Apply Filters bar).
3. **Below the matrix**: nothing. Pre-fix, a "Per-Category Leader Tables" section rendered here with 7 leader-ranking panels — that block is removed.
4. For the per-category leader tables, customers go to the **Benchmarking** tab (same 7 tables + filter bar).

### A3. Influencer Type dropdown reflects actual data (Item 2)

Affects: KOL Explorer (Total Weighted Score tab), Sociometric Summary, Benchmarking.

1. Open KOL Explorer on prod Dry Eye. Find the Influencer Type filter dropdown.
2. **Expected**: dropdown shows 4 options — National Leaders, Pre-Emergent, Regional Leaders, Rising Stars (alpha). 'Regional Influencers' should NOT appear.
3. Pick 'Regional Leaders'. Without clicking Apply yet, the live "N KOLs match" indicator should show **~1,291** (not 0).
4. Pick 'Pre-Emergent'. Live count should show **~2,261**.
5. Click Apply. The table populates with the corresponding HCPs.

Repeat the dropdown check on Sociometric Summary + Benchmarking — same 4-value list, no Regional Influencers.

### A4. Survey-question (i) popovers (Item 3)

**Benchmarking**:
1. Open the Benchmarking tab.
2. **Expected**: each of the 7 LeaderRankingPanel headers shows a small "(i) Survey question" affordance above the per-panel search input.
3. Click the (i) on the National Leaders panel. **Expected**: popover renders with the actual question text — e.g., "Please list eye care professionals who you consider to be national leaders in the research and management of patients with dry eye disease (DED):" — and a "Source: <Campaign Name>" line below.
4. Repeat on a couple of other panels (Advice Leaders, Referral Leaders). Confirm the text matches what's in `SurveyQuestion.questionTextSnapshot` for one of the analysis's included campaigns.

**Demographics**:
1. Open the Demographics tab.
2. **Expected**: 6 main chart cards (Respondent Role, Total Monthly Patients, Monthly DED Patients, Years in Practice, Practice Setting, Core Focus by Avg Monthly Patients) each show a small info icon next to the title.
3. Click on each (i). Popover renders the actual question text + source campaign.

**Sparse-data cases**:
- If an analysis has no matching question for a dimension, the (i) icon should be hidden (not render an empty popover).
- If an analysis pools campaigns with slightly different `questionTextSnapshot` for the same dimension (rare in practice), the popover shows the **most recent** campaign's text.

### A5. New endpoints respond 200 + correct shape

```bash
TOKEN="<paste a valid Cognito access token>"
DA="<configured DA, e.g. Dry Eye>"
CLIENT="<a client id with a KolAnalysis on that DA>"

curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/nomination-questions?clientId=$CLIENT"
# Expected: { "items": [{ nominationType, text, campaignName }, ...] } + 200

curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA/demographic-questions?clientId=$CLIENT"
# Expected: { "items": [{ dimension, text, campaignName }, ...] } + 200
```

Both endpoints return 400 without `clientId` (same contract as the rest of the analysis-backed surfaces).

## Phase B — Functional smoke (≤30 min)

### B1. Existing Insights surfaces unchanged

Spot-check Sociometric Summary, KOL Explorer, Demographics, Benchmarking, KOL Profile drill-down on a customer dashboard. All numbers MUST match what they showed on 4.1.33. (4.1.34 is purely additive plus the dropdown vocabulary fix; no aggregation logic changed.)

### B2. Lite-client journey unchanged

sam@bio-exec.com / Bio-Exec: lite-client journey (4.1.29 + 4.1.30 fixes) still works end-to-end with the new (i) popovers + the corrected Influencer Type dropdown.

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
  --filter-pattern '?nomination-questions ?demographic-questions ?ERROR ?error' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -30
```

The two new endpoints fire on tab mount; expect modest traffic — no errors expected.

## Rollback gate

If A1–A4 don't pass within 30 min of deploy, redeploy `prod-rel-4.1.33` (v1.17.53). Effects:
- Sociometric Tables block re-appears below the matrix.
- Influencer Type dropdown reverts to 3 hardcoded values (Regional Influencers / 0-results bug returns).
- (i) popovers disappear.

No data destruction.
