import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// v1.17.37 — SES → SNS → here. The kol360-default SES configuration
// set was wired to publish to the kol360-ses-events SNS topic on
// 2026-06-13 (releases/runbook-ses-delivery-events.md). This route
// receives the events via an HTTPS SNS subscription.
//
// Two message types arrive at this endpoint:
//
//   - SubscriptionConfirmation: when an HTTPS endpoint is subscribed
//     to an SNS topic, the FIRST POST is a SubscriptionConfirmation
//     with a `SubscribeURL`. The handler must fetch that URL once to
//     confirm the subscription; otherwise SNS gives up and the
//     subscription stays in PendingConfirmation forever.
//
//   - Notification: every event afterward. The body is an SNS
//     envelope; the SES event payload is `Message` (a JSON string
//     that needs a second JSON.parse).
//
// The route is mounted at /api/v1/internal/ses-event and is
// intentionally UNAUTHENTICATED — SNS calls from AWS infrastructure
// without bearer tokens. Auth is enforced via the topic ARN check
// (SNS includes the topic ARN in every body; we verify it matches
// the one we expect) and the in-account SNS topic policy. This route
// is also listed in plugins/auth.ts PUBLIC_ROUTES so the user-SPA
// hook bows out.

const EXPECTED_TOPIC_ARN =
  process.env.SES_SNS_TOPIC_ARN ||
  'arn:aws:sns:us-east-2:163859990568:kol360-ses-events';

interface SnsEnvelope {
  Type?: string;
  Token?: string;
  TopicArn?: string;
  SubscribeURL?: string;
  Message?: string;
  MessageId?: string;
}

interface SesEvent {
  eventType?: string;
  notificationType?: string; // legacy field
  mail?: {
    messageId?: string;
    destination?: string[];
    timestamp?: string;
  };
  bounce?: {
    bounceType?: string; // 'Permanent' | 'Transient' | 'Undetermined'
    bounceSubType?: string;
    bouncedRecipients?: Array<{ emailAddress?: string; diagnosticCode?: string }>;
    timestamp?: string;
  };
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>;
    complaintFeedbackType?: string;
    timestamp?: string;
  };
  delivery?: {
    timestamp?: string;
  };
  reject?: { reason?: string };
}

export const sesEventRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/ses-event', async (request, reply) => {
    const body = (typeof request.body === 'string'
      ? JSON.parse(request.body)
      : request.body) as SnsEnvelope;

    // Topic ARN check — reject anything not from our expected topic.
    // Belt-and-suspenders alongside the in-account SNS topic policy.
    if (body.TopicArn && body.TopicArn !== EXPECTED_TOPIC_ARN) {
      logger.warn('SES event from unexpected topic ARN', {
        got: body.TopicArn,
        expected: EXPECTED_TOPIC_ARN,
      });
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // ---- 1. Subscription confirmation ----
    if (body.Type === 'SubscriptionConfirmation') {
      if (!body.SubscribeURL) {
        logger.error('SubscriptionConfirmation without SubscribeURL', { body });
        return reply.status(400).send({ error: 'Bad Request' });
      }
      logger.info('Confirming SNS subscription', { subscribeUrl: body.SubscribeURL });
      try {
        // Fetch once — SNS treats a 200 from this URL as confirmation.
        const res = await fetch(body.SubscribeURL);
        if (!res.ok) {
          logger.error('SubscribeURL fetch failed', {
            status: res.status,
            text: await res.text(),
          });
          return reply.status(500).send({ error: 'Subscription confirmation failed' });
        }
        return reply.status(200).send({ confirmed: true });
      } catch (err) {
        logger.error('SubscribeURL fetch threw', undefined, err instanceof Error ? err : undefined);
        return reply.status(500).send({ error: 'Subscription confirmation failed' });
      }
    }

    // ---- 2. Notification ----
    if (body.Type === 'Notification' && body.Message) {
      let sesEvent: SesEvent;
      try {
        sesEvent = JSON.parse(body.Message);
      } catch (err) {
        logger.error('Failed to parse SES event Message', { snsMessageId: body.MessageId });
        return reply.status(400).send({ error: 'Bad SES event payload' });
      }

      const eventType = (sesEvent.eventType || sesEvent.notificationType || '').toLowerCase();
      const messageId = sesEvent.mail?.messageId;
      if (!messageId) {
        logger.warn('SES event without mail.messageId', { eventType });
        return reply.status(200).send({ ignored: true });
      }

      // Locate the matching EmailDeliveryEvent row by sesMessageId.
      // The row was written at send-time with status='SENT'.
      const existing = await prisma.emailDeliveryEvent.findUnique({
        where: { sesMessageId: messageId },
      });
      if (!existing) {
        // Possible: events for messages sent before v1.17.37 deployed,
        // or for messages from another consumer of this SES topic.
        logger.warn('SES event for unknown messageId', { messageId, eventType });
        return reply.status(200).send({ ignored: true });
      }

      const now = new Date();
      const update: Record<string, unknown> = {
        rawEvent: sesEvent as unknown,
      };

      switch (eventType) {
        case 'send':
          // Already recorded at send-time as SENT; just stash the raw
          // event for completeness. Don't change status.
          break;

        case 'delivery':
          update.status = 'DELIVERED';
          update.deliveredAt = sesEvent.delivery?.timestamp
            ? new Date(sesEvent.delivery.timestamp)
            : now;
          break;

        case 'bounce': {
          const isPermanent = sesEvent.bounce?.bounceType === 'Permanent';
          update.status = isPermanent ? 'BOUNCED_HARD' : 'BOUNCED_SOFT';
          update.statusReason =
            sesEvent.bounce?.bouncedRecipients?.[0]?.diagnosticCode ??
            sesEvent.bounce?.bounceSubType ??
            null;
          update.bouncedAt = sesEvent.bounce?.timestamp
            ? new Date(sesEvent.bounce.timestamp)
            : now;
          break;
        }

        case 'complaint':
          update.status = 'COMPLAINED';
          update.statusReason = sesEvent.complaint?.complaintFeedbackType ?? null;
          update.complainedAt = sesEvent.complaint?.timestamp
            ? new Date(sesEvent.complaint.timestamp)
            : now;
          break;

        case 'reject':
          update.status = 'SUPPRESSED';
          update.statusReason = sesEvent.reject?.reason ?? null;
          break;

        case 'renderingfailure':
          update.status = 'RENDERING_FAILED';
          break;

        case 'deliverydelay':
          // Soft signal — keep status as DELIVERED if already there,
          // otherwise mark DELAYED so the row reflects we know things
          // are slow on this address.
          if (existing.status === 'SENT') {
            update.status = 'DELAYED';
          }
          break;

        default:
          // Subscription / unknown — just stash raw.
          break;
      }

      await prisma.emailDeliveryEvent.update({
        where: { sesMessageId: messageId },
        data: update,
      });

      return reply.status(200).send({ recorded: true, status: update.status ?? existing.status });
    }

    // ---- 3. Anything else — log + 200 so SNS doesn't retry forever ----
    logger.info('SES event of unhandled type', { Type: body.Type });
    return reply.status(200).send({ ignored: true });
  });
};
