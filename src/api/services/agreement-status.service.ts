import type { Response } from 'express';
import crypto from 'crypto';
import { config } from '../../config/index.js';

export type AgreementStatus =
  | 'new'
  | 'pending'
  | 'opened'
  | 'signed'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'failed'
  | 'deleted'
  | 'anonymized'
  | 'unknown';

export interface AgreementStatusUpdate {
  casefileId: number;
  status: AgreementStatus;
  eventType?: string;
  updatedAt: string;
}

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const statuses = new Map<number, AgreementStatusUpdate>();
const clients = new Map<number, Set<Response>>();
const TERMINAL_STATUSES = new Set<AgreementStatus>([
  'completed',
  'rejected',
  'expired',
  'failed',
  'deleted',
  'anonymized',
]);

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function createAgreementStatusToken(casefileId: number): string {
  return crypto
    .createHmac('sha256', config.penneo.apiSecret)
    .update(String(casefileId))
    .digest('base64url');
}

export function verifyAgreementStatusToken(casefileId: number, token: string): boolean {
  if (!token || !config.penneo.apiSecret) return false;
  const expected = createAgreementStatusToken(casefileId);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function normalizePenneoStatus(status: string | number): AgreementStatus {
  const normalized = String(status).toLowerCase();
  const statusMap: Record<string, AgreementStatus> = {
    '0': 'new',
    '1': 'pending',
    '2': 'rejected',
    '3': 'deleted',
    '4': 'signed',
    '5': 'completed',
    '6': 'failed',
    '7': 'expired',
    '8': 'anonymized',
    new: 'new',
    pending: 'pending',
    rejected: 'rejected',
    deleted: 'deleted',
    signed: 'signed',
    completed: 'completed',
    failed: 'failed',
    expired: 'expired',
    anonymized: 'anonymized',
  };
  return statusMap[normalized] ?? 'unknown';
}

export function setAgreementStatus(
  casefileId: number,
  status: AgreementStatus,
  eventType?: string,
): AgreementStatusUpdate {
  const current = statuses.get(casefileId);
  if (current && TERMINAL_STATUSES.has(current.status)) return current;

  const update: AgreementStatusUpdate = {
    casefileId,
    status,
    updatedAt: new Date().toISOString(),
    ...(eventType ? { eventType } : {}),
  };
  statuses.set(casefileId, update);

  for (const client of clients.get(casefileId) ?? []) {
    writeSse(client, 'status', update);
  }
  return update;
}

export function getStoredAgreementStatus(casefileId: number): AgreementStatusUpdate | undefined {
  return statuses.get(casefileId);
}

export function subscribeToAgreementStatus(casefileId: number, res: Response): () => void {
  const casefileClients = clients.get(casefileId) ?? new Set<Response>();
  casefileClients.add(res);
  clients.set(casefileId, casefileClients);

  writeSse(res, 'connected', { casefileId });
  const current = statuses.get(casefileId);
  if (current) writeSse(res, 'status', current);

  return () => {
    casefileClients.delete(res);
    if (casefileClients.size === 0) clients.delete(casefileId);
  };
}

export function clearAgreementStatuses(): void {
  statuses.clear();
}

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - STATUS_TTL_MS;
  for (const [casefileId, update] of statuses) {
    if (Date.parse(update.updatedAt) < cutoff) statuses.delete(casefileId);
  }
}, 60 * 60 * 1000);
cleanupTimer.unref();
