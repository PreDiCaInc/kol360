# prod-rel-4.1.18 — Soak Checks (v1.17.35 + v1.17.36 + v1.17.37 + v1.17.38)

Tag at the merge commit on `main`. Four 2026-06-13 incident tickets in one release. **2 idempotent migrations** (both applied to test DB on 2026-06-13).

## What 4.1.18 changed (the universe of risk)

1. **HCP audit foundation** (v1.17.35): new `HcpImportBatch` table + `Hcp.importBatchId` column. Per-row audit on every Hcp write path. Dedicated `hcp.email_changed` / `hcp.specialty_changed` audit actions.
2. **Placeholder gate** (v1.17.36): `isPlaceholderEmail()` helper + gates in `sendBulkInvitations` / `sendBulkReminders` / `sendSurveyInvitation` / `sendReminderEmail`. New `skippedPlaceholder` bucket. Pre-flight admin warning on confirm dialog.
3. **SES delivery events** (v1.17.37): new `EmailDeliveryEvent` table. `ConfigurationSetName` attached to every SES send. New `POST /api/v1/internal/ses-event` SNS handler. Bounce-aware reminder gate (`skippedBounced` bucket).
4. **Survey-email mismatch surface** (v1.17.38): `detectSurveyEmailMismatch` in `submitSurvey` emits `hcp.survey_email_mismatch` audit rows. Payment-export gets a "Survey-Provided Email (review)" column. Pre-flight banner on the Payments page.

Plus the carry-over **Payments-page HCP search** (commit `b1c02f8`).

---

## Phase A — Sanity (within minutes of deploy)

### A1. Versions deployed

```bash
curl -s https://ik6dmnn2ra.us-east-2.awsapprunner.com/health
# Expected: { "status": "ok", "version": "1.17.38", ... }
```

Web — open `https://kol360.bio-exec.com`, footer / admin header should report `1.17.38`.

### A2. Migrations applied + tables present

```bash
PGPASSWORD=... psql -h <prod-tunnel> -p 5433 -U kol360admin -d kol360 -c "
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('HcpImportBatch','EmailDeliveryEvent')
ORDER BY table_name;
"
# Expected: both rows returned.
```

If absent, run the two migration .sql files via psql:
```bash
psql ... -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260613_hcp_import_batch/migration.sql
psql ... -v ON_ERROR_STOP=1 -f apps/api/prisma/migrations/20260613_email_delivery_event/migration.sql
```
Both idempotent — safe to re-run.

### A3. Subscribe the prod API endpoint to the SNS topic (one-time)

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:163859990568:kol360-ses-events \
  --protocol https \
  --notification-endpoint https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/internal/ses-event \
  --region us-east-2 --profile koluser

# Confirm:
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-2:163859990568:kol360-ses-events \
  --region us-east-2 --profile koluser
# Expect SubscriptionArn for the prod endpoint to NOT be "PendingConfirmation".
# The handler at /api/v1/internal/ses-event auto-confirms by fetching SubscribeURL.
```

(The api-test endpoint subscription was added during test-env soak — same command, different `--notification-endpoint`.)

### A4. Existing bulk-send flow doesn't regress

Smoke-test a non-prod campaign with a known mix of placeholder + real-email HCPs:

```bash
TOK=... ; CAMP=<non-prod-test-campaign-id>
# Trigger bulk-send (UI → Send Invitations) → observe result
# Expected: result.skippedPlaceholder reflects the placeholder count;
# result.skippedNoEmail reflects NULL-email count (separate buckets).
```

---

## Phase B — Functional smoke (~15 minutes)

### B1. HCP audit: bulk import emits per-row audit

Upload a small CSV (say 5 rows, 3 new + 2 existing) via the HCP admin page. After upload, query prod:
```sql
SELECT b.id, b."fileName", b."recordsCreated", b."recordsUpdated"
FROM "HcpImportBatch" b
ORDER BY b."importedAt" DESC LIMIT 1;
-- Expect: matching fileName, recordsCreated=3, recordsUpdated=2 (or whatever you uploaded)

SELECT h.id, h.npi, h."importBatchId" FROM "Hcp" h
WHERE h."importBatchId" = '<batch-id-from-above>';
-- Expect: 3 rows (the newly created HCPs)

SELECT a.action, a."entityId", a."createdAt"
FROM "AuditLog" a
WHERE a."entityType" = 'Hcp'
  AND a."createdAt" > NOW() - INTERVAL '5 minutes'
