# prod-rel-4.1.16 — Soak Checks (v1.17.33)

Tag at the v1.17.33 merge commit on `main`. One P1 customer fix — Sociometric Summary KOL-side filter destructure. **No DB migration.**

## What 4.1.16 changed (the universe of risk)

1. **`getSociometricSummary` service method** — destructure now reads `specialties`, `states`, `influencerType`, `influencerTypes` from the filter object.
2. **`getSociometricSummary` where-clause** — dual-shape (plural array OR singular legacy), mirrors `getLeaderRankings`.
3. **`getSociometricSummary` item-build loop** — adds an influencerType post-filter `continue`.
4. **New e2e** `insights-kol-side-filters.test.ts` with the structural-check matrix.
5. **Existing e2e** `insights-respondent-filters.test.ts` — silent-drop sentinel added.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.33", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.33`.

### A2. The customer's reported bug is gone — KOL State filter narrows

Sun Pharma + Dry Eye DA → Insights → Sociometric Leaders tab → Filter button → KOL State → CA → Apply.

- **Pre-fix:** total stayed at 2337; mixed states in the result.
- **Post-fix:** total narrows to ~244; every visible row's State column is "CA".

### A3. API-level confirmation across all three dims

```bash
TOK=...                # mint via cognito
DA=cml92bqnh00012msmjdr62saq; CL=cmmjq5hbl00jevqf87olee6yb
API=https://ik6dmnn2ra.us-east-2.awsapprunner.com

# (a) states — plural array (the broken-in-4.1.15 path)
curl -s -H "Authorization: Bearer $TOK" \
  "$API/api/v1/insights/$DA/sociometric-summary?clientId=$CL&limit=50&states=CA" \
  | jq '{ total, sample_states: ([.items[].state] | unique) }'
# Expected: total ~= 244, sample_states == ["CA"]
# Pre-fix:  total == 2337 (== baseline), mixed states

# (b) specialties
curl -s -H "Authorization: Bearer $TOK" \
  "$API/api/v1/insights/$DA/sociometric-summary?clientId=$CL&limit=50&specialties=Optometry" \
  | jq '{ total, sample_specialties: ([.items[].specialty] | unique) }'
# Expected: sample_specialties == ["Optometry"]

# (c) influencerTypes
curl -s -H "Authorization: Bearer $TOK" \
  "$API/api/v1/insights/$DA/sociometric-summary?clientId=$CL&limit=50&influencerTypes=National%20Leaders" \
  | jq '{ total, sample_types: ([.items[].influencerType] | unique) }'
# Expected: sample_types == ["National Leaders"]

# (d) singular legacy paths still work — back-compat regression check
curl -s -H "Authorization: Bearer $TOK" \
  "$API/api/v1/insights/$DA/sociometric-summary?clientId=$CL&limit=50&state=CA" \
  | jq '{ total, sample_states: ([.items[].state] | unique) }'
# Expected: same as (a)
```

---

## Phase B — Functional smoke (~10 minutes)

### B1. Browser UI — Sociometric Summary KOL-side filters

Sun Pharma + Dry Eye DA → Sociometric Leaders tab → Filter button. Each of the following should narrow the result and show ONLY matching rows:

| Filter dropdown | Expected behaviour |
|---|---|
| KOL State = CA | Total drops to ~244; every row's State column is "CA". |
| KOL State = CA + NY | Union — CA + NY rows only. |
| Specialty = Optometry | Every row's Specialty column is "Optometry". |
| Influencer Type = National Leaders | Every row classified as National Leaders. |
| KOL State CA + Specialty Optometry | Intersection — only CA Optometrists. |

### B2. Combine with a respondent filter

With KOL State = CA selected, ALSO apply a respondent filter (Resp Role = Optometry). Two filters compound:
- KOL-side narrows the candidate KOLs to CA-based.
- Respondent-side narrows which surveys' nominations count.
Total narrows further than either filter alone.

### B3. KOL Explorer still works

Same DA → KOL Explorer tab. Apply the same three KOL-side filters. Pre-fix behaviour: KOL Explorer already worked correctly; this is a regression check that v1.17.33 didn't break what was already right.

### B4. Leader Rankings still works

Same DA → Benchmarking tab. Apply KOL State filter on any nomination card. Pre-fix: worked correctly. Regression check.

### B5. Re-soak prior bundles

- **prod-rel-4.1.15**: Sociometric matrix column order still Total → National → Discussion → … → Biased. Export still emits full filtered list with NPI.
- **prod-rel-4.1.14**: "Dry Eye (including OSD, MGD, and NK)" filter still narrows. Repeated-query-params on the wire.
- **prod-rel-4.1.13**: Header brand badge still visible for TEAM_MEMBER.

---

## Phase C — 24h watch

### C1. CloudWatch — API error rate

Standard 24h post-deploy watch on the `kol360-api` service.

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. Filter latency on /sociometric-summary

The change adds: (a) two more conditional branches to the where-clause, (b) one post-fetch `continue` per HCP for the influencerType post-filter. Neither adds I/O. No p95 latency regression expected.

### C3. Customer signal — close the loop

Customer reported the KOL State filter not working. Loop back within 48h of deploy to confirm the fix lands as expected.

### C4. E2E coverage check

After deploy, run the full e2e API suite against api-test. New `insights-kol-side-filters.test.ts` should go from 3/6 (pre-fix) to **6/6 green**. Existing `insights-respondent-filters.test.ts` should stay at 7/7.

---

## Rollback gate

If A1-A3 don't all pass within 30 min of deploy, redeploy `prod-rel-4.1.15`. The customer's KOL State filter goes back to silently ignoring; rest of Insights unaffected.
