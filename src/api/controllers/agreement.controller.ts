import type { Request, Response, NextFunction } from 'express';

import type { CreateAgreementInput } from '../dtos/agreement.dto.js';
import { createAgreement, getAgreementStatus } from '../services/agreement.service.js';
import { logger } from '../../utils/logger.js';
import {
  getStoredAgreementStatus,
  subscribeToAgreementStatus,
  verifyAgreementStatusToken,
} from '../services/agreement-status.service.js';

function getStatusToken(req: Request): string {
  const header = req.header('x-agreement-status-token');
  const query = req.query.token;
  return header ?? (typeof query === 'string' ? query : '');
}
/**
 * POST /agreement/create
 * Validates input (middleware), runs the Penneo pipeline, returns signing URL.
 */
export const createAgreementHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const input = req.body as CreateAgreementInput;
    logger.info('Agreement create request received', {
      email: input.customer.email,
    });
    const result = await createAgreement(input);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /agreement/status/:id
 * Fetches the current status of the agreement casefile.
 */
export const getAgreementStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const idParam = req.params.id;
    if (!idParam || typeof idParam !== 'string') {
      res.status(400).json({ success: false, message: 'Invalid casefile ID' });
      return;
    }

    const casefileId = parseInt(idParam, 10);
    if (!Number.isSafeInteger(casefileId) || casefileId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid casefile ID' });
      return;
    }

    if (!verifyAgreementStatusToken(casefileId, getStatusToken(req))) {
      res.status(401).json({ success: false, message: 'Invalid status token' });
      return;
    }

    const stored = getStoredAgreementStatus(casefileId);
    if (stored) {
      res.status(200).json({ success: true, data: stored, source: 'webhook' });
      return;
    }

    const status = await getAgreementStatus(casefileId);

    if (!status) {
      res.status(404).json({ success: false, message: 'Casefile status not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        casefileId,
        status,
        completed: status === 'completed',
      },
      source: 'penneo',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /agreement/events/:id
 * Server-Sent Events stream used by the frontend for instant status updates.
 */
export const streamAgreementStatusHandler = (req: Request, res: Response): void => {
  const casefileId = Number(req.params.id);
  if (!Number.isSafeInteger(casefileId) || casefileId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid casefile ID' });
    return;
  }

  if (!verifyAgreementStatusToken(casefileId, getStatusToken(req))) {
    res.status(401).json({ success: false, message: 'Invalid status token' });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const unsubscribe = subscribeToAgreementStatus(casefileId, res);
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
};
