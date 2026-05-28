# prod-rel-4.1.2 — Handoff to Prod Team

**Status:** Ready for prod deploy.
**Tag:** [`prod-rel-4.1.2`](https://github.com/PreDiCaInc/kol360/releases/tag/prod-rel-4.1.2) → commit [`f2922d8`](https://github.com/PreDiCaInc/kol360/commit/f2922d8) on `main`.
**Supersedes:** `prod-rel-4.1.1` (v1.17.0) — this is a small follow-up patch from your 4.1.1-soak bug reports.

## What this is

Three code-only fixes flagged during the prod-rel-4.1.1 soak. **No migrations.** Reversible — redeploy 4.1.1 if anything regresses.

| # | Severity | Area | Change |
|---|---|---|---|
| 1 | P2 | Segment-score importer | Within-file dedup of `(npi, diseaseAreaId)` rows + new `deduped` count in the response |
| 2 | P3 | Admin `/health/status` widget | Web proxy forwards `HEALTH_CHECK_TOKEN`; backend gate flipped from strict-equality to dev-allowlist |
| 3 | UX | Insights "Clear filters" button | Outline variant + full label so it doesn't blend away |

The tag also includes a non-prod-impacting e2e test fix (race-prone empty-array assertions in `nomination-matching.test.ts`) — won't affect prod behavior, just makes the E2E suite stable under parallel workers.

## Fix details

### 1. Segment-score importer dedup (P2 — your 2026-05-22 report)

**Bug:** CSV with the same NPI listed twice for the same disease area hit the `@@unique([hcpId, diseaseAreaId])` constraint and crashed the import. Both rows were routed into `toCreate` because the categorization phase ran in a single pass without refreshing its in-memory map.

**Fix:** [`apps/api/src/services/hcp.service.ts`](apps/api/src/services/hcp.service.ts) — dedupe `rowsWithHcps` by NPI before the categorization phase. **Last row wins** (i.e., later rows in the CSV override earlier ones). The response payload now includes a `deduped` count so customers see how many rows collapsed.

**E2E regression:** [`e2e/api/segment-import-dedup.test.ts`](e2e/api/segment-import-dedup.test.ts) — CSV with Alice listed twice → expects `deduped=1`, `created+updated=2`, no errors.

### 2. Admin `/health/status` widget (P3 — 2-bug compound, your 2026-05-22 report)

**Bug A — web proxy:** The Next.js route at [`apps/web/src/app/api/health/status/route.ts`](apps/web/src/app/api/health/status/route.ts) was calling backend `/health/full` without forwarding the `HEALTH_CHECK_TOKEN`. On prod, backend rejected the unauthenticated call → widget went red.

**Bug B — backend gate:** [`apps/api/src/routes/health.ts`](apps/api/src/routes/health.ts) was using `process.env.NODE_ENV === 'production'` as the strict-equality gate for token enforcement. Staging (`NODE_ENV=staging`) silently bypassed the check entirely — the proxy bug couldn't surface on test, only prod.

**Fix A:** Web proxy now reads `HEALTH_CHECK_TOKEN` from env and sends `Authorization: Bearer ${token}` to backend.

**Fix B:** Backend gate flipped to a **dev allowlist**: `!['development', 'test'].includes(NODE_ENV)`. Means staging (`NODE_ENV=staging`) now enforces the token check too — surfacing this class of bug in test before prod going forward.

This is the principle you flagged: *"test and prod should have the same functionality — only dev gets lenient defaults."* Captured to our memory; default for future env-conditional checks.

### 3. Insights "Clear filters" button (UX — customer feedback, your 2026-05-22 report)

**Bug:** Existing Clear filters button was rendered as `variant="ghost"` + `text-muted-foreground` + the label `"Clear"`. Customer didn't see it and asked for one to be added.

**Fix:** [`apps/web/src/components/insights/global-filters.tsx`](apps/web/src/components/insights/global-filters.tsx) — switched to `variant="outline"`, dropped the muted-foreground class, label updated to `"Clear filters"`. Now visible.

## Customer-facing change worth signaling

- **Segment import:** customers will see a new `deduped` field in the import-result toast/summary (e.g. `"Imported: 198 created, 12 updated, 3 deduped (NPI listed twice)"`). Same import semantics as before, just no longer fails on duplicates.
- **Insights page:** "Clear filters" button is now visible. No new functionality, just visible.
- **/admin/health/status:** widget will go green on prod once the deploy + env-var change lands.

## AWS env var change (you own — one-time)

After or during the 4.1.2 deploy, set `HEALTH_CHECK_TOKEN` on the **test** App Runner service (`kol360-api-test`) so the proxy works end-to-end on staging. Same value as prod's (or rotate both — see below). Without this, the staging admin status widget will go red after fix-2 lands.

### Token rotation note

If you ever rotate `HEALTH_CHECK_TOKEN`, both places must update in lockstep:

- App Runner backend env var (prod: `kol360-api`; test: `kol360-api-test`)
- `apps/web/.env.production`

Worth a check at the cutover review gate per release.

## Migrations

**None.** Code-only patch.

## Test environment verification

| Check | Result |
|---|---|
| Shared unit tests | 162/162 |
| API unit tests | 210/210 |
| Web build | green |
| E2E full workflow vs test env (post-deploy of v1.17.1) | 152/152 ✓ |
| New `segment-import-dedup` regression test | passes |
| Test-env deployment | `kol360-api-test` + `kol360-web-test` both RUNNING on 1.17.1 ✓ |

## Soak checks

[`prod-rel-4.1.2-soak-checks.md`](prod-rel-4.1.2-soak-checks.md) — short 3-phase checklist scoped to the 3 fixes. Recommend **2-3 days soak** (small surface area, no migrations).

## Rollback

If anything regresses, redeploy 4.1.1 (v1.17.0). No data-state divergence — code-only patch.

## What's next on our side

After 4.1.2 soaks cleanly: **the Phase 3 arc + 4.1.1 follow-ups are all done.** No queued workstream behind it.

Outstanding minor items (not blocking):
- Migration baseline reconciliation on prod (`_prisma_migrations` table is stale — housekeeping, see [`prod-team-deploy-guidance.md`](prod-team-deploy-guidance.md) for the reconcile snippet).
