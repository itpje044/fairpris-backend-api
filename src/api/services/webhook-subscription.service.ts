import axios from 'axios';
import { config } from '../../config/index.js';
import { getApiKeysToken } from './oauth.service.js';
import { ExternalServiceError, HttpError } from '../../middleware/error.middleware.js';
import { logger } from '../../utils/logger.js';

export const PENNEO_WEBHOOK_EVENT_TYPES = [
  'sign.casefile.completed',
  'sign.casefile.rejected',
  'sign.casefile.expired',
  'sign.casefile.failed',
  'sign.signer.signed',
  'sign.signer.rejected',
  'sign.signer.reminderSent',
  'sign.signer.undeliverable',
  'webhook.subscription.test',
] as const;

export interface PenneoWebhookSubscription {
  id: string;
  endpoint: string;
  eventTypes: string[];
  isActive: boolean;
  secret?: string;
}

interface PenneoWebhookSubscriptionList {
  items: PenneoWebhookSubscription[];
}

function validateWebhookEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') {
    throw new HttpError(400, ' must use HTTPS');
  }
  if (
    url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname.startsWith('192.168.')
    || url.hostname.startsWith('10.')
  ) {
    throw new HttpError(400, 'PENNEO_WEBHOOK_ENDPOINT must be publicly reachable');
  }
}

async function createWebhookClient() {
  const token = await getApiKeysToken();
  const origin = new URL(config.penneo.apiBaseUrl).origin;
  return axios.create({
    baseURL: `${origin}/webhook/api/v1`,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

export async function setupPenneoWebhookSubscription(): Promise<{
  subscription: PenneoWebhookSubscription;
  created: boolean;
}> {
  const endpoint = config.penneo.webhookEndpoint;
  validateWebhookEndpoint(endpoint);
  const client = await createWebhookClient();
  const body = {
    endpoint,
    eventTypes: [...PENNEO_WEBHOOK_EVENT_TYPES],
    isActive: true,
  };

  try {
    const listed = await client.get<PenneoWebhookSubscriptionList | PenneoWebhookSubscription[]>(
      '/subscriptions',
    );
    const subscriptions = Array.isArray(listed.data) ? listed.data : listed.data.items;
    const existing = subscriptions.find(item => item.endpoint === endpoint);

    if (existing) {
      const updated = await client.put<PenneoWebhookSubscription>(
        `/subscriptions/${existing.id}`,
        body,
      );
      logger.info('Penneo webhook subscription updated', {
        subscriptionId: existing.id,
        endpoint,
      });
      return {
        subscription: updated.data?.id ? updated.data : { ...existing, ...body },
        created: false,
      };
    }

    const created = await client.post<PenneoWebhookSubscription>('/subscriptions', body);
    logger.info('Penneo webhook subscription created', {
      subscriptionId: created.data.id,
      endpoint,
    });
    return { subscription: created.data, created: true };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      const detail = JSON.stringify(err.response?.data ?? err.message);
      throw new ExternalServiceError(
        'Penneo webhook API',
        `request failed (${status}): ${detail}`,
      );
    }
    throw err;
  }
}

export async function testPenneoWebhookSubscription(): Promise<void> {
  validateWebhookEndpoint(config.penneo.webhookEndpoint);
  const client = await createWebhookClient();

  try {
    await client.post('/subscriptions/test', {});
    logger.info('Penneo webhook test event dispatched', {
      endpoint: config.penneo.webhookEndpoint,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 0;
      const detail = JSON.stringify(err.response?.data ?? err.message);
      throw new ExternalServiceError(
        'Penneo webhook API',
        `test failed (${status}): ${detail}`,
      );
    }
    throw err;
  }
}
