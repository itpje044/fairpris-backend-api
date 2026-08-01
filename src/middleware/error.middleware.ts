import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true,
  ) {
    super(message);
    this.name = 'HttpError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Ressource ikke fundet') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ExternalServiceError extends HttpError {
  constructor(service: string, message: string) {
    super(502, `${service}: ${message}`);
    this.name = 'ExternalServiceError';
  }
}

/**
 * Centralised error-handling middleware.
 * Must be the LAST middleware registered in app.ts (4-arg signature).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const globalErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Known operational HTTP errors
  if (err instanceof HttpError || (err instanceof Error && 'statusCode' in err)) {
    const statusCode = (err as any).statusCode || 500;
    const isOperational = (err as any).isOperational !== false;

    if (statusCode >= 500) {
      logger.error(err.message, { stack: err.stack });
    } else {
      logger.warn(err.message);
    }
    res.status(statusCode).json({
      success: false,
      message: isOperational ? err.message : 'Der opstod en uventet fejl',
    });
    return;
  }

  // Unknown errors – never expose details to the client in prod, but for debugging now:
  const msg = err instanceof Error ? err.message : String(err);
  logger.error('Unhandled error', { message: msg, error: err });
  res.status(500).json({ success: false, message: `Intern serverfejl: ${msg}` });
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, message: 'Ruten blev ikke fundet' });
};
