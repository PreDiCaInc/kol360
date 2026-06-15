# prod-rel-4.1.22 — Handoff to Prod Team

**Status:** Ready for prod deploy. **1 migration (idempotent).** Reversible.
**Tag:** `prod-rel-4.1.22` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.21` (v1.17.41).
**Bundles:** v1.17.42 — data-team-managed influencer-type classification (replaces algorithmic determination) + UI polish accumulated since 4.1.21.

## TL;DR

The `influencerType` column on Insights surfaces (KOL Explorer "Type" column, Sociometric Summary, KOL Profile, Leader Rankings) used to be computed at request time from `compositeScore + scoreSurvey` thresholds. Pteam wants the data team to own classification: they classify HCPs per disease area and upload CSVs; the platform reads the manual value.

**Breaking semantic for the rollout window:** with the new column, when an HCP isn't classified for a given disease area, the column renders empty (NULL). **The data team must upload classifications before deploy** (or accept the column reading empty until they do).

## What changes for customers

| Surface | Before (4.1.21) | After (4.1.22) |
|---|---|---|
| `influencerType` source | Computed at runtime by `determineInfluencerType()` from `compositeScore + scoreSurvey` + `InfluencerThreshold` row | Read from `HcpDiseaseArea.influencerType` per (HCP, disease area). NULL when not classified — **no algorithmic fallback** |
| Allowed values | National Leaders / Rising Stars / Regional Influencers (computed) | Same 3 values (data-team-managed) |
| HCP admin page | "Import HCPs", "Import Aliases" | + new **"Import Influencer Types"** button — 2-step dialog: select disease area, upload CSV, preview ("Based on this file, 500 HCPs will be classified for Dry Eye"), confirm → write |
| Insights filter dropdown (Influencer Type) | Returns 3 buckets every time | Returns whatever the data team has classified (HCPs without a value drop out when filtering) |
| Sidebar branding when PLATFORM_ADMIN browses Insights | Always BioExec default | Lights up with the selected client's branding (logo, stripe, theme) via new view-as context. No impersonation flip, no API-header change. |
| KOL Explorer "Weighted Score" tab | Sticky `#` only, fixed columns | Sticky `# + Name` (anchor); new "Columns" popover hides Degree + City by default (data-team CSV: localStorage-persisted user prefs) |
| Sociometric Summary tab | Plain table | Sticky `# + Name`; same "Columns" popover (default hides City) |
| Collapsed sidebar | Click on "KOL Insights" did nothing visible | Click expands sidebar + opens the section in one shot |

## Migrations (1)

### `20260614_hcp_disease_area_influencer_type`

```sql
ALTER TABLE "HcpDiseaseArea"
  ADD COLUMN IF NOT EXISTS "influencerType" TEXT;
CREATE INDEX IF NOT EXISTS "HcpDiseaseArea_diseaseAreaId_influencerType_idx"
  ON "HcpDiseaseArea" ("diseaseAreaId", "influencerType");
```

Already applied to test DB. Safe to re-run via psql.

## API endpoints (new)

- `POST /api/v1/hcps/influencer-types/preview` — multipart: `file` (CSV) + `diseaseAreaId`. Returns `{ totalRows, matched, unmatchedNpi, invalidType, unmatchedDiseaseArea, countsByType, errorRows[] }`. Read-only.
- `POST /api/v1/hcps/influencer-types/import` — same shape, writes the values + emits a `hcp.influencer_types_imported` audit row.

CSV format: `NPI,InfluencerType`. Type values accepted: 'National Leaders', 'Rising Stars', 'Regional Influencers' (case-insensitive + singular alternates). Unknown values become per-row errors and are skipped — batch completes.

## Rollout — CRITICAL

**Coordinate the deploy with the data team.** The moment v1.17.42 goes live, every Insights `influencerType` column reads NULL until the data team uploads a classification CSV for each disease area in use.

Suggested sequence:
1. Merge PR + deploy
2. Data team uploads classifications for Sun Pharma Dry Eye (and any other disease areas the customer expects to see populated) within the same window
3. Customer-facing dashboards continue to look correct

If the data team isn't ready, hold the deploy. There's no algorithmic fallback by design.

## Risk

**Medium.** Schema migration is small + idempotent. The behavioral change is the rollout coordination above — that's the largest risk vector.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **230/230** |
| Migration applied to test DB | ✓ |
| New e2e (`influencer-type-import.test.ts`) | will run post-deploy |

## Rollback

Redeploy `prod-rel-4.1.21` (v1.17.41). Effects:
- `influencerType` reverts to algorithmic computation (3 buckets always populated).
- The new `HcpDiseaseArea.influencerType` column stays in the DB (harmless under 4.1.21 since the code doesn't read it).
- Any classifications the data team uploaded stay in the DB and become live again on next forward roll.

No data destruction.

## UI polish bundled in this release (no separate version bump)

- `7b4351d` — Opaque sticky-header bg on KOL Explorer (fixes scroll bleed-through)
- `f64bad9` — Sticky # + Name on Sociometric Summary
- `74da033` — Collapsed-sidebar click expands sidebar + section
- `8e0ff2d` — PLATFORM_ADMIN view-as branding in Insights
- `745b691` — Column-visibility selector on both tables
- `[this PR]` — Influencer-type import (the headline feature)

## See also

- Soak checks: [`prod-rel-4.1.22-soak-checks.md`](prod-rel-4.1.22-soak-checks.md)
- Predecessor: [`prod-rel-4.1.21-handoff.md`](prod-rel-4.1.21-handoff.md)
