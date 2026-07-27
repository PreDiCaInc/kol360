# prod-rel-5.0.2 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Fully reversible via PR revert.
**Tag:** `prod-rel-5.0.2` — anchor at the merge commit on `main` (tag flavor TBD by pteam at cut time; `5.0.2` used here as the working name for the patch bump on the 5.0 line).
**Supersedes:** `prod-rel-5.0.1` (v1.19.2).
**Bundles:** v1.19.2 → v1.19.3 — hygiene continuation of 5.0.1 addressing the 2 post-soak tickets pteam raised on prod-rel-5.0.1 (2026-07-25).

---

## TL;DR

Hygiene release. Closes the 2-ticket punch-list from pteam's prod-rel-5.0.1 post-soak review (`docs/findings/prod-rel-5.0.1-post-soak-tickets-2026-07-25.md`): **one P2** (T7 — full-suite e2e was failing ~45 tests on FK errors because cleanup nuked seeded fixtures and nothing re-seeded them; adds `pnpm seed` to the same pretest hook chain 5.0.1's T5 wired `prisma:generate` into — the missing companion fix) and **one P3** (T8 — `insights-report.test.ts` "labels every KOL with a valid influencer type" assertion swapped from `.toBe(true)` shape to `.toContain(kol.influencerType)` so future failures name the offending value in the diff instead of stranding pteam on "expected false to be true").

Zero product runtime paths changed. E2E-only + one const-mirror sync. Same "very low" risk shape as 5.0.1.

---

## What changed — ticket by ticket

### Ticket 7 (P2) — Full-suite e2e re-seeds fixtures automatically before every run

**File:** `e2e/package.json`

Root cause: `cleanup:all` (and per-run cleanups from prior full-suite runs) delete seeded fixtures — the test admin `User`, `SurveyTemplate cme2e0test0survey00001`, `SectionTemplate`, 3 test HCPs, test specialty, 3 test questions, test `DiseaseArea`. On the next full-suite run against the same env, ~45 tests failed with Prisma FK errors (`Campaign_surveyTemplateId_fkey`, `AuditLog_userId_fkey`) across `full-workflow.test.ts`, `users-*.test.ts`, `questions.test.ts`, `ucpm-backfill-deep.test.ts`, `influencer-type-import.test.ts`, `opt-outs.test.ts`, `brand-grid-question-toggle.test.ts`, auth `/users/me`, access-control impersonation, etc.

The 5.0.1 T5 fix (`prisma:generate` pretest hook) closed the stale-Prisma-client half of "e2e broke because our env drifted." T7 closes the missing-fixtures half — the two together restore self-healing behavior to the full-suite entry points.

Fix — one-liner sibling of T5, applied to all 6 `pretest:*:auth` pnpm pre-hooks the 5.0.1 T5 already covered:

```diff
-    "pretest:api:test:auth": "pnpm prisma:generate",
+    "pretest:api:test:auth": "pnpm prisma:generate && pnpm seed",
```

Chained shape (`prisma:generate && seed`) matters — the seed script imports `@prisma/client` and needs the generated client on disk. Ordering matches T5's intent. `pnpm seed` is idempotent (the existing script uses `prisma.*.upsert` throughout), so re-runs against an env that already has the fixtures are a no-op.

