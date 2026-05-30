# prod-rel-4.1.9 — Soak Checks (v1.17.11, bundles v1.17.10)

Tag at the v1.17.11 merge commit + this docs commit on `main`. Scoped to what v1.17.10 + v1.17.11 change vs `prod-rel-4.1.8` — insights endpoint perf refactor; no behavior changes, no API contract shifts, one additive idempotent index.

## What 4.1.9 changed (the universe of risk)

1. **`/demographics`** — replaced full-table `SurveyResponseAnswer` load + JS aggregation loop with 13 parallel SQL `GROUP BY` queries.
2. **`/respondent-analytics`** — replaced full-table `CampaignHcp` + `SurveyResponse` load + JS distributions with 11 parallel SQL `GROUP BY` queries.
3. **`/filter-options`** — replaced fetch-and-dedupe with two `$queryRaw DISTINCT` queries.
4. **`/kol-explorer`, `/leader-rankings`, `/sociometric-summary`** — narrowed `prisma.hcp.findMany` select to the 6–7 fields actually consumed (down from ~20-column wide rows).
5. **`InfluencerThreshold`** — module-level cache, 60s TTL. Tuning `UPDATE` propagates within 60s instead of immediately.
6. **`Nomination_filter_idx`** — new composite index `(responseId, matchStatus, matchedHcpId)`. Idempotent migration.

No other change. No behavior contract changes. No API shape changes.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.11", ... }
```

Web — open `https://kol360.bio-exec.com`, check footer / admin header → `1.17.11`.

### A2. Index present

```sql
\d "Nomination"
-- Expected to include:
--   "Nomination_filter_idx" btree ("responseId", "matchStatus", "matchedHcpId")
```

If missing → apply the migration. Without it, the refactored insights endpoints still WORK (the new index is optional, not a hard dependency), but you miss the growth-insurance benefit.

### A3. Insights endpoints respond (smoke)

```bash
TOKEN="<JWT>"
DA_ID="<dry-eye-da-id>"
CLIENT_ID="<sun-pharma-client-id>"

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/respondent-analytics?clientId=$CLIENT_ID" \
  | python3 -m json.tool | head -20

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/$DA_ID/demographics?clientId=$CLIENT_ID" \
  | python3 -m json.tool | head -20
```

Expected: 200, full JSON shape. A 500 here probably means the SQL refactor hit an edge case not seen in test data — flag back with the specific endpoint + DA + client.

---

## Phase B — Functional smoke (the headline; ~10 minutes)

### B1. Insights tab numbers look right

Open `/admin/insights/<DA>` for Sun Pharma + Dry Eye. Visually compare each tab to a screenshot or notes from prod-rel-4.1.8:

- **KOL Explorer**: same KOL count, same top-N ordering by composite score, same scores per KOL. Influencer-type labels unchanged.
- **Sociometric Leaders**: same counts per nomination type. Top-N HCPs identical.
- **Leader Rankings**: same per-type rankings.
- **Demographics tab**: total respondents same, by-role/by-state/by-decile distributions same. Educational resources rank tables same. Core focus vs patients cross-tab same.
- **Respondent Analytics tab**: total respondents same, completed surveys same, response rate same, all 8 distributions same. Completion-over-time line chart shape same.

**Allowed differences (called out in the 4.1.9 handoff, not bugs):**

- **Tie-ordering on count-tied items may differ.** E.g., if two practice settings both have count=3, the order in which they appear in the bar chart may differ from 4.1.8. Look at the values, not the order.
- **Multi-campaign respondent edge:** a few percent of respondents may shift between adjacent buckets on `byDecile` and `coreFocusByPatients` because the old impl's "last write wins" by Prisma row order differs from the new impl's deterministic pick. If a Decile-3 bucket has 71 in 4.1.8 and 67 in 4.1.9, that's expected. If it has 71 vs 30, that's a real regression — flag it.

### B2. Threshold cache propagation (one tuning iteration)

If you've been tuning influencer thresholds via the prod-rel-4.1.7 `UPDATE InfluencerThreshold` flow:

```sql
UPDATE "InfluencerThreshold" SET "nationalLeaderMinComposite" = 35 WHERE id = 'default';
```

- Within ~60 s, KOL Explorer should reflect the new threshold (some Rising Stars → Regional, etc.).
- If it takes > 90 s, flag it — cache TTL is 60s; > 90s would indicate the cache isn't getting invalidated correctly.
- Set back to the original value when done.

This isn't a regression check per se — it's a confirmation that the cache behaves as documented in the handoff.

### B3. Filter options dropdown (the `DISTINCT` refactor)

Open KOL Explorer or any tab with the State / Specialty filter dropdown.

- Same specialties appear as on 4.1.8.
- Same US states appear (no AB / AU / non-US — the whitelist still applies app-side).
- Visual ordering (alphabetical) preserved.

### B4. Latency spot-check (the headline)

In browser dev-tools network tab on a fresh dashboard load, look at:

- `/demographics`: was ~1.45 s on 4.1.8 (per the 2026-05-28 perf review measurement); expect < 250 ms on 4.1.9.
- `/respondent-analytics`: was ~1.10 s; expect < 250 ms.
- `/filter-options`: was ~0.45 s; expect < 150 ms.
- KOL Explorer / Sociometric / Leader Rankings: 10–15% improvement.

If `/demographics` is still > 1 s on 4.1.9, something's off — either the deploy didn't take or the SQL refactor isn't using the indexes it expects. EXPLAIN the slow query to find out.

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

Expected: zero or unchanged from baseline. A spike of 500s with `prisma.$queryRaw` in the message points at a SQL edge case not covered by the test diff (the test env has a smaller dataset than prod, so some patterns are prod-only).

### C2. p50 latency drift over 24h

If you have a dashboard / CloudWatch Insights query for endpoint latency, watch the p50 stay below the targets through normal business-hours traffic. The refactor's wins should hold under load (the new SQL queries scale linearly with row count, not user count).

---

## Rollback criteria

Roll back to `prod-rel-4.1.8` **only if**:

- A1 fails — wrong version reported
- A3 / C1 — `/demographics` or `/respondent-analytics` returning 500s with SQL-related error messages
- B1 — distribution values shift meaningfully (more than the ~5% multi-campaign edge documented in the handoff; e.g., totals off by 20%+, or dimensions missing entirely)
- B4 — `/demographics` p50 still > 1 s after the deploy completes (means the refactor didn't take effect)

**Rollback procedure (Case A — code only, recommended):** redeploy v1.17.9. The `Nomination_filter_idx` index sits unused; v1.17.9 code doesn't depend on it. No data-state divergence.

**Rollback procedure (Case B — drop the index too):** rare. Only if you suspect the index itself is causing query-plan regressions elsewhere.
```sql
DROP INDEX IF EXISTS "Nomination_filter_idx";
```
Then redeploy v1.17.9.

---

## When to declare soak passed

Recommend **1 business day** with:

- Phase A passes immediately after deploy
- Phase B passes once on day 1 — particular attention on tile/chart numerics matching 4.1.8 within the documented tie-order + multi-campaign edges
- Phase C shows no insights endpoint 5xx spike + p50 stays below targets

After 4.1.9 soaks: no further perf items queued. Per-client `Client.region` setting + email-domain audit script remain as backlog.
