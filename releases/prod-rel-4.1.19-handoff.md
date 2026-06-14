# prod-rel-4.1.19 — Handoff to Prod Team

**Status:** Hotfix roll-forward on top of `prod-rel-4.1.18`. **No migrations.** Reversible (code-only).
**Tag:** `prod-rel-4.1.19` → commit on `main` (cut immediately after this PR merges per combined-PR workflow).
**Supersedes:** `prod-rel-4.1.18` (v1.17.38) — see "Why" below. Pteam should sync **4.1.19**, not 4.1.18.
**Bundles:** v1.17.39 — single-commit hotfix.

## Why

`prod-rel-4.1.18` (PR #163, merged 2026-06-13) broke the `POST /hcps/import` endpoint on api-test. **Caught during post-deploy soak (Phase A4 e2e)**, before Bio-Exec sync. No customer impact — this was test-env only.

Root cause: the new per-row audit `prisma.auditLog.createMany()` in `HcpService.importFromFile` (v1.17.35) passed the route's `userId` directly as `AuditLog.userId`. The route's `userId` value is `request.user!.sub` — a Cognito sub UUID. `AuditLog.userId` is a foreign key to `User.id` (cuid). FK violation → Prisma `P2003` → API returned 400 on every CSV import.

The existing `createAuditLog()` helper already does the cognitoSub→User.id resolution. The new createMany path bypassed it for batch efficiency and forgot the resolution.

Two e2e tests in `e2e/api/hcp-audit-trail.test.ts` (shipped with v1.17.35) caught the regression cleanly: both 400'd on the post-deploy soak run.

## What changes

| Surface | Before (4.1.18) | After (4.1.19) |
|---|---|---|
| `POST /hcps/import` | 503/400 on every upload — Prisma FK violation in per-row audit write | Resolves Cognito sub → User.id once per batch, falls back to system user if no User row, skips per-row audit (and logs a warn) only if neither resolves. Existing batch-summary audit row continues to land via `createAuditLog()`. |
| `apps/api/src/lib/audit.ts` | `createAuditLog()` only — single-row resolution | New exported `resolveUserIdForAudit(cognitoSub)` for batch-insert callers. Same resolution + fallback logic as `createAuditLog`. |
| `releases/runbook-ses-delivery-events.md` | Referenced from 4.1.18 docs but never committed to the PR | Now tracked. |

## Migrations

**None.** Code-only fix.

## Risk

**Very low.** Diff is ~20 lines:
- 1 new exported helper in `audit.ts` (additive — no behavior change for existing callers).
- 1 change to `HcpService.importFromFile`: replace bare `userId` with the resolved User.id in the createMany payload.
- No schema change. No new dependencies. No new env vars.

The per-row audit write was the only caller of the bad pattern. `DistributionService.importHcpsFromFile` (the campaign-side import) already used `createAuditLog()` per-row (correctly), so it never had this bug.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **226/226** |
| Shared unit tests | **190/190** |
| Migrations | n/a (none) |
| E2E `hcp-audit-trail.test.ts` | will run post-deploy — was 2/4 failed on 4.1.18, expected 4/4 on 4.1.19 |

## Rollback

Redeploy `prod-rel-4.1.17` (v1.17.34). **Do not** roll back to 4.1.18 — it has the broken CSV import path. The two 4.1.18 migrations stay in the DB (harmless under 4.1.17 since the new tables go unused).

## See also

- Soak checks: [`prod-rel-4.1.19-soak-checks.md`](prod-rel-4.1.19-soak-checks.md)
- Predecessor: [`prod-rel-4.1.18-handoff.md`](prod-rel-4.1.18-handoff.md) — superseded
