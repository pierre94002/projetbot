import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getScorecard } from '../controllers/matchAiAnalysis.controller.js';

/**
 * Étape 21 du plan (14/10/2026) : le carnet de notes de l'IA, LECTURE SEULE — il est calculé chaque nuit
 * (étape « carnetIA » de l'actualisation, data/aiScorecard.js) ; la route ne recalcule rien.
 *   GET /api/match-ai/scorecard
 */
const router = Router();

router.get('/scorecard', asyncHandler(getScorecard));

export default router;
