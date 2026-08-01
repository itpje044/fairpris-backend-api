import { body } from 'express-validator';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CustomerDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface AgreementDto {
  cprNumber?: string;
  address?: string;
  zipCode?: string;
  city?: string;
  gsrnNumber?: string;
  selectedProduct?: string;
  moveInDate?: string;
  [key: string]: unknown;
}

export interface CreateAgreementDto {
  customer: CustomerDto;
  agreement: AgreementDto;
}

export interface AgreementPdfPayloadDto {
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
  documentDate?: string | undefined;
  paymentMethod?: string | undefined;
  startDate?: string | undefined;
  productMargin?: string | undefined;
  productSubscription?: string | undefined;
  balanceFee?: string | undefined;
  subPrice?: string | undefined;
  subMargin?: string | undefined;
  prodMargin?: string | undefined;
  prodSubscription?: string | undefined;
  marketingConsent?: string | undefined;
}

// ─── Express Validator Rules ──────────────────────────────────────────────────

export const createAgreementValidator = [
  body('customer.firstName').isString().notEmpty().withMessage('Fornavn er påkrævet'),
  body('customer.lastName').isString().notEmpty().withMessage('Efternavn er påkrævet'),
  body('customer.email').isEmail().withMessage('Ugyldigt e-mailformat'),
  body('customer.phone').isString().isLength({ min: 8 }).withMessage('Telefonnummeret er for kort'),

  body('agreement.cprNumber')
    .optional({ checkFalsy: true })
    .matches(/^\d{6}-\d{4}$/)
    .withMessage('Ugyldigt CPR-format (DDMMYY-XXXX)'),
  body('agreement.address').optional({ checkFalsy: true }).isString().notEmpty(),
  body('agreement.zipCode').optional({ checkFalsy: true }).isString().isLength({ min: 4 }),
  body('agreement.city').optional({ checkFalsy: true }).isString().notEmpty(),
  body('agreement.gsrnNumber')
    .optional({ checkFalsy: true })
    .isLength({ min: 18, max: 18 }).withMessage('GSRN skal være præcis 18 cifre')
    .matches(/^\d+$/).withMessage('GSRN må kun indeholde tal'),
  body('agreement.selectedProduct').optional({ checkFalsy: true }).isString().notEmpty(),
  body('agreement.moveInDate').optional({ checkFalsy: true }).isString()
];
