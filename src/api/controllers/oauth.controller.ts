import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';
import {
  generatePKCE,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  isTokenExpired,
} from '../services/oauth.service.js';
import { checkAgreementCompleted } from '../services/agreement.service.js';
import { HttpError } from '../../middleware/error.middleware.js';
import crypto from 'crypto';

// In-process PKCE state (state => { codeVerifier, createdAt })
const pkceStore = new Map<string, { codeVerifier: string; createdAt: number }>();
const PKCE_TTL_MS = 10 * 60 * 1000;

function cleanExpired() {
  const now = Date.now();
  for (const [k, v] of pkceStore.entries()) {
    if (now - v.createdAt > PKCE_TTL_MS) pkceStore.delete(k);
  }
}

/**
 * GET /oauth/authorize
 * Starts the PKCE Authorization Code flow — redirects to Penneo login.
 * NOTE: This is only needed if YOU want to log in as a Penneo user.
 * For agreement creation, the backend uses API Keys (headless) auth.
 */
export const initiateOAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('OAuth: initiating authorization code flow');
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    cleanExpired();
    pkceStore.set(state, { codeVerifier, createdAt: Date.now() });

    const authUrl = buildAuthorizationUrl({ codeChallenge, state });
    logger.info('OAuth: redirecting to Penneo login', { state });
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /oauth/callback
 * Receives authorization code after Penneo login.
 * Logs agreement status.
 */
export const oauthCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

    if (error) {
      logger.warn('OAuth callback error', { error, error_description });
      throw new HttpError(400, `OAuth error: ${error_description ?? error}`);
    }

    if (!code)  throw new HttpError(400, 'Missing authorization code');
    if (!state) throw new HttpError(400, 'Missing state parameter');

    const pkceEntry = pkceStore.get(state);
    if (!pkceEntry) {
      logger.warn('OAuth: unknown or expired state', { state });
      throw new HttpError(400, 'Invalid or expired OAuth state');
    }

    if (Date.now() - pkceEntry.createdAt > PKCE_TTL_MS) {
      pkceStore.delete(state);
      throw new HttpError(400, 'OAuth state expired');
    }

    pkceStore.delete(state); // one-time use

    logger.info('OAuth: exchanging code for token');
    const tokenData = await exchangeCodeForToken(code, pkceEntry.codeVerifier);

    if (isTokenExpired(tokenData.access_token)) {
      throw new HttpError(401, 'Received token is already expired');
    }

    // Optionally verify casefile status (log only)
    const rawId = req.query['casefileId'] as string | undefined;
    const casefileId = rawId ? parseInt(rawId, 10) : null;

    if (casefileId && !isNaN(casefileId)) {
      const completed = await checkAgreementCompleted(casefileId);
      logger.info('OAuth: agreement status logged', { casefileId, completed });
    }

    res.status(200).send(`
      <!DOCTYPE html><html lang="da">
      <head><meta charset="UTF-8"><title>Signering Gennemført</title>
      <style>
        body{font-family:sans-serif;text-align:center;margin-top:10vh;background:#f4f8f2}
        .card{display:inline-block;padding:40px 60px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1)}
        h1{color:#2e7d32}
      </style></head>
      <body><div class="card">
        <h1>✅ Tak for din signering!</h1>
        <p>Din aftale er nu gennemført. Du kan lukke dette vindue.</p>
      </div></body></html>
    `);
  } catch (err) {
    next(err);
  }
};
