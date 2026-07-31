import crypto from 'crypto';
import type { Request } from 'express';

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

interface SignatureParts {
  timestamp: string;
  signedHeaders: string;
  signature: string;
}

function parseSignatureHeader(header: string): SignatureParts | undefined {
  const parts = new Map<string, string>();
  for (const component of header.split(',')) {
    const separator = component.indexOf('=');
    if (separator <= 0) continue;
    parts.set(component.slice(0, separator).trim(), component.slice(separator + 1).trim());
  }

  const timestamp = parts.get('t');
  const signedHeaders = parts.get('h');
  const signature = parts.get('v1');
  if (!timestamp || !signedHeaders || !signature) return undefined;
  return { timestamp, signedHeaders, signature };
}

export function verifyPenneoWebhookSignature(
  req: Request,
  rawBody: Buffer,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || rawBody.length === 0) return false;
  const parsed = parseSignatureHeader(req.header('x-event-signature') ?? '');
  if (!parsed || !/^\d+$/.test(parsed.timestamp) || !/^[a-f\d]+$/i.test(parsed.signature)) {
    return false;
  }

  const timestamp = Number(parsed.timestamp);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const headerNames = parsed.signedHeaders.split(/\s+/).filter(Boolean);
  const headerValues: string[] = [];
  for (const headerName of headerNames) {
    const value = req.header(headerName);
    if (value === undefined) return false;
    headerValues.push(value);
  }

  const signedPayload = [
    parsed.timestamp,
    parsed.signedHeaders,
    ...headerValues,
    rawBody.toString('utf8'),
  ].join('.');
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(parsed.signature, 'hex');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
