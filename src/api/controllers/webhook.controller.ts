import type { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import type { IPenneoWebhookPayload, IPenneoWebhookEventType } from '../../interfaces/index';
import { setAgreementStatus, type AgreementStatus } from '../services/agreement-status.service';
import { verifyPenneoWebhookSignature } from '../services/webhook-verification.service';
import { config } from '../../config/index';

// Idempotency — deduplicate retried events
const processedEvents = new Set<string>();

function findCasefileId(value: unknown, depth = 0): number | undefined {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replaceAll('_', '');
    if (normalizedKey === 'casefileid') {
      if (typeof nested === 'number' && Number.isSafeInteger(nested)) return nested;
      if (typeof nested === 'string' && /^\d+$/.test(nested)) return Number(nested);
    }
    const found = findCasefileId(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}
function getCasefileId(payload: IPenneoWebhookPayload): number | undefined {
  const bodyPayload = payload.payload;
  if (payload.topic === 'casefile') {
    const id = bodyPayload?.['id'];
    if (typeof id === 'number') return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
  }
  if (payload.topic === 'signer') {
    const caseFile = bodyPayload?.['caseFile'];
    if (caseFile && typeof caseFile === 'object') {
      const id = (caseFile as Record<string, unknown>)['id'];
      if (typeof id === 'number') return id;
      if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
    }
  }
  return findCasefileId(payload);
}

function getEventType(req: Request, payload: IPenneoWebhookPayload): string | undefined {
  const headerEvent = req.header('x-event-type');
  if (headerEvent) return headerEvent;
  const bodyEvent = payload.eventType ?? payload.event;
  if (!bodyEvent) return undefined;
  if (bodyEvent.includes('.')) return bodyEvent;
  return payload.topic ? `sign.${payload.topic}.${bodyEvent}` : bodyEvent;
}

function frontendStatusForEvent(event: IPenneoWebhookEventType): AgreementStatus | undefined {
  switch (event) {
    case 'sign.signer.opened':
    case 'sign.signer.requestOpened':
      return 'opened';
    case 'sign.signer.signed':
    case 'sign.signer.signedWithImageUploadAndNAP':
      return 'signed';
    case 'sign.casefile.completed':
      return 'completed';
    case 'sign.casefile.rejected':
    case 'sign.signer.rejected':
      return 'rejected';
    case 'sign.casefile.expired':
      return 'expired';
    case 'sign.casefile.failed':
      return 'failed';
    default:
      return undefined;
  }
}

/**
 * POST /webhooks/penneo
 *
 * Receives Penneo lifecycle events and logs them.

 * Returns 2xx only after the event has been accepted into local state.
 */
export const penneoWebhookHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const penneoWebhookPayload = req.body as IPenneoWebhookPayload;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);

    if (!config.penneo.webhookSecret) {
      logger.error('Webhook: PENNEO_WEBHOOK_SECRET is not configured');
      res.status(503).json({ received: false, message: 'Webhook verification unavailable' });
      return;
    }
    if (!verifyPenneoWebhookSignature(req, rawBody, config.penneo.webhookSecret)) {
      logger.warn('Webhook: invalid Penneo signature');
      res.status(401).json({ received: false, message: 'Invalid signature' });
      return;
    }

    const event = getEventType(req, penneoWebhookPayload);
    if (!event) {
      logger.warn('Webhook: received payload without event type');
      res.status(400).json({ received: false, message: 'Missing event type' });
      return;
    }

    const casefileId = getCasefileId(penneoWebhookPayload);
    const eventId = req.header('x-event-id') ?? penneoWebhookPayload.id
      ?? `${event}-${casefileId ?? 'unknown'}-${penneoWebhookPayload.timestamp ?? penneoWebhookPayload.createdAt ?? ''}`;

    if (processedEvents.has(eventId)) {
      logger.info('Webhook: duplicate event ignored', { eventId });
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    logger.info('Webhook: event received', { event, casefileId });

    switch (event as IPenneoWebhookEventType) {
      case 'webhook.subscription.test':
        logger.info('Webhook: Penneo test event received successfully');
        break;

      case 'sign.signer.opened':
      case 'sign.signer.requestOpened':
        logger.info('Webhook: signing request opened', { casefileId });
        break;

      case 'sign.signer.signed':
      case 'sign.signer.signedWithImageUploadAndNAP':
        logger.info('Webhook: signer signed (awaiting casefile completion)', { casefileId });
        break;

      case 'sign.casefile.completed':
        logger.info('Webhook: casefile completed; signed documents are ready', { casefileId });
        break;

      case 'sign.casefile.rejected':
      case 'sign.signer.rejected':
        logger.warn('Webhook: casefile rejected', { casefileId });
        break;

      case 'sign.casefile.expired':
        logger.warn('Webhook: casefile expired', { casefileId });
        break;

      case 'sign.casefile.failed':
        logger.error('Webhook: Penneo casefile processing failed', { casefileId });
        break;

      case 'sign.signer.undeliverable':
      case 'sign.signer.transientBounce':
        logger.warn('Webhook: signer notification delivery problem', { event, casefileId });
        break;

      default:
        logger.info('Webhook: unknown event type', { event, casefileId });
    }

    const frontendStatus = frontendStatusForEvent(event as IPenneoWebhookEventType);
    if (frontendStatus && casefileId) {
      setAgreementStatus(casefileId, frontendStatus, event);
    } else if (frontendStatus && !casefileId) {
      logger.warn('Webhook: status event did not contain a casefile ID', { event });
      res.status(422).json({ received: false, message: 'Manglende casefile ID' });
      return;
    }

    processedEvents.add(eventId);

    // Prune old entries (keep last 1000)
    if (processedEvents.size > 1000) {
      const toDelete = Array.from(processedEvents).slice(0, 200);
      toDelete.forEach(k => processedEvents.delete(k));
    }

    res.status(200).json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Webhook: processing error', { error: msg });
    if (!res.headersSent) {
      res.status(500).json({ received: false });
    }
  }
};
