# prod-rel-4.1.7 — Handoff to Prod Team

**Status:** Ready for prod deploy. One additive migration + code change. Reversible (see Rollback).
**Tag:** `prod-rel-4.1.7` → commit `2337dd8` on `main`.
**Supersedes:** `prod-rel-4.1.6` (v1.17.6 — rename dialog inline match).

## TL;DR

Two changes bundled in v1.17.7:

1. **Insights search bug fix** — multi-token full-name queries like "joseph allen" returned 0 records on KOL Explorer + Sociometric Leaders. Now they match.
2. **Influencer-type labels (National Leaders / Rising Stars / Regional Influencers) are now tunable** without a redeploy. The 4 cut-off values live in a new singleton DB row; edit via psql to retune anytime. Defaults are identical to the prior compiled constants — **labels do not change at deploy time**.

## What's in it

### Bug 1 — Insights full-name search

**Pre-fix:**
- User types "joseph allen" in the Insights search box
- API checks `firstName.includes("joseph allen") || lastName.includes("joseph allen")` separately
- Neither matches (firstName is "joseph", lastName is "allen"); 0 results
- Typing just "joseph" or just "allen" works

**Post-fix:**
- API now matches against `${firstName} ${lastName}` as a single string
- "joseph allen" → matches Joseph Allen
- NPI substring match preserved on KOL Explorer

**Surfaces fixed:**
- KOL Explorer (Insights tab 5 / Total Weighted Score)
- Sociometric Leaders (Insights tab 4)

### Bug 2 (feature) — Tunable influencer-type thresholds

**Why:** the National / Rising / Regional cut-off values are still being iterated on. Each round shouldn't require a full edit → PR → deploy cycle.

**What:**
- New table `InfluencerThreshold` — singleton row, `id = 'default'`
- 4 integer columns: `nationalLeaderMinComposite`, `nationalLeaderMinSurvey`, `risingStarMinSurvey`, `risingStarMaxComposite`
- Service reads the row once per insights call; falls back to compiled defaults if the row is somehow missing
- **Seeded at migration time with `30 / 50 / 30 / 30`** — same values that were hardcoded prior to v1.17.7, so classification behavior is identical at deploy moment

**Classification rules (unchanged from prior code):**
- `National Leaders`: composite ≥ minComposite AND survey ≥ minSurvey
- `Rising Stars`: survey ≥ minSurvey AND composite < maxComposite
- `Regional Influencers`: everyone else

**How to retune values after deploy (no redeploy needed):**

```sql
-- Read current values
SELECT * FROM "InfluencerThreshold";

-- Tune (example: raise the National Leader composite floor)
UPDATE "InfluencerThreshold"
SET "nationalLeaderMinComposite" = 35
WHERE id = 'default';
```

Next insights API call picks it up. No service restart, no cache invalidation.

## Migrations

**One migration, idempotent:** `20260528_add_influencer_threshold_table`

```sql
CREATE TABLE IF NOT EXISTS "InfluencerThreshold" (
  "id"                         TEXT      PRIMARY KEY,
  "nationalLeaderMinComposite" INTEGER   NOT NULL,
  "nationalLeaderMinSurvey"    INTEGER   NOT NULL,
  "risingStarMinSurvey"        INTEGER   NOT NULL,
  "risingStarMaxComposite"     INTEGER   NOT NULL,
  "updatedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "InfluencerThreshold" (
  "id", "nationalLeaderMinComposite", "nationalLeaderMinSurvey",
  "risingStarMinSurvey", "risingStarMaxComposite"
) VALUES ('default', 30, 50, 30, 30)
ON CONFLICT ("id") DO NOTHING;
```

**Apply order:** migration first, then code deploy. The v1.17.7 service queries `InfluencerThreshold` on every Insights call; if the table doesn't exist, Prisma will throw P2021 and the Insights endpoints will 503. With migration in place, the singleton row provides the values; if the row is missing for any reason, the service silently falls back to the compiled defaults.

Safe to re-run the SQL — both DDL and the seed INSERT are guarded (`IF NOT EXISTS` + `ON CONFLICT DO NOTHING`).

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| Migration applied to test DB | ✅ singleton row present with seed defaults (30/50/30/30) |
| E2E suite (test env, v1.17.7) | **181/181 passing** |
| New regression: multi-token search ("Sarah Williams" → 1 result) | ✅ |
| New regression: influencer-type label sanity (50 KOLs, all 3 labels valid) | ✅ |
| Deploy status | API + web both RUNNING at v1.17.7 |

## Customer-facing change worth signaling

- **Admin Insights:** searches that include both first and last name now return results. Anyone who had been telling customers to "use first name only" can retire that workaround.
- **Influencer-type values are now dynamic.** If/when prod team and Bio-Exec settle on different thresholds, they can be updated against prod DB without a release cycle. Coordinate any change via the standard runbook so the audit trail (who changed what, when) is captured externally.

## Soak checks

[`prod-rel-4.1.7-soak-checks.md`](prod-rel-4.1.7-soak-checks.md) — 3-phase checklist. Recommend **1-day soak**.

## Rollback

Two cases:

**Case A — code rollback only (table stays):** redeploy `prod-rel-4.1.6`. The `InfluencerThreshold` table sits unused; older code paths don't touch it. No data-state divergence.

**Case B — full rollback (drop the table):** rare, only if you suspect the table itself is causing issues.
```sql
DROP TABLE IF EXISTS "InfluencerThreshold";
```
Then redeploy `prod-rel-4.1.6`. Note: if 4.1.7 ran for any meaningful period and anyone tuned values via psql, those tuned values are lost on drop. Only the seeded defaults match what 4.1.6 had hardcoded, so dropping after tuning means a label-classification regression that 4.1.6 then re-enforces with the original 30/50/30/30.

## What's next on our side

- **Threshold tuning iterations** — first edit will happen out-of-band against prod DB once the customer confirms the value direction. Will coordinate before pushing.
- **Future small PR** — per-client `Client.region` setting (replaces hardcoded US state whitelist from v1.17.4). Doesn't block anything.
