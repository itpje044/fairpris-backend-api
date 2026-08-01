/**
 * Shared TypeScript types for the Fairpris microservice
 */

export interface ICustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface IAgreementData {
  cprNumber?: string | undefined;
  address?: string | undefined;
  zipCode?: string | undefined;
  city?: string | undefined;
  gsrnNumber?: string | undefined;
  selectedProduct?: string | undefined;
  moveInDate?: string | undefined;
  [key: string]: unknown;
}

// ─── Penneo Types ─────────────────────────────────────────────────────────────

export interface IPenneoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_expires_at: number;
  refresh_token?: string;
  refresh_token_expires_at?: number;
}

export interface IPenneoCasefile {
  id: number;
  title: string;
  status: string | number;
  metaData?: string;
}

export interface IPenneoDocument {
  id: number;
  title: string;
  caseFileId: number;
}

export interface IPenneoSigner {
  id: number;
  name: string;
}

export interface IPenneoSigningRequest {
  id: number;
  link: string;
  status: string;
}

export type IPenneoAgreementStatus =
  | 'new'
  | 'pending'
  | 'rejected'
  | 'deleted'
  | 'signed'
  | 'completed';

// ─── Webhook Types ────────────────────────────────────────────────────────────

export type IPenneoWebhookEventType =
  | 'sign.casefile.completed'
  | 'sign.casefile.expired'
  | 'sign.casefile.failed'
  | 'sign.casefile.rejected'
  | 'sign.signer.requestActivated'
  | 'sign.signer.requestSent'
  | 'sign.signer.reminderSent'
  | 'sign.signer.requestOpened'
  | 'sign.signer.undeliverable'
  | 'sign.signer.opened'
  | 'sign.signer.rejected'
  | 'sign.signer.signed'
  | 'sign.signer.signedWithImageUploadAndNAP'
  | 'sign.signer.finalized'
  | 'sign.signer.deleted'
  | 'sign.signer.transientBounce'
  | 'webhook.subscription.test';

export interface IPenneoWebhookPayload {
  id?: string;
  event?: IPenneoWebhookEventType;
  eventType?: IPenneoWebhookEventType;
  caseFileId?: number;
  casefileId?: number;
  casefile_id?: number;
  signerIds?: number[];
  timestamp?: string;
  createdAt?: string;
  topic?: string;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── PKCE / OAuth Types ───────────────────────────────────────────────────────

export interface IPKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface IOAuthState {
  codeVerifier: string;
  createdAt: number;
}

// ─── Internal Service Result Types ───────────────────────────────────────────

export interface ICreateAgreementResult {
  signingUrl: string;
  casefileId: number;
  statusToken: string;
  pdfUrl?: string;
}

export interface IAppError extends Error {
  statusCode: number;
  isOperational: boolean;
}
