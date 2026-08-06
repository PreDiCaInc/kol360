# prod-rel-5.1.2 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Fully reversible via PR revert.
**Tag:** `prod-rel-5.1.2` — anchor at the merge commit on `main`.
**Supersedes:** `prod-rel-5.1.1` (v2.1.1).
**Bundles:** v2.1.1 → v2.1.2 — 1 P2 audit-gap fix filed by pteam post-Jen-Pikor-incident (2026-08-04). **NOT a v2.1.x regression** — pre-existing gap that lived since the bulk-import path was written; only became a real recovery problem when a live corruption incident hit prod.

**One-liner:** the bulk-import codepath (`POST /hcps/import` and `POST /campaigns/:id/import-hcps`) writes an `hcp.updated` AuditLog row per touched HCP, but the primary path (`hcp.service.ts`) was writing `oldValues = NULL` on every row. On the next data-corruption incident where no clean source file exists to re-upload from, that gap forces RDS PITR (nuclear) instead of surgical audit-log revert. This PR fills the gap — plus a shared-const refactor + a Prisma-DMMF-reflective guardrail test so a future `Hcp` column addition can't silently drop from audit again.

---

## On pull, run

**Nothing to reinstall. TS-only changes to 3 API files + 1 new API file + 1 new API test + 1 new e2e test + 3 version-string bumps. Just `git pull`.**

Zero `package.json` dep edits (only version-string bumps), zero `pnpm-lock.yaml` movement, zero pretest-hook changes, zero migration files, zero DB touch.

The edits are:

1. NEW — `apps/api/src/services/hcp-fields.ts` (shared `UPDATABLE_HCP_AUDIT_FIELDS` const + `pickHcpAuditSnapshot()` helper + `HCP_META_EXCLUDED_FROM_AUDIT` list)
2. NEW — `apps/api/src/services/__tests__/hcp-fields.test.ts` (Prisma-DMMF-reflective guardrail — 6 tests)
3. EDIT — `apps/api/src/services/hcp.service.ts` (importFromFile: expand pre-update `select`, build pre-image map during categorize, populate `oldValues` in the per-row `hcp.updated` createMany)
4. EDIT — `apps/api/src/services/distribution.service.ts` (importHcpsFromFile: refactor inline old/new-values literals to shared helper)
5. EDIT — `apps/api/src/routes/hcps.ts` (PUT /:id admin edit: replace 2-field `{ firstName, lastName }` inline literal with `pickHcpAuditSnapshot(existing)` — now covers all 13 fields)
6. NEW — `e2e/api/hcp-import-audit-oldvalues.test.ts` (3 tests: `/hcps/import` update-row oldValues assertion + `hcp.created` NULL sanity + campaign-scoped path parity)
7. Three `package.json` version-string bumps (2.1.1 → **2.1.2** — patch bump).
8. This handoff + soak-checks doc + README row.

Skip `pnpm install`, skip `npx prisma generate`, skip any DB migration step.

---

## TL;DR (per ticket)

### 1. Bulk-import path populates `AuditLog.oldValues` (primary fix from pteam finding)

**Files:** `apps/api/src/services/hcp.service.ts` (site of primary bug), `apps/api/src/services/distribution.service.ts` (already had oldValues since v1.17.35 — refactored to shared const).

**Root cause.** `hcp.service.ts:importFromFile` emits one `hcp.updated` AuditLog row per touched HCP at the tail of the function. Pre-v2.1.2 that row was:

```ts
{ action: 'hcp.updated', entityId: id,
  newValues: { source: 'bulk_import', batchId, fileName } }
```

`oldValues` was left unset — Prisma writes `NULL` in that case. The 2026-08-04 Jen Pikor incident (sort-mangled CSV → 411 HCPs updated with mis-mapped fields) surfaced this: recovery only worked because a clean source file existed and upsert overwrote back to correct values. On an incident without a clean source file, the only alternative would have been RDS point-in-time restore (loses hours of legitimate activity across the entire DB).

**Fix.** The bulk `existingHcps` findMany at the top of `importFromFile` already loads every HCP the batch touches (keyed by NPI); this PR expands its `select` to include every field in `UPDATABLE_HCP_AUDIT_FIELDS` (via `HCP_AUDIT_SELECT`), builds a `preImagesByHcpId: Map<string, HcpAuditSnapshot>` during categorization (populated from both the `existingByNpi` map for UPDATE branch and `aliasByName.include.hcp` for MERGE branch), and attaches `oldValues` from that map to each `hcp.updated` audit row before the `createMany`. Zero extra reads over the pre-fix implementation — Part 3 batched-read work turned out to already be in place (the file loads all existing HCPs upfront).

The distribution.service.ts campaign-scoped path (`/campaigns/:id/import-hcps`) already wrote `oldValues` correctly since v1.17.35; the change there is a refactor to consume the shared const so the two sites stay in sync.

**No user-visible surface change.** No data mutation change. Only adds `oldValues` where it was previously `NULL`.

### 2. Shared field list — `UPDATABLE_HCP_AUDIT_FIELDS` (my POV add on top of pteam's fix)

**File:** NEW `apps/api/src/services/hcp-fields.ts`.

