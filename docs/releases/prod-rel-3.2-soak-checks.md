# prod-rel-3.2 — Soak Checks (v1.15.30)

Renamed from `prod-rel-3.1-soak-checks.md`. `prod-rel-3.1` (v1.15.30) was caught in pre-deploy review with a UUID-vs-cuid bug in the seeded Medical Oncology DA + backfilled HcpDiseaseArea rows — same class as the SOT campaign-ID issue. `prod-rel-3.2` (v1.15.30) ships the corrected migration with a single `pg_temp.cuid_like()` helper plus a HEAL block that self-corrects any pre-existing UUID-shaped IDs. The 3.1 tag is kept as a "caught in review" fossil.

Tag points at the v1.15.30 merge commit. Test-env: migration re-applied cleanly, 155/155 E2E pass. These checks target what **v1.15.30 actually changes vs. prod (v1.15.28)** — don't re-run everything; trust v1.15.28's soak.

## What v1.15.30 changed (the universe of risk)

1. **DB migration** `20260519_add_hcp_disease_area_and_normalize_specialty` — creates `HcpDiseaseArea`, normalizes Specialty rows + `Hcp.specialty` string values, seeds Medical Oncology DA, nulls Interstitial Lung Disease entries.
2. **HCP create/edit form** — specialty is now a 2-value dropdown; sub-specialty is a DA-backed MultiSelect.
3. **HCP list filter** — adds sub-specialty MultiSelect filter on `/admin/hcps`.
4. **Nominations page** — inline "Accept" link per row; bulk-accept button; low-confidence confirm modal; Create-New-HCP inside the review dialog.
5. **New API endpoints** — `POST /campaigns/:id/nominations/top-suggestions`, `POST /campaigns/:id/nominations/bulk-accept`, `?diseaseAreaIds=…` on `/api/v1/hcps`.

Everything else (KOL Analysis, scoring, opt-outs, payments, exports, lite client, customer dashboards) is **unchanged** — those are covered by prod-rel-3.0's soak.

---

## Phase A — Migration verification (within minutes of deploy)

These run against prod DB via the bastion. Quick, all-read except idempotency check.

### A1. Migration applied + idempotent re-run safe
```sql
-- Did the new table get created?
SELECT to_regclass('public."HcpDiseaseArea"') IS NOT NULL AS hcp_da_table_exists;
-- Expected: true

-- Did the FKs land?
SELECT conname FROM pg_constraint
WHERE conrelid = '"HcpDiseaseArea"'::regclass AND contype = 'f'
ORDER BY conname;
-- Expected: 2 rows — fkey to Hcp, fkey to DiseaseArea
```

Then re-run the migration file via `psql -v ON_ERROR_STOP=1 -f migration.sql`:
- Exit code must be 0
- Output should be all NOTICEs (no actual changes — migration is idempotent)

### A1.5. ID shape sanity (new in v1.15.30 — guards against the cuid bug)
```sql
-- Medical Oncology DA id must be cuid-shaped (no hyphens, 25 chars).
SELECT
  id,
  char_length(id)        AS len,
  (position('-' IN id) = 0) AS cuid_shape_ok
  FROM "DiseaseArea"
 WHERE code = 'MEDICAL_ONCOLOGY';
-- Expected: 1 row, len=25, cuid_shape_ok=true. If cuid_shape_ok=false
-- the migration ran with the buggy pre-v1.15.30 generator; the HEAL
-- block will fix it on next migration apply.

-- All HcpDiseaseArea ids must be cuid-shaped.
SELECT
  COUNT(*) FILTER (WHERE position('-' IN id) > 0) AS uuid_shaped,
  COUNT(*) FILTER (WHERE position('-' IN id) = 0) AS cuid_shaped,
  COUNT(*)                                          AS total
  FROM "HcpDiseaseArea";
-- Expected: uuid_shaped=0, cuid_shaped=total.
```

If A1.5 fails: re-apply the corrected migration (`psql -v ON_ERROR_STOP=1 -f migration.sql`). HEAL block rewrites in place via the ON UPDATE CASCADE.

