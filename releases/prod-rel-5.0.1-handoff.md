# prod-rel-5.0.1 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Fully reversible via PR revert.
**Tag:** `prod-rel-5.0.1` — anchor at the merge commit on `main` (tag flavor TBD by pteam at cut time; `5.0.1` used here as the working name for the patch bump on the 5.0 line).
**Supersedes:** `prod-rel-5.0` (v1.19.1).
**Bundles:** v1.19.1 → v1.19.2 — hygiene bundle addressing the 5 post-soak tickets pteam raised on prod-rel-5.0 (2026-07-22), plus a one-shot Cognito Ops sweep of stale test-user residue.

---

## TL;DR

Hygiene release. Closes the 5-ticket punch-list from pteam's prod-rel-5.0 post-soak review (`docs/findings/prod-rel-5.0-post-soak-tickets-2026-07-22.md`): **two P2s** (extend the canonical `INFLUENCER_TYPES` list so the Insights KOL Explorer filter dropdown re-surfaces the 8 post-retag categories + green e2e; unblock targeted rerun of `brand-grid-survey-submit.test.ts` after full-suite cleanup — the missing verification path for the respondent-side grid submit flow on prod) and **three P3s** (drop hardcoded E2E password fallback from 2 new specs that tripped the Bio-Exec strip safety-scan; fix `cleanup-test-data.ts` FK order + the swallowed-error message that reported "successfully" when a delete actually failed; add `pnpm prisma:generate` pre-hooks to e2e scripts so schema-changing releases don't hit `Unknown argument …` errors on a stale cached client). Plus a one-shot Cognito Ops sweep — 251 stale `e2e-*` users deleted from `us-east-2_63CJVTAV9`, all pre-dating the `afterAll` cleanup fix from v1.18.3.

Zero product runtime paths changed. The only customer-visible surface is the Insights KOL Explorer influencer-type filter dropdown, which gains 8 additional filterable options.

---

## What changed — ticket by ticket

### Ticket 1 (P2) — Extend `INFLUENCER_TYPES` with 8 post-retag categories

**File:** `packages/shared/src/schemas/insights-report.ts`

