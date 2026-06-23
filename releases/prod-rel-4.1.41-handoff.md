# prod-rel-4.1.41 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.41` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.40` (v1.17.60).
**Bundles:** v1.17.61 — two pteam soak follow-ups, both cosmetic / non-regression.

## TL;DR

1. **`logo-white.png` shrunk 899 KB → 4.9 KB.** v1.17.60 made the asset LOOK right under `object-fit: contain` + the 144×36 box, but the underlying bytes were untouched. Slow on mobile / corporate wifi, and Outlook proxies were dropping it for size. Resampled to 93×72 PNG (2× retina for the 36 px display, source aspect ratio preserved) via macOS `sips`. **99.4 % smaller**, visually unchanged.

2. **Dropped 6 unreachable CLIENT_ADMIN branches in `routes/users.ts`.** Each of invite / update / disable / enable / resend-invite / delete is already gated by `requirePlatformAdmin()` preHandler. Every `if (request.user!.role === 'CLIENT_ADMIN' && ...) { 403 }` block inside those handlers was dead code — `requirePlatformAdmin` rejects non-platform-admins before the handler runs. **77 lines deleted.** Behavior identical.

## What changes for customers

| Surface | Before (4.1.40) | After (4.1.41) |
|---|---|---|
| Welcome / survey / reminder emails — visible logo | renders correctly (v1.17.60 fix) but the source is 899 KB; Outlook recipients still see "Loading…" or a blocked image | same render, 4.9 KB source, near-instant load, slips under Outlook's image-block thresholds |
| `/users` admin actions | behavior identical | behavior identical (dead-code cleanup only) |

## API changes

**None.** Item 2 removes only unreachable code paths.

## Migrations

**None.** Code-only.

## Risk

**Trivial.**

- Item 1: file swap. Same path, same alt text, same dimensions HTML attrs in the templates. If anything looks wrong post-deploy: redeploy 4.1.40 and the 899 KB file comes back.
- Item 2: pure refactor. Any non-platform-admin attempting these routes hits the same 403 from `requirePlatformAdmin` they hit before; the second-layer 403s never fired.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.61 |
| Email render with new logo | confirmed locally — 144×36 box still constrained; image sharper at 2× display density |
| API routes | identical Fastify route table at startup |

## Rollback

Redeploy `prod-rel-4.1.40` (v1.17.60). 899 KB logo returns; 77 lines of dead conditional code return. No data destruction.

## Manual soak

1. Pull up a welcome invite or survey email on a slow mobile connection / Outlook web. Confirm the logo loads near-instantly (was 899 KB → 4.9 KB).
2. Confirm Users page Invite / Edit / Disable / Enable / Approve / Resend / Delete all still work identically.

## See also

- Soak checks: [`prod-rel-4.1.41-soak-checks.md`](prod-rel-4.1.41-soak-checks.md)
- Predecessor: [`prod-rel-4.1.40-handoff.md`](prod-rel-4.1.40-handoff.md)
- Pteam soak feedback that surfaced these: (informal, in-conversation 2026-06-22)
