# prod-rel-4.1.14 — Soak Checks (v1.17.31)

Tag at the v1.17.31 merge commit on `main`. One P1 customer hotfix (comma-shred filter bug) + one P3 ops hygiene (`tunnel-up.sh` cred hardening). **No DB migration.**

## What 4.1.14 changed (the universe of risk)

1. **`parseRespondentFilters`** — moved to `apps/api/src/lib/respondent-filters.ts`, now accepts `string | string[]` and no longer comma-splits a single string.
2. **Shared Zod schemas** for `specialties`, `states`, `influencerTypes` — `z.union([string, string[]])`.
3. **Frontend URL serialization** — `lib/api.ts` + `use-insights-report.ts` + 4 page components + `respondent-filters-bar.tsx`. Arrays now emit as repeated query params (`?k=A&k=B`), not CSV.
4. **`scripts/tunnel-up.sh`** — BASTION_IP + PGPASSWORD env-var-ized.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.31", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.31`.

### A2. The customer's bug is gone

Pick the customer's exact value. The whole reason for 4.1.14 ships:

```bash
TOK=...                # mint via cognito
DA=cml92bqnh00012msmjdr62saq; CL=cmmjq5hbl00jevqf87olee6yb
API=https://ik6dmnn2ra.us-east-2.awsapprunner.com

ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('Dry Eye (including OSD, MGD, and NK)'))")
curl -s -H "Authorization: Bearer $TOK" \
  "$API/api/v1/insights/$DA/demographics?clientId=$CL&coreFocuses=$ENC" | jq -r '.totalRespondents'
# Pre-4.1.14: 0
# 4.1.14:     ~288 (the originally-expected count per the bug report)
```

If this stays 0, the deploy didn't take effect or didn't pick up the fix. Rollback gate.

### A3. The other 7 Core Focus values still work

Regression check for the no-comma path:

```bash
for v in "Cataract/Refractive Surgery" "Comprehensive Ophthalmology" "Cornea" \
         "Glaucoma" "Medical Optometry" "Other: (please specify)" "Retina"; do
  ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$v")
  N=$(curl -s -H "Authorization: Bearer $TOK" "$API/api/v1/insights/$DA/demographics?clientId=$CL&coreFocuses=$ENC" | jq -r '.totalRespondents')
  echo "$v → $N"
done
# All should return non-zero counts (~156, 210, 265, 166, 326, 69, 59 for Sun Pharma DA).
```

---

## Phase B — Functional smoke (~10 minutes)

### B1. Browser UI on the Insights Demographics tab

Sun Pharma + Dry Eye DA → Demographics tab → top filter bar:

1. Open Core Focus dropdown. All 8 categories present.
2. Pick "Dry Eye (including OSD, MGD, and NK)". Dashboard updates; total respondents narrows to ~288; bar charts re-render with non-empty distributions.
3. With Dry Eye picked, ALSO pick Glaucoma. Total updates to the union (~444).
4. Clear filter → totalRespondents returns to the unfiltered baseline (~756).

### B2. Repeated query params on the wire

Open dev tools network panel during step B1.3. The request URL should contain `coreFocuses=Dry%20Eye%20(including%20OSD%2C%20MGD%2C%20and%20NK)&coreFocuses=Glaucoma` (two repeated params) — not `coreFocuses=Dry%20Eye%20(...)%2CGlaucoma` (a CSV).

If you see CSV in the request, the frontend serializer fix didn't take.

### B3. Same filter on the other Insights surfaces

Apply the same Dry Eye selection on:
- **Sociometric Leaders** matrix → list narrows; non-empty
- **Strategic / Benchmarking** (per-nomination LeaderTable) → narrows; non-empty
- **KOL Explorer** (if exposing the filter there) → narrows; non-empty

All three flow through the same parser; if one works, all should.

### B4. Cross-filter combination

With Dry Eye + Glaucoma picked, ALSO pick a Practice Setting. Total should narrow further (intersection of all three sets). Tests that multi-filter intersection still works after the parser change.

### B5. Legacy CSV format still works (back-compat)

Open a previously-loaded tab from prod-rel-4.1.13 in a separate window (don't refresh — keep the cached JS). Apply a Core Focus filter using values without commas. Should still work; the backend accepts both shapes.

This validates that anyone with a cached old client tab doesn't suddenly break.

### B6. Re-soak prior bundles

- **prod-rel-4.1.13**: Header brand badge still visible for TEAM_MEMBER; 4px brand stripe still renders; `/clients/me` still returns the right shape.
- **prod-rel-4.1.12**: Demographics Practice Setting multi-select still works.
- **prod-rel-4.1.11**: Demographics filter bar stays mounted across refetches.

---

## Phase C — 24h watch

### C1. CloudWatch — API error rate

Watch the `kol360-api` service for the 24h post-deploy window. Baseline error rate is <0.5%. Spike investigation:

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. Specific watch — Zod validation 400s

The schema change widens `specialties` / `states` / `influencerTypes` to accept arrays. If a Zod error surfaces on Insights query params (any 400 from `/insights/.../*` endpoints), investigate immediately — would mean the union type is rejecting a shape it should accept.

### C3. Filter latency

The parser added one branch (`Array.isArray` check) inside an already-tight function. No new queries, no I/O. Don't expect any p95 latency change on the three Insights endpoints. Spot-check if curious.

### C4. Customer signal — the loop-back

Loop back with the customer who reported the original bug (2026-06-09) within 48h of deploy. The Dry Eye case is the specific value they reported; confirming the filter works for them closes both the original 4.1.13 ticket and this 4.1.14 follow-up in one round.

---

## Rollback gate

If A1-A3 don't all pass within 30 min of deploy, redeploy `prod-rel-4.1.13`. The customer's Dry Eye case stays broken in that state but the other 7 categories continue to work — strictly an improvement over rolling further back.
