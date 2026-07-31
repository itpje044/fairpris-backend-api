import { Router } from 'express';
import {
  createAgreementHandler,
  getAgreementStatusHandler,
  streamAgreementStatusHandler,
} from '../controllers/agreement.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { createAgreementValidator } from '../dtos/agreement.dto.js';

const router = Router();

router.post('/create', validate(createAgreementValidator), createAgreementHandler);
router.get('/status/:id', getAgreementStatusHandler);
router.get('/events/:id', streamAgreementStatusHandler);

export default router;
