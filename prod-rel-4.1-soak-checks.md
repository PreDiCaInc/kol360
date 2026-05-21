# prod-rel-4.1 — Soak Checks (v1.17.0)

Tag at [`0aa82cb`](https://github.com/PreDiCaInc/kol360/commit/0aa82cb). Scoped to what v1.17.0 changes vs the prior prod baseline (v1.15.31 OR v1.16.0 depending on whether prod-rel-4.0 was deployed first). Don't re-run everything — trust prior soaks.

## What v1.17.0 changed (the universe of risk)

1. **Schema** — DROP `CompositeScoreConfig`, DROP 4 vestigial computed columns on the two score tables. Irreversible.
2. **lite-client** — repointed from `HcpDiseaseAreaScore` to `HcpAnalysisScore` for composite + survey. **Customer-facing semantic shift** (pooled per-(client, DA) instead of disease-area-wide average).
3. **dashboard.service** — 4 methods repointed (`getScoreStats`, `getScoreDistribution`, `getTopKols`, `getSegmentScores`). Weights now from `KolAnalysis.weightsJson`.
4. **Specialty whitelist CHECK** — replaced blacklist with strict whitelist. Only Optometry/Ophthalmology/NULL accepted.
5. **Zod bypass fixes** — `createHcpFromNominationSchema` + `distribution.service.ts` CSV import path both tightened.
6. **Test pollution cleanup** — DELETE 22 historical orphan rows + UPDATE 3 seeded fixtures' specialty.

---

## Phase A — Migration + DB verification (within minutes of deploy)

### A1. Both migrations applied + idempotent re-run safe

```sql
-- Schema check 1: CompositeScoreConfig dropped
SELECT to_regclass('public."CompositeScoreConfig"') AS table_after_drop;
-- Expected: NULL (table gone)

-- Schema check 2: 4 vestigial columns dropped
SELECT 'HcpCampaignScore' AS where_,
       string_agg(column_name, ', ') AS dropped_cols_should_be_empty
  FROM information_schema.columns
 WHERE table_name='HcpCampaignScore' AND column_name IN ('scoreSurvey', 'compositeScore');
SELECT 'HcpDiseaseAreaScore' AS where_,
       string_agg(column_name, ', ') AS dropped_cols_should_be_empty
  FROM information_schema.columns
 WHERE table_name='HcpDiseaseAreaScore' AND column_name IN ('scoreSurvey', 'compositeScore');
-- Expected: both rows have NULL/empty for dropped_cols_should_be_empty

-- 8 objective columns on HcpDiseaseAreaScore retained
SELECT string_agg(column_name, ', ' ORDER BY column_name) AS objective_cols
  FROM information_schema.columns
 WHERE table_name='HcpDiseaseAreaScore' AND column_name LIKE 'score%';
-- Expected: scoreClinicalTrials, scoreConference, scoreMediaPodcasts,
--           scoreOrgAwards, scoreOrgLeadership, scorePublications,
--           scoreSocialMedia, scoreTradePubs
```

Re-run both migration files via `psql -v ON_ERROR_STOP=1 -f migration.sql` for each. Both must exit 0 with NOTICEs only on second run.

### A2. Specialty whitelist constraint active

```sql
-- Old blacklist gone, new whitelist installed
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname IN ('Hcp_specialty_not_role_form', 'Hcp_specialty_check');
-- Expected: only Hcp_specialty_check (CHECK ((specialty IS NULL) OR (specialty IN ('Optometry', 'Ophthalmology'))))

-- Enforcement read-only test
BEGIN;
UPDATE "Hcp" SET specialty = 'Cardiology' WHERE id = (SELECT id FROM "Hcp" LIMIT 1);
-- Expected: ERROR violates check constraint "Hcp_specialty_check"
ROLLBACK;
```

### A3. Cleanup applied

```sql
-- Pollution rows gone
SELECT COUNT(*) FROM "Hcp"
 WHERE email LIKE 'import.test%@e2etest.example.com'
    OR ("firstName" = 'Import' AND "lastName" = 'TestHCP');
-- Expected: 0

-- Specialty distribution: only canonical + NULL
SELECT specialty, COUNT(*) FROM "Hcp" GROUP BY specialty ORDER BY 2 DESC;
-- Expected: Optometry, Ophthalmology, NULL — nothing else.
```

### A4. Drift check

```bash
cd apps/api
npx prisma migrate diff \
  --from-url "$PROD_DB_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```
Expected: same benign deltas as prior soaks (3 trgm GIN false-positives). Plus possibly some additional deltas if you ran v1.17.0 migrations via raw `psql` — the `_prisma_migrations` table may not reflect them. Not blocking; documented housekeeping debt.

---

## Phase B — Functional smoke (1 steward + customer-facing surfaces, ~15 minutes)

### B1. lite-client portal works (and shows different numbers — that's expected)

Pick a lite-client account that's been actively viewed (Sun Pharma, B&L, whoever).

1. Log in as that client / use the lite portal URL
2. Disease area dashboard loads — no error
3. Top KOLs list populates
4. Per-HCP detail shows objective scores (8 segments) + composite + survey
5. **Expected:** composite + survey numbers will be DIFFERENT from what was on prod-rel-4.0. They now reflect the per-(client, DA) KOL Analysis (pooled normalization + per-analysis weights), not the disease-area-wide average. **This is correct, but worth telling the customer team so they don't panic.**
6. If a `(client, DA)` doesn't have an analysis configured: portal shows empty state with `notConfigured: true` — frontend should display a "contact admin" message gracefully (not a stack trace).

### B2. lite-client CSV export

Trigger CSV export from the lite portal. Open in Excel:
- All HCP attributes columns present (NPI, firstName, lastName, etc.)
- 8 objective score columns present (Publications, Clinical Trials, etc.)
- `scoreSurvey` + `compositeScore` columns populated from `HcpAnalysisScore` (not the old SCD)
- `nominationCount` populated

### B3. KOL Analysis dashboard (regression — must still work)

Same as prior soaks:
- Sun Pharma + B&L analyses load without error
- Top KOL list looks right (same names as prior soaks; same data source)
- Recalculate button works
- No 500s in browser console

### B4. Campaign dashboard (admin or client view)

Pick any CLOSED or PUBLISHED campaign with KOL Analysis data:
- `/admin/campaigns/[id]/dashboard` (or `/client/...`) loads
- Top KOLs table populates with composite scores
- Score distribution chart renders
- Segment score breakdown shows weights from the analysis (not stale per-campaign config)

### B5. HCP create — strict whitelist now enforced

1. `/admin/hcps` → "Add HCP"
2. Specialty dropdown shows exactly 2 options (Optometry, Ophthalmology)
3. Create HCP with Optometry → saves
4. Try to direct-POST `specialty: 'Cardiology'` to the API: expect 400 (Zod) before it reaches the DB. If something bypasses Zod and reaches DB: CHECK constraint catches with `Hcp_specialty_check`.

### B6. Bulk CSV import — non-canonical values get error message

Try a 1-row CSV with `Specialty: Cardiology` (out-of-domain):
- Import fails with the new error message: `"Cardiology" not recognized (expected Optometry or Ophthalmology, or aliases OD/MD/DO)`
- NOT the old "Specialty is required" misleading message
- NOT a raw Prisma error

Try 1-row CSV with `Specialty: OD` or `Specialty: Optometrist`:
- Import succeeds, HCP created with `specialty = 'Optometry'` (normalizer canonicalized)

### B7. Nomination create-HCP — clean 400 on old-form

If you have a nomination steward + an UNMATCHED nomination:
1. Open the nomination review dialog
2. Click "Create New HCP"
3. The form should only accept Optometry/Ophthalmology from the dropdown (UI constraint)
4. If someone direct-POSTs old-form `'Optometrist'` to `/api/v1/campaigns/:cid/nominations/:nid/create-hcp`: expect clean 400 with Zod message ('Invalid: Optometrist'), NOT a raw Prisma error in a browser alert.

---

## Phase C — Background watch (continuous, 24-48h)

### C1. CHECK-constraint hits

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"Hcp_specialty_check"' \
  --query 'events[*].message' --output text | tail -20
```

Expected: zero or a brief trickle right after deploy (stale-tab users — same pattern as 3.3, but should be even smaller since the v1.15.31 normalizer already exists in prod). After 30 min, **zero persistent hits**. Failure signal: persistent hits → there's a new bypass path we missed. Page me.

### C2. lite-client error rate

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"/lite" 500' \
  --query 'events[*].message' --output text | tail -20
```

Expected: no 500s. The repointed code falls back gracefully to `notConfigured: true` if no KolAnalysis exists. If you see 500s, the most likely cause is a `(client, DA)` pair that has BOTH a `liteClientDiseaseArea` assignment AND no `KolAnalysis` — investigate that customer / DA, configure their analysis.

### C3. Customer-visible composite numbers

Spot-check 2-3 lite-client portals over 24h. The numbers should be **different** from prior days (per the semantic shift), but **stable** (not changing minute-to-minute). If they're shifting wildly, something's recomputing more often than expected.

### C4. New HCP creates check

```sql
-- 24h post-deploy: any non-canonical specialty values written?
SELECT specialty, COUNT(*)
  FROM "Hcp"
 WHERE "createdAt" > NOW() - INTERVAL '24 hours'
 GROUP BY specialty
 ORDER BY 2 DESC;
```

Expected: only `Optometry`, `Ophthalmology`, or NULL. **Any other value is a bug** — Zod + CHECK should have blocked it. Page me with the row.

---

## Rollback criteria

Roll back to `prod-rel-4.0` **only if**:
- A1 fails — migrations didn't apply cleanly (investigate the SQL output)
- B1 fails — lite client throws 500s the `notConfigured` fallback doesn't catch (likely a code bug in the repoint)
- B3 fails — KOL Analysis dashboard regresses (the canary — unexpected; PR B shouldn't touch it)
- Persistent CHECK hits in C1 after deploy window (latent bypass we missed)
- Customer team flags the composite-number shift as actively harmful (e.g., contract violations)

**Rollback procedure:**
- Code rollback (redeploy prod-rel-4.0): v1.16.0 code paths read the now-missing `compositeScoreConfig` table + the dropped columns. **They will throw Prisma errors on prod.** This is the meaningful gotcha of irreversible migrations — a v1.16.0 redeploy doesn't restore the dropped data.
- True rollback would require: restore from the pre-cutover snapshot OR add the columns back as nullable + the table back as empty. **Hours of work, not minutes.** That's why we held PR B for 4.0 soak.
- More pragmatic if 4.1 breaks: hotfix forward (small bug fix on top of v1.17.0), not rollback.

---

## When to declare soak passed

Recommend **5-7 business days** with all of these holding:
- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no persistent CHECK hits + no lite-client 500s + no rogue new HCP specialty values
- Customer team has been told about the lite-client composite number shift and has signed off

After 4.1 soaks: **Phase 3 is officially done.** No queued workstream behind it.
