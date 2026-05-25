# prod-rel-4.0 — Soak Checks (v1.16.0)

Tag at [`4dc3ce4`](https://github.com/PreDiCaInc/kol360/commit/4dc3ce4). Test-env regression clean (150/150 — 5 fewer than 3.3 because the 5 score-calculation tests went with their endpoints). These checks target what **v1.16.0 changes vs live v1.15.31 prod** — don't re-run everything; trust the v1.15.31 soak.

## What v1.16.0 changed (the universe of risk)

1. **Backend deletes**: 5 route/service files for `/score-config` + `/scores/calculate-*` + `/hcps/recalculate-composites`.
2. **Backend edits**: `campaigns.publish()` no longer recalcs; nominations post-bulk-match no longer recalcs; export.service.ts drops 2 columns + the Rank column.
3. **Frontend**: workflow steps gone; redirect at `/admin/campaigns/[id]/scores`; Recalculate Composites button gone from `/admin/hcps/scores`.
4. **Shared**: `score-config.ts` schema deleted; `DEFAULT_SCORE_WEIGHTS` moved to `kol-analysis.ts`.
5. **Migration**: `20260520_heal_specialty_cuid_ids` — heals UUID-shaped `Specialty.id` + `HcpSpecialty.id` rows. No-op on a freshly-applied DB; small UPDATE pass on prod (~2-5 rows).

Everything else (KOL Analysis pipeline, nominations workflow, opt-outs, payments, lite client, customer dashboards, Specialty canonical form from 3.3, HCP forms) is **unchanged** — covered by prod-rel-3.0 through 3.3 soaks.

---

## Phase A — Migration + drift verification (within minutes of deploy)

### A1. Specialty cuid heal applied + idempotent
```sql
-- Migration recorded?
SELECT migration_name FROM _prisma_migrations
 WHERE migration_name = '20260520_heal_specialty_cuid_ids';
-- (If your team applies via raw psql, this row may not exist. Verify via A2.)
```

Re-run the migration via `psql -v ON_ERROR_STOP=1 -f migration.sql`:
- Exit 0.
- The two FOR-loops in the DO block should iterate 0 rows on re-run (all rows already cuid-shape from first run).

### A2. Specialty + HcpSpecialty IDs are cuid-shape
```sql
SELECT 'Specialty' AS what,
       COUNT(*) FILTER (WHERE position('-' IN id) > 0) AS uuid_shaped,
       COUNT(*) FILTER (WHERE position('-' IN id) = 0) AS cuid_shaped,
       COUNT(*) AS total
  FROM "Specialty";
SELECT 'HcpSpecialty' AS what,
       COUNT(*) FILTER (WHERE position('-' IN id) > 0) AS uuid_shaped,
       COUNT(*) FILTER (WHERE position('-' IN id) = 0) AS cuid_shaped,
       COUNT(*) AS total
  FROM "HcpSpecialty";
```
**Expected:** `uuid_shaped = 0` for both. Failure signal: any UUID-shaped row remaining means the HEAL block didn't run on that row (investigate before B-phase).

### A3. Drift check
```bash
cd apps/api
npx prisma migrate diff \
  --from-url "$PROD_DB_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```
**Expected:** same benign deltas as previous soaks (3 trgm GIN false-positives), plus possibly the `CompositeScoreConfig` table and the 4 vestigial computed columns on `HcpCampaignScore` + `HcpDiseaseAreaScore` if the schema.prisma was updated in PR A. (Actually no — PR A is code-only, schema.prisma still declares them. PR B drops them. So drift should be identical to prior soaks.) Anything else = investigate.

---

## Phase B — Functional smoke (1 steward, 10 minutes)

### B1. Campaign workflow sidebar no longer shows the gone steps
1. `/admin/campaigns/[id]` for any campaign in any state
2. Sidebar shows: **Overview, HCPs, Templates, Initiate Survey, Nominations, Payments, Survey Status**. **No** `Score Config`, **no** `Survey Scores`.
3. Step numbering shifts up — that's expected.

### B2. Campaign Activate gate works without scoreConfigConfirmedAt
1. Create a new DRAFT campaign with HCPs assigned + a survey template + email templates confirmed.
2. **No** Score Config confirm-and-continue step blocks Activate.
3. Activate succeeds → status → ACTIVE.

### B3. `/admin/campaigns/[id]/scores` redirects to `/admin/kol-analysis`
1. Navigate directly (paste URL or use a bookmark).
2. Lands at `/admin/kol-analysis` in one transparent hop. No 404 page flash.

### B4. `/admin/hcps/scores` has no Recalculate Composites button
1. `/admin/hcps/scores`
2. Header row has **Import Survey/Segment Scores** button. **No** Recalculate Composites button.

### B5. KOL Analysis dashboard (regression — must still work)
- Sun Pharma + B&L analyses load without error.
- Top KOL list looks right (same names as prior soaks).
- Clicking **Recalculate** on an analysis page still works (this is the analysis-side recalc, not the deleted hardcoded-weights endpoint — different code path).
- No 500s in browser console.

### B6. /publish on a CLOSED campaign — status-only behavior
Pick a CLOSED campaign (or close an active one). Click Publish:
- Campaign status moves CLOSED → PUBLISHED.
- **No** campaign-level Survey/Composite score calculation fires anymore.
- The auto-recalc on any KOL Analysis that includes this campaign still fires (best-effort, doesn't block publish). Check `lastCalculatedAt` on a relevant analysis to confirm.

### B7. Score export CSV — columns dropped
1. Pick any CLOSED or PUBLISHED campaign.
2. Trigger Score export via the existing UI flow.
3. Open the CSV. **Expected columns:** `NPI, First Name, Last Name, Email, Specialty, City, State, Publications Score, Clinical Trials Score, Trade Pubs Score, Org Leadership Score, Org Awareness Score, Conference Score, Social Media Score, Media/Podcasts Score, Nomination Count`. **NOT present:** `Rank`, `Survey Score`, `Composite Score`. Ordering: alphabetical by lastName, then firstName.

### B8. Bulk-match nominations — no post-recalc fires
1. Pick an ACTIVE campaign with UNMATCHED nominations.
2. Run Auto-Match (or use the new bulk-accept flow from v1.15.29).
3. **Expected:** matching succeeds. No campaign-level recalc warning in CloudWatch logs (`'Auto score calculation failed after bulk match'` should never appear because the call is gone).

---

## Phase C — Background watch (continuous, 24h+)

### C1. 404s on deleted endpoints
```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"score-config" OR "calculate-survey" OR "calculate-composite" OR "calculate-all" OR "recalculate-composites"' \
  --query 'events[*].message' --output text | tail -30
```
**Expected:** zero or a brief trickle during the deploy window (rolling-deploy v1.15.31 instances still serving), tapering to zero. **Failure signal:** persistent 404s after the deploy fully completes → external integration we didn't know about. Investigate the caller; we may need to reach out to whoever's hitting it.

### C2. Score Status tile on CLOSED campaign cards
1. Open a CLOSED campaign's main page.
2. Score Status tile reads either "Publish to update analysis" (status != PUBLISHED) or "✓ Published — analysis recalculated" (status == PUBLISHED).
3. Visually confirm with the customer team that this language matches expectations (the previous version showed an HCP count from `campaignScores`).

### C3. KOL Analysis dashboard composite scores still look right
24h after deploy:
1. Pick any analysis with `lastCalculatedAt` within the last 24h (i.e., a campaign in its set published recently).
2. Verify top-KOL list, composite values, distribution — should match prior days' snapshots barring legitimate data changes.
3. Failure signal: if composite values shift unexpectedly, the dashboard.service.ts → compositeScoreConfig read may be picking up a stale value that PR B's repoint will fix. Note it; not a rollback trigger.

### C4. Customer-facing client dashboards
Public client dashboard URLs still load + show correct scores. The dashboards read from `HcpAnalysisScore` (Phase 2 cutover) — unaffected by PR A.

---

## Rollback criteria

Roll back to `prod-rel-3.3` (v1.15.31) **only if**:
- A2 fails (UUID-shaped IDs remain) AND a downstream consumer is breaking on them.
- B5 fails — KOL Analysis dashboard regresses (unexpected, since PR A doesn't touch it, but the canary).
- B6 fails — `/publish` errors or doesn't move status (would mean the publish() refactor broke).
- C1 shows a persistent caller of the deleted endpoints that we can't get to upgrade quickly.

**Rollback procedure** if needed: v1.15.31 code paths read against the v1.16.0 schema cleanly (we didn't drop anything — that's PR B). So a code-only rollback is the safer path. The Specialty cuid heal is non-reversing (heal is one-way — UUID-shaped IDs are gone). The deleted-endpoints-now-404 reverts to functioning when v1.15.31 redeploys.

---

## When to declare soak passed

Recommend: **5-7 business days** with all of these holding:
- Phase A passes immediately after deploy.
- Phase B passes once on day 1.
- Phase C shows zero persistent 404s on the deleted endpoints.
- Customer-facing dashboards continue to look right over the window.
- No new bugs flagged against the campaign workflow (the surface that changed visually).

Then **Phase 3 PR B** (the irreversible schema drops) is unblocked. Also **v1.15.32** (CHECK constraint tightening) is unblocked once 4.0 has had its window.
