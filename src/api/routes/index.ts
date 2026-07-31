import { Router } from 'express';
import agreementRoutes from './agreement.routes.js';
import oauthRoutes from './oauth.routes.js';
import webhookRoutes from './webhook.routes.js';

const router = Router();

// Mount routes
router.use('/agreement', agreementRoutes);
router.use('/oauth', oauthRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
