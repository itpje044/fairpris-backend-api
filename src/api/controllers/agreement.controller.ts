import type { Request, Response } from 'express';
import type { CreateAgreementDto } from '../dtos/agreement.dto';
import { createAgreement, getAgreementStatus } from '../services/agreement.service';
import { logger } from '../../utils/logger';
import {
  getStoredAgreementStatus,
  subscribeToAgreementStatus,
  verifyAgreementStatusToken,
} from '../services/agreement-status.service';

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
  res: Response
): Promise<void> => {
  try {
    const agreementpayload = req.body as CreateAgreementDto;
    logger.info('Agreement create request received', {
      email: agreementpayload.customer.email,
    });
    const result = await createAgreement(agreementpayload);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    throw (err);
  }
};

/**
 * GET /agreement/status/:id
 * Fetches the current status of the agreement casefile.
 */
export const getAgreementStatusHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const idParam = req.params.id;
    if (!idParam || typeof idParam !== 'string') {
      res.status(400).json({ success: false, message: 'Ugyldigt sagsnummer' });
      return;
    }
    const casefileId = parseInt(idParam, 10);
    if (!Number.isSafeInteger(casefileId) || casefileId <= 0) {
      res.status(400).json({ success: false, message: 'Ugyldigt sagsnummer' });
      return;
    }

    if (!verifyAgreementStatusToken(casefileId, getStatusToken(req))) {
      res.status(401).json({ success: false, message: 'Ugyldigt statustoken' });
      return;
    }

    const storedagreementstatus = getStoredAgreementStatus(casefileId);
    if (storedagreementstatus) {
      res.status(200).json({ success: true, data: storedagreementstatus, source: 'webhook' });
      return;
    }
    const agreementstatus = await getAgreementStatus(casefileId);
    if (!agreementstatus) {
      res.status(404).json({ success: false, message: 'Sagsstatus ikke fundet' });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        casefileId,
        agreementstatus,
        completed: agreementstatus === 'completed',
      },
      source: 'penneo',
    });
  } catch (err) {
    throw (err);
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

  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const unsubscribe = subscribeToAgreementStatus(casefileId, res);
  const keepAlive = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': keep-alive\n\n');
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
};
