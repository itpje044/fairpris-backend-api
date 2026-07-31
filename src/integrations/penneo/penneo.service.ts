import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { getApiKeysToken, isTokenExpired } from '../../api/services/oauth.service.js';
import { ExternalServiceError, HttpError } from '../../middleware/error.middleware.js';
import type {
  PenneoCasefile,
  PenneoDocument,
  PenneoSigner,
  PenneoSigningRequest,
  PenneoTokenResponse,
  CustomerInfo,
  AgreementData,
} from '../../interfaces/index.js';

// ─── Token Cache (in-process) ─────────────────────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getValidAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000 && !isTokenExpired(_cachedToken)) {
    return _cachedToken;
  }

  logger.debug('Penneo: refreshing access token via API Keys grant');
  const tokenData: PenneoTokenResponse = await getApiKeysToken();
  _cachedToken = tokenData.access_token;
  _tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
  return _cachedToken;
}

// ─── Axios Client ─────────────────────────────────────────────────────────────

function createPenneoClient(accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: config.penneo.apiBaseUrl,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
}

// ─── Recommended Casefile Creation API ───────────────────────────────────────

interface PenneoCasefileJob {
  uuid: string;
  payloadHash: string;
}

interface PenneoCasefileCreateResponse {
  message?: string;
  status?: string;
  jobs?: PenneoCasefileJob[];
  // Retained for compatibility with environments that return the job directly.
  uuid?: string;
  payloadHash?: string;
}

interface PenneoCasefileJobStatus {
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string | null;
  result?: {
    success?: boolean;
    errors?: unknown;
    data?: {
      caseFile?: { id: number };
      signingLinks?: Array<{ signingLink: string }>;
    };
  };
}

/**
 * Create and activate a complete casefile using Penneo's recommended
 * asynchronous endpoint. The signer email is intentionally omitted because
 * this service returns and distributes the signing link itself.
 */
export async function createSigningCasefile(
  customer: CustomerInfo,
  agreement: AgreementData,
  pdfBuffer: Buffer,
): Promise<{ casefileId: number; signingUrl: string }> {
  const token = await getValidAccessToken();
  const penneoOrigin = new URL(config.penneo.apiBaseUrl).origin;
  const createUrl = `${penneoOrigin}/send/api/v1/casefiles/20251022/create`;
  const statusUrl = `${penneoOrigin}/send/api/v1/queue/public/status`;
  const fullName = `${customer.firstName} ${customer.lastName}`;
  const title = `Elleverandøraftale - ${fullName}`;
  const fileName = 'agreement.pdf';

  const form = new FormData();
  form.append('files', pdfBuffer, {
    filename: fileName,
    contentType: 'application/pdf',
  });
  form.append('data', JSON.stringify({
    caseFile: {
      title,
      metaData: JSON.stringify({
        email: customer.email,
        phone: customer.phone,
        ...agreement,
      }),
      signers: [
        {
          name: fullName,
          role: 'Customer',
          signOrder: 0,
          accessControl: false,
          enableInsecureSigning: true,
          ...(config.penneo.signingSuccessUrl
            ? { successUrl: config.penneo.signingSuccessUrl }
            : {}),
          ...(config.penneo.signingFailUrl
            ? { failUrl: config.penneo.signingFailUrl }
            : {}),
        },
      ],
      documents: [
        {
          name: fileName,
          title,
          signable: true,
          roles: ['Customer'],
          documentOrder: 0,
        },
      ],
    },
  }));

  logger.info('Penneo: submitting complete casefile', { title });

  try {
    const created = await axios.post<PenneoCasefileCreateResponse>(createUrl, form, {
      timeout: 30_000,
      headers: {
        ...form.getHeaders(),
        'X-Auth-Token': token,
        Accept: 'application/json',
      },
    });

    const returnedJob = created.data.jobs?.[0] ?? created.data;
    const { uuid, payloadHash } = returnedJob;
    if (!uuid || !payloadHash) {
      throw new Error(
        `Penneo did not return a casefile job identifier (response keys: ${Object.keys(created.data).join(', ')})`,
      );
    }
    logger.info('Penneo: casefile job accepted');

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 5_000));
      }

      const statusResponse = await axios.post<PenneoCasefileJobStatus>(
        statusUrl,
        { uuid, payloadHash },
        {
          timeout: 30_000,
          headers: { Accept: 'application/json' },
        },
      );
      const job = statusResponse.data;
      logger.debug('Penneo: casefile job status', {
        attempt: attempt + 1,
        jobStatus: job.jobStatus,
      });

      if (job.jobStatus === 'failed') {
        throw new Error(`Penneo casefile job failed: ${job.errorMessage ?? JSON.stringify(job.result?.errors)}`);
      }

      if (job.jobStatus === 'completed') {
        const casefileId = job.result?.data?.caseFile?.id;
        const signingUrl = job.result?.data?.signingLinks?.[0]?.signingLink;
        if (!casefileId || !signingUrl) {
          throw new Error('Penneo completed the casefile without returning a signing link');
        }

        logger.info('Penneo: complete casefile ready for signing', { casefileId });
        return { casefileId, signingUrl };
      }
    }

    throw new Error('Timed out waiting for Penneo to create the signing casefile');
  } catch (err) {
    handlePenneoError(err, 'createSigningCasefile');
  }
}

