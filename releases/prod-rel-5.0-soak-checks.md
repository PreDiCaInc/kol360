# prod-rel-5.0 — Soak Checks (v1.19.1)

Tag at the merge commit on `main`. Brand-Affinity Grid + MINC → OneKey ID rename + hardening fixes. **TWO migrations** — both run via psql before code reads them.

---

## Phase A — Version + migrations

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.19.1", ... }
```

### A2. Both migrations applied on prod DB

```sql
SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name IN (
  '20260710_add_brand_affinity_grid',
  '20260716_rename_minc_to_onekey_id'
)
ORDER BY finished_at;
-- Expected: 2 rows, both finished_at NOT NULL.
```

### A3. Brand-affinity DB objects present

```sql
SELECT tablename FROM pg_tables
WHERE tablename IN ('CampaignBrandOption', 'NominationBrandFlag');
-- Expected: 2 rows.

SELECT enum_range(NULL::"BrandFlagType");
-- Expected: {BRAND,NEUTRAL,DONT_KNOW}

SELECT column_name FROM information_schema.columns
WHERE table_name = 'Campaign' AND column_name = 'brandsFrozenAt';
-- Expected: 1 row.

SELECT column_name FROM information_schema.columns
WHERE table_name = 'SurveyQuestion' AND column_name = 'useBrandGrid';
-- Expected: 1 row.
```

### A4. OneKey ID rename landed

```sql
SELECT "nationalIdType", COUNT(*)
FROM "Hcp"
GROUP BY "nationalIdType"
ORDER BY 1;
-- Expected: no 'MINC' rows. Only 'NPI' and (if any CA HCPs exist) 'ONEKEY_ID'.
```

If any `MINC` rows remain, migration didn't apply cleanly — re-run the SQL file directly:

```bash
PGPASSWORD=... psql -h prod-host -U kol360admin -d kol360 \
  -f apps/api/prisma/migrations/20260716_rename_minc_to_onekey_id/migration.sql
