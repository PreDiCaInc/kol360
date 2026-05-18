# KOL Analysis — Production Cutover Runbook

Cut production over to analysis-backed scoring (Phases 1–2b + explainability).
**Prod currently has none of the KOL Analysis schema.** This runbook sequences
**migrate → backfill → deploy** so the dashboard never serves an empty
"not configured" state to users.

> Scope: brings prod from its current (pre-migration) version up to the latest
> merged version (v1.15.25 Phase 2b cutover; v1.15.26 explainability once
> PR #111 is merged). Does **not** include Phase 3 teardown (separate, later).

---

## 0. Why ordering matters (read first)

Phase 2b made the insights dashboard read `HcpAnalysisScore` (resolved per
client+disease-area). Failure modes if sequenced wrong:

| If… | Result |
|---|---|
| New code deployed, tables missing | API 500s on insights endpoints |
| New code deployed, tables empty (migrated, not backfilled) | Every dashboard shows "No analysis configured" |
| Migration applied, old code still serving | **Safe** — old code never touches the new tables |
| Backfill run, old code still serving | **Safe** — backfill only writes new tables |

**Therefore the safe order is: (1) migrate prod DB → (2) backfill prod DB from
local with latest code → (3) deploy new code.** When the new code goes live the
data is already there, so the "not configured" window is ~zero.

The new tables are **additive** (`KolAnalysis`, `KolAnalysisCampaign`,
`HcpAnalysisScore`) — old prod code does not reference them, so steps 1–2 are
non-disruptive and can run during normal operation.

---

## 1. Prerequisites & access

- **AWS:** profile `koluser`, region `us-east-2`.
- **Prod DB:** `kol360-db-prod.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432`,
  db `kol360`, user `kol360admin`, pw `RDS4Bioexec2025`.
- **Prod DB tunnel (local port 5433 — do NOT use 5432, that's the test tunnel):**
  ```
  ssh -i /Users/haranath/genai/kol360/kol360-bastion-key.pem \
    -L 5433:kol360-db-prod.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432 \
    ec2-user@3.142.171.8 -N -o StrictHostKeyChecking=no -f
  ```
  Prod connection string used below:
  `postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360`
- **Local checkout** on the target commit (PreDiCaInc `main` after the relevant
  PRs are merged), with:
  ```
  pnpm --filter @kol360/shared build      # backfill imports @kol360/shared
  cd apps/api && npx prisma generate      # client matches schema
  ```
- **Prod App Runner services** (source: **Bio-Exec/kol360** `main`):
  - kol360-api: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd` → https://ik6dmnn2ra.us-east-2.awsapprunner.com
  - kol360-web: `arn:aws:apprunner:us-east-2:163859990568:service/kol360-web/9fe5595685ad4ab89cdb29333ab1f5f6` → kol360.bio-exec.com
- **⚠ Open question to confirm before cutover:** the PreDiCaInc → Bio-Exec sync
  mechanism (how `main` propagates to the prod-source repo). Confirm the exact
  process/credentials with whoever owns the Bio-Exec remote before Step I.
  Remotes: PreDiCa `git@github.com:PreDiCaInc/kol360.git`,
  Bio-Exec `git@github.com:Bio-Exec/kol360.git`.

---

## 2. Pre-flight checks (no changes yet)

1. Record current prod version (for rollback):
   ```
   curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
   ```
   → note `version` = **PROD_ROLLBACK_VERSION**.
2. Confirm prod services `RUNNING`:
   ```
   aws apprunner describe-service --service-arn <api-arn>  --region us-east-2 --profile koluser --query 'Service.Status' --output text
   aws apprunner describe-service --service-arn <web-arn>  --region us-east-2 --profile koluser --query 'Service.Status' --output text
   ```
3. Open the prod tunnel (Section 1) and confirm connectivity:
   ```
   PGPASSWORD='RDS4Bioexec2025' psql -h localhost -p 5433 -U kol360admin -d kol360 -c "select now();"
   ```
4. **Enumerate pending migrations** (prod may be several versions behind — do
   not assume only the two KOL ones):
   ```
   cd apps/api
   DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
   DB_DIRECT_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
     npx prisma migrate status
   ```
   Expected genuinely-new: `20260515_add_kol_analysis_scoring`,
   `20260518_add_optout_hcpid_index_fk`,
   `20260518_add_regional_leader_nomination_type`. Review each pending
   migration's SQL.

   **⚠ Ledger reconciliation (confirmed needed by prod pre-flight).**
   `_prisma_migrations` is behind reality: several migrations
   (`20260310`, `20260320`, `20260323`, `20260403`, `20260514`) were applied
   to the prod DB via raw psql in past drops but are **not in the ledger**.
   A plain `migrate deploy` would try to re-run all of them and hard-fail on
   the first (e.g. `20260310` ADD COLUMN on an existing column) before ever
   reaching the new ones. **Before Step B**, mark the already-applied ones as
   applied (ledger-only, no DDL):
   ```
   for m in 20260310_<name> 20260320_<name> 20260323_<name> \
            20260403_add_beid_sequence 20260514_add_pg_trgm_for_fuzzy_match; do
     DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
       npx prisma migrate resolve --applied "$m"
   done
   ```
   (Use exact directory names from `prisma/migrations/`.) After this,
   `migrate deploy` will run **only** the genuinely-new migrations.
5. **Drift check** (prod has a history of manual-SQL drift — Feb 2025 incident):
   ```
   DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
     npx prisma migrate diff \
     --from-url "$DATABASE_URL" \
     --to-schema-datamodel prisma/schema.prisma --exit-code
   ```
   **Known-benign deltas (do NOT block on these — interpret the gate as
   "clean modulo the documented items"):**
   - **trgm GIN indexes** (`Hcp_lastName_trgm_idx`, `Hcp_firstName_trgm_idx`,
     `HcpAlias_aliasName_trgm_idx`): Prisma cannot express `gin_trgm_ops`, so
     `migrate diff` will **always** report these as "to remove." This is a
     permanent false-positive, never real drift. Ignore.
   - Pre-`20260518`: the **OptOut hcpId index + FK** delta and the
     **NominationType `REGIONAL_LEADER`** missing-enum-value delta are
     expected; resolved by `20260518_add_optout_hcpid_index_fk` and
     `20260518_add_regional_leader_nomination_type` in Step B. (Both were
     recent schema-without-migration gaps; now fixed.)
   - Any **other** delta → **STOP.** Reconcile before continuing.
   - NOTE: a static migrations-folder audit shows many *older* objects (init
     is a `db push` snapshot) that no migration file creates — but those
     exist on prod (built via historical `db push`) and so do **not** appear
     in this `--from-url PROD` diff. The prod diff is authoritative for the
     cutover; the folder-vs-schema debt is tracked separately and is NOT a
     cutover blocker.

**Go/No-Go gate:** services RUNNING, tunnel works, ledger reconciled, pending
migrations reviewed, drift = only the documented benign deltas, rollback
version recorded.

---

## 3. Step A — Prod DB snapshot (rollback safety net)

Take an RDS snapshot before any DDL:
```
aws rds create-db-snapshot \
  --db-instance-identifier kol360-db-prod \
  --db-snapshot-identifier kol360-db-prod-pre-kolanalysis-$(date +%Y%m%d%H%M) \
  --region us-east-2 --profile koluser
```
Wait until `available`:
```
aws rds describe-db-snapshots --db-snapshot-identifier <id> --region us-east-2 --profile koluser --query 'DBSnapshots[0].Status'
```
(New tables are additive so a snapshot is belt-and-suspenders, but mandatory
before prod DDL.)

---

## 4. Step B — Apply migrations to prod DB

Old prod code does not touch the new tables, so this is non-disruptive.
```
cd apps/api
DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
DB_DIRECT_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
  npx prisma migrate deploy
```
- Runs **only the genuinely-new** migrations now (ledger reconciled in §2.4):
  `20260515_add_kol_analysis_scoring`, `20260518_add_optout_hcpid_index_fk`,
  `20260518_add_regional_leader_nomination_type`.
- All are **idempotent** (`CREATE … IF NOT EXISTS`, `ADD VALUE IF NOT
  EXISTS`, FK in guarded `DO` blocks) — re-running does not hard-fail. Safe
  whether applied here via `migrate deploy` or via raw psql.
- `20260518_add_regional_leader_nomination_type` adds the
  `REGIONAL_LEADER` value to the `NominationType` enum (mirrors the proven
  `20260306` pattern). Lone `ADD VALUE` — transaction-safe.
- `20260518` also **nulls any dangling `OptOut.hcpId`** (HCP since
  deleted/re-imported) before adding the FK — a deliberate, safe data
  normalization (opt-out lookups are email-canonical post-v1.15.14; hcpId is
  provenance only). Expect a non-zero `UPDATE` count on prod; that is normal,
  not an error.

Verify the three tables exist:
```
PGPASSWORD='RDS4Bioexec2025' psql -h localhost -p 5433 -U kol360admin -d kol360 -c "\dt \"KolAnalysis\" \"KolAnalysisCampaign\" \"HcpAnalysisScore\""
```

### Step B' — Post-migration drift check
```
cd apps/api
DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
  npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```
Interpret as **"clean modulo the documented benign deltas"** (same rule as
§2.5):
- The **trgm GIN indexes** false-positive will still appear — Prisma can't
  express `gin_trgm_ops`. Permanent, ignore.
- The **OptOut hcpId index/FK delta must now be GONE** —
  `20260518_add_optout_hcpid_index_fk` resolved it. If it still shows →
  the migration didn't apply; STOP.
- The **NominationType `REGIONAL_LEADER` delta must now be GONE** —
  `20260518_add_regional_leader_nomination_type` resolved it. If it still
  shows → STOP.
- The **KOL Analysis tables delta must now be GONE** — `20260515` created
  them. If it still shows → STOP.
- **Any other delta → STOP**, reconcile before backfill/deploy.

Net expected state: drift output contains **only** the three trgm index
lines. Anything else is a real problem.

---

## 5. Step C — Backfill prod (dry-run → execute)

Run from local with the **latest code** against the prod DB. Old prod code is
still serving and is unaffected (new tables only).

Dry-run (no writes — review the plan):
```
cd apps/api
DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
  npx tsx ../../scripts/backfill-kol-analysis.ts
```
Review: number of (client, disease area) pairs → analyses, campaign counts,
weights source (`from CompositeScoreConfig` vs `DEFAULT`). Sanity-check the
count is plausible for prod's client/disease-area footprint.

Execute:
```
DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
  npx tsx ../../scripts/backfill-kol-analysis.ts --execute
```
- Idempotent: re-runs skip existing (client, DA) analyses. Safe to re-run.
- Record: analyses created, total HCP scores recalculated. Larger than test
  (test produced 8 analyses); allow more time on prod volume.

---

## 6. Step D — Spot-check prod data (before deploying code)

Via psql on the prod tunnel:
```
PGPASSWORD='RDS4Bioexec2025' psql -h localhost -p 5433 -U kol360admin -d kol360 -c "
  SELECT count(*) AS analyses,
         (SELECT count(*) FROM \"HcpAnalysisScore\") AS scores,
         (SELECT count(*) FROM \"KolAnalysisCampaign\") AS links
  FROM \"KolAnalysis\";"
```
Pick the largest analysis and verify internal consistency (per-type score must
equal `count / pooledMax × 100`; on test this was exact, e.g. 48/71→67.61):
```
PGPASSWORD='RDS4Bioexec2025' psql -h localhost -p 5433 -U kol360admin -d kol360 -c "
  SELECT h.\"nominationCount\", h.\"scoreSurvey\", h.\"compositeScore\",
         h.\"countNationalLeader\", h.\"scoreNationalLeader\"
  FROM \"HcpAnalysisScore\" h
  JOIN \"KolAnalysis\" k ON k.id=h.\"analysisId\"
  ORDER BY h.\"nominationCount\" DESC LIMIT 5;"
```
**Go/No-Go gate:** analyses + scores present and internally consistent.

---

## 7. Step E — Deploy code to prod

1. **Sync PreDiCaInc `main` → Bio-Exec `main`** using the confirmed process
   (see ⚠ in Section 1). Target commit = the merged version (≥ v1.15.25;
   v1.15.26 if PR #111 merged).
2. Trigger App Runner deploys (if not auto on Bio-Exec push):
   ```
   aws apprunner start-deployment --service-arn <prod-api-arn> --region us-east-2 --profile koluser
   aws apprunner start-deployment --service-arn <prod-web-arn> --region us-east-2 --profile koluser
   ```
3. Poll until both `RUNNING` and the API `/health` reports the target version:
   ```
   curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
   ```

Data is already populated (Steps B–C), so the dashboard works from the first
post-deploy request.

---

## 8. Step F — Post-deploy verification

1. `/health` version matches target; both services `RUNNING`.
2. Final drift check against prod (per the standing rule):
   ```
   cd apps/api
   DATABASE_URL='postgresql://kol360admin:RDS4Bioexec2025@localhost:5433/kol360' \
     npx prisma migrate diff --from-url "$DATABASE_URL" \
     --to-schema-datamodel prisma/schema.prisma --exit-code   # expect 0
   ```
3. Manual smoke on **kol360.bio-exec.com** (PLATFORM_ADMIN):
   - `/admin/kol-analysis` lists the backfilled analyses with scored-HCP counts.
   - Insights dashboard: pick a client+disease-area with an analysis → summary +
     tabs populate (not "not configured").
   - A client+DA with no analysis → clean "No analysis configured" empty state.
   - Score troubleshooting: search an HCP → breakdown renders; recomputed == stored.
4. CloudWatch error scan (api):
   ```
   aws logs filter-log-events \
     --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
     --start-time $(( $(date +%s) - 900 ))000 --region us-east-2 --profile koluser \
     --query 'events[*].message' --output text | tail -50
   ```

---

## 9. Rollback

The new tables are additive and unused by old code, so rollback is **code-only**
— no DB rollback needed:

1. Redeploy **PROD_ROLLBACK_VERSION** (Section 2) by syncing Bio-Exec `main`
   back to that commit and triggering App Runner deploys, or App Runner
   "Deploy previous".
2. Old code reads the legacy `HcpDiseaseAreaScore` path; the KOL Analysis tables
   sit idle and harmless. Backfill is idempotent so re-attempting later is safe.
3. Only restore the RDS snapshot if drift/corruption is detected (not expected
   from additive DDL).

---

## 10. Timing, comms, ownership

- Suggested window: low-traffic; Steps B–D (~no user impact) can run ahead of
  time; Step E (deploy) is the only user-visible moment (~5–8 min App Runner).
- Estimated effort: pre-flight 15m · migrate 5m · backfill dry+exec 10–30m
  (prod volume) · spot-check 10m · deploy+verify 20m.
- Owner: platform admin with prod AWS + bastion access. Announce the deploy
  window; insights briefly recomputes-fresh but is populated before code flips.

---

## 11. Post-cutover (not blocking)

- **Curation:** platform admin reviews backfilled analyses — exclude stale
  campaigns, set per-analysis weights, Recalculate. The dedup report +
  Score-troubleshooting view (v1.15.26) are available for sanity-checking.
- **Insights nav:** the sidebar "Insights" item is still `disabled` ("coming
  soon"). Enabling it for prod clients is a **separate product decision** — not
  part of this cutover.
- **Phase 3 teardown** (drop `CompositeScoreConfig`, strip campaign composite,
  delete campaign Score Config UI, re-semantic `publish()`) is a later,
  separate change with its own runbook.

---

## Quick checklist

- [ ] Pre-flight: prod version recorded, services RUNNING, tunnel ok
- [ ] Ledger reconciled (`migrate resolve --applied` the 5 psql-applied ones)
- [ ] `prisma migrate status` reviewed; drift = only documented benign deltas
      (trgm indexes always; OptOut hcpId until `20260518` applies)
- [ ] RDS snapshot `available`
- [ ] `prisma migrate deploy` on prod; 3 KOL tables + OptOut hcpId idx/FK
      present; post-migrate drift = only the 3 trgm index lines
- [ ] Backfill dry-run reviewed
- [ ] Backfill `--execute`; counts recorded
- [ ] Prod data spot-check consistent
- [ ] Code synced to Bio-Exec; App Runner deployed; `/health` = target version
- [ ] Post-deploy drift 0; dashboard smoke passes; CloudWatch clean
- [ ] Rollback version + snapshot id documented somewhere durable
