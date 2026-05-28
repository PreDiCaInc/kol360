# prod-rel-4.1.7 — Soak Checks (v1.17.7)

Tag at the v1.17.7 merge commit on `main` (`2337dd8`) + this docs commit. Scoped to what 4.1.7 changes vs `prod-rel-4.1.6` — one search-behavior fix on two Insights surfaces, one additive table + seed, no breaking changes elsewhere. Short soak suffices.

## What v1.17.7 changed (the universe of risk)

1. **KOL Explorer + Sociometric Leaders search** now matches against `${firstName} ${lastName}` (was: first OR last, separately). Affects only the search path; sort, filter, pagination unchanged.
2. **New `InfluencerThreshold` table** (singleton, `id='default'`) seeded with `30 / 50 / 30 / 30` — same values previously hardcoded.
3. **`determineInfluencerType()`** now reads thresholds from the singleton row. Public API responses are unchanged at deploy moment (same labels) because the seed mirrors prior compiled values. Fallback to compiled defaults if the row is missing.

No other change.

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.7", ... }
```

Web — open `https://kol360.bio-exec.com`, check the footer / admin header → `1.17.7`.

### A2. Threshold table + seed row present

```sql
\d "InfluencerThreshold"
SELECT * FROM "InfluencerThreshold";
-- Expected: exactly one row, id='default',
--   nationalLeaderMinComposite=30, nationalLeaderMinSurvey=50,
--   risingStarMinSurvey=30, risingStarMaxComposite=30
```

If the table is missing or the row is missing, **stop and apply the migration**. Insights endpoints will fail until the table exists.

### A3. Insights endpoints respond (smoke)

```bash
# Replace <DA_ID> and <CLIENT_ID> with a real configured pair on prod.
TOKEN="<JWT>"
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/insights/<DA_ID>/kol-explorer?clientId=<CLIENT_ID>&page=1&limit=5" \
  | python3 -m json.tool | head -40
```

Expected: 200 with `items` array; each item carries an `influencerType` of `National Leaders`, `Rising Stars`, or `Regional Influencers`. A 503 here points at the table being missing (P2021).

---

## Phase B — Functional smoke (~5 minutes)

### B1. Insights — full-name search returns results (the headline)

1. Open `/admin/insights/<DA>/kol-explorer` (or whichever surface customer flagged)
2. In the search box, type the **first name only** of any KOL you can see in the list (e.g. `Joseph`) → results contain that KOL ✓ (this was always working)
3. Now extend to **first + last** (e.g. `Joseph Allen`) → results still contain that KOL ✓ (this was the bug)
4. Type **last name only** (e.g. `Allen`) → results contain that KOL ✓

Repeat once on **Sociometric Leaders** tab — same expected behavior.

### B2. Insights — influencer-type labels unchanged at deploy

Compare a handful of rows in KOL Explorer to a screenshot or note from 4.1.6:
- Same KOL → same `influencerType` label (`National Leaders` / `Rising Stars` / `Regional Influencers`)

Because the seed (30 / 50 / 30 / 30) matches what was hardcoded in 4.1.6, **no row should reclassify at deploy moment**. If any row changes label, the seed was wrong — see Rollback.

### B3. Threshold-table tunability (optional, only if you want to validate the dial works)

1. Pick a low-traffic moment.
2. Record current values from `SELECT * FROM "InfluencerThreshold";`
3. Raise the National Leader composite floor to a value that should reclassify some KOLs:
   ```sql
   UPDATE "InfluencerThreshold"
   SET "nationalLeaderMinComposite" = 99
   WHERE id = 'default';
   ```
4. Refresh KOL Explorer → most "National Leaders" should now show as "Rising Stars" or "Regional Influencers".
5. Restore:
   ```sql
   UPDATE "InfluencerThreshold"
   SET "nationalLeaderMinComposite" = 30
   WHERE id = 'default';
   ```
6. Refresh → labels return to prior values.

This is optional — the dev team has verified the tunability end-to-end on test. Only run on prod if you want to see it work with your eyes.

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

Expected: zero or unchanged from baseline. A spike of 503s with `InfluencerThreshold` / `P2021` in the message means the table never landed on prod — apply the migration immediately.

### C2. Insights search usage (informational, no rollback signal)

Optional — gauge whether the fix is being exercised:

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"kol-explorer" "search="' \
  --query 'events[*].message' --output text | wc -l
```

---

## Rollback criteria

Roll back to `prod-rel-4.1.6` **only if**:

- A1 fails — wrong version reported
- A3 / C1 — `P2021` (table missing) burst that you can't resolve by re-running the migration
- B1 fails — full-name search still returns 0 results (would indicate the fix didn't deploy)
- B2 fails — KOLs reclassify at deploy moment with no threshold change (would indicate the seed was wrong)

**Rollback procedure (Case A — code only, recommended):** redeploy v1.17.6. The `InfluencerThreshold` table sits unused. No data-state divergence.

**Rollback procedure (Case B — drop the table too):** rare. Only if you suspect the table itself is the culprit.
```sql
DROP TABLE IF EXISTS "InfluencerThreshold";
```
Then redeploy v1.17.6. Caveat: if anyone tuned values via psql between deploy and rollback, those tuned values are lost on drop (4.1.6 reverts to hardcoded 30/50/30/30).

---

## When to declare soak passed

Recommend **1 business day** with:
- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no Insights endpoint 5xx spike

After 4.1.7 soaks: threshold tuning iterations will happen against prod DB out-of-band (coordinate with dev team first time so the audit trail is right). Per-client `Client.region` setting remains the next-queued infrastructure improvement.
