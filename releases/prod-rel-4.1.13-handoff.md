# prod-rel-4.1.13 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.13` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.12` (v1.17.28).
**Bundles:** v1.17.30 — one P1 hotfix + the first slice of client branding.

## TL;DR

Two unrelated themes, bundled into one deploy at the request of "let's have one build trigger." No DB migration, no data backfill.

1. **Core Focus filter on Insights returned 0 respondents for every selection (P1).**
   Bug shipped ~2 months ago (when filter wiring was added) and lurked until a customer reported on 2026-06-09. Root cause: the `coreFocuses` branch in `applyRespondentFilters` only read `answerText` (the single-choice path). Core Focus is a `MULTI_CHOICE` question; 100% of prod answers store data in `answerJson.selected[]`, so the filter never matched. The sibling `practiceSettings` filter (also MULTI_CHOICE) already handled both shapes — this commit mirrors that pattern verbatim. Single helper change → all three filter-aware endpoints (Demographics + Leader Rankings + Sociometric Summary) fixed together. Full repro + root cause: [`docs/findings/core-focus-filter-broken-2026-06-09.md`](../docs/findings/core-focus-filter-broken-2026-06-09.md).

2. **Client branding — Phase 1 + 3A + Phase 2 of the client-branding ticket.** TEAM_MEMBER / CLIENT_ADMIN users now see a clear visual cue of which client they're viewing. PLATFORM_ADMIN impersonation gets a prominent "Viewing as X" badge in the header (was previously only an 11px grey hover sublabel). Spec: [`docs/findings/client-branding-theme-ticket-2026-06-05.md`](../docs/findings/client-branding-theme-ticket-2026-06-05.md).
   - **Header brand badge** — name + logo (or tinted initials) + color dot. Sits left of the user menu.
   - **`GET /api/v1/clients/me`** — new opt-in endpoint (scoped to `requireTenantUser`) so TEAM_MEMBER / CLIENT_ADMIN can fetch their own client. PLATFORM_ADMIN gets `null` (no tenant); they fall through to the impersonation context.
   - **`logoUrl` text input on the client edit form** — previously the form read `client.logoUrl` on edit but never rendered an input, so the field was effectively unreachable from the UI. Now editable as a URL string (no upload — Phase 3B deferred).
   - **4px brand-color stripe** at the very top of the admin layout — hidden for PLATFORM_ADMIN with no impersonation; subtle always-on cue otherwise.
   - **CSS-var theme provider** — sets `--brand-primary` + `--brand-on-primary` + `--brand-primary-tint` on `documentElement` from the current client's `primaryColor`. Auto-luminance picks the readable text color. Default falls back to `#0066CC`, so all 3 prod clients (currently on default) see no visual change until an admin edits their color.

Also bundled: a **two-sided E2E filter matrix** (`filtered ≤ baseline` AND `filtered > 0`, pulls values from `/filter-options`) so the next time a filter zeros out, it fails loudly in CI instead of silently in prod for 2 months. Test-suite-only change; no runtime impact.

## What changes for customers (the visible bit)

| Surface | Before (prod-rel-4.1.12) | After (prod-rel-4.1.13) |
|---|---|---|
| Insights → Demographics → Core Focus filter | Every selection returned 0 respondents and an empty dashboard | Selections narrow to the matching respondents (e.g. Glaucoma → ~156, Dry Eye (...) → ~288 on the Sun Pharma DA) |
| Insights → Sociometric Leaders → Core Focus filter | Same — every selection zeroed the list | Filters narrow as expected |
| Insights → Strategic / Benchmarking → Core Focus filter | Same | Filters narrow as expected |
| Admin header (TEAM_MEMBER / CLIENT_ADMIN login) | No visible client cue; only 11px grey "role" sublabel in user menu | Brand badge: name + logo (or tinted initials) + color dot |
| Admin header (PLATFORM_ADMIN impersonating) | "Viewing as X" was an 11px grey sublabel in the user menu hover only | Prominent "Viewing as X" badge in the header |
| Admin header (PLATFORM_ADMIN no impersonation) | (no change) | (no change — badge hidden, stripe hidden) |
| Top of admin layout | (none) | 4px brand-color stripe when there's a client context |
| Client edit form (admin → Clients → Edit) | Logo URL field exists in the data model but no input in the form | "Logo URL" text input next to Brand Color |

## Per-PR detail

Single PR: **#155** (`v1.17.30: fix Core Focus filter (MULTI_CHOICE branch) + two-sided test matrix` + `v1.17.30: client branding`). Two commits on the dev branch:

### v1.17.30 (a) — `23ac436` — Core Focus + test matrix

- `apps/api/src/services/insights-report.service.ts` — `coreFocuses` filter branch now handles `MULTI_CHOICE` by reading `answerJson.selected[]`. Single-choice fallback retained. Mirrors `practiceSettings` (lines 279-302) verbatim.
- `e2e/api/insights-respondent-filters.test.ts` — new `Two-sided filter matrix` block. For each `(filter, endpoint)` pair, asserts `filtered <= baseline` AND `filtered > 0`. Pulls realistic values from `/filter-options` instead of the prior hardcoded literals (the old test used `'Dry Eye'` while the actual category is `'Dry Eye (including OSD, MGD, and NK)'`).

