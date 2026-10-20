import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getOpportunitiesData, getOpportunitiesVertes } from '../controllers/opportunities.controller.js';

/**
 * La page « Opportunités du jour » (étape 8 du plan, cf. data/opportunities.js) :
 * GET seulement — rien ne s'écrit, rien ne part sur le réseau.
 */
const router = Router();

router.get('/', asyncHandler(getOpportunitiesData));
router.get('/vertes', asyncHandler(getOpportunitiesVertes));

export default router;