// ─── Casefile Operations ──────────────────────────────────────────────────────

export async function createCasefile(
  customer: CustomerInfo,
  agreement: AgreementData,
): Promise<PenneoCasefile> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);
  const title = `Elleverandøraftale - ${customer.firstName} ${customer.lastName}`;

  logger.info('Penneo: creating casefile', { title });

  try {
    const response = await client.post<PenneoCasefile>('/casefiles', {
      title,
      metaData: JSON.stringify({ email: customer.email, phone: customer.phone, ...agreement }),
    });

    logger.info('Penneo: casefile created', { casefileId: response.data.id });
    return response.data;
  } catch (err) {
    handlePenneoError(err, 'createCasefile');
  }
}

export async function uploadDocument(
  casefileId: number,
  pdfBuffer: Buffer,
  title: string,
): Promise<PenneoDocument> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  logger.info('Penneo: uploading document', { casefileId, title });

  try {
    const response = await client.post<PenneoDocument>(
      '/documents',
      {
        caseFileId: casefileId,
        title,
        pdfFile: pdfBuffer.toString('base64'),
        type: 'signable',
      }
    );

    logger.info('Penneo: document uploaded', { documentId: response.data.id });
    return response.data;
  } catch (err) {
    handlePenneoError(err, 'uploadDocument');
  }
}

export async function addSigner(
  casefileId: number,
  customer: CustomerInfo,
): Promise<PenneoSigner> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  logger.info('Penneo: adding signer', { casefileId });

  try {
    const response = await client.post<PenneoSigner>(`/casefiles/${casefileId}/signers`, {
      name: `${customer.firstName} ${customer.lastName}`,
    });

    logger.info('Penneo: signer added', { signerId: response.data.id });
    return response.data;
  } catch (err) {
    handlePenneoError(err, 'addSigner');
  }
}

export async function linkSignerToDocument(
  casefileId: number,
  documentId: number,
  signerId: number,
): Promise<void> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  logger.info('Penneo: linking signer to document via signature line', { casefileId, documentId, signerId });

  try {
    // 1. Create a Signature Line on the document
    const slRes = await client.post(`/documents/${documentId}/signaturelines`, {
      role: 'Customer',
      conditions: 0,
      // This is the first (and currently only) signer, so they must be able
      // to sign immediately. A value of 1 waits for an order-0 signer.
      signOrder: 0,
    });
    const signatureLineId = slRes.data.id;

    // 2. Map the Signer to the newly created Signature Line
    await client.post(`/documents/${documentId}/signaturelines/${signatureLineId}/signers/${signerId}`, {});

    logger.info('Penneo: signer linked to document successfully');
  } catch (err) {
    handlePenneoError(err, 'linkSignerToDocument');
  }
}

