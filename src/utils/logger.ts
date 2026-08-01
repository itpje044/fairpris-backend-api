import winston from 'winston';
import { config } from '../config/index';

const SENSITIVE_KEYS = ['access_token', 'refresh_token', 'client_secret', 'password', 'apiKey', 'api_key', 'digest'];

/**
 * Recursively redact sensitive fields from log metadata
 */
function redact(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))
      ? '[REDACTED]'
      : redact(value);
  }
  return sanitized;
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(redact(meta))}` : '';
  return stack
    ? `[${ts}] ${level}: ${message}\n${stack}${metaStr}`
    : `[${ts}] ${level}: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: config.server.nodeEnv === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    config.server.nodeEnv === 'production' ? winston.format.json() : combine(colorize(), logFormat),
  ),
  transports: [new winston.transports.Console()],
});