### A2. Specialty normalization landed
```sql
-- Specialty table should now have Optometrist + Ophthalmologist (renamed from Optometry/Ophthalmology).
SELECT name, code FROM "Specialty" WHERE name IN ('Optometrist', 'Ophthalmologist', 'Optometry', 'Ophthalmology');
-- Expected: 2 rows — 'Optometrist' and 'Ophthalmologist'. Zero rows for the old names.

-- Hcp.specialty values should be normalized.
SELECT specialty, COUNT(*) FROM "Hcp" WHERE specialty IS NOT NULL GROUP BY specialty ORDER BY 2 DESC LIMIT 10;
-- Expected top values: Optometrist + Ophthalmologist. Some legacy values may remain
-- (e.g., 'Oncology') — those stay on the column but won't appear in the new dropdown.
```

### A3. DiseaseArea seed + cleanup
```sql
-- Medical Oncology should now exist.
SELECT id, name FROM "DiseaseArea" WHERE name = 'Medical Oncology';
-- Expected: 1 row

-- Interstitial Lung Disease as a sub-specialty value should be gone.
SELECT COUNT(*) FROM "Hcp" WHERE "subSpecialty" = 'Interstitial Lung Disease';
-- Expected: 0
```

### A4. Backfill produced sensible HcpDiseaseArea rows
```sql
-- Test ran with 6 rows backfilled. Prod number depends on prod data.
SELECT COUNT(*) AS backfilled FROM "HcpDiseaseArea";
-- Expected: > 0, plausible (each row is an HCP × DA mapping from old subSpecialty)

-- Sanity check: every HcpDiseaseArea row's DA should still exist.
SELECT COUNT(*) FROM "HcpDiseaseArea" hda
LEFT JOIN "DiseaseArea" da ON da.id = hda."diseaseAreaId"
WHERE da.id IS NULL;
-- Expected: 0 (the FK with ON DELETE CASCADE should guarantee this anyway)
```

### A5. Drift check
```bash
# Same drift command used post-prod-rel-3.0. Should report only known benign deltas
# (the 3 trgm GIN index "false positives" the prod team already documented).
cd apps/api
npx prisma migrate diff \
  --from-url "$PROD_DB_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```
Non-zero exit = real drift; investigate before declaring soak passed.

---

## Phase B — Functional smoke (1 steward, 5 minutes)

These need a logged-in PLATFORM_ADMIN on prod. Use Sun Pharma or B&L data so the checks have something to bite into.

### B1. HCP form, Create flow
1. `/admin/hcps` → click "Add HCP"
2. Specialty dropdown shows **exactly 2 options**: Optometrist, Ophthalmologist
3. Sub-specialty MultiSelect shows the live DA list (incl. Medical Oncology, **not** Interstitial Lung Disease)
4. Create with NPI + first/last + email + specialty=Optometrist + sub-specialty=[Cornea, Dry Eye]
5. Open the new HCP detail → confirm both DAs persist and re-render

