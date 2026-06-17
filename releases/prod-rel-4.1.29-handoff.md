# prod-rel-4.1.29 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.29` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.28` (v1.17.48).
**Bundles:** v1.17.49 — 2 paired P1 fixes for the lite-client TEAM_MEMBER / CLIENT_ADMIN user journey. Code-only.

## TL;DR

Pteam surfaced two coupled bugs while validating the lite-client flow end-to-end (created `Bio-Exec` lite client + `KolAnalysis(Dry Eye)` + added `sam@bio-exec.com` as TEAM_MEMBER; logged in as sam):

1. **Frontend routing**: non-PLATFORM_ADMIN users land on `/admin` (the platform-admin dashboard) after login. Their sidebar (correctly, per v1.17.45) hides every link except "KOL Insights", but the landing URL itself wasn't role-routed. User has to manually click the sidebar item to reach anything.
2. **Backend DA filter**: `GET /api/v1/insights/disease-areas` filtered by "DA has ≥1 Campaign owned by the user's client". **Lite clients have 0 campaigns by design** — their DA association is via `KolAnalysis` only. The filter missed this entire class, so lite-client users saw "no disease areas available" even when their KolAnalysis was set up correctly.

Either bug alone breaks the journey. Both ship in one PR. Each fix is small + tightly scoped — easy to revert.

## What changes for customers

| Surface | Before (4.1.28) | After (4.1.29) |
|---|---|---|
| `/admin` (post-login landing) | All roles landed here. PLATFORM_ADMIN saw the platform dashboard (stats, system health, etc.); CLIENT_ADMIN / TEAM_MEMBER saw the **same** platform dashboard even though their sidebar didn't have a "Dashboard" entry. Confusing for client users — they had to guess to click "KOL Insights" to find anything. | Client-side `useEffect` redirects non-PLATFORM_ADMIN users to `/admin/dashboards` on mount. PLATFORM_ADMIN (including PLATFORM_ADMIN-while-impersonating) keep the existing platform dashboard. Brief blank render during redirect; no flash of platform content for client users. |
| `GET /api/v1/insights/disease-areas` (for non-PLATFORM_ADMIN) | `where: { isActive: true, campaigns: { some: { clientId: user.tenantId } } }` — required a Campaign to surface a DA. Lite-client users got `[]` because lite clients don't have Campaigns. | `where: { isActive: true, OR: [{ campaigns: { some: clientFilter } }, { kolAnalyses: { some: clientFilter } }] }` — DA surfaces if EITHER a Campaign OR a KolAnalysis is owned by the user's client. PLATFORM_ADMIN path (clientFilter = `{}`) returns same results as before. |

## Side-effect awareness

For a **non-lite client** that happens to have a `KolAnalysis` but no `Campaign`, the DA would now show up (previously it wouldn't). This is desirable — "we have analysis data for this DA" is the meaningful signal for surfacing it on the Insights menu. No customer is in this shape today (Sun Pharma, B+L both have campaigns paired to every analyzed DA).

The campaign/KOL counts returned in the same response are still campaign-based (`_count: { campaigns: { where: clientFilter } }`), so lite-client DAs will show `campaignCount: 0` — the frontend already renders this gracefully (existing 4.1.28 behavior for DAs with no campaigns).

## API changes

None to the contract — same response shape (`{ items: InsightsDiseaseArea[] }`). The filter clause is broader; the returned fields are unchanged.

## Migrations

**None.** Code-only.

## Risk

**Low.** Both changes are tightly scoped and trivially reversible:
- Bug #1 revert: drop the `useEffect` + `useRouter` import + early-return guard in [`apps/web/src/app/admin/page.tsx`](apps/web/src/app/admin/page.tsx).
- Bug #2 revert: restore the AND-only `campaigns: { some: clientFilter }` clause in [`apps/api/src/routes/insights-report.ts:48-65`](apps/api/src/routes/insights-report.ts#L48-L65).

No migrations, no schema, no other surfaces affected. Existing customer behavior (Sun Pharma, B+L — both non-lite, both have Campaign-anchored DAs) is unchanged.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green (1.17.49 across all three) |
| API unit tests | unchanged (no service-layer behavior shifted) |
| E2E structural check (Prisma-direct) | added in [`e2e/api/insights-report.test.ts`](e2e/api/insights-report.test.ts) — synthetic lite-client + KolAnalysis-only DA seeded; OLD `campaigns-only` shape returns 0 matches; NEW `OR { campaigns | kolAnalyses }` shape returns 1. Cleans up after itself. |

**Why a Prisma-direct test and not an HTTP test:** the e2e test user is PLATFORM_ADMIN (`clientFilter = {}`), so both the old and new filters return every active DA via the HTTP path — the bug is invisible at that role level. The structural test exercises the WHERE clause directly with a synthetic `clientFilter = { clientId: liteClient.id }` to prove the OR clause is the operative change.

## Rollback

Redeploy `prod-rel-4.1.28` (v1.17.48). Effects:
- Lite-client users revert to landing on `/admin` (platform dashboard) and seeing `[]` on `/admin/dashboards`.
- Non-lite-client journeys unchanged.

No data destruction. No migration to undo.

## Manual soak

The full repro from the pteam ticket is the verification:

1. As PLATFORM_ADMIN, ensure a lite client (`isLite=true`) exists with at least one `KolAnalysis` paired to a `DiseaseArea`. The pteam test setup (`Bio-Exec` + Dry Eye `KolAnalysis`) already exists in test DB.
2. Ensure a TEAM_MEMBER user is assigned to that client (`sam@bio-exec.com` in test).
3. Log out, log in as that user.
4. **Expected**: lands on `/admin/dashboards` (not `/admin`), and the page renders the Dry Eye DA in the disease-area picker.

PLATFORM_ADMIN smoke: log in as PLATFORM_ADMIN → still lands on `/admin` → still sees the platform dashboard and full DA list. No behavior change.

## See also

- Soak checks: [`prod-rel-4.1.29-soak-checks.md`](prod-rel-4.1.29-soak-checks.md)
- Predecessor: [`prod-rel-4.1.28-handoff.md`](prod-rel-4.1.28-handoff.md)
- Source ticket: [`docs/findings/lite-client-team-member-routing-and-da-visibility-2026-06-16.md`](../docs/findings/lite-client-team-member-routing-and-da-visibility-2026-06-16.md)
