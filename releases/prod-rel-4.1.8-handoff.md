# prod-rel-4.1.8 — Handoff to Prod Team

**Status:** Ready for prod deploy. **Migration required** (one additive column). Reversible.
**Tag:** `prod-rel-4.1.8` → commit on `main` (cut after this docs PR merges).
**Supersedes:** `prod-rel-4.1.7` (v1.17.7).
**Bundles:** v1.17.8 + v1.17.9 (v1.17.8 was never separately deployed to prod — both ship together here).

## TL;DR

Two changes:

1. **Per-client email-domain allowlist** (v1.17.9) — new `Client.emailDomains` column + service-layer guard + admin UI. When set, `userService.invite()` rejects users whose email domain isn't in the list. `bio-exec.com` is always allowed. **Empty list = no restriction**, so every existing client lands at deploy moment with `[]` and keeps working unchanged.
2. **Campaign-create `excludeInternalEmails` fix** (v1.17.8) — POST /campaigns was silently dropping the flag (UPDATE worked, CREATE didn't). One-line fix. UPDATE consumers were unaffected; only API-direct create consumers saw the gap (e2e tests, scripts; admin UI usually edits right after create which masked it).

Plus the deferred E2E deep assertions from PR D backfilled (4 new tests).

## What's in it

### v1.17.9 — Per-client email-domain allowlist

**The risk being mitigated:** a platform admin invites `john@sunpharma.com` into DE Pharma's tenant by mistake. Pre-1.17.9, nothing stopped it. Post-1.17.9, an admin can opt-in per client by setting allowed domains; subsequent invites are rejected if the email domain isn't covered.

**Backend** ([apps/api/src/services/user.service.ts](../apps/api/src/services/user.service.ts)):
- New helper `validateEmailForClient(email, client)` — exported.
- Skips when `clientId` is null (platform admins are tenant-less).
- Skips when `client.emailDomains` is empty (opt-in mode).
- Otherwise: email's domain must be in `client.emailDomains` OR in `ALWAYS_ALLOWED_DOMAINS = ['bio-exec.com']`.
- Wired into `userService.invite()` BEFORE the Cognito call — a rejected invite can't leak a half-provisioned Cognito user.
- Wired into `userService.update()` — fires on clientId reassignment (moving a user A→B re-validates A's existing email against B's allowlist).
- Route translates the `EMAIL_DOMAIN_NOT_ALLOWED` error code into a 400 with a stable machine-readable `code` field, not 500.

**Admin UI**:
- Client form ([client-form-dialog.tsx](../apps/web/src/components/clients/client-form-dialog.tsx)) — new "Allowed Email Domains" field. Comma/whitespace-separated input, normalized to lowercase, trimmed, deduped. Help text explains opt-in + bio-exec always-allowed.
- User invite form ([user-invite-dialog.tsx](../apps/web/src/components/users/user-invite-dialog.tsx)) — when a gated client is selected, helper text shows the live allowlist (client domains + bio-exec.com); inline amber warning fires if the typed email's domain doesn't match. Submit is NOT blocked — backend is the truth.

### v1.17.8 — Campaign-create `excludeInternalEmails` fix

**The bug** ([campaign.service.ts:create](../apps/api/src/services/campaign.service.ts)): explicitly enumerated fields into Prisma's `data` object and didn't include `excludeInternalEmails`. UPDATE used `...data` spread, so it worked. So an admin wanting the flag from day one had to: create → edit. Web UI hid it because the edit form follows create immediately. API-direct callers (scripts, e2e, integrations) hit the silent-drop.

**The fix:** one line — added `excludeInternalEmails: data.excludeInternalEmails ?? false` to the create service. Plus 1 regression test in [e2e/api/ucpm-backfill-deep.test.ts](../e2e/api/ucpm-backfill-deep.test.ts) that round-trips the flag through POST /campaigns and verifies it persists.

### Deferred E2E deep assertions (v1.17.8)

Three assertions from PR D (v1.17.4–v1.17.6 backfill) that needed fixture work. All landed in [e2e/api/ucpm-backfill-deep.test.ts](../e2e/api/ucpm-backfill-deep.test.ts):

1. `getStats` sum equals list pagination total under `excludeInternalEmails=true`.
2. List excludes nominations from internal-email respondents (cross-checked against direct Prisma counts).
3. `updateRawName` writes the `nomination.raw_name_updated` AuditLog row with correct old/new values + actor.

## Migrations

**One migration, idempotent:** `20260529_add_client_email_domains`

```sql
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "emailDomains" TEXT[] NOT NULL DEFAULT '{}';
```

(v1.17.8 had no migration — it was code-only.)

**Apply order:** migration first, then code deploy. The v1.17.9 service queries `Client.emailDomains` on every invite + on tenant reassignment; if the column doesn't exist, Prisma will throw P2021 and those endpoints will 503. With migration in place, every existing client has `[]` (= permissive), so behavior is unchanged at deploy moment.

Safe to re-run — `ADD COLUMN IF NOT EXISTS` is idempotent.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | 210/210 (incl. updated user.service mocks) |
| Migration applied to test DB | ✅ all clients default to `emailDomains: '{}'` |
| E2E suite (test env, v1.17.9) | **191/191 passing** |
| New tests: 4 email-domain cases + 4 v1.17.8 deferred assertions | all green |
| Deploy status | API + web both RUNNING at v1.17.9 |

## Customer-facing changes worth signaling

- **New "Allowed Email Domains" field on the Client edit form.** Empty (current default) = no restriction; behavior unchanged. Set domains when you want admin-typo protection on that client's invites.
- **Bio-Exec staff (`@bio-exec.com`) are always allowed regardless of a client's allowlist.** So Bio-Exec ops can be added to any tenant. Document this on the field's help text so admins don't get confused.
- **Validation runs only on invite + tenant reassignment.** Existing users with mismatched domains keep working — we don't retroactively reject anyone.

## Rollback

Two cases:

**Case A — code rollback only (column stays):** redeploy `prod-rel-4.1.7` (v1.17.7). The `emailDomains` column sits unused; older code paths don't touch it. No data-state divergence.

**Case B — full rollback (drop the column):** rare. Only if you suspect the column itself is the issue.
```sql
ALTER TABLE "Client" DROP COLUMN IF EXISTS "emailDomains";
```
Then redeploy v1.17.7. Caveat: any per-client domains set during the 4.1.8 deploy window are lost.

## Soak checks

[`prod-rel-4.1.8-soak-checks.md`](prod-rel-4.1.8-soak-checks.md) — 3-phase checklist. Recommend **1-day soak**.

## What's next on our side

- **Phase 3 of the email-domain feature** — adoption audit script. Local helper that lists users whose email domain isn't in their client's allowlist (would-be-violations under enforcement). Run before flipping the gate on any specific client. No deploy, no PR; we run it on request.
- **Per-client `Client.region` setting** — replace hardcoded US state whitelist (v1.17.4). Tracked separately; doesn't block anything.