### B2. HCP form, Edit flow (regression — must still work)
1. Open any existing HCP that had a legacy free-text specialty (e.g., 'Oncology')
2. Edit dialog opens **without crashing** — specialty dropdown is empty (legacy value isn't in the 2-val enum) but the legacy value is preserved on the underlying record
3. Change specialty to Ophthalmologist + add a sub-specialty → save → reload → confirms

### B3. HCP list sub-specialty filter
1. `/admin/hcps` → sub-specialty MultiSelect at top
2. Pick "Dry Eye" → list narrows to HCPs linked to that DA (via HcpDiseaseArea)
3. Pick "Dry Eye" + "Cornea" → result is the UNION (OR semantics)
4. Clear filter → full list returns

### B4. Nominations — inline accept (single row)
Pick a campaign with UNMATCHED nominations (e.g., one of the Sun Pharma campaigns).
1. Open `/admin/campaigns/[id]/nominations`
2. UNMATCHED rows now show "Accept: First Last (NN%)" links
3. Click one with high confidence (≥ 90%) — row should flip to MATCHED immediately
4. Audit log entry should appear for `nomination.matched` with `isManual: true`

### B5. Nominations — bulk accept (high-conf only)
1. Multi-select 3-5 UNMATCHED rows where all top suggestions are ≥ 90%
2. Click "Accept Top Match (N)" — modal should **not** appear (all high-conf), submission goes through
3. Stats card updates: UNMATCHED decreases, MATCHED increases

### B6. Nominations — bulk accept with low-conf modal
1. Multi-select rows incl. at least one with a top suggestion < 90% (often "REVIEW_NEEDED" rows)
2. Click "Accept Top Match (N)" — modal **must** appear, listing the low-conf rows
3. Test "Skip low-conf, accept N" → only high-conf rows accepted, low-conf left untouched
4. Re-select the low-conf one → click "Accept all" → goes through

### B7. Review dialog → Create New HCP
1. Click the review (link) icon on an UNMATCHED row
2. New "Create New HCP" button appears in the dialog footer
3. Click it → review dialog closes, Create-HCP dialog opens with `firstName` / `lastName` pre-filled from the raw nomination name (last-token = lastName)
4. Fill NPI + email + specialty → save → nomination is now matched to the new HCP

### B8. KOL Analysis dashboard (regression — must still work)
- Sun Pharma + B&L analyses load without error
- Top KOL list looks right (same names as prod-rel-3.0)
- No 500s in browser console

---

## Phase C — Background watch (continuous, 24h+)

### C1. CloudWatch
```bash
# API errors after deploy
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --filter-pattern '"ERROR"' \
  --query 'events[*].message' --output text | tail -20
```
Expectation: zero errors related to `HcpDiseaseArea`, `top-suggestions`, `bulk-accept`, `setHcpDiseaseAreas`, `diseaseAreaIds`. Pre-existing noise is fine.

### C2. Nomination accept rates
If you have any usage analytics: bulk-accept volume should rise relative to the per-row dialog accepts (that's the point of the change). If it doesn't, stewards may not be discovering the inline link — a UX issue, not a regression.

### C3. Survey portal sanity
- Open one active survey via the public token URL (no login)
- Survey loads + submits cleanly
- No nomination-page changes leaked into the customer survey portal (they shouldn't have — the changes were admin-only)

---

## Rollback criteria

Roll back to `prod-rel-3.0` (v1.15.28) **only if**:
- The migration didn't apply cleanly (A1/A2/A3 fail), or
- HCP create/edit is broken for users not editing sub-specialty (B1/B2), or
- The KOL Analysis dashboard regresses (B8), or
- Production data shows unexpected data loss (e.g., subSpecialty values disappeared without being mapped — A3/A4 fail).

The migration is **additive** for new structures (HcpDiseaseArea) and **mutating** for Specialty row renames + Hcp.specialty value normalization + Interstitial Lung Disease nulling. The Specialty rename and Interstitial Lung Disease NULL are the only steps that aren't trivially reversible — the original subSpecialty data path is gone, but the equivalent DA links are now in HcpDiseaseArea.

**Reversal procedure** if needed:
```sql
-- 1. Restore Specialty names (manual; safe because no FKs change semantics)
UPDATE "Specialty" SET name = 'Optometry' WHERE name = 'Optometrist';
UPDATE "Specialty" SET name = 'Ophthalmology' WHERE name = 'Ophthalmologist';

-- 2. Hcp.specialty values: can be restored from a pre-migration backup if needed;
--    otherwise the legacy free-text values are gone.

-- 3. HcpDiseaseArea table can be dropped, but the original Hcp.subSpecialty
--    values are NOT auto-restored — the migration nulled Interstitial Lung Disease
--    but otherwise just copied subSpecialty into the join table without clearing it.
```

If rollback to v1.15.28 code is needed without DB reversal: the v1.15.28 code reads `Hcp.specialty` and `Hcp.subSpecialty` directly — both still exist on the row after the migration, so the old code path still works. The `HcpDiseaseArea` rows just become orphaned (read by nothing, harmless).

---

## When to declare soak passed

Recommend: **3-5 business days** with all of these holding:
- Phase A passes immediately after deploy
- Phase B passes once on day 1
- Phase C shows no novel errors over the window
- No customer-reported issues with HCP forms, nominations, or sub-specialty filter

Then Phase 3 teardown is unblocked per [phase-3-teardown-plan.md](../plans/phase-3-teardown-plan.md).
