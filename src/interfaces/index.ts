/**
 * Shared TypeScript types for the Fairpris microservice
 */

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface AgreementData {
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

export interface PenneoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_expires_at: number;
  refresh_token?: string;
  refresh_token_expires_at?: number;
}

export interface PenneoCasefile {
  id: number;
  title: string;
  status: string | number;
  metaData?: string;
}

export interface PenneoDocument {
  id: number;
  title: string;
  caseFileId: number;
}

export interface PenneoSigner {
  id: number;
  name: string;
}

export interface PenneoSigningRequest {
  id: number;
  link: string;
  status: string;
}

export type PenneoAgreementStatus =
  | 'new'
  | 'pending'
  | 'rejected'
  | 'deleted'
  | 'signed'
  | 'completed';

// ─── Webhook Types ────────────────────────────────────────────────────────────

export type PenneoWebhookEventType =
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

export interface PenneoWebhookPayload {
  id?: string;
  event?: PenneoWebhookEventType;
  eventType?: PenneoWebhookEventType;
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

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface OAuthState {
  codeVerifier: string;
  createdAt: number;
}

// ─── Internal Service Result Types ───────────────────────────────────────────

export interface CreateAgreementResult {
  signingUrl: string;
  casefileId: number;
  statusToken: string;
  pdfUrl?: string;
}

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}
