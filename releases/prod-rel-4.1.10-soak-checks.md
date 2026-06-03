# prod-rel-4.1.10 — Soak Checks (v1.17.14, bundles v1.17.12 + v1.17.13)

Tag at the v1.17.14 merge commit + this docs commit on `main`. Scoped to what v1.17.12 + v1.17.13 + v1.17.14 change vs `prod-rel-4.1.9` — three customer-facing correctness fixes on the Insights dashboard, one dead-code removal, one cleanup-script fix.

## What 4.1.10 changed (the universe of risk)

1. **`getSummary` and `getDemographics`** — both now use the same dedup-aware precompute (most-recent SurveyResponse per respondent, per-campaign `excludeInternalEmails` honored). `totalRespondents` value semantics shift.
2. **`byCoreFocus` SQL** — UNIONs single-choice + MULTI_CHOICE selected-array elements (was returning `[]` for MULTI_CHOICE-only DAs).
3. **`getFilterOptions`** — adds `coreFocuses` field (was missing; left filter dropdown empty).
4. **`/respondent-analytics` endpoint** — fully removed (orphan, no consumer). Anyone calling it directly (no one should be) gets 404.
5. **`cleanup-test-data.ts`** — internal e2e tooling, no prod impact.

No other change. No DB migration.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.14", ... }
```

Web — open `https://kol360.bio-exec.com`, check footer / admin header → `1.17.14`.

### A2. Insights endpoints respond

```bash
TOKEN="<JWT>"
DA_ID="<dry-eye-da-id>"
CLIENT_ID="<sun-pharma-client-id>"

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/summary?clientId=$CLIENT_ID" \
  | python3 -m json.tool

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/demographics?clientId=$CLIENT_ID" \
  | python3 -m json.tool | head -20

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/filter-options" \
  | python3 -m json.tool
```

Expected: all three return 200, full JSON shape. The `/filter-options` response now includes a `coreFocuses` array.

### A3. /respondent-analytics returns 404 (intentional)

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/respondent-analytics"
# Expected: 404
```

The endpoint was removed in this release. If any downstream code somewhere is hitting it, surface in C2.

---

## Phase B — Functional smoke (the headline; ~10 minutes)

### B1. Sun Pharma + Dry Eye — the customer-reported case

Open `/admin/insights/<dry-eye-da-id>` for Sun Pharma. **All three of these numbers must now be the same:**

1. Top tile **Total Respondents** (3-card row above the tabs)
2. Demographics tab header **"Survey respondent demographics across N respondents"**
3. Any single-answer dimension's bucket sum on Demographics (e.g., `byRole`: Ophthalmology + Optometry counts) — must be **≤** the headline (respondents may skip a question), never equal-but-higher

Pre-fix on prod they were 778 / 567 / 583 respectively — the 4.1.10 number is the *correct* count per the dedup rule. **Confirm this number with the customer.** Their stated expectation was 778, which assumed raw response count; the new value will be lower because multi-campaign respondents collapse.

Verify against ground-truth SQL (run via prod tunnel):
```sql
SELECT COUNT(*) AS total
FROM (
  SELECT DISTINCT ON (sr."respondentHcpId") sr.id
  FROM "SurveyResponse" sr
  JOIN "Campaign" c ON c.id = sr."campaignId"
  LEFT JOIN "Hcp" h ON h.id = sr."respondentHcpId"
  WHERE c."diseaseAreaId" = '<dry-eye-da-id>'
    AND c."clientId" = '<sun-pharma-client-id>'
    AND sr.status = 'COMPLETED'
    AND (
      c."excludeInternalEmails" = false
      OR h.email IS NULL
      OR h.email NOT LIKE '%@bio-exec.com'
    )
  ORDER BY sr."respondentHcpId", sr."completedAt" DESC NULLS LAST
) latest_per_respondent;
-- The number this returns is what /summary and /demographics MUST agree on.
```

### B2. Core Focus filter dropdown populates

On the same Sun Pharma + Dry Eye page:

- Open Demographics tab → Core Focus filter dropdown → should show options (e.g. "Comprehensive Ophthalmology", "Dry Eye", "Cataract/Refractive Surgery"). Pre-fix: empty.
- Open Sociometric Leaders tab → same Core Focus filter → same options. Pre-fix: empty.

### B3. `byCoreFocus` bar/donut chart populates

On Demographics tab, scroll to the Core Focus chart (or section title containing it). Pre-fix: empty for any DA with MULTI_CHOICE Core Focus. Post-fix: populated. Sun Pharma + Dry Eye is the canonical case; should now show buckets like "Comprehensive Ophthalmology=47", "Dry Eye=43", etc.

### B4. Selecting a Core Focus filter actually filters

Pick one value from the Core Focus dropdown (B2) on Demographics tab → all the dimension charts re-render with narrower counts. Clear the filter → counts return.

### B5. Another customer's DA (cross-customer sanity)

Repeat B1 against any non-Sun-Pharma client + DA. The math invariant `summary == demographics` must hold for them too. The Core Focus chart should populate if their survey template has a Core Focus question.

---

## Phase C — Background watch (24h, light)

### C1. Insights endpoint error rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/api/v1/insights/" 5' \
  --query 'events[*].message' --output text | tail -40
```

Expected: zero or unchanged from baseline. Any spike with SQL-related stack traces → flag back; the dedup precompute query could hit an edge case we didn't see on test data.

### C2. Any caller still hitting /respondent-analytics

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"respondent-analytics" 404' \
  --query 'events[*].message' --output text | wc -l
```

Expected: 0. If non-zero, someone is calling the endpoint — figure out who and route them to `/demographics` or `/summary`.

---

## Rollback criteria

Roll back to `prod-rel-4.1.9` **only if**:

- A1 fails — wrong version reported
- B1 fails — `summary.totalRespondents != demographics.totalRespondents`. (Means the dedup precompute query isn't being shared correctly between the two endpoints; not a small fix.)
- B1 produces a value the customer flags as obviously wrong (e.g., far higher than the raw response count, or far lower than 567). Flag back to dev rather than rolling back blind — the math is testable.
- C1 — `/insights/` 5xx spike with SQL error messages
- C2 — non-zero hits on /respondent-analytics (somebody depends on the dropped endpoint)

**Rollback procedure:** redeploy v1.17.11. The Core Focus filter goes empty again. The 567/583/778 inconsistency returns. The deleted endpoint comes back. All known-broken behaviors restored.

---

## When to declare soak passed

Recommend **1 business day** with:

- Phase A passes immediately after deploy
- Phase B1 confirmed with customer (their expected number, or close enough that they accept the new math)
- Phase B2/B3/B4 visually confirmed
- Phase C shows no insights endpoint 5xx spike and zero `/respondent-analytics` hits

After 4.1.10 soaks: continue with the remaining bug-bundle items (Group C reorder + Biased Leaders, Group D table layout, Group E KOL Profile core focus noms, Group F filter UX). None block 4.1.10.