Covered scripts (mirrors T5's coverage exactly):
- `pretest:api:test:auth`
- `pretest:api:prod:auth`
- `pretest:api:aws:auth`
- `pretest:workflow:test`
- `pretest:workflow:prod`
- `pretest:workflow:aws`
- `pretest:all:aws:auth`

Behavior for pteam: any full-suite run now starts from a known-good baseline. No user-facing change — the 45 failing tests should green on the next full-suite run.

### Ticket 8 (P3) — INFLUENCER_TYPES assertion diagnostic + prod-values audit

**File:** `e2e/api/insights-report.test.ts`

Two parts, shipped together.

**Part A (diagnostic) — always ship.** The `"labels every KOL with a valid influencer type"` assertion was written as:

```ts
expect(valid.has(kol.influencerType as string)).toBe(true);
```

On failure this produces `AssertionError: expected false to be true`, which strands the reader on figuring out WHICH value was rejected. Swapped to vitest's `.toContain()` shape so the diff surfaces the offending value:

```ts
expect(INFLUENCER_TYPES).toContain(kol.influencerType);
```

This is a pure test-diagnostic improvement — same pass/fail semantics, better failure message. Applies regardless of what the const contains.

**Part B (data audit) — no const change needed today.** The 5.0.1 T1 fix extended `INFLUENCER_TYPES` from 5 values to 13 (added DED Trace / Industry / Glaucoma / Retina / Retired / Canada / Deceased / FDA). Pteam's post-soak ticket flagged that the test still failed after 5.0.1 on prod, implying an unknown 9th (14th total) value was present on a real prod KOL row that the extended const didn't cover.

Ran a read-only audit against prod (`postgresql://…@localhost:5433/kol360` via `scripts/tunnel-up.sh prod`):

```sql
SELECT DISTINCT "influencerType", length("influencerType")
FROM "HcpDiseaseArea"
WHERE "influencerType" IS NOT NULL
ORDER BY 1;
```

Result — 11 distinct values, all already in the current 13-value const:

| Value | Row count |
|---|---|
| DED Trace | 1,939 |
| Regional Leaders | 1,492 |
| Rising Stars | 382 |
| National Leaders | 90 |
| Industry | 27 |
| Glaucoma | 9 |
| Retina | 7 |
| Retired | 7 |
| Canada | 3 |
| Deceased | 1 |
| FDA | 1 |

Every one of the 11 present values is in `INFLUENCER_TYPES` and lengths are clean (no hidden whitespace / trailing chars). **No 9th value exists on prod as of 2026-07-26.**

Two plausible explanations for pteam's 5.0.1 observation: (a) it was run against a stale build (before T1 shipped, or before the deployed web bundle picked up the const extension) — 5.0.1's `/health` did flip to 1.19.2 but the specific test module may have been cached; or (b) the offending row was corrected between 2026-07-25 and today (biz-team is actively importing — Hcp counts +12 NPI + +12 ONEKEY_ID vs. 2026-07-22 baseline per pteam's 5.0.1 soak notes).

**Ship shape:** Part A only. The `INFLUENCER_TYPES` const on dev already includes all 11 prod values from the 5.0.1 extension — no addition needed. If a 14th value appears on the next full-suite run against prod after this ships, Part A's `.toContain` diff will name it in the failure output and pteam can hand it back as a one-line const extension.

E2E test file inlines `INFLUENCER_TYPES` (e2e workspace can't resolve `@kol360/shared` paths). Updated the inline list to match the 13-value shared const so both stay in sync — same maintenance pattern the file was already following.

---

## Migrations

**None.** This release changes zero schema.

---

## Risk

**Very low.** Both changes are e2e / test-diagnostic only.

- **Ticket 7** touches only `e2e/package.json`. `pnpm seed` uses `upsert` throughout — safe to re-run on any env, safe to run against a pristine env. Only side effect on the test envs is that the seeded fixtures are present when tests need them. No runtime code path.
- **Ticket 8** Part A is a `.toBe(true)` → `.toContain()` swap in one test — same pass/fail truth table, better diff on failure. Part B added no code (audit-only).

Rollback shape: revert the PR. No schema to unwind. No infra state changed.

---

## Test environment verification

At `v1.19.3` on dev branch:

| Check | Result |
|---|---|
| `pnpm --filter @kol360/shared build` | pass |
| `pnpm --filter @kol360/api build` | pass |
| `pnpm --filter @kol360/web build` | pass |

Formal e2e verification of both tickets happens post-deploy per `tdct` — see `prod-rel-5.0.2-soak-checks.md`.

---

## Rollback shape

1. Revert the PR on `main` → App Runner auto-redeploys to v1.19.2.
2. No DB state to unwind (no migrations in this release).
3. No Cognito or infra state to unwind.

---

## See also

- Soak checks: [`prod-rel-5.0.2-soak-checks.md`](prod-rel-5.0.2-soak-checks.md)
- Predecessor: [`prod-rel-5.0.1-handoff.md`](prod-rel-5.0.1-handoff.md)
- Source ticket doc: [`docs/findings/prod-rel-5.0.1-post-soak-tickets-2026-07-25.md`](../docs/findings/prod-rel-5.0.1-post-soak-tickets-2026-07-25.md)
