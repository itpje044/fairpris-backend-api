import 'dotenv/config';
import { testPenneoWebhookSubscription } from '../api/services/webhook-subscription.service.js';

try {
  await testPenneoWebhookSubscription();
  console.log(JSON.stringify({ success: true, message: 'Test event dispatched' }, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
