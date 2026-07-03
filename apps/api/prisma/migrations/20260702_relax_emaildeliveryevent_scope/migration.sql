-- v1.17.67 — Relax EmailDeliveryEvent scope so non-campaign sends
-- (user invites, invite resends, future transactional email) can
-- share the SES → SNS → webhook delivery-tracking pipeline.
--
-- Change surface:
--   * campaignId + hcpId become nullable (were NOT NULL — required
--     row-level context for campaign sends). Existing campaign rows
--     keep their values; the constraint just no longer requires new
--     rows to have them.
--   * userId column added (nullable). Populated on user-invite /
--     user-invite-resent sends so the webhook can correlate delivery
--     outcomes back to the User row.
--   * userId index added for fast "did user X's invite deliver?"
--     lookups from the admin UI.
--
-- Constraint semantics: EXACTLY ONE context slot is populated per
-- row — either (campaignId, hcpId) for campaign sends or userId for
-- user sends. Enforced app-side (email.service.recordDeliveryEvent);
-- no DB CHECK because the writer is audited.
--
-- Rollback (if ever): redeploy the prior code. The old writers only
-- populate campaignId+hcpId, so the old code path keeps working on
-- the widened schema without any DDL rollback. Only if you want to
-- re-tighten the schema do you need to first DELETE FROM
-- "EmailDeliveryEvent" WHERE "userId" IS NOT NULL, then re-ALTER
-- SET NOT NULL. Not recommended — no reason to rewind the schema.
--
-- Idempotent: all statements use IF EXISTS / IF NOT EXISTS or
-- DROP NOT NULL (which is a no-op when the column is already nullable).

ALTER TABLE "EmailDeliveryEvent" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "EmailDeliveryEvent" ALTER COLUMN "hcpId"      DROP NOT NULL;
ALTER TABLE "EmailDeliveryEvent" ADD COLUMN IF NOT EXISTS "userId" TEXT;
CREATE INDEX IF NOT EXISTS "EmailDeliveryEvent_userId_idx" ON "EmailDeliveryEvent"("userId");
