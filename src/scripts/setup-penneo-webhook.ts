import 'dotenv/config';
import { setupPenneoWebhookSubscription } from '../api/services/webhook-subscription.service.js';

try {
  const { subscription, created } = await setupPenneoWebhookSubscription();
  console.log(JSON.stringify({
    success: true,
    action: created ? 'created' : 'updated',
    subscriptionId: subscription.id,
    endpoint: subscription.endpoint,
    eventTypes: subscription.eventTypes,
    // Penneo returns the secret only when creating a subscription.
    subscriptionSecret: subscription.secret,
  }, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
