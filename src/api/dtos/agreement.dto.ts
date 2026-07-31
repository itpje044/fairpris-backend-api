import { body } from 'express-validator';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CustomerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface AgreementInput {
  cprNumber?: string;
  address?: string;
  zipCode?: string;
  city?: string;
  gsrnNumber?: string;
  selectedProduct?: string;
  moveInDate?: string;
  [key: string]: unknown;
}

export interface CreateAgreementInput {
  customer: CustomerInput;
  agreement: AgreementInput;
}

export interface PdfPayload {
  firstName: string;
  lastName: string;
  cprNumber: string;
  email: string;
  phone: string;
  address: string;
  zipCode: string;
  city: string;
  gsrnNumber: string;
  selectedProduct: string;
  moveInDate?: string | undefined;
}

// ─── Express Validator Rules ──────────────────────────────────────────────────

export const createAgreementValidator = [
  body('customer.firstName').isString().notEmpty().withMessage('First name is required'),
  body('customer.lastName').isString().notEmpty().withMessage('Last name is required'),
  body('customer.email').isEmail().withMessage('Invalid email format'),
  body('customer.phone').isString().isLength({ min: 8 }).withMessage('Phone number is too short'),

  body('agreement.cprNumber')
    .optional()
    .matches(/^\d{6}-\d{4}$/)
    .withMessage('Invalid CPR format (DDMMYY-XXXX)'),
  body('agreement.address').optional().isString().notEmpty(),
  body('agreement.zipCode').optional().isString().isLength({ min: 4 }),
  body('agreement.city').optional().isString().notEmpty(),
  body('agreement.gsrnNumber')
    .optional()
    .isLength({ min: 18, max: 18 }).withMessage('GSRN must be exactly 18 digits')
    .matches(/^\d+$/).withMessage('GSRN must contain only digits'),
  body('agreement.selectedProduct').optional().isString().notEmpty(),
  body('agreement.moveInDate').optional().isString()
];
