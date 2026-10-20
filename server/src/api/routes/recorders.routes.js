import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getRecordersOverview } from '../controllers/recorders.controller.js';

// Les enregistreurs (étape E du plan) : lecture seule.
const router = Router();

router.get('/', asyncHandler(getRecordersOverview));

export default router;