### v1.17.30 (b) — `2847339` — Client branding

Backend:
- `apps/api/src/routes/client-me.ts` — new plugin registering `GET /me` at the `/api/v1/clients` prefix. Auth: `requireTenantUser` (so it doesn't inherit the `requirePlatformAdmin` gate on the main `clientRoutes` plugin). Returns the user's Client row, or `null` for PLATFORM_ADMIN (no tenant) / a deleted Client.

Frontend hooks:
- `apps/web/src/hooks/use-clients.ts` — new `useClientMe()` query.
- `apps/web/src/hooks/use-current-client.ts` — `useCurrentClient()` unifies the three cases: PLATFORM_ADMIN impersonating → impersonation context; PLATFORM_ADMIN no impersonation → `null`; TEAM_MEMBER / CLIENT_ADMIN → `/clients/me`. Single source of truth for the badge + theme provider.

Frontend components:
- `apps/web/src/components/layout/client-badge.tsx` — compact name + logo (or tinted initials) badge with primaryColor-tinted background. Prefixes with "Viewing as" when impersonating.
- `apps/web/src/components/layout/client-theme-provider.tsx` — sets CSS vars on `documentElement` from `client.primaryColor`. Mounted inside `ImpersonationProvider` in the admin layout so it picks up impersonation flips.
- `apps/web/src/lib/color.ts` — `hexToRgb`, `pickReadableTextColor` (WCAG luminance threshold for auto-contrast), `withAlpha`.

Wiring:
- `apps/web/src/components/layout/header.tsx` — `<ClientBadge />` mounted to the left of the user menu (Option C from the spec — pairs with user context, no new layout zone).
- `apps/web/src/app/admin/layout.tsx` — `<ClientThemeProvider>` wraps `<AdminLayoutContent>`; new `<BrandStripe>` 4px component mounts above `<Header />`.
- `apps/web/src/components/clients/client-form-dialog.tsx` — `<FormField name="logoUrl">` URL text input added between the name and primaryColor fields. Zod schema already accepts `logoUrl` as optional/nullable URL; no schema change needed.

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green (all 3 packages, no errors) |
| Shared unit tests (165 tests) | green |
| API unit tests (210 tests) | green |
| Test env deploy (api-test) | api-test.bio-exec.com `/health` reports `1.17.30` |
| `/clients/me` unauth | 401 (correct gate) |
| `/clients/me` as PLATFORM_ADMIN | returns `null` (correct — no tenant) |
| `/demographics?coreFocuses=...` | 200 (route healthy; full filter behavior not exercised on test — test env has 1 respondent + empty `byCoreFocus`, so meaningful Core Focus data only exists in prod where the bug was reported) |
| Browser UI on koltest.bio-exec.com | Badge + logo + name visible (operator-verified) |

## Risk

**Low.**

- **Core Focus fix**: 15-line service change in a single helper, mirrors an existing working pattern (`practiceSettings`). No DB / migration / schema change.
- **`/clients/me` endpoint**: net-new route gated on `requireTenantUser`; nothing else changes. PLATFORM_ADMIN reads of the existing `/clients/:id` still go through the main plugin (with `requirePlatformAdmin`).
- **Header badge + brand stripe**: pure additive UI. If either renders broken, no other chrome is affected — the user menu sits on the same row and is unchanged.
- **CSS-var theming**: Phase 2 theming ships **visually no-op on prod**. All 3 prod clients (Sun Pharma, Joe's Company, BioExec internal) are on the default `#0066CC` primaryColor. Theming only activates when an admin edits a client's color via the existing form (which has been there since 2025). The stripe will become brand-colored once a color is changed.
- **logoUrl input**: form field addition only. Same field exists in the DB + Zod schema; this just makes it reachable from the UI. Until a client admin pastes a logo URL, badges fall back to tinted initials (already the current behavior since all 3 prod clients have empty `logoUrl`).

## Rollback

Redeploy `prod-rel-4.1.12` (v1.17.28). Effects:

- Core Focus filter regresses to "returns 0 for every selection" (the original P1 bug returns).
- Header brand badge disappears; impersonation reverts to 11px grey sublabel only.
- `GET /api/v1/clients/me` returns 404. No frontend cleanup needed — `useCurrentClient` falls through to `null` and the badge component renders nothing.
- Brand stripe disappears.
- `--brand-primary` CSS vars are no longer set, but nothing reads them in the rolled-back code.
- Logo URL input disappears from the client edit form. Any `logoUrl` values set during the 4.1.13 window remain in the DB (they're just no longer visible in the form until rolled-forward).

No data state to unwind.

## See also

- Soak checks: [`prod-rel-4.1.13-soak-checks.md`](prod-rel-4.1.13-soak-checks.md)
- Predecessor: [`prod-rel-4.1.12-handoff.md`](prod-rel-4.1.12-handoff.md)
- Original bug report: [`docs/findings/core-focus-filter-broken-2026-06-09.md`](../docs/findings/core-focus-filter-broken-2026-06-09.md)
- Original branding spec: [`docs/findings/client-branding-theme-ticket-2026-06-05.md`](../docs/findings/client-branding-theme-ticket-2026-06-05.md)
