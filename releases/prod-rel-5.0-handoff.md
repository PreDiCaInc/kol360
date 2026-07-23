# prod-rel-5.0 — Handoff to Prod Team

**Status:** Ready for prod deploy. **TWO migrations** — both idempotent, both must run. **Reversible.**
**Tag:** `prod-rel-5.0` → merge commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.57` (v1.17.77).
**Bundles:** v1.17.78 → v1.19.1 — Brand-Affinity Grid feature (Phases 1 + 2 + 3), MINC → OneKey ID terminology + format relax, plus a handful of hardening fixes surfaced along the way.

**Why 5.0 (not 4.1.58):** first fully-shipped customer-visible major feature (Brand-Affinity Grid) since the 4.x line. Also renames the CA identifier vocabulary (MINC → OneKey ID) with a DB migration — the kind of thing a major-tag bump signals cleanly to customers + integration partners.

---

## TL;DR

Two feature-scale changes + a handful of hardening fixes:

1. **Brand-Affinity Grid Nomination** — new campaign format. Admin configures a brand list per campaign; every enabled nomination question gets an inline grid (brand chips + Neutral + Unknown) on the respondent survey; nominations persist with per-brand flags; Sociometric Summary gains per-brand cluster columns + a two-state view toggle (All categories ↔ Bias focus). **Additive throughout** — classic campaigns are unaffected.
2. **MINC → OneKey ID** — Canada national-ID renamed everywhere (display, enum, DB rows). Format also relaxed from strict `CAMD########` to any 10-or-12 alphanumeric characters after normalization, unblocking real CA HCP data coming through the Canada HCP table import.
3. **Hardening fixes** — client-form-dialog scroll, ChartTableToggle w-full wrapper, POST /campaigns silent-drop of `showTopicsDiscussed`, e2e cleanup FK-order (both the script + the API's `forceDeleteTestCampaign`), Cognito test-user afterAll cleanup.

---

## Migrations (RUN IN ORDER)

Both are idempotent. Both files live under `apps/api/prisma/migrations/`.

### 1. `20260710_add_brand_affinity_grid` (from v1.17.78)

Additive schema for the Brand-Affinity Grid feature.

- New enum: `BrandFlagType` (`BRAND`, `NEUTRAL`, `DONT_KNOW`)
- New columns:
  - `Campaign.brandsFrozenAt TIMESTAMP(3)` — nulls brand-option mutation past first response
  - `SurveyQuestion.useBrandGrid BOOLEAN DEFAULT FALSE` — per-question grid opt-in
- New tables:
  - `CampaignBrandOption` — per-campaign ordered brand list (unique (campaignId, brandName), (campaignId, displayOrder))
  - `NominationBrandFlag` — per-nomination flag rows (unique (nominationId, brandOptionId, flagType); partial unique index on (nominationId, flagType) WHERE brandOptionId IS NULL closes the sentinel-slot gap Postgres unique-tuples don't cover)
- Every DDL guarded with `IF NOT EXISTS` / `DO $$ EXCEPTION WHEN duplicate_object $$` so re-apply is a no-op with `NOTICE`s only.

**Rollback shape:** drop the two tables (cascade from Campaign FK / Nomination FK), drop the enum, drop the two columns. Existing surveys / campaigns / nominations unaffected.

### 2. `20260716_rename_minc_to_onekey_id` (from v1.19.0)

Data-only rename. `Hcp.nationalIdType` is a TEXT column (not a Prisma enum type), so this is a plain UPDATE.

```sql
UPDATE "Hcp" SET "nationalIdType" = 'ONEKEY_ID' WHERE "nationalIdType" = 'MINC';
```

- Idempotent: second run's WHERE clause matches zero rows.
- Test-env verified: 176 CA rows migrated cleanly, `_prisma_migrations` row recorded.
- Prod impact: however many CA HCPs prod has today (should be <100 given CA launch is recent).

**Rollback shape:** `UPDATE "Hcp" SET "nationalIdType" = 'MINC' WHERE "nationalIdType" = 'ONEKEY_ID'` — but code that reads the column also needs the reverted enum. **Prefer a code-side revert first** if you need to roll back; then this SQL closes the loop.

---

## What changes for customers

| Surface | Before | After |
|---|---|---|
| Campaign edit → new "Brand-Affinity Grid" card | Not there | Add brands (up to 20, drag-order, delete), toggle grid ON per nomination question, freeze banner once responses arrive |
| Respondent survey (grid campaigns only) | Nomination = name only | Nomination = name + inline grid (checkbox row for brands + Neutral + Unknown, mutually exclusive between brands and sentinels) |
| Insights → Sociometric Summary (grid campaigns only) | Per-type nomination counts | Same + per-brand cluster columns after Biased + a "All categories / Bias focus" view toggle above the table |
| CSV / Excel export from Sociometric | 8 nomination-type columns | Same + brand cluster columns (per-brand + Neutral + Unknown) |
| Canada client — HCP import errors | `"Invalid MINC format (must be CAMD followed by 8 digits)"` | `"Invalid OneKey ID format (must be 10 or 12 alphanumeric characters after normalization)"` |
| Canada client — HCP import accepts | Only strict `CAMD########` | Any 10 or 12 alphanumeric identifier (hyphens/spaces/case tolerated) |
| Anywhere "MINC" was shown | "MINC" | "OneKey ID" |
| Add Client / Edit Client dialog | Buttons cut off on short viewports | Scrollable content area |
| Insights → Demographics pie cards | Occasional blank pie on first paint (fixed in 4.1.56 at 2 sites; this release adds the wrapper-level guard) | Every future chart type gets a stable 100%-width parent by default |

**Classic (non-grid) campaigns are unaffected.** No visible change to any admin surface, respondent surface, or insights surface for campaigns without brands configured.

---

## API changes

### New endpoints (Brand-Affinity Grid)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/campaigns/:id/brand-options` | List brand config + `brandsFrozenAt` |
| PUT | `/api/v1/campaigns/:id/brand-options` | Full-replacement upsert of brand list (409 once frozen) |
| PATCH | `/api/v1/campaigns/:id/survey-questions/:sqId` | Set `useBrandGrid` per question |

### Extended response shapes

- `GET /api/v1/campaigns/:id/survey-preview` — items now include `useBrandGrid`
- `GET /api/v1/survey/take/:token` (public) — response now includes `campaign.brandOptions[]` + `question.useBrandGrid`
- `POST /api/v1/survey/take/:token/submit` — accepts extended `{ names, brandFlags }` shape for MULTI_TEXT answers on grid-enabled questions; persists `NominationBrandFlag` rows in the same transaction that flips response to COMPLETED
- `GET /api/v1/insights/:diseaseAreaId/sociometric-summary` — response now includes `brandColumns[]` at top level + `brandFlagCounts` per item

### Silent-drop fix
`POST /api/v1/campaigns` now honors `showTopicsDiscussed` on create (was silently dropped; admins had to POST-then-PATCH). Same anti-pattern as the `excludeInternalEmails` bug fixed last sprint.

### Terminology rename
- `NationalIdType` enum: `'MINC'` → `'ONEKEY_ID'` (single hard swap; caller-facing schema types updated everywhere)
- `country + nationalIdType` pairing check emits new message: `"country and nationalIdType must be paired: 'CA' → 'ONEKEY_ID', 'US' → 'NPI'"`
- CSV column headers `MINC` / `minc` **still accepted** for backward compat with legacy CA templates + new `OneKey ID` / `OneKey` / `OneKeyID` / `onekey` / `onekey_id` variants added

---

## Risk

**Moderate for a milestone tag, low per line of change.** Everything is additive at the DB level; every code path has a classic-only-campaign fast path so non-adopters see no behavioral change.

- Brand-Affinity Grid: net new tables + optional-toggle columns. No existing writer can start emitting the new rows unless admin explicitly configures a grid campaign.
- OneKey ID rename: DB migration is a single UPDATE on <200 rows in test-DB. All code that reads `nationalIdType` was updated to `'ONEKEY_ID'`; legacy `'MINC'` value would only reappear on rollback (which the reverse-UPDATE covers).
- Hardening fixes: each is small and self-contained (see per-version commits).

Rollback = revert the tag + drop the new tables + reverse-UPDATE the CA rows. Both migrations are documented above with exact rollback SQL.

---

## Test environment verification

At `v1.19.1` on `kol360-api-test` + `kol360-web-test`:

| Check | Result |
|---|---|
| API `/health` | v1.19.1 |
| Both migrations applied | `_prisma_migrations` rows present + finished |
| E2E workflow | **303 pass / 8 skipped / 0 failed** |
| Post-run stale campaigns | Cleaned to 0 via `pnpm cleanup` |

E2E coverage added in this release rollup:
- `e2e/api/brand-options.test.ts` (14 tests) — brand-options CRUD + freeze
- `e2e/api/brand-grid-question-toggle.test.ts` (7 tests) — useBrandGrid PATCH round-trip
- `e2e/api/brand-grid-survey-submit.test.ts` (6 tests) — respondent submit persistence + validation
- `e2e/api/brand-grid-sociometric.test.ts` (3 tests) — sociometric response shape
- `e2e/api/hcp-import-canada-minc.test.ts` — expanded coverage of relaxed OneKey ID validation + new acceptance cases
- `e2e/web/insights-demographics-pie.spec.ts` (Playwright, 2 tests) — pie regression guard
- `e2e/web/tour.spec.ts` (Playwright, 6 tests) — interactive tour engine

---

## Manual soak

Full checklist in `prod-rel-5.0-soak-checks.md`. Highlights:

1. `/health` returns 1.19.1.
2. Both migrations applied on prod DB (`SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20260710_add_brand_affinity_grid', '20260716_rename_minc_to_onekey_id')`).
3. Existing classic campaigns still render normally on Campaign edit / Sociometric Summary — no visible change.
4. New Brand-Affinity Grid card appears on Campaign overview.
5. CA HCP import on a CA-scoped client accepts a non-CAMD 10-or-12-char OneKey ID sample row.

---

## See also

- Soak checks: [`prod-rel-5.0-soak-checks.md`](prod-rel-5.0-soak-checks.md)
- Predecessor: [`prod-rel-4.1.57-handoff.md`](prod-rel-4.1.57-handoff.md)
- Ticket references:
  - Brand-Affinity Grid — plan doc `docs/findings/brand-affinity-grid-nomination-plan-2026-07-08.md` (local, gitignored)
  - OneKey ID rename + relax — `docs/findings/canada-minc-checks-reference-2026-07-15.md`
  - Original CA support — `docs/findings/canada-hcp-support-lite-plan-2026-06-25.md`
