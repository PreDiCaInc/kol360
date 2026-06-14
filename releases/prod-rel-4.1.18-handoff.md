# prod-rel-4.1.18 — Handoff to Prod Team

**Status:** Ready for prod deploy. **2 idempotent migrations.** Reversible (code + table additions only).
**Tag:** `prod-rel-4.1.18` → commit on `main` (cut immediately after this PR merges per combined-PR workflow).
**Supersedes:** `prod-rel-4.1.17` (v1.17.34).
**Bundles:** v1.17.35 + v1.17.36 + v1.17.37 + v1.17.38 + the payments-search polish — the four 2026-06-13 incident tickets in one release.

## TL;DR

During a closed-campaign investigation on 2026-06-13 (Sun Pharma Optometry 2026, Kaleel Shaheen), pteam found that the platform:

1. Couldn't reconstruct WHO changed an HCP's email + WHEN (audit was batch-summary only). Blocked the investigation.
2. Had silently sent 269 invitations to placeholder addresses across two ACTIVE Sun Pharma 2026 campaigns. SES returned 250 OK on each; the platform marked `emailSentAt`; 3 reminders followed. All went into the void.
3. Had ZERO record of bounce / complaint / delivery outcomes from SES. "Invitations sent" was actually "send-requests SES accepted."
4. Was about to issue honoraria via payment-export to placeholder addresses while the respondents' real emails sat buried in `SurveyResponseAnswer`.

This release closes all four.

| Ticket | PR | Version |
|---|---|---|
| [`hcp-row-level-audit-gap-2026-06-13.md`](../docs/findings/hcp-row-level-audit-gap-2026-06-13.md) | PR #1 (commit `6863e93`) | v1.17.35 |
| [`bulk-send-accepts-placeholder-emails-2026-06-13.md`](../docs/findings/bulk-send-accepts-placeholder-emails-2026-06-13.md) | PR #2 (commit `8f1bb13`) | v1.17.36 |
| [`no-ses-delivery-logging-2026-06-13.md`](../docs/findings/no-ses-delivery-logging-2026-06-13.md) | PR #3 (commit `ea36ed9`) | v1.17.37 |
| [`survey-email-not-propagated-to-hcp-2026-06-13.md`](../docs/findings/survey-email-not-propagated-to-hcp-2026-06-13.md) | PR #4 (commit `844f28a`) | v1.17.38 |
| Payments-page HCP search (small carry-over) | commit `b1c02f8` | (no version bump) |

## What changes for customers (the visible bit)

| Surface | Before (4.1.17) | After (4.1.18) |
|---|---|---|
| HCP bulk import via CSV (`/hcps/import`, `/campaigns/:id/import-hcps`) | Single batch-summary audit row | Per-row `hcp.created` / `hcp.updated` audit + new `HcpImportBatch` row with filename + createdHcpIds[] + errorRows. `Hcp.importBatchId` points back to its batch. "Which CSV did this person come from?" is one query. |
| HCP single-update via PUT `/hcps/:id` | Only NPI got a dedicated audit action (v1.17.34) | Email + specialty changes also emit dedicated `hcp.email_changed` / `hcp.specialty_changed` rows alongside the existing `hcp.npi_changed`. Generic `hcp.updated` only when nothing field-dedicated changed. |
| Bulk-send invitations / reminders / single-send | Skipped only NULL emails. `nomail@…` addresses went to SES, got 250 OK, marked `emailSentAt`, 3 reminders followed (into the void). | All three send paths gate on `isPlaceholderEmail()`. New `skippedPlaceholder` bucket in the result. New pre-flight banner on Send Invitations confirm dialog showing the placeholder count. |
| SES delivery outcomes | Zero record. "Invited 4,526" = "send-requests SES accepted 4,526". | New `EmailDeliveryEvent` table receives bounce / complaint / delivery events via SES SNS. Reminder loop now skips HCPs whose latest event was `BOUNCED_HARD` / `COMPLAINED` / `SUPPRESSED` (new `skippedBounced` bucket). |
| Survey "Email address:" answer | Stored in `SurveyResponseAnswer` and never re-read by any production flow. Payment-export sent checks to placeholders while real emails sat in survey answers. | On submit, plausible answers that differ from `Hcp.email` emit a `hcp.survey_email_mismatch` audit row. Payment-export Excel now has a **"Survey-Provided Email (review)"** column populated when an unresolved mismatch exists. New amber banner on the Payments page when any visible row has a placeholder email. `Hcp.email` is NOT auto-updated — admin reviews + decides. |
| Payments page HCP search | Status filter only, no text search | New debounced search input (multi-token full-name supported, same shape as HCP admin search) above the table |

## Migrations (2)

