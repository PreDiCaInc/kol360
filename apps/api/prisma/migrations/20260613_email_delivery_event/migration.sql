-- v1.17.37 — per-message SES delivery tracking. Inserted on send (status='SENT',
-- acceptedAt=now() when SES returns 250 OK) and updated by the SNS handler when
-- bounce/complaint/delivery events arrive.
--
-- Background: docs/findings/no-ses-delivery-logging-2026-06-13.md.
--
-- Idempotent (re-runnable) per kol360 prod-psql convention. All
-- CREATE / ADD COLUMN / ADD CONSTRAINT use IF NOT EXISTS or DO-block.

CREATE TABLE IF NOT EXISTS "EmailDeliveryEvent" (
  "id"             TEXT PRIMARY KEY,
  "campaignId"     TEXT NOT NULL,
  "hcpId"          TEXT NOT NULL,
  "campaignHcpId"  TEXT,
  "messageType"    TEXT NOT NULL,
  "sesMessageId"   TEXT NOT NULL,
  "toEmail"        TEXT NOT NULL,
  "fromEmail"      TEXT NOT NULL,
  "subject"        TEXT NOT NULL,
  "status"         TEXT NOT NULL,
  "statusReason"   TEXT,
  "acceptedAt"     TIMESTAMP(3) NOT NULL,
  "deliveredAt"    TIMESTAMP(3),
  "bouncedAt"      TIMESTAMP(3),
  "complainedAt"   TIMESTAMP(3),
  "rawEvent"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- sesMessageId unique — SNS events arrive keyed by MessageId, the
-- handler updates the row matching that id.
CREATE UNIQUE INDEX IF NOT EXISTS "EmailDeliveryEvent_sesMessageId_key"
  ON "EmailDeliveryEvent" ("sesMessageId");

CREATE INDEX IF NOT EXISTS "EmailDeliveryEvent_campaignId_status_idx"
  ON "EmailDeliveryEvent" ("campaignId", "status");
CREATE INDEX IF NOT EXISTS "EmailDeliveryEvent_hcpId_idx"
  ON "EmailDeliveryEvent" ("hcpId");
CREATE INDEX IF NOT EXISTS "EmailDeliveryEvent_toEmail_idx"
  ON "EmailDeliveryEvent" ("toEmail");
CREATE INDEX IF NOT EXISTS "EmailDeliveryEvent_acceptedAt_idx"
  ON "EmailDeliveryEvent" ("acceptedAt");
