import { Router } from 'express';
import agreementRoutes from './agreement.routes';
import oauthRoutes from './oauth.routes';
import webhookRoutes from './webhook.routes';

const router = Router();

// Mount routes
router.use('/agreement', agreementRoutes);
router.use('/oauth', oauthRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
