import dotenv from 'dotenv';
dotenv.config();
function optionalEnv(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}
export const config = {
  server: {
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    baseUrl: optionalEnv('BASE_URL', 'http://localhost:3000'),
  },
  penneo: {
    clientId: optionalEnv('PENNEO_CLIENT_ID'),
    clientSecret: optionalEnv('PENNEO_CLIENT_SECRET'),
    apiKey: optionalEnv('PENNEO_API_KEY'),
    apiSecret: optionalEnv('PENNEO_API_SECRET'),
    redirectUri: optionalEnv('PENNEO_REDIRECT_URI', 'http://localhost:3000/oauth/callback'),
    signingStatusUrl: optionalEnv('PENNEO_SIGNING_STATUS_URL') || optionalEnv('PENNEO_SIGNING_REDIRECT_URL'),
    oauthBaseUrl: optionalEnv('PENNEO_OAUTH_BASE_URL', 'https://sandbox.oauth.penneo.cloud'),
    apiBaseUrl: optionalEnv('PENNEO_API_BASE_URL', 'https://sandbox.penneo.com/api/v3'),
    webhookEndpoint: optionalEnv(
      'PENNEO_WEBHOOK_ENDPOINT',
      `${optionalEnv('BASE_URL', 'http://localhost:3000')}/api/webhooks/penneo`,
    ),
    webhookSecret: optionalEnv('PENNEO_WEBHOOK_SECRET'),
  },
} as const;
export type Config = typeof config;