```

---

## Phase B — Brand-Affinity Grid smoke (customer-facing)

### B1. Admin config surface

- Log in as PLATFORM_ADMIN → `/admin/campaigns/<any DRAFT campaign>`.
- Overview tab → scroll below "Show Topics Discussed" toggle → confirm new **Brand-Affinity Grid** card is present.
- Empty state text: "No brands configured. This campaign is in Classic mode. Add a brand to switch to Grid mode."
- Add a brand named "TestBrand" → Save → refresh → row persists.
- Delete the brand → Save → card returns to empty state.
- If the campaign has nomination questions, the per-question toggle section appears once ≥1 brand is configured. Each row shows the nomination type + section chip (e.g. "Advice Leaders [JOE'S TEST SECTION]").

### B2. Respondent surface (only test if you have a CA/grid campaign ready)

- On a DRAFT campaign with a brand configured + one nomination question toggled `useBrandGrid=true`, assign a test HCP, activate.
- Open the survey link in a private/incognito window (avoids stale JS cache).
- On the grid-enabled nomination question, verify the inline table renders below each name input: brand columns + Neutral + Unknown, checkboxes below.
- Auto-swap: check a brand → then Neutral → brand unchecks. Check Neutral → then a brand → Neutral unchecks.
- Submit → verify Nomination rows written + NominationBrandFlag rows attached (needs DB read).

### B3. Insights Sociometric Summary

- Log in → Insights → Sociometric Summary on a DA with an analysis.
- Column selector should show the standard columns; on grid-mode analyses, brand cluster columns appear after Biased in a distinct color (orange bg).
- New **All categories / Bias focus** view toggle in the header (only renders when brandColumns is non-empty).
- Excel export includes brand columns after Biased.

### B4. Regression — classic campaigns unaffected

- Open a non-grid campaign's Sociometric Summary → verify no brand columns render + no view toggle appears.
- Full-workflow campaign (any existing scored analysis) → Sociometric Summary should look identical to 4.1.57.

---

## Phase C — OneKey ID smoke

### C1. Language rename visible

- Client dialog → Country dropdown → item reads **"Canada (OneKey ID)"** (was "Canada (MINC)").
- HCP import dialog → CA mode → footer text reads **"OneKey ID (10 or 12 alphanumeric characters — hyphens optional)"** (was CA-MD-####-###-#).
- All error toasts / API 4xx messages that reference the identifier read "OneKey ID" not "MINC".

### C2. Relaxed validation accepts non-CAMD

On a CA-scoped Client's HCP import:
- Upload a CSV row with identifier `ABC123456789` (12-char alphanumeric, no CAMD prefix) → accepted.
- Upload a CSV row with identifier `CA1234A2C4` (10-char alphanumeric) → accepted.
- Upload a CSV row with identifier `CAMD1234567` (11 chars) → rejected as per-row error with message referencing OneKey ID + 10/12-char length rule.

### C3. Legacy templates still work

- Upload a CSV whose header column is literally `MINC` (legacy CA template shape) → accepted (backend still recognizes the header + `NPI` / `OneKey ID` / `onekey` / `onekey_id` variants).
- Upload a CSV row with the classic `CAMD12345678` value → still accepted (12 chars alphanumeric fits the relaxed rule).

---

## Phase D — Hardening regression checks

Fast sweep — these are the fixes that landed between 4.1.57 and 5.0. Each is a 30-second click test.

- **Add Client modal scroll**: `/admin/clients` → New Client → resize browser to a short window → confirm you can scroll to reach Cancel / Create at the bottom.
- **Insights Demographics pie**: `/admin/dashboards/<da-id>` → Demographics tab → confirm both the Respondent Role and Topics Discussed (Distribution) pie charts render on first load without a blank/refresh.
- **Campaign create honors showTopicsDiscussed**: create a new campaign via UI with the "Show Topics Discussed Charts" toggle ON at create time → confirm it stays on without a follow-up edit save.
- **E2E cleanup**: after any run of the workflow suite, `SELECT COUNT(*) FROM "Campaign" WHERE name LIKE 'E2E_TEST_CAMPAIGN_%'` — should be 0 or trivially small (single-digit); `pnpm cleanup` clears any residue.
- **Cognito test-user cleanup**: after e2e runs, `aws cognito-idp list-users --user-pool-id us-east-2_63CJVTAV9 --filter 'email ^= "e2e-"' --limit 60 --query 'length(Users)'` should NOT accumulate. (60 stale entries manually swept during the test cycle; verify no re-accumulation past a run or two.)

---

## Phase E — 24h watch

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

Watch CloudWatch for:
- Any 500 responses on `/api/v1/campaigns/:id/brand-options` (new endpoint — highest chance of surprise).
- Any 500 on `/api/v1/survey/take/:token/submit` from grid-mode nominations (Zod / persistence chain).
- Any `nationalIdType` value string other than `NPI` or `ONEKEY_ID` in application logs (would indicate an unmigrated row somewhere).

---

## Rollback gate

If any of the following fail, roll back the release:

- **A1** fails (`/health` doesn't return 1.19.1) → App Runner deploy issue; check CloudWatch, redeploy or roll back the tag.
- **A2/A3/A4** fail (migration objects/rows missing) → migration didn't run; re-run the SQL files directly, then retry A.
- **B1** fails (no Brand-Affinity Grid card) → FE bundle mis-shipped; check the App Runner web deploy version.
- **C2** fails (`ABC123456789` rejected) → the relax code didn't ship; check the API deploy version matches 1.19.1 exactly.

**Roll back shape** (documented per plan):
1. Revert the merge commit on main → App Runner auto-redeploys to prior version.
2. If code is reverted but data-side survives (harmless — enum values `ONEKEY_ID` in DB with reverted code would break the type cast in `routes/curation.ts`), also reverse the OneKey ID rename: `UPDATE "Hcp" SET "nationalIdType" = 'MINC' WHERE "nationalIdType" = 'ONEKEY_ID'`.
3. Brand-Affinity Grid tables can be left in place (harmless if no code writes to them) or dropped: `DROP TABLE "NominationBrandFlag"; DROP TABLE "CampaignBrandOption"; DROP TYPE "BrandFlagType"; ALTER TABLE "Campaign" DROP COLUMN "brandsFrozenAt"; ALTER TABLE "SurveyQuestion" DROP COLUMN "useBrandGrid";`.
