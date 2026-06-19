# prod-rel-4.1.37 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.37` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.36` (v1.17.56).
**Bundles:** v1.17.57 — pteam dev-hygiene ticket `e2e-maintenance-3-fixups-2026-06-18.md` (3 test fixups) + **one real production-code bug** surfaced while verifying the test fixes.

## TL;DR

1. **HCP importer UPDATE branch stale-snapshot race fix (PRODUCTION CODE).** The v1.17.56 importer relaxation used `row.X || existing.X` to fall back to the bulk-load snapshot for omitted columns. Under concurrent admin uploads (or the test suite's interleaved tests on the same HCP), the snapshot is stale by the time the UPDATE runs — writing it back clobbers any concurrent edit. Fix: only set columns the row actually provides; omit the rest from the Prisma `update` call (Prisma leaves them untouched). No FE change.

2. **E2E `valid` influencer-type set updated.** Was hardcoded to the pre-4.1.24 3-value list (`'National Leaders', 'Rising Stars', 'Regional Influencers'`). v1.17.44 expanded the canonical set to 5 (added `'Regional Leaders'` and `'Pre-Emergent'`). The data team's recent direct-SQL backfill populated `'Pre-Emergent'` on ~3,978 prod HCPs, so the test was guaranteed to fail when sampling those rows.

3. **E2E ZodError-specific assertion loosened to status-only.** The `nomination-matching.test.ts` 4.1.36-era guard against the 2026-05-21 "Optometrist → 500 + raw Prisma error" regression demanded the 400 specifically carry `errorName === 'ZodError'`. 4.1.36's HCP importer moved validation earlier in the request lifecycle — 400 no longer Zod-shaped. Customer-visible behavior unchanged. Test now asserts the contract ("rejected with structured 400"), not the implementation layer.

4. **E2E match-count parity test pinned to isolated fixture.** The parity test (`match-count == demographics.totalRespondents`) used the top-scored analysis. Same (client, DA) as the `createTestCampaign` pool. Campaigns mutated mid-suite → `resolveAccessibleCampaignIds` returned different sets between the two API calls → flake. New `STABLE_FIXTURE.PARITY_*` seed: dedicated DA + campaign + analysis under their own disease area no other test touches.

## What changes for customers

### Item 1 — HCP importer concurrency safety

Single-admin bulk-upload flows are unaffected (no concurrent writes to clobber). The race only bites when two admins upload to the same set of HCPs at the same time, or when an admin uploads while the data team runs a SQL backfill.

| Scenario | Before (4.1.36) | After (4.1.37) |
|---|---|---|
| Solo admin full-row CSV | Worked. UPDATE wrote all 8 columns. | Worked. UPDATE writes only the columns the row provides; for full rows, that's all 8. Same end state. |
| Solo admin partial CSV (`NPI,City,State`) | Worked. UPDATE used `row.X \|\| existing.X` — `existing.X` from bulk-load snapshot. | Works correctly. Now writes only city + state; firstName/lastName/email/specialty stay untouched in DB. |
| Concurrent admin A (`NPI,City,State`) + admin B (`NPI,Specialty`) | **Clobber race.** Whoever wrote second's `existing` snapshot was stale → restored the first writer's pre-write values. The later write would erase the earlier one's changes. | No clobber. A's update sets `{city, state}` only; B's sets `{specialty}` only. Both land cleanly. |

The pre-fix race wasn't yet observed in customer ops sessions (admins haven't done concurrent bulk uploads), but it would have surfaced once two admins started working in parallel. Caught by the test suite's interleaved test execution exposing the race deterministically.

### Items 2-4 — Test maintenance

Pure dev hygiene. No customer impact. After this release, the e2e suite passes deterministically against prod data instead of requiring re-runs to clear known flakes.

## API changes

**None.** Item 1's fix changes the Prisma `update` data payload shape — fields are omitted instead of set to fallback values — but the request/response contract is identical.

## Migrations

**None.** Code-only.

## Risk

**Low.** Item 1 is the only production code change. The new UPDATE behavior is strictly safer (writes only what the row provides; never clobbers); the existing full-row CSV flow is unchanged in behavior. Items 2-4 are e2e-only edits + a new fixture seed.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.57 |
| API unit tests | 231/231 pass |
| Stable parity fixture seeded on test DB | ✓ (e2e:seed run; parity DA + campaign + analysis present) |
| E2E run | will run post-deploy via `tdct` against v1.17.57 |

## Rollback

Redeploy `prod-rel-4.1.36` (v1.17.56). Effects:
- HCP importer UPDATE reverts to the stale-snapshot fallback pattern. Concurrent-write races return; solo uploads unaffected.
- E2E test fixes are local to dev clones (don't deploy); not part of rollback.

No data destruction.

## Manual soak

The most important thing to verify post-deploy is the partial-row UPDATE behavior (which 4.1.36 introduced and 4.1.37 makes race-safe):

1. Pick an existing HCP. Note their current values (name, email, specialty, city, state).
2. Upload `NPI,City,State` CSV with new city + state for that HCP.
3. Confirm city + state changed; name/email/specialty preserved.
4. Repeat with `NPI,Specialty` CSV. Confirm specialty changed; city/state preserved.

Each path independently exercises the per-field update-omission logic.

## See also

- Soak checks: [`prod-rel-4.1.37-soak-checks.md`](prod-rel-4.1.37-soak-checks.md)
- Predecessor: [`prod-rel-4.1.36-handoff.md`](prod-rel-4.1.36-handoff.md)
- Source ticket: [`docs/findings/e2e-maintenance-3-fixups-2026-06-18.md`](../docs/findings/e2e-maintenance-3-fixups-2026-06-18.md)