export async function configureSigningRequest(
  casefileId: number,
  customer: CustomerInfo,
): Promise<void> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  const successUrl = config.penneo.redirectUri;

  logger.info('Penneo: configuring signing request', { casefileId });

  try {
    // 1. Fetch casefile to get the auto-generated signingRequest ID
    const cf = await client.get(`/casefiles/${casefileId}`);
    const signers = cf.data.signers;
    if (!signers || signers.length === 0) throw new Error('No signers found in casefile');

    const signingRequestId = signers[0].signingRequest.id;

    // 2. Update the signing request with email
    await client.put(`/signingrequests/${signingRequestId}`, {
      email: customer.email,
      // Opening the private signing link should go straight to the signing
      // flow rather than requiring identity validation before document access.
      accessControl: false,
    });

    logger.info('Penneo: signing request configured successfully');
  } catch (err) {
    handlePenneoError(err, 'configureSigningRequest');
  }
}

export async function sendCasefile(casefileId: number): Promise<void> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  logger.info('Penneo: sending casefile for signing', { casefileId });

  try {
    // Penneo's direct casefile workflow requires /send to activate the
    // casefile. The signing link can still be distributed by our frontend.
    await client.patch(`/casefiles/${casefileId}/send`, {});
    logger.info('Penneo: casefile activated for signing', { casefileId });
  } catch (err) {
    handlePenneoError(err, 'sendCasefile');
  }
}

export async function getSigningLink(
  casefileId: number,
): Promise<string> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  logger.info('Penneo: retrieving signing link', { casefileId });

  try {
    const cf = await client.get(`/casefiles/${casefileId}`);
    const signers = cf.data.signers;
    if (!signers || signers.length === 0) throw new Error('No signers found in casefile');

    const signingRequestId = signers[0].signingRequest.id;
    // Penneo V3 requires a PATCH to /signingrequests/{id}/link which returns an array of links.
    const response = await client.patch<string[]>(`/signingrequests/${signingRequestId}/link`);

    logger.info('Penneo: signing link retrieved');
    const link = response.data[0];
    if (!link) throw new Error('No signing link returned from Penneo');
    return link;
  } catch (err) {
    handlePenneoError(err, 'getSigningLink');
  }
}

export async function getCasefileStatus(casefileId: number): Promise<string | number> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  logger.info('Penneo: fetching casefile status', { casefileId });

  try {
    const response = await client.get<PenneoCasefile>(`/casefiles/${casefileId}`);
    return response.data.status;
  } catch (err) {
    handlePenneoError(err, 'getCasefileStatus');
  }
}

export async function getCasefileDetails(casefileId: number): Promise<PenneoCasefile> {
  const token = await getValidAccessToken();
  const client = createPenneoClient(token);

  logger.info('Penneo: fetching casefile details', { casefileId });

  try {
    const response = await client.get<PenneoCasefile>(`/casefiles/${casefileId}`);
    return response.data;
  } catch (err) {
    handlePenneoError(err, 'getCasefileDetails');
  }
}

// ─── Error Helper ─────────────────────────────────────────────────────────────

function handlePenneoError(err: unknown, context: string): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const detail = JSON.stringify(err.response?.data ?? err.message);
    logger.error(`Penneo API error [${context}]`, { status, detail });

    if (status === 400 || status === 422) throw new HttpError(400, `Penneo validation error: ${detail}`);
    if (status === 401 || status === 403) throw new HttpError(401, 'Penneo authentication failed');
    if (status === 404) throw new HttpError(404, `Penneo resource not found: ${context}`);
    if (status >= 500) throw new ExternalServiceError('Penneo', `Server error (${status})`);
    if (err.code === 'ECONNABORTED') throw new HttpError(504, 'Penneo API timeout');
  }

  const detail = err instanceof Error ? err.message : String(err);
  logger.error(`Penneo error [${context}]`, { detail });
  throw new ExternalServiceError('Penneo', detail);
}