Both idempotent (`IF NOT EXISTS` / DO-block FK guards) per the kol360 prod-psql convention. Both already applied to the test DB on 2026-06-13.

### `20260613_hcp_import_batch`
- New `HcpImportBatch` table (id, campaignId, importedBy, fileName, recordsTotal/Created/Updated/Skipped/Errored, createdHcpIds[], updatedHcpIds[], errorRows JSONB, importedAt).
- New `Hcp.importBatchId TEXT NULL` column + FK `ON DELETE SET NULL`.
- Indexes on `HcpImportBatch.campaignId`, `importedAt`; `Hcp.importBatchId`.

### `20260613_email_delivery_event`
- New `EmailDeliveryEvent` table (id, campaignId, hcpId, campaignHcpId, messageType, sesMessageId UNIQUE, toEmail, fromEmail, subject, status, statusReason, acceptedAt, deliveredAt, bouncedAt, complainedAt, rawEvent JSONB, createdAt, updatedAt).
- Indexes on (campaignId, status), hcpId, toEmail, acceptedAt; UNIQUE on sesMessageId.

Existing rows are untouched. Existing read paths unaffected.

## AWS-side wiring (one-time, already provisioned)

The SES configuration set + SNS topic + event destination were provisioned on 2026-06-13 by pteam — see [`releases/runbook-ses-delivery-events.md`](runbook-ses-delivery-events.md). Resources:
- `arn:aws:sns:us-east-2:163859990568:kol360-ses-events` (topic with in-account policy)
- `kol360-default` SES configuration set with sns-events destination wired to all 8 event types

After v1.17.37 lands on api-test (and prod), one `aws sns subscribe` call adds the HTTPS subscription for the kol360-api endpoint(s). Commands in the runbook.

## Risk

**Low for code; moderate for the volume of change.** Each PR is concern-scoped and additive:

- **Audit foundation:** new table, new optional column, new audit rows added alongside existing ones. No existing read paths regress. Audit table growth: ~4k rows per HCP import × 50/year ≈ 200k rows/yr — comfortable against the ~11.6k current.
- **Placeholder gate:** strictly more restrictive (skip more, not less). No risk of accidentally spamming real addresses. Customer-visible: fewer "invitations sent" counts on placeholder-heavy campaigns — which is the *correct* number.
- **SES SNS:** `ConfigurationSetName` is a documented optional SES parameter; absence + presence are both valid SES inputs. The reminder gate is more restrictive, never less. The SNS handler route is unauthenticated by design (SNS doesn't carry bearer tokens); auth via `TopicArn` check + in-account topic policy.
- **Survey-email surface:** detection is best-effort + non-blocking on submit. The audit row is additive. The payment-export Excel column is a new label + value in a fresh column — existing readers ignore unknown columns. `Hcp.email` is NOT mutated; admin reviews + decides.

No DB column rename. No data backfill. No existing route shape change.

## Test environment verification

| Check | Result |
|---|---|
| Shared / API / Web builds | green |
| API unit tests | **226/226** |
| Shared unit tests | **190/190** (+24 placeholder coverage) |
| Migrations applied to test DB | ✓ (both, idempotent re-runs verified) |
| `kol360-ses-events` topic | confirmed Online, in-account policy attached |
| `kol360-default` config set + sns-events event destination | confirmed wired to all 8 event types |
| E2E full suite (vs api-test) | will run post-deploy — current snapshot 214/221 passed on 4.1.17 baseline |

## Rollback

Redeploy `prod-rel-4.1.17` (v1.17.34). Effects:

- HCP audit reverts to batch-summary-only. Existing `HcpImportBatch` + `EmailDeliveryEvent` rows stay in the DB but become unreachable by code. Existing `Hcp.importBatchId` values stay (orphaned pointers; nullable column, no breakage).
- Bulk-send accepts placeholder addresses again (re-introduces the originally-reported bug).
- SES events keep publishing to the SNS topic (AWS infra unchanged) but nothing in the code consumes them. Subscription stays Pending or unconfirmed if not previously confirmed.
- Survey-email mismatch detection stops; payment-export reverts to no "Survey-Provided Email" column.

Strictly an improvement over rolling further back; no data state to unwind.

## Companion runbook

- [`releases/runbook-ses-delivery-events.md`](runbook-ses-delivery-events.md) — AWS-side wiring + cost estimate + post-deploy `aws sns subscribe` step + troubleshooting.

## See also

- Soak checks: [`prod-rel-4.1.18-soak-checks.md`](prod-rel-4.1.18-soak-checks.md)
- Predecessor: [`prod-rel-4.1.17-handoff.md`](prod-rel-4.1.17-handoff.md)
- Bug tickets (all 4): [`docs/findings/`](../docs/findings/) — `*-2026-06-13.md`
