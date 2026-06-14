# Runbook — SES delivery-event logging via SNS

**Provisioned:** 2026-06-13.
**Purpose:** Capture bounce/complaint/delivery events for outbound campaign emails. The application code that consumes these events ships in v1.17.35 (PR #3 of the prod-rel-4.1.18 release per the four 2026-06-13 incident tickets); the AWS-side wiring below is in place ahead of the code so the route can be hooked up with zero AWS churn.

---

## What was provisioned (AWS-side, one-time)

| Resource | Identifier | Purpose |
|---|---|---|
| SNS topic | `arn:aws:sns:us-east-2:163859990568:kol360-ses-events` | Single fan-out point for all SES event types |
| Topic name | `kol360-ses-events` | |
| SNS topic policy | Allows `ses.amazonaws.com` to `sns:Publish` (scoped to AWS:SourceAccount = `163859990568`); allows in-account subscribers | |
| SES configuration set | `kol360-default` | New config set with `ReputationMetricsEnabled=true` |
| Event destination | `sns-events` on `kol360-default` | Wired to publish all 8 event types to the topic: `SEND`, `REJECT`, `BOUNCE`, `COMPLAINT`, `DELIVERY`, `RENDERING_FAILURE`, `DELIVERY_DELAY`, `SUBSCRIPTION` |

Verify any time:
```bash
aws sesv2 get-configuration-set-event-destinations \
  --configuration-set-name kol360-default \
  --region us-east-2 --profile koluser

aws sns get-topic-attributes \
  --topic-arn arn:aws:sns:us-east-2:163859990568:kol360-ses-events \
  --region us-east-2 --profile koluser
```

---

## What still needs to land

### Application code (ships in v1.17.35 PR #3)

1. **Update `email.service.ts`** to attach `ConfigurationSetName: 'kol360-default'` on every `SendEmailCommand` / `SendBulkEmailCommand`. Until this lands, the configuration set isn't applied to outgoing sends and no events publish.

2. **New route `POST /api/v1/internal/ses-event`** to receive SNS notifications. Handles:
   - **Subscription confirmation** — initial POST from SNS contains `Type: SubscriptionConfirmation` + `SubscribeURL`. Route fetches that URL once to confirm.
   - **Notification** — every event afterward has `Type: Notification` + JSON body with the event payload. Route inserts a row into `EmailDeliveryEvent`.

3. **New Prisma model `EmailDeliveryEvent`** + migration (per the no-ses-delivery-logging ticket §A).

### HTTPS subscription (post-deploy)

Once the route is shipped and the api-test deploy has completed:

```bash
# Subscribe the api-test endpoint
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:163859990568:kol360-ses-events \
  --protocol https \
  --notification-endpoint https://api-test.bio-exec.com/api/v1/internal/ses-event \
  --region us-east-2 --profile koluser

# SNS will POST a SubscriptionConfirmation to that URL. The route fetches
# the SubscribeURL from the body to confirm. The subscription becomes
# Confirmed (visible in `aws sns list-subscriptions-by-topic`).
```

Same for prod after the prod-rel-4.1.18 deploy:

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-2:163859990568:kol360-ses-events \
  --protocol https \
  --notification-endpoint https://ik6dmnn2ra.us-east-2.awsapprunner.com/api/v1/internal/ses-event \
  --region us-east-2 --profile koluser
```

Two subscriptions, one topic, both confirmed → both envs receive every event.

---

## Cost estimate

### SNS event delivery
- **$0.50 per million SNS publishes** in us-east-2.
- For a typical campaign with 4,500 invites + 3 reminders per send = ~3-4 events per recipient lifecycle (SEND → DELIVERY/BOUNCE, plus complaint or delay if applicable).
- **~13,500-18,000 events per campaign of 4.5k.** At $0.50/M = **~$0.01 per campaign.**
- Even at 50 campaigns/year = **~$0.50/year for SNS publishes.**

### SNS HTTP delivery
- HTTPS delivery to subscribers: **$0.60 per million HTTP deliveries** (above the free 1M/month).
- With 2 confirmed subscriptions (test + prod), each event delivers twice.
- 50 campaigns × 18k events × 2 deliveries = 1.8M deliveries/year. **First 1M free**, remaining 800k = **~$0.48/year.**

### EmailDeliveryEvent storage
- ~1 row per event published. 18k events/campaign × 50 campaigns/year = ~900k rows/year.
- At ~200 bytes/row (snapshot fields + JSON `rawEvent`), ~180 MB/year. **Negligible** at RDS storage rates.

### Total
- **First year: under $1.** Even with 10× the volume assumed above, **under $10/year.**

This is rounding error against the existing RDS + App Runner monthly bill. The observability win — knowing which 6% of "invitations sent" actually bounced silently — is the actual value.

---

## What this does NOT do

- **Doesn't backfill past events.** SES only publishes events for sends that go out AFTER the configuration set is applied to outgoing sends. The 269 prior platform-sent invitations on placeholder addresses (Sun Pharma 2026 campaigns) won't get retroactive event rows. Those are addressed by the placeholder-gate ticket (PR #2) preventing future occurrences.
- **Doesn't change SES sending behavior.** The configuration set just publishes telemetry; the actual sender behavior (rates, suppression list, etc.) is unchanged.
- **Doesn't subscribe Lambda/SQS.** HTTPS-only — App Runner endpoint handles the events directly. Cheaper, simpler, no Lambda cold-start. If event volume ever spikes past ~1k/sec, revisit.

---

## How to undo (if ever needed)

```bash
TOPIC=arn:aws:sns:us-east-2:163859990568:kol360-ses-events

# 1. Unsubscribe any HTTPS endpoints
for sub in $(aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" --region us-east-2 --profile koluser --query 'Subscriptions[*].SubscriptionArn' --output text); do
  [ "$sub" != "PendingConfirmation" ] && \
    aws sns unsubscribe --subscription-arn "$sub" --region us-east-2 --profile koluser
done

# 2. Remove event destination from the config set
aws sesv2 delete-configuration-set-event-destination \
  --configuration-set-name kol360-default \
  --event-destination-name sns-events \
  --region us-east-2 --profile koluser

# 3. (Optional) Delete the configuration set
aws sesv2 delete-configuration-set \
  --configuration-set-name kol360-default \
  --region us-east-2 --profile koluser

# 4. Delete the SNS topic
aws sns delete-topic --topic-arn "$TOPIC" --region us-east-2 --profile koluser
```

App Runner sends revert to no-config-set state; the existing `emailSentAt` semantic stays unchanged (per the no-ses-delivery-logging ticket §D, that's a separate rename decision).
