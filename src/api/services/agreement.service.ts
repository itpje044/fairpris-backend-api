import fs from 'fs';
import path from 'path';
import { generateAgreementPdf } from '../../integrations/pdf/pdf.service.js';
import {
  createSigningCasefile,
  getCasefileStatus,
} from '../../integrations/penneo/penneo.service.js';
import { logger } from '../../utils/logger.js';
import type { CreateAgreementInput } from '../dtos/agreement.dto.js';
import type { CreateAgreementResult } from '../../interfaces/index.js';
import { config } from '../../config/index.js';
import {
  createAgreementStatusToken,
  normalizePenneoStatus,
  setAgreementStatus,
} from './agreement-status.service.js';

export async function createAgreement(input: CreateAgreementInput): Promise<CreateAgreementResult> {
  const { customer, agreement } = input;
  const fullName = `${customer.firstName} ${customer.lastName}`;

  logger.info('Agreement: starting creation pipeline', { customer: fullName });

  const pdfPayload = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    cprNumber: agreement.cprNumber ?? '',
    address: agreement.address ?? '',
    zipCode: agreement.zipCode ?? '',
    city: agreement.city ?? '',
    gsrnNumber: agreement.gsrnNumber ?? '',
    selectedProduct: agreement.selectedProduct ?? '',
    moveInDate: agreement.moveInDate,
  };

  // 1. Generate PDF
  const pdfBuffer = await generateAgreementPdf(pdfPayload);
  logger.info('Agreement: PDF generated', { bytes: pdfBuffer.byteLength });

  // 2. Create, upload, activate, and retrieve the signer-specific URL using
  // Penneo's recommended complete-casefile endpoint.
  const { casefileId, signingUrl } = await createSigningCasefile(
    customer,
    agreement,
    pdfBuffer,
  );

  logger.info('Agreement: pipeline complete', { casefileId });
  setAgreementStatus(casefileId, 'pending');

  // 3. Save PDF to disk and return URL instead of Base64
  const pdfFileName = `agreement-${casefileId}.pdf`;
  const pdfPath = path.join(process.cwd(), 'public', 'pdfs', pdfFileName);
  fs.writeFileSync(pdfPath, pdfBuffer);

  const pdfUrl = `${config.server.baseUrl}/pdfs/${pdfFileName}`;

  return {
    signingUrl,
    casefileId,
    pdfUrl,
    statusToken: createAgreementStatusToken(casefileId),
  };
}

// ─── Webhook Helper ───────────────────────────────────────────────────────────

/**
 * Check and log casefile completion status.
 *
 * Returns true if the casefile is completed, false otherwise.
 */
export async function checkAgreementCompleted(casefileId: number): Promise<boolean> {
  logger.info('Agreement: checking completion status', { casefileId });
  const status = await getCasefileStatus(casefileId);
  const completed = normalizePenneoStatus(status) === 'completed';
  logger.info('Agreement: status checked', { casefileId, status, completed });
  return completed;
}

export async function getAgreementStatus(casefileId: number): Promise<ReturnType<typeof normalizePenneoStatus>> {
  logger.info('Agreement: getting status for frontend polling', { casefileId });
  const status = await getCasefileStatus(casefileId);
  return normalizePenneoStatus(status);
}
