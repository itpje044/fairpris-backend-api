import crypto from 'crypto';
import axios from 'axios';
import { config } from '../../config/index';
import { logger } from '../../utils/logger';
import type { IPKCEPair, IPenneoTokenResponse } from '../../interfaces/index';
import { ExternalServiceError, HttpError } from '../../middleware/error.middleware';

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random code_verifier (43–128 chars, RFC 7636).
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString('base64url').slice(0, 128);
}

/**
 * Derive code_challenge using S256 method (SHA-256 then Base64url).
 */
export function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

/**
 * Generate a PKCE pair: { codeVerifier, codeChallenge }.
 */
export function generatePKCE(): IPKCEPair {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

// ─── Authorization URL Builder ────────────────────────────────────────────────

export interface BuildAuthUrlOptions {
  state?: string;
  codeChallenge: string;
}

/**
 * Build the Penneo /oauth/authorize URL for Authorization Code + PKCE flow.
 */
export function buildAuthorizationUrl(options: BuildAuthUrlOptions): string {
  const params = new URLSearchParams({
    client_id: config.penneo.clientId,
    redirect_uri: config.penneo.redirectUri,
    response_type: 'code',
    code_challenge: options.codeChallenge,
    code_challenge_method: 'S256',
  });

  if (options.state) {
    params.set('state', options.state);
  }

  return `${config.penneo.oauthBaseUrl}/oauth/authorize?${params.toString()}`;
}

// ─── Authorization Code → Token Exchange ────────────────────────────────────

/**
 * Exchange an authorization code for an access_token / refresh_token pair.
 * Validates the PKCE code_verifier to prevent code interception attacks.
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<IPenneoTokenResponse> {
  logger.info('OAuth: exchanging authorization code for access token');

  const tokenUrl = `${config.penneo.oauthBaseUrl}/oauth/token`;

  try {
    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.penneo.clientId,
      client_secret: config.penneo.clientSecret,
      redirect_uri: config.penneo.redirectUri,
      code,
      code_verifier: codeVerifier,
    });

    const response = await axios.post<IPenneoTokenResponse>(tokenUrl, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });

    logger.info('OAuth: token exchange successful');
    return response.data;
  } catch (err: unknown) {
    handleOAuthError(err, 'token exchange');
  }
}

// ─── Refresh Token Grant ──────────────────────────────────────────────────────

export async function refreshAccessToken(refreshToken: string): Promise<IPenneoTokenResponse> {
  logger.info('OAuth: refreshing access token');

  const tokenUrl = `${config.penneo.oauthBaseUrl}/oauth/token`;

  try {
    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.penneo.clientId,
      client_secret: config.penneo.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await axios.post<IPenneoTokenResponse>(tokenUrl, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });

    logger.info('OAuth: token refresh successful');
    return response.data;
  } catch (err: unknown) {
    handleOAuthError(err, 'token refresh');
  }
}

// ─── API Keys Grant (headless / server-to-server) ─────────────────────────────

/**
 * Obtain an access token via the API Keys grant (WSSE-based).
 * Used for automated server-to-server calls without user interaction.
 */
export async function getApiKeysToken(): Promise<IPenneoTokenResponse> {
  logger.info('OAuth: obtaining token via API Keys grant');

  const tokenUrl = `${config.penneo.oauthBaseUrl}/oauth/token`;
  const apiKey = config.penneo.apiKey;
  const apiSecret = config.penneo.apiSecret;

  if (!apiKey || !apiSecret) {
    throw new HttpError(500, 'PENNEO_API_KEY and PENNEO_API_SECRET are required for API Keys grant');
  }

  // Build WSSE digest using raw Buffers to ensure binary safety
  const rawNonce = crypto.randomBytes(32);
  const nonce = rawNonce.toString('base64');
  const createdAt = new Date().toISOString();

  const hash = crypto.createHash('sha1');
  hash.update(rawNonce);
  hash.update(createdAt, 'utf8');
  hash.update(apiSecret, 'utf8');
  const digest = hash.digest('base64');

  try {
    const payload = new URLSearchParams({
      client_id: config.penneo.clientId,
      client_secret: config.penneo.clientSecret,
      grant_type: 'api_keys',
      key: apiKey,
      nonce,
      created_at: createdAt,
      digest,
    });

    const response = await axios.post<IPenneoTokenResponse>(
      tokenUrl,
      payload.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      },
    );

    logger.info('OAuth: API Keys token obtained successfully');
    return response.data;
  } catch (err: unknown) {
    handleOAuthError(err, 'API Keys grant');
  }
}

// ─── Token Validation ─────────────────────────────────────────────────────────

/**
 * Decode a JWT payload (no signature verification – for expiry check only).
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payloadB64] = token.split('.');
  if (!payloadB64) throw new HttpError(400, 'Invalid JWT format');
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as Record<string, unknown>;
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    const exp = typeof payload['exp'] === 'number' ? payload['exp'] : null;
    if (exp === null) return true;
    return Date.now() / 1000 > exp;
  } catch {
    return true;
  }
}

// ─── Error Helper ─────────────────────────────────────────────────────────────

function handleOAuthError(err: unknown, context: string): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const detail = (err.response?.data as Record<string, unknown>)?.['error_description']
      ?? (err.response?.data as Record<string, unknown>)?.['error']
      ?? err.message;

    logger.error(`OAuth ${context} failed`, { status, detail });

    if (status === 400) throw new HttpError(400, `Invalid OAuth request: ${detail}`);
    if (status === 401) throw new HttpError(401, `OAuth unauthorized: ${detail}`);
    if (err.code === 'ECONNABORTED') throw new HttpError(504, 'Penneo OAuth timeout');

    throw new ExternalServiceError('Penneo OAuth', String(detail));
  }
  throw new ExternalServiceError('Penneo OAuth', `${context} failed`);
}
