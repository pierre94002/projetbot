import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getMarketKnowledge } from '../controllers/marketKnowledge.controller.js';

/**
 * Connaître le marché (étape 22 du plan, data/marketKnowledge.js), lu par la page « Bookmakers » de l'étape 31 :
 * GET seulement — rien ne se calcule ni ne s'écrit ici (l'actualisation calcule et range), rien ne part sur le réseau.
 */
const router = Router();

router.get('/', asyncHandler(getMarketKnowledge));

export default router;
