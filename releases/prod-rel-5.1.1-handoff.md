# prod-rel-5.1.1 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Fully reversible via PR revert.
**Tag:** `prod-rel-5.1.1` — anchor at the merge commit on `main`.
**Supersedes:** `prod-rel-5.1.0` (v2.1.0).
**Bundles:** v2.1.0 → v2.1.1 — 2 P3 e2e-only fragility items from the 5.1.0 post-soak review. **Test-infra only** — zero customer runtime path changed, zero API surface change.

**One-liner:** `ensureClientSelected()` helper stops swallowing failures (they'll now name themselves in test output instead of surfacing as misleading downstream "tab missing" errors); the two brand-grid e2e tests use a hermetic test-owned Question fixture instead of `findFirst`-ing on real prod Question rows (which was catching admin-tuned `minEntries: 3` rows and looking like release regressions).

---

## On pull, run

**Nothing to reinstall. TS-only changes to 4 e2e files + 3 version-string bumps. Just `git pull`.**

Zero `package.json` dep edits (only version-string bumps), zero `pnpm-lock.yaml` movement, zero pretest-hook changes, zero runtime code touched.

The edits are:

1. E2E — `e2e/web/insights-demographics-pie.spec.ts` (`ensureClientSelected()` no longer swallows failures)
2. E2E — `e2e/web/tour.spec.ts` (same helper, same fix)
3. E2E — `e2e/api/brand-grid-survey-submit.test.ts` (upsert hermetic Question fixture instead of `findFirst`)
4. E2E — `e2e/api/brand-grid-question-toggle.test.ts` (same upsert pattern; same fragility class)
5. Three `package.json` version-string bumps (2.1.0 → **2.1.1** — patch bump).
6. This handoff + soak-checks doc + README row.

Skip `pnpm install`, skip `npx playwright install`, skip `npx prisma generate`.

---

## TL;DR (per ticket)

### 1. `ensureClientSelected()` helper no longer swallows failures (Finding A — partial-close on v2.1.0 #2)

**Files:** `e2e/web/insights-demographics-pie.spec.ts`, `e2e/web/tour.spec.ts`.

**Root cause.** v2.1.0 replaced blind `waitForTimeout(300)/(600)` with real `waitFor({state:'visible'})` gates — a real improvement — but both waits retained `.catch(() => {})`. When the helper failed to select a client, the failure was silently swallowed, and downstream locators timed out with a misleading error ("demographics tab not visible" / "how-to button not visible") instead of the true cause ("client never selected"). 7 web tests failed undiagnosably on prod.

**Fix.** Replace both `.catch(() => {})` sites with `.catch((e) => { throw new Error('ensureClientSelected: <context>: ' + msg); })`. Helper failures now name themselves in test output. If the helper is still broken on prod after this ships, the failure message will say so directly — no more diagnosing phantom "tab missing" errors.

**No runtime impact.** Test-only change to two spec files.

### 2. Brand-grid tests use hermetic Question fixture (Finding B — NOT a v2.1.0 regression)

**Files:** `e2e/api/brand-grid-survey-submit.test.ts`, `e2e/api/brand-grid-question-toggle.test.ts`.

**Root cause.** Both tests used `prisma.question.findFirst({ where: { nominationType: { not: null } } })` to look up a Question row. On prod, `findFirst` returned a real Dry Eye Question whose `minEntries` had been bumped from 1 to 3 by an admin. The `brand-grid-survey-submit` test submits 2 names → validator correctly returned 400. Not a validator bug — test-fixture drift.

**Cross-check** (per pteam): validation code, submit route, seed fixtures, and both test files were **NOT** in the 5.0.4→5.1.0 diff. Validator unchanged since v1.17.83. This was ambient prod-DB fragility, not a release regression.

**Fix.** Both tests now `prisma.question.upsert({ where: { id: 'cme2e0stable0quest0001' }, update: { minEntries: null }, create: { … } })`. Hermetic test-owned Question with a namespaced id (`cme2e0stable0quest0001`). The `update: { minEntries: null }` clause enforces the test-friendly value on every run, so a future drift on the fixture id can't reintroduce the bug.

**Fixture shape** (create clause, only fires once per env):
- `id: 'cme2e0stable0quest0001'`
- `text: 'E2E stable nomination Question (hermetic test fixture)'`
- `type: 'MULTI_TEXT'`
- `nominationType: 'NATIONAL_LEADER'`
- `minEntries: null`
- `isRequired: false`

**No runtime impact.** Test-only change to two spec files. The upsert creates one new Question row per env on first run; subsequent runs are idempotent no-ops (update: `{minEntries: null}` is stable).

---

## Migrations

**None.** No schema change. No data migration. Nothing runs on prod DB from this release.

The `prisma.question.upsert` in the two brand-grid tests DOES insert one Question row into whichever DB the tests are pointed at (test env by default, prod only if you deliberately run `test:api:aws:auth` against prod). The row is namespaced (`cme2e0stable0quest0001`) and idempotent — safe to re-run. Not a schema/migration, just a fixture upsert.

---

## Risk

**Very low.** Test-only. No customer runtime code changed, no API surface changed, no schema changed.

- Runtime code: **untouched**
- API routes: **untouched**
- FE bundle: **untouched** (version-string bump only)
- Database schema: **untouched**
- Auth surface: **untouched**

Rollback: revert PR — every changed file is under `e2e/`, plus 3 version-string bumps and 3 doc files.

---

## See also

- Source doc: [`docs/findings/5.1.0-post-soak-two-e2e-fragility-items-2026-08-02.md`](../docs/findings/5.1.0-post-soak-two-e2e-fragility-items-2026-08-02.md)
- Predecessor: [`prod-rel-5.1.0-handoff.md`](prod-rel-5.1.0-handoff.md)
- Soak checks: [`prod-rel-5.1.1-soak-checks.md`](prod-rel-5.1.1-soak-checks.md)
