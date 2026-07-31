import { Router } from 'express';
import { penneoWebhookHandler } from '../controllers/webhook.controller.js';

const router = Router();

/**
 * POST /webhooks/penneo
 * Receives Penneo event webhooks.
 */
router.post('/penneo', penneoWebhookHandler);

export default router;
