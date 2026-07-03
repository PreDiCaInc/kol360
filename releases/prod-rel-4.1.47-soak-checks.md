# prod-rel-4.1.47 — Soak Checks (v1.17.67)

Tag at the merge commit on `main`. Includes DB migration.

## Phase 0 — Migration (BEFORE deploy verify)

Apply `20260702_relax_emaildeliveryevent_scope` via psql against prod DB:

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 \
  -f apps/api/prisma/migrations/20260702_relax_emaildeliveryevent_scope/migration.sql
```

Idempotent — safe to re-run. Confirm post-apply:

```sql
\d+ "EmailDeliveryEvent"
-- Expected: userId column present; campaignId + hcpId nullable;
--           EmailDeliveryEvent_userId_idx exists.
```

## Phase A — Sanity

### A1. Version deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.67", ... }
```

### A2. New endpoint contract

```bash
# Requires an authed session. Substitute a real userId from prod.
curl -sH "Authorization: Bearer $TOKEN" \
  https://kol360.bio-exec.com/api/v1/users/<userId>/latest-invite-event
# Expected: 200 { "latestEvent": null } for pre-4.1.47 users,
#           200 { "latestEvent": { messageType, status, ... } } for post-4.1.47.
# Non-existent user → 404.
```

### A3. Invite → EDE write

1. From admin UI, invite a fresh test user (e.g. `soak-{date}@bio-exec.com`).
2. Query DB:

```sql
SELECT "messageType", status, "acceptedAt", "campaignId", "hcpId", "userId"
FROM "EmailDeliveryEvent"
WHERE "userId" = '<newly-created-user-id>'
ORDER BY "acceptedAt" DESC LIMIT 1;
```

**Expected**: exactly one row, `messageType='user_invite'`, `status='SENT'`, `campaignId=NULL`, `hcpId=NULL`, `userId=<user id>`.

### A4. Delivery event correlates

Wait 5-30 seconds after A3. Re-query the same row:

**Expected**: `status='DELIVERED'`, `deliveredAt` timestamp populated, `rawEvent` JSON now non-null.

### A5. Resend invite → second EDE row

1. From admin UI on the same user: Resend Invite.
2. Query:

```sql
SELECT "messageType", status, "acceptedAt"
FROM "EmailDeliveryEvent"
WHERE "userId" = '<user-id>'
ORDER BY "acceptedAt" DESC LIMIT 2;
```

**Expected**: two rows now; newest has `messageType='user_invite_resent'`, oldest is the original invite.

### A6. CloudWatch — "unknown messageId" WARN volume drops

Baseline before deploy: `grep "SES event for unknown messageId" ...` produces N warnings per hour.

Post-deploy: expect near-zero for messageIds generated after the deploy time (legacy pre-deploy messageIds still hit the dropped path).

```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '"SES event for unknown messageId"' \
  --start-time $(( $(date +%s) - 3600 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | wc -l
```

### A7. Users page "Last Invite" column

1. Open `/admin/users`.
2. Find a PENDING user with a recent invite. **Expected**: cell reads `✓ Delivered Jun 26` (or similar). Hover shows tooltip with the same text.
3. Find a PENDING user without an invite in EDE. **Expected**: cell reads `—`.
4. Find an ACTIVE user. **Expected**: cell reads `—` (invite state not relevant post-activation).

### A8. Bounce simulation

1. Invite `bounce@simulator.amazonses.com` (AWS SES bounce simulator).
2. Wait ~10 seconds. Query EDE for that userId.

**Expected**: `status='BOUNCED_HARD'`, `statusReason` populated. Users page chip reads `⚠ bounced hard`.

## Phase B — Functional smoke (≤30 min)

### B1. Existing campaign email flow unchanged

- Send a survey invitation from any active campaign. Confirm EDE row still writes with `campaignId + hcpId` populated (userId NULL). Delivery event correlates as before.
- Same for reminders.

### B2. Existing users page actions unchanged

- Approve / Disable / Enable / Delete on a test user still work (v1.17.60 behavior).
- Existing dropdown menu items still render.

## Phase C — 24h watch

### C1. App Runner health

```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-2:163859990568:service/kol360-api/7eb09ba9317d46d681d004d999663ffd" \
  --region us-east-2 --profile koluser \
  --query 'Service.Status' --output text
# Expected: RUNNING
```

### C2. No new error patterns

Watch for:
- `Failed to record EmailDeliveryEvent` — expected to be rare (DB blip). If frequent, indicates the migration didn't apply.
- Any 500 on `/users/:id/latest-invite-event` — indicates a Prisma-schema mismatch (client not regenerated after migration).

## Rollback gate

If A1–A5 don't pass, redeploy `prod-rel-4.1.46` (v1.17.66). **Leave schema as-is** — the old code doesn't touch the new `userId` column and can still write to the campaign fields. Do NOT try to re-tighten NOT NULL constraints if any user-invite rows have been written (`ALTER SET NOT NULL` will fail).

No data destruction on rollback.
