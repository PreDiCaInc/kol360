# prod-rel-3.3 — Soak Checks (v1.15.31)

Tag points at [`3ecbcfa`](https://github.com/PreDiCaInc/kol360/commit/3ecbcfa). Test-env regression was clean (154/155 — the 1 was the expected new-behavior-vs-old-API mismatch, passes post-deploy). These checks target what **v1.15.31 actually changes vs the live v1.15.30 prod** — don't re-run everything; trust the prod-rel-3.2 soak.

## What v1.15.31 changed (the universe of risk)

1. **Canonical Specialty flip**: `Hcp.specialty` reverse-canonicalized from role-form (Optometrist/Ophthalmologist) back to field-form (Optometry/Ophthalmology). `Specialty` table rows renamed to match.
2. **Bulk-import bypass fix**: `hcp.service.ts:521` now calls `normalizeHcpSpecialty(row.specialty)` per row so CSV imports can't slip non-canonical values in.
3. **DB CHECK constraint**: `Hcp_specialty_not_role_form` forbids OLD role-form values.
4. **UI label flips**: 7 sites updated to display field-form.

Everything else (KOL Analysis, scoring, nominations workflow, opt-outs, payments, exports, lite client, customer dashboards) is **unchanged** — covered by v1.15.28-30 soaks.

---

## Phase A — Migration verification (within minutes of deploy)

All read-only except A1 idempotency re-run.

### A1. Migration applied + idempotent re-run safe
```sql
-- Migration applied?
SELECT migration_name, finished_at IS NOT NULL AS applied
  FROM _prisma_migrations
 WHERE migration_name = '20260520_canonicalize_specialty_to_field_form';
-- (If your team applies via raw psql instead of prisma migrate deploy,
--  this row may not exist even after the migration ran — known baseline-
--  reconciliation gap. Check the table-level outcome via A2-A4 instead.)
```

Then re-run the migration file via `psql -v ON_ERROR_STOP=1 -f migration.sql`:
- Exit code must be 0.
- All UPDATE statements should report `UPDATE 0` (idempotent — no rows to convert).
- The `DO` block for the CHECK constraint should be a no-op (constraint already exists from first run).

### A2. Hcp.specialty distribution flipped
```sql
SELECT specialty, COUNT(*)
  FROM "Hcp"
 WHERE specialty IS NOT NULL
 GROUP BY specialty
 ORDER BY 2 DESC;
```
**Expected:** Top values are `Optometry` and `Ophthalmology` (NOT `Optometrist` / `Ophthalmologist`). Roughly 5,300 and 4,900 respectively (~10,200 total canonical). Plus ~38 `Oncology` rows still present (intentional — legacy out-of-domain).

**Failure signal:** any non-zero count for `Optometrist` or `Ophthalmologist` means the migration UPDATE didn't fire. Investigate before running E2E.

### A3. Specialty table rows renamed
```sql
SELECT name, code FROM "Specialty" ORDER BY name;
```
**Expected:** `Optometry` (code `OPTOMETRY`) + `Ophthalmology` (code `OPHTHALMOLOGY`). No rows for `Optometrist` / `Ophthalmologist`.

### A4. CHECK constraint in place + functioning
```sql
-- Constraint exists with expected definition?
SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conname = 'Hcp_specialty_not_role_form';
-- Expected: CHECK (((specialty IS NULL) OR (specialty <> ALL (ARRAY['Optometrist'::text, 'Ophthalmologist'::text]))))

-- Constraint actually enforces (read-only test on a known row):
BEGIN;
UPDATE "Hcp" SET specialty = 'Optometrist'
 WHERE id = (SELECT id FROM "Hcp" WHERE specialty IS NOT NULL LIMIT 1);
-- Expected: ERROR violates check constraint "Hcp_specialty_not_role_form"
ROLLBACK;
```

### A5. Drift check
```bash
cd apps/api
npx prisma migrate diff \
  --from-url "$PROD_DB_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```
Expect the same benign deltas as prod-rel-3.2 soak documented (the 3 trgm GIN false-positives). Anything new = investigate.

---

## Phase B — Functional smoke (1 steward, 5 minutes)

### B1. HCP form labels show field-form
1. `/admin/hcps` → click "Add HCP"
2. Specialty dropdown shows **exactly 2 options**: `Optometry`, `Ophthalmology` (NOT Optometrist/Ophthalmologist)
3. Cancel, then open an existing HCP detail — specialty column displays field-form
4. Quick check on `/admin/campaigns/[id]/survey-status` — specialty column reads field-form

### B2. HCP create via admin form works
1. Create new HCP with Specialty = Optometry → save → reload → confirms value persists
2. Verify the new HCP's `specialty` column in the DB is `'Optometry'` (not `'Optometrist'` and not the bypass-bug pattern)

### B3. Bulk CSV import normalizes correctly
Pick a small (5-10 row) test CSV with a mix of specialty values: `OD`, `Optometry`, `Optometrist`, `MD`, `Ophthalmology`, `Ophthalmologist`, plus one out-of-domain like `Cardiology`.
1. `/admin/hcps` → Import → upload
2. After import completes:
   ```sql
   SELECT npi, specialty FROM "Hcp" WHERE npi IN (<test-row-NPIs>);
   ```
   **Expected:** all in-domain values normalize to `Optometry` or `Ophthalmology`. `Cardiology` row has `specialty = NULL` (out-of-domain → normalizer returns null, row is otherwise imported intact).

### B4. CHECK constraint protects against the bypass
Synthetic direct DB write to confirm the safety net:
```sql
BEGIN;
INSERT INTO "Hcp" (id, "beId", npi, "firstName", "lastName", specialty, "createdAt", "updatedAt", "createdBy")
  VALUES ('cmsynthetic_block_check_test_0', 'BE-test', '9999999999', 'Synthetic', 'Block', 'Optometrist',
          NOW(), NOW(), 'd11b2570-8051-7098-327c-3d660a97d7a0');
-- Expected: ERROR violates check constraint "Hcp_specialty_not_role_form"
ROLLBACK;
```

### B5. Insights dashboards bucket correctly
1. `/admin/dashboards/<diseaseAreaId>` for any active DA
2. Respondent Analytics tab → "By Specialty" pie/bar chart shows `Optometry` + `Ophthalmology` + (maybe) `Other` slices — NOT role-form labels
3. KOL Explorer → click any KOL profile → degree column reads `OD` or `MD` correctly (the API derives it from `'Ophthalmolog'` substring match, so it works either way)

### B6. KOL Analysis dashboard (regression — must still work)
- Sun Pharma + B&L analyses load without error
- Top KOL list looks right
- No 500s in browser console — especially watching for any `degree` derivation breaking on field-form data

---

## Phase C — Background watch (continuous, 24h+)

### C1. CloudWatch — watch for CHECK-constraint 500s
```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"Hcp_specialty_not_role_form"' \
  --query 'events[*].message' --output text | tail -20
```
**Expected:** zero or a handful during the deploy window (rolling-deploy v1.15.30 instances), tapering to zero. **Failure signal:** persistent hits after the deploy fully completes → there's another bypass write path we missed.

### C2. New HCP creates check
```sql
-- 24h after deploy, what specialty values are new HCPs being created with?
SELECT specialty, COUNT(*)
  FROM "Hcp"
 WHERE "createdAt" > NOW() - INTERVAL '24 hours'
 GROUP BY specialty
 ORDER BY 2 DESC;
```
**Expected:** all new rows have `Optometry`, `Ophthalmology`, or `NULL`. **Failure signal:** any non-canonical (`Optometrist`/`Ophthalmologist`/`OD`/`MD`/etc.) post-deploy means a write path is still bypassing both Zod *and* the helper *and* the constraint — which shouldn't be possible after this release. Page me.

### C3. Survey portal sanity
- Public survey URL still loads + submits — specialty changes are admin-side only.

---

## Rollback criteria

Roll back to `prod-rel-3.2` (v1.15.30) **only if**:
- A1/A2/A3 fail (migration didn't apply or partially applied).
- Persistent CHECK-constraint 500s after the deploy window (C1) — indicates a writer we missed.
- New HCP creates show non-canonical values post-deploy (C2).
- KOL Analysis dashboards (B6) regress on field-form data.

**Rollback procedure** if needed: the migration is mostly reversible —
```sql
-- Reverse the canonicalization (~10K rows):
UPDATE "Hcp" SET specialty = 'Optometrist'      WHERE specialty = 'Optometry';
UPDATE "Hcp" SET specialty = 'Ophthalmologist'  WHERE specialty = 'Ophthalmology';
UPDATE "Specialty" SET name='Optometrist', code='OPTOMETRIST' WHERE name='Optometry';
UPDATE "Specialty" SET name='Ophthalmologist', code='OPHTHALMOLOGY' WHERE name='Ophthalmology';
-- Drop the CHECK constraint:
ALTER TABLE "Hcp" DROP CONSTRAINT IF EXISTS "Hcp_specialty_not_role_form";
```
The v1.15.30 code reads `Hcp.specialty` and `Specialty.name` directly — both work on the role-form again after this reverse. The hcp.service.ts bypass-fix can stay (it's a service-layer code change with no schema dependency).

---

## When to declare soak passed

Recommend: **2-3 business days** with all of these holding:
- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows zero persistent CHECK-constraint 500s + no non-canonical writes after the deploy window

Then **v1.15.32** (tighten CHECK to strict whitelist) is unblocked, and so is **Phase 3** (v1.16.0 — campaign-scoring teardown).
