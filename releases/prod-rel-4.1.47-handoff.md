# prod-rel-4.1.47 — Handoff to Prod Team

**Status:** Ready for prod deploy. **Migration included.** Reversible.
**Tag:** `prod-rel-4.1.47` → commit on `main` (cut immediately after this PR merges).
**Supersedes:** `prod-rel-4.1.46` (v1.17.66).
**Bundles:** v1.17.67 — closes the EmailDeliveryEvent scope gap surfaced by pteam's Michael Garanzini investigation.

## TL;DR

User-invite (initial + resend) SES sends now write `EmailDeliveryEvent` rows at send-time, same pattern the campaign paths have used since v1.17.37. The SES → SNS → webhook then correlates delivery / bounce / complaint events by `sesMessageId` and updates the row's status — no more `"SES event for unknown messageId"` warnings for user-invite messages, no more CloudWatch hand-grepping when someone reports "didn't get the invite."

Ticket: [`docs/findings/email-delivery-event-scope-gap-2026-07-02.md`](../docs/findings/email-delivery-event-scope-gap-2026-07-02.md).

Also ships: **"Last Invite" column on the users admin page** — small `✓ Delivered Jun 26 / ⚠ Bounced / · Sent` chip per PENDING user. Admins can answer "did they get it?" without pinging pteam.

## Schema change (⚠ migration required)

`EmailDeliveryEvent` — three changes, all additive/backward-compatible:

- `campaignId` → nullable (was NOT NULL). Existing campaign rows keep their value; the constraint no longer requires it on new rows.
- `hcpId` → nullable (was NOT NULL). Same as above.
- **New:** `userId` column (nullable). Set on user-invite / user-invite-resent rows so the webhook can correlate delivery outcomes back to the User row.
- **New:** `EmailDeliveryEvent_userId_idx` for fast "did user X's invite deliver?" lookups.

**Prod ops step**: run the migration via psql before promoting the deploy (or immediately after — the API code can handle both nullable and non-nullable schemas gracefully since existing writers populate the campaign fields either way).

```bash
# Migration file: apps/api/prisma/migrations/20260702_relax_emaildeliveryevent_scope/migration.sql
# Idempotent — safe to re-run (uses IF EXISTS / IF NOT EXISTS / DROP NOT NULL).
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260702_relax_emaildeliveryevent_scope/migration.sql
```

## API changes

**New endpoint:**
- `GET /api/v1/users/:id/latest-invite-event` — 200 `{ latestEvent: EmailDeliveryEvent | null }` | 404 (unknown user). Platform-admin gated. Powers the new users-page column.

**Extended:**
- `emailService.sendUserInvitation` now requires `userId: string` and accepts optional `messageType: 'user_invite' | 'user_invite_resent'` (defaults to `user_invite`). Both existing callers (`userService.invite` + `userService.resendInvite`) updated.

**Behavior unchanged:**
- The `POST /users/:id/resend-invite` and `POST /users/invite` route contracts.
- Campaign email flow (`sendSurveyInvitation`, `sendReminderEmail`) — byte-identical.

## Constraint enforcement — app-side, not DB CHECK

The schema doesn't add a `CHECK` requiring exactly one of `(campaignId, hcpId)` or `userId`. The type system in `recordDeliveryEvent` (discriminated union) enforces the invariant; code review catches new writers. See handoff comment on the model + ticket for rationale.

## Known gap — pre-existing pattern, not fixed by this PR

The webhook does `findUnique({sesMessageId}) + drop-if-null`. There's a race window: SES → SNS → webhook can theoretically fire before the send-time `recordDeliveryEvent` write commits. **This is the pre-existing v1.17.37 pattern**; the fix keeps it identical to avoid scope creep. In practice the race window is small (webhook lag is typically seconds after the ~ms DB write) and the failure mode is a single dropped WARN. Worth revisiting as a `upsert` in a follow-up.

## What changes for customers

| Surface | Before (4.1.46) | After (4.1.47) |
|---|---|---|
| Admin resend-invite → "did it deliver?" | Only path: hand-grep CloudWatch for the SES messageId. No DB row for user-invite sends. | Users page shows per-row **Last Invite: ✓ Delivered / ⚠ Bounced / · Sent**. SQL query `SELECT status FROM "EmailDeliveryEvent" WHERE "userId" = X` answers the question. |
| SES event webhook logs | Frequent `"SES event for unknown messageId"` WARN entries — one per user-invite delivery / send event. | Those specific WARN entries drop to zero. Legacy invite sends from before this deploy still produce the WARN once (no historical backfill). |

## Migrations

**20260702_relax_emaildeliveryevent_scope** — idempotent.

## Risk

**Low.**
- Additive column, dropped-NOT-NULL is backward-compatible.
- Existing campaign email flow: unchanged (writers still populate `campaignId + hcpId`; queries unchanged; webhook correlation unchanged).
- Existing rows: unaffected (`userId` defaults to null via the new column).
- Rollback: redeploy prior code. The old writers only populate campaignId+hcpId, so the old code path keeps working on the widened schema without any DDL rollback. Do **NOT** re-tighten the NOT NULL constraints if user-invite rows have already been written (`SET NOT NULL` would fail).

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green at 1.17.67 |
| Migration applied to test DB | ✓ userId column present + userId_idx created; idempotency test re-ran successfully |
| 2 new e2e structural tests | added — 404 on unknown user, 200 `{ latestEvent: null }` for seeded e2e user (no invite EDE rows) |

## Manual soak

1. **Invite a fresh user.** Confirm a row lands in `EmailDeliveryEvent` with `userId` set + `messageType='user_invite'` + `status='SENT'` + `campaignId+hcpId` both NULL.
2. **Wait 5-30 seconds.** Confirm the same row updates to `status='DELIVERED'` + `deliveredAt` timestamp populated. `rawEvent` JSON should now be populated with the SES delivery payload.
3. **Resend invite.** Confirm a second row with `messageType='user_invite_resent'` + same flow.
4. **CloudWatch check.** Filter for `"SES event for unknown messageId"` — the count should drop to ~zero going forward (only legacy invite messageIds sent before this deploy would still hit the dropped path).
5. **Users admin page.** For a PENDING user with a recent invite: cell reads `✓ Delivered Jun 26` (or similar). For a PENDING user without one: `—`. For ACTIVE/DISABLED users: `—`.
6. **Force a bounce.** Invite `bounce@simulator.amazonses.com`. Row should show `status='BOUNCED_HARD'` + statusReason populated + "⚠ bounced hard" chip on the users page.

## Companion out-of-scope observation (from the ticket)

Password-reset emails still go through Cognito's own send path (not our SES). Those are entirely invisible to us — no messageId, no DB row, no delivery outcome. Cheapest fix is to switch Cognito to use our SES identity via `EmailSendingAccount='DEVELOPER'` + `SourceArn` — 30-minute AWS console + IAM change. Worth doing next maintenance window; not blocked by this PR.

## See also

- Soak checks: [`prod-rel-4.1.47-soak-checks.md`](prod-rel-4.1.47-soak-checks.md)
- Predecessor: [`prod-rel-4.1.46-handoff.md`](prod-rel-4.1.46-handoff.md)
- Source ticket: [`docs/findings/email-delivery-event-scope-gap-2026-07-02.md`](../docs/findings/email-delivery-event-scope-gap-2026-07-02.md)
