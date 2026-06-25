# prod-rel-4.1.45 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migrations.** Reversible.
**Tag:** `prod-rel-4.1.45` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.44` (v1.17.64).
**Bundles:** v1.17.65 — three Insights Use Cases UX polish items + one tooling fix.

## TL;DR

1. **Intro tab link now opens the drawer** (was: navigated to `/admin/dashboards/guide` as a full page). Matches the behavior of the "Use Cases" button in the dashboard header — same drawer either way. Less context loss for the user reading the Methodology + clicking the inline link.
2. **Drawer is wider** — was capped at 720px (≈ 50% of viewport on a 1440 monitor), now uses 65vw capped at 1100px (≈ 60–70% on common laptop / monitor sizes, ≈ 76% at 1440, ≈ 57% at 1920). Easier to read screenshots + step text side-by-side.
3. **Favicon explicit in root metadata** — pages under `/admin/dashboards/guide` (and any others mounted in App Router branches without an explicit `app/favicon.ico` lookup match) were rendering without the browser-tab icon. Adding `icons: { icon: '/favicon.ico' }` to the root layout's metadata emits `<link rel="icon">` on every page.
4. **Tooling: sync-hcps-from-prod.ts advances `beid_seq`** at the end of a run. Caught from yesterday's prod-sync → today's e2e regression: 6 HCP-create tests deterministically failed with `Unique constraint failed on (beId)`. Root cause: Postgres sequences don't auto-advance when rows are inserted with explicit values, so after the sync `beid_seq.last_value` (11035) lagged the synced max beId (13619). Next API-driven `nextval()` returned a value already taken by a synced row. Fix: `setval('beid_seq', GREATEST(max_beId, last_value))` at end of sync. Idempotent. Test DB was hand-fixed at diagnosis time; the script change keeps it from happening again on future runs.

5. **Tooling: sync scripts require `SYNC_DB_PASSWORD` env var** — pteam flagged that the original commits hardcoded the admin password in source. Both `scripts/sync-hcps-from-prod.ts` and `scripts/sync-segment-scores-from-prod.ts` now read the password from `process.env.SYNC_DB_PASSWORD` and refuse to start without it. **Important caveat:** the prior commits (`c8d29f6`, `b4c0f09`, `f9ce673`, `cff14fc`) are already on `main` with the password in source — those values live in git history forever even after this fix. Recommend rotating the test/prod DB admin password at the next maintenance window; flag separately.

## What changes for customers

| Surface | Before (4.1.44) | After (4.1.45) |
|---|---|---|
| Insights → Intro tab → "Insights — Use Cases" link | Navigated away to `/admin/dashboards/guide` as a full-page route | Opens the same right-side drawer as the "Use Cases" button. User keeps their dashboard context. |
| Insights guide drawer width | Capped at 720px (~50% viewport at 1440) | 65vw, capped at 1100px (~60–70% at 1440) |
| Browser tab on `/admin/dashboards/guide` | No favicon shown | Favicon shown |

Standalone `/admin/dashboards/guide` page still works as a bookmarkable full-page route (linked from the drawer's "Open full page" affordance). Only the inline Intro-tab link changed behavior.

## API changes

**None.**

## Migrations

**None.** Code-only.

## Risk

**Trivial.** Three UI polish items + one tooling script edit. No data path touched.

Rollback: redeploy 4.1.44 (v1.17.64). Inline link reverts to navigation; drawer width back to 720px cap; favicon goes back to "whatever browsers find by default."

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.65 |
| E2E suite | 251 passed / 5 skipped (test DB sequence hand-fixed during diagnosis; matches pre-sync baseline) |

## Manual soak

1. **Intro tab link → drawer**: Insights → Intro → scroll to bottom of Methodology → click "📖 Insights — Use Cases" → drawer slides in from the right. (Pre-fix this navigated away.)
2. **Drawer width**: Click the Use Cases button → drawer should take roughly 60–70% of viewport (varies with screen size).
3. **Favicon**: Open `/admin/dashboards/guide` directly (or click "Open full page" from the drawer) → confirm browser tab shows the KOL360 favicon.

## See also

- Soak checks: [`prod-rel-4.1.45-soak-checks.md`](prod-rel-4.1.45-soak-checks.md)
- Predecessor: [`prod-rel-4.1.44-handoff.md`](prod-rel-4.1.44-handoff.md)