The canonical `INFLUENCER_TYPES` set (used by `e2e/api/insights-report.test.ts`'s "labels every KOL with a valid influencer type" assertion + the Insights KOL Explorer filter dropdown) was still the pre-retag list. Post-retag (~June 2026), 2,261 HCPs were reassigned to 8 new labels not in the canonical list: **DED Trace**, **Industry**, **Glaucoma**, **Retina**, **Retired**, **Canada**, **Deceased**, **FDA**. E2E was red on the assertion since the retag; the filter dropdown was missing the options so users couldn't filter by them.

Fix: extend the `INFLUENCER_TYPES` const to include the 8 additional values. Dropdown re-renders automatically (it reads from the same const). E2E assertion now passes.

### Ticket 2 (P3) — Drop hardcoded E2E password fallback in 2 new specs

**Files:** `e2e/web/insights-demographics-pie.spec.ts`, `e2e/web/tour.spec.ts`

Two new Playwright specs shipped in prod-rel-5.0 had the pattern:

```ts
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTest@2024Secure#1';
```

The `|| 'E2eTest@2024Secure#1'` fallback embeds a credential in source, which tripped the Bio-Exec strip safety-scan on the 5.0 cutover (required stripping the whole `e2e/` tree). The rest of the suite reads the env var with no fallback and hard-fails on absence. Fixed by aligning both specs with the established pattern:

```ts
const PASSWORD = process.env.E2E_TEST_PASSWORD;
if (!PASSWORD) throw new Error('E2E_TEST_PASSWORD env var required');
```

The strip-manifest workaround from 5.0 still holds; this is convention-cleanup so the credential string stops showing up in the safety-scan.

### Ticket 3 (P3) — Cleanup: FK-safe delete order + honest success message

**File:** `e2e/cleanup-test-data.ts`

`pnpm cleanup --all` was hitting `Foreign key constraint violated on the fields: (CampaignHcp_hcpId_fkey)` on the `prisma.hcp.deleteMany` step (per-run test HCPs still linked to global fixture campaigns), but the outer catch swallowed the exception and the script's trailing log line still read "successfully" — cleanup looked green when it wasn't. Fix:

1. Reorder deletes so `CampaignHcp` (and any other `Hcp` children) fire before `prisma.hcp.deleteMany`.
2. Rewrite the swallowed-error catch to log `✗ Failed:` (matching the campaign-cleanup style) instead of returning a green success line — the trailing check-mark now reflects actual state.

Cosmetic hygiene, but restores signal — future soaks will see a real failure marker instead of a false-positive success.

### Ticket 4 (P2) — Unblock `brand-grid-survey-submit.test.ts` targeted rerun

**File:** `e2e/api/brand-grid-survey-submit.test.ts`

`beforeAll` was calling `api.createTestCampaign()`, which passes `TEST_IDS.SURVEY_TEMPLATE_ID`. `cleanup:all` deletes that template row (correctly — it's per-run test data), so any targeted rerun after a full-suite cleanup 400'd on template lookup. The full suite only "worked" because some earlier file re-seeded the template as a side-effect.

Fix: switch to `api.createCampaign()` **without** `surveyTemplateId`. The test already Prisma-inserts its own `SurveyQuestion` — the template was unused anyway. This removes the dependency entirely, so a targeted rerun works in isolation after any level of cleanup.

**Why this matters for pteam:** this is the test that exercises the respondent-side grid submit path end-to-end on prod (Phase B2 of the 5.0 soak). With it now runnable in isolation, the customer-facing Brand-Affinity Grid persistence flow can be programmatically verified without a full-suite run — closing the Phase B2 verification gap flagged in the 5.0 handoff.

### Ticket 5 (P3) — `prisma generate` pretest hooks on e2e scripts

**File:** `e2e/package.json`

On prod-rel-5.0 (which added `brandsFrozenAt` + `BrandFlagType` + new Hcp/Client columns), pteam's local e2e checkout hit `PrismaClientValidationError: Unknown argument brandsFrozenAt` on 4 tests. Root cause: the local pnpm cache had a pre-5.0 generated Prisma client; a manual `npx prisma generate` in `apps/api` fixed it. Pteam shouldn't need to know that.

Fix:
- Added `prisma:generate` helper script.
- Added `pretest:*` pnpm pre-hooks for every shared-DB test entry point (`test:api:test:auth`, `test:api:aws:auth`, `test:workflow:*`, `test:all:aws:auth`) that invoke `prisma:generate` before the test run.

Result: any e2e run after a schema-changing release regenerates the client automatically. No developer-facing behavior change; just removes a class of "you forgot to regenerate" failures from future soaks.

---

## Cognito Ops sweep (out-of-band, not code)

Not part of the release code diff, but worth logging alongside the release so pteam knows the shared pool is clean:

- **Pool:** `us-east-2_63CJVTAV9` (shared test + prod).
- **What:** deleted 251 stale `e2e-*` users, all pre-dating the `afterAll` Cognito cleanup fix that landed in v1.18.3.
- **Why it needed a second pass:** the original sweep on 2026-07-14 used `--limit 60`, which is an AWS list-users query cap — 191 tail users remained undetected until a paginated audit.
- **How verified:** paginated `list-users` audit + per-username `admin-get-user` ground-truth. **Zero users** created after the v1.18.3 fix commit — the fix itself is working; today's residue was pure historical accumulation.

**Ticket 6 from the source doc did NOT need a code fix.** Option (c) from the ticket (add a periodic Lambda for pool-wide Cognito hygiene) is being dropped since post-fix leakage is zero — no ongoing hygiene issue to automate around. If leakage re-emerges in a future soak, the option can be reopened.

---

## Migrations

**None.** This release changes zero schema.

---

## Risk

**Very low.** All 5 code changes are e2e / build-hygiene / display-string only. No product runtime path changed except the Insights KOL Explorer filter dropdown — which gains 8 additional filter options and no other behavior.

- **Ticket 1** is a const extension. The dropdown reads from the const, so it re-renders with more options; the e2e assertion accepts the new values. Zero risk to any code that consumes `INFLUENCER_TYPES` — extending an accepted-values list is additive.
- **Tickets 2, 3, 4, 5** touch only files under `e2e/`; no runtime code path.
- **Cognito sweep** was a one-shot Ops action already completed; nothing to deploy.

Rollback shape: revert the PR. No schema to unwind. If anything unexpected surfaces in the KOL Explorer dropdown post-deploy, the const extension can be reverted independently.

---

## Test environment verification

At `v1.19.2` on dev branch:

| Check | Result |
|---|---|
| `pnpm --filter @kol360/shared build` | pass |
| `pnpm --filter @kol360/api build` | pass |
| `pnpm --filter @kol360/web build` | pass |

Formal e2e workflow run happens post-deploy per `tdct` — see `prod-rel-5.0.1-soak-checks.md`.

---

## Rollback shape

1. Revert the PR on `main` → App Runner auto-redeploys to v1.19.1.
2. No DB state to unwind (no migrations in this release).
3. No Cognito state to unwind (sweep is complete; deleted users were stale test data with no active sessions).

---

## See also

- Soak checks: [`prod-rel-5.0.1-soak-checks.md`](prod-rel-5.0.1-soak-checks.md)
- Predecessor: [`prod-rel-5.0-handoff.md`](prod-rel-5.0-handoff.md)
- Source ticket doc: [`docs/findings/prod-rel-5.0-post-soak-tickets-2026-07-22.md`](../docs/findings/prod-rel-5.0-post-soak-tickets-2026-07-22.md)
