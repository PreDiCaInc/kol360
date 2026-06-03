# prod-rel-4.1.11 — Handoff to Prod Team

**Status:** Ready for prod deploy. **No migration.** Reversible (code-only).
**Tag:** `prod-rel-4.1.11` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.10` (v1.17.16).
**Bundles:** v1.17.17 + v1.17.18 (admin-UX policy changes + one follow-up).

## TL;DR

Three policy/RBAC items + one follow-up against the v1.17.17 deploy.

**Theme 1 — Client.emailDomains is now required (v1.17.17).** Was optional with `default([])` → admin could create a client with no allowlist and the runtime fell back to "no restriction" mode. Now `.min(1)` at the Zod layer; admins must specify at least one domain on every new client. Legacy clients (every pre-v1.17.17 client on prod) are grandfathered at the userService runtime check — any future edit through the form forces filling it in, gradually retiring the empty-array state.

**Theme 2 — Auto-approve invited users (v1.17.17).** Was: admin invites → user sits in `PENDING_VERIFICATION` → user completes Cognito's forced password change → `/users/me` returns 403 → frontend signs them out. The user couldn't progress past the login screen without a separate admin clicking "Approve" in /admin/users. Confusing UX with no real benefit (admin already invited them). Now: `/users/me` auto-flips `PENDING_VERIFICATION → ACTIVE` on first successful authenticated call. `/users/:id/approve` route kept for explicit admin overrides; PENDING_APPROVAL state stays 403'd (reserved, no code currently sets it).

**Theme 3 — TEAM_MEMBER role gets read-only tenant access (v1.17.17).** Pre-fix, TEAM_MEMBER had zero permissions — every admin route used `requireClientAdmin()` which allowed only PLATFORM_ADMIN + CLIENT_ADMIN. Logged-in TEAM_MEMBER hit "Insufficient permissions" on HCPs, campaigns, dashboards, insights, surveys — everything. Now: read-only across all tenant-scoped data; writes (POST/PUT/PATCH/DELETE) still admin-only.

**Theme 4 — ZodError → 400 in global error handler (v1.17.18).** Caught against the v1.17.17 deploy: the new emailDomains-required E2E test expected 400 on empty array, got 500. Root cause: the global error handler had branches for ApiError / Fastify / Prisma but no `ZodError` branch — so every `schema.parse(request.body)` in every route fell through to 500 on validation failure. Broad pre-fix scope; routes that had their own try/catch (nominations, kol-analysis, opt-outs) worked correctly, everything else was broken. Fix: ZodError → 400 + first issue's message surfaced in the response.

## What changes for customers (the visible bit)

| Where | Before | After |
|---|---|---|
| New-client form (admin) | "Allowed Email Domains" optional, "Leave empty to allow any domain" | "Allowed Email Domains *" required, must specify at least one |
| Invited user first login | Sign-in → bounced back to login until admin approves | Sign-in → reaches dashboard immediately |
| TEAM_MEMBER login on admin pages | "Insufficient permissions" on every tenant page | Read access to HCPs/campaigns/dashboards/insights/surveys for their client; writes still blocked |
| Form validation errors (any route via Zod) | 500 with "Something went wrong. Please try again later." | 400 with the actual validation message (e.g. "emailDomains: At least one email domain is required") |

## Per-PR detail

### v1.17.17 (PR #147 — three themes bundled)

**emailDomains required.** `createClientSchema.emailDomains` changed from `z.array(emailDomainSchema).default([])` to `z.array(emailDomainSchema).min(1, 'At least one email domain is required')`. The `updateClientSchema = createClientSchema.partial()` preserves the rule conditionally — omit the field and nothing changes; provide it and `.min(1)` applies. Frontend form helper text updated; FormLabel marked with `*`. Legacy clients (9 on test env, presumably similar on prod) keep working at the userService allowlist runtime check via the existing `length === 0 → return` escape hatch. Any future edit through the form forces filling it in. Once all clients have been edited or backfilled, the escape hatch can be removed (TODO).

**Auto-approve.** `/users/me` route: when DB status is `PENDING_VERIFICATION`, update to `ACTIVE` (set `approvedAt`, `approvedBy = user.id`), audit log entry `user.auto_approved`, then return the normal /me response. PENDING_APPROVAL still 403'd. DISABLED still 403'd. `/users/:id/approve` route kept for admin overrides (now mostly unused).

**TEAM_MEMBER read perms.** New `requireTenantUser()` helper (allows PLATFORM_ADMIN + CLIENT_ADMIN + TEAM_MEMBER) + `gateWritesToAdmins()` (403s any non-admin POST/PUT/PATCH/DELETE). Applied as paired global hooks across 8 route files: hcps, campaigns, distribution, questions, sections, survey-templates, dashboards, specialties. Kept strictly admin-only: `/clients` (cross-tenant view), `/lite-clients`, `/kol-analysis`, `/opt-outs`, campaigns/[id]/payments page. Frontend: bulk-added `TEAM_MEMBER` to `allowedRoles` on 19 `RequireAuth` usages across 9 page files (sidebar inherits clientAdminNavigation for non-platform-admin, so nav stays correct).

### v1.17.18 (PR #148 — ZodError follow-up)

`apps/api/src/plugins/error-handler.ts`: `getStatusCode()` now returns 400 for `ZodError`. `getUserFriendlyMessage()` surfaces the first issue's `path: message` (e.g. `emailDomains: At least one email domain is required`) instead of the generic INTERNAL_ERROR message. Three routes that already had their own ZodError try/catch (`nominations`, `kol-analysis`, `opt-outs`) are unaffected — their handlers run first and never reach the global handler. Everything else (clients, campaigns, hcps, sections, survey-templates, etc.) now returns 400-with-message on body validation failure instead of 500.

## Migrations

**None.** All code-only.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green (all 3 versions cleanly compiled v1.17.17 and v1.17.18) |
| Shared unit tests (165 tests) | green — 6 client.test.ts tests updated for the `.min(1)` rule + 3 new contract tests added |
| API unit tests (210 tests) | green |
| E2E test env (v1.17.17 deploy) | **194/196** — 1 long-standing flake + 1 new "ZodError-as-500" failure (case 5 contract: empty emailDomains expected 400, got 500). Surfaced the v1.17.18 gap. |
| E2E test env (v1.17.18 deploy) | **195/196** — only the long-standing `nominations.items[0]` undefined flake remains (no UNMATCHED nomination on test env, data-dependent). Case 5 green. |
| Deploy status | API at v1.17.18; web at v1.17.18 (in flight at handoff time). |

## Risk

**Low-medium.**

- **emailDomains required**: only affects the create-client write path. Existing prod clients keep working via the escape hatch. The first time an admin edits an existing prod client through the form, they'll be forced to add a domain — possible friction if they're editing for an unrelated reason (e.g. renaming) and don't know what domain belongs to that client. Mitigation: the form's existing helper text + the placeholder example (`sunpharma.com, na.sunpharma.com`) gives them a reasonable hint, and they can copy from any invite email's `@domain`.
- **Auto-approve**: trust-shifted from "admin manually approves" to "Cognito password change is the verification". The risk model didn't really change — admin still controls *who* gets invited, Cognito still verifies their email + password. The removed step was a redundant tap.
- **TEAM_MEMBER read perms**: opens up tenant data to a role that previously couldn't access anything. Audit: any existing TEAM_MEMBER user on prod (if any) gains read access to their tenant's HCPs/campaigns/insights. Spot-check the User table for TEAM_MEMBER rows before deploy; if any are unexpected, downgrade or disable them first.
- **ZodError → 400**: pure win for UX (real error messages instead of "Something went wrong"). The only behavior change is: routes that previously 500'd on bad input now 400. Frontend that depended on "validation error = 500" would break, but no such code exists in this codebase (frontend forms validate via Zod resolver before submit; backend 400/500 are surfaced as toasts, not branched on status).

## Rollback

Redeploy `prod-rel-4.1.10` (v1.17.16). Effects:

- emailDomains becomes optional again — new clients can be created with empty allowlist; existing customers unaffected.
- Invited users return to PENDING_VERIFICATION limbo until an admin clicks Approve. They get bounced back to login mid-flow.
- TEAM_MEMBER role returns to "no permissions anywhere" state.
- Body-validation failures return 500 with "Something went wrong" again.

All four are visible-but-non-data-destructive. No database state to unwind.

## See also

- Soak checks: [`prod-rel-4.1.11-soak-checks.md`](prod-rel-4.1.11-soak-checks.md)
- Predecessor: [`prod-rel-4.1.10-handoff.md`](prod-rel-4.1.10-handoff.md)