ORDER BY a."createdAt" DESC;
-- Expect: per-row hcp.created / hcp.updated rows + a hcp.bulk_import summary row.
```

### B2. HCP audit: single-update emits dedicated actions

Pick any HCP via the admin UI → Edit → change email to a new value → Save.
```sql
SELECT action, "createdAt", "oldValues", "newValues"
FROM "AuditLog"
WHERE "entityType" = 'Hcp' AND "entityId" = '<hcp-id>'
ORDER BY "createdAt" DESC LIMIT 3;
-- Expect: hcp.email_changed row with oldValues.email + newValues.email captured.
```

Repeat with a specialty change → expect `hcp.specialty_changed` row.

### B3. Placeholder gate skips bulk-send into placeholder

Find or seed a campaign with an HCP whose email is `nomail@kol360research.com`. Trigger bulk-send (UI → Send Invitations on the campaign-HCPs tab).

- Pre-flight confirm dialog: amber warning shows the placeholder count.
- After send: result toast / UI shows "X have a placeholder email — update before next send".
- DB sanity:
```sql
SELECT ch."hcpId", h.email, ch."emailSentAt"
FROM "CampaignHcp" ch JOIN "Hcp" h ON h.id = ch."hcpId"
WHERE ch."campaignId" = '<campaign-id>' AND h.email LIKE 'nomail@%';
-- Expect: emailSentAt remains NULL for those rows (pre-fix, it would be set).
```

### B4. SES delivery events land in the new table

After B3's send (or any real send post-deploy), let SNS deliver:
```sql
SELECT "sesMessageId", "toEmail", status, "acceptedAt", "deliveredAt", "bouncedAt"
FROM "EmailDeliveryEvent"
ORDER BY "acceptedAt" DESC LIMIT 5;
-- Expect: rows inserted at send time with status='SENT'. Within ~60s of SES processing,
-- status updates to DELIVERED (or BOUNCED_HARD for unreachable addresses).
```

Send to an SES mailbox-simulator address to force a hard bounce:
- Use `bounce@simulator.amazonses.com` as the to address (SES special-purpose mailbox).
- Within seconds, the corresponding `EmailDeliveryEvent` row should flip to `status='BOUNCED_HARD'`.

### B5. Reminder gate respects bounce status

After B4's hard-bounce:
- Trigger reminder send for the same campaign.
- Result UI should show a non-zero `skippedBounced` count (= the bounced HCP from B4).
- DB:
```sql
-- Confirm the bounced HCP's reminderCount didn't increment
SELECT ch."hcpId", ch."reminderCount", ch."lastReminderAt"
FROM "CampaignHcp" ch
WHERE ch."campaignId" = '<campaign-id>' AND ch."hcpId" = '<bounced-hcp-id>';
-- Expect: reminderCount unchanged; lastReminderAt unchanged.
```

### B6. Survey-email mismatch surface

Simulate a survey submission where the respondent enters an email different from their Hcp.email:
- Find a campaign with a respondent token + a survey that has an "Email address:" question.
- Submit the survey via the public token URL with the email field filled in differently from Hcp.email.
- DB:
```sql
SELECT a.action, a."entityId", a."oldValues"->>'email' AS hcp_email,
       a."newValues"->>'email' AS survey_email, a."createdAt"
FROM "AuditLog" a
WHERE a.action = 'hcp.survey_email_mismatch'
ORDER BY a."createdAt" DESC LIMIT 5;
-- Expect: row with both addresses captured.
```

### B7. Payment-export annotates the mismatch

For a campaign with HCPs in the mismatch state:
- Trigger payment export (admin UI → Payments tab → Export Pending).
- Open the downloaded Excel:
  - New column **"Survey-Provided Email (review)"** between Email and Survey Completion Date.
  - Populated for HCPs with unresolved mismatches; blank for HCPs without.
- On the Payments page UI: amber pre-flight banner appears when any visible row has a `nomail@…` email.

### B8. Payments-page HCP search

Same Payments tab → use the new search input.
- "Paul Karpecki" → narrows to that HCP's payment rows.
- NPI substring → narrows.
- Clear button (X) → resets.

### B9. Re-soak prior bundles

- **prod-rel-4.1.17** (v1.17.34): HCP full-name search still works; NPI editable for PLATFORM_ADMIN; nomination rematch still works.
- **prod-rel-4.1.16** (v1.17.33): KOL State filter on Sociometric Summary still narrows correctly.
- **prod-rel-4.1.15** (v1.17.32): Sociometric matrix column order intact; full-list exports still emit with NPI.

---

## Phase C — 24h watch

### C1. CloudWatch — API error rate

Standard 24h post-deploy watch on `kol360-api`:
```bash
aws logs filter-log-events \
  --log-group-name "/aws/apprunner/kol360-api/7eb09ba9317d46d681d004d999663ffd/service" \
  --filter-pattern '?error ?ERROR ?"5xx"' \
  --start-time $(( $(date +%s) - 86400 ))000 \
  --region us-east-2 --profile koluser \
  --query 'events[*].message' --output text | tail -50
```

### C2. AuditLog growth rate

After the first week, sanity-check audit row growth — should be linear with import + edit volume:
```sql
SELECT DATE_TRUNC('day', "createdAt") AS day,
       action,
       COUNT(*) AS count
FROM "AuditLog"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
  AND "entityType" = 'Hcp'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;
-- Sanity: per-row hcp.created counts should match recent batch
-- recordsCreated sums. No surprise spikes.
```

### C3. EmailDeliveryEvent ↔ SES SNS health

```sql
SELECT status, COUNT(*) AS count, MAX("acceptedAt") AS most_recent
FROM "EmailDeliveryEvent"
WHERE "acceptedAt" > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY count DESC;
-- Expect: SENT rows update to DELIVERED in <60s for the bulk of traffic.
-- Persistent SENT-only without DELIVERED → SNS handler not receiving events.
```

If status flow looks stuck at SENT:
- Confirm SNS subscription is `Confirmed` (not `PendingConfirmation`).
- Check api-test / prod logs for `/api/v1/internal/ses-event` POSTs — should see SES event payloads.
- Verify `ConfigurationSetName` reached SES on the send (check CloudTrail for SES.SendEmail calls).

### C4. Customer signal — Sun Pharma honoraria

Loop back with pteam / customer on the Sun Pharma honoraria queue:
- Export should show Survey-Provided Email column populated for the historical mismatches (no backfill, but the column exists; new submissions populate it).
- Customer can review + decide per-row whether to update Hcp.email before issuing checks.

---

## Rollback gate

If A1-A4 don't all pass within 30 min of deploy, redeploy `prod-rel-4.1.17`. Effects per the [handoff](prod-rel-4.1.18-handoff.md#rollback). The two new tables stay in the DB (harmless); the AWS-side SES configuration set + SNS topic remain provisioned for the next attempt.
