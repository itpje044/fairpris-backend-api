import { Router } from 'express';
import { initiateOAuth, oauthCallback } from '../controllers/oauth.controller.js';

const router = Router();

/**
 * GET /oauth/authorize
 * Starts PKCE OAuth flow — redirects to Penneo login.
 */
router.get('/authorize', initiateOAuth);

/**
 * GET /oauth/callback
 * Receives authorization code from Penneo after user signs in.
 */
router.get('/callback', oauthCallback);

export default router;