**Rationale.** The pteam finding recommended inlining a 13-field pick at each site. Doing so would leave three copies of the list drifting independently — the exact "someone adds a new column and one write path silently drops it" class of bug that lived latent in v1.17.0 → v1.17.2 for the specialty CHECK constraint (this repo's CLAUDE.md documents that class of regression at length). Extracting to one shared const (with a Prisma-DMMF-reflective test guardrail — see item 3) is a small addition on top of the fix that closes the whole class instead of the single instance.

The const has 13 fields matching pteam's recommendation verbatim: `npi, nationalIdType, country, firstName, lastName, email, specialty, subSpecialty, city, state, yearsInPractice, isSurveyTaker, isNominated`. Companion `HCP_META_EXCLUDED_FROM_AUDIT` lists the 9 system-managed columns intentionally excluded (`id, beId, alternateIds, createdAt, updatedAt, createdBy, curationManagedAt, discoveredFrom, importBatchId`).

Both bulk-import parse sites AND the admin-edit path (`routes/hcps.ts:PUT /:id`) now consume `pickHcpAuditSnapshot()` from this file. The admin-edit path pre-fix had `{ firstName, lastName }` inline — only 2 of the 13 audit-worthy fields; that's now `pickHcpAuditSnapshot(existing)` and captures the full pre-image.

### 3. Prisma-DMMF-reflective guardrail test (my POV add on top of pteam's fix)

**File:** NEW `apps/api/src/services/__tests__/hcp-fields.test.ts` — 6 tests.

**Rationale.** A shared const only helps if adding a new `Hcp` column also touches it. This test walks `Prisma.HcpScalarFieldEnum` (Prisma-generated at build time, so it can never drift from the schema) and asserts every scalar field appears in EITHER `UPDATABLE_HCP_AUDIT_FIELDS` OR `HCP_META_EXCLUDED_FROM_AUDIT`. If a dev adds a new column to `schema.prisma` without classifying it, this test fails at PR time with a message like:

```
New Hcp scalar field(s) not classified in apps/api/src/services/hcp-fields.ts:
  - phoneNumber

Add each to UPDATABLE_HCP_AUDIT_FIELDS (audit-worthy) or
HCP_META_EXCLUDED_FROM_AUDIT (system-managed / opaque).
```

Companion tests: (a) the two lists don't overlap, (b) no field declared in either list has drifted off the model, (c) `pickHcpAuditSnapshot()` picks the audit-worthy fields, preserves nulls, strips excluded fields + undefined entries.

### 4. Batched read (my POV add — Part 3 from the PR brief)

**Not implemented — turned out to already be batched.**

The PR brief flagged that a naive per-row `findUnique({ where: { npi } })` in `importFromFile` would be cheap at 416 rows and expensive at 10K. Reading the actual code, `hcp.service.ts:importFromFile` already batches (`existingHcps = prisma.hcp.findMany({ where: { npi: { in: candidateNpis }, country } })` at the top of the function since v1.17.68). Zero extra reads needed — Part 1's fix just expanded that already-loaded `select` and picked from the already-built map.

The distribution.service.ts path IS still per-row (per-row `findUnique`), but it already captured `oldValues` from that per-row read since v1.17.35 — refactoring it to batch would cascade into the segmentation-fields + campaign-assignment logic that reads the same row. Deferred as a possible perf-only follow-up if a customer ever imports 10K+ rows through the campaign-scoped path (today the biggest customer campaign import is ~1500 rows).

---

## Migrations

**None.** No schema change. No data migration. Nothing runs on prod DB from this release.

Existing `AuditLog` rows with `oldValues = NULL` (411 rows from the 2026-08-04 Jen Pikor batch + ~700 others across the past 6 months of bulk imports) are unaffected. This PR only changes what future rows look like; historical rows stay as-is (no backfill possible — the pre-image data was never captured).

---

## Risk

**LOW.** Audit-write path only; no user-visible surface change, no data mutation change — just adds `oldValues` where it was previously `NULL`.

- Runtime code touched: `hcp.service.ts:importFromFile` (audit-write scope only — Phase 1b `select` expansion + Phase 3 pre-image map build + audit-emit loop `oldValues` field), `distribution.service.ts:importHcpsFromFile` (refactor to shared helper, no behavior change), `routes/hcps.ts:PUT /:id` (expanded from 2 to 13 audit fields on the base hcp.updated row — strictly more audit info, no behavior change).
- API routes: unchanged surface (no new endpoints, no parameter changes, no response shape changes).
- FE bundle: **untouched** (version-string bump only).
- Database schema: **untouched**.
- Auth surface: **untouched**.

**Rollback:** revert PR. Zero data change to unwind — the `AuditLog` table gains richer rows post-deploy, but nothing else changes; historical NULL-oldValues rows remain NULL. Existing pipelines / dashboards querying `AuditLog` see additional non-null data in a column that was previously always NULL on bulk-import rows (net-positive; not a breaking-change vector).

---

## Test verification

- **Builds:** all 3 pass (`pnpm --filter @kol360/{shared,api,web} build`).
- **Unit test:** 6/6 pass in `hcp-fields.test.ts` (the Prisma-DMMF guardrail plus `pickHcpAuditSnapshot()` picker semantics).
- **E2E test:** new `hcp-import-audit-oldvalues.test.ts` — 3 tests. (a) `/hcps/import` UPDATE branch: seeds 2 HCPs via CREATE, updates via a second CSV, reads AuditLog via Prisma, asserts oldValues carries the pre-update email/specialty/city/state. (b) `/hcps/import` CREATE branch: asserts hcp.created rows still have oldValues = NULL (regression guard — the fix targets updates only). (c) `/campaigns/:id/import-hcps` (distribution.service.ts path): asserts oldValues also populated there.

E2E runs against test env post-deploy via the existing `tdct` workflow.

---

## See also

- Source finding: [`docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-2026-08-05.md`](../docs/findings/bulk-import-no-oldvalues-blocks-surgical-revert-2026-08-05.md)
- Predecessor: [`prod-rel-5.1.1-handoff.md`](prod-rel-5.1.1-handoff.md)
- Soak checks: [`prod-rel-5.1.2-soak-checks.md`](prod-rel-5.1.2-soak-checks.md)
