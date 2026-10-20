import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getHealthChecks, getHealthSources, putJetonClaude } from '../controllers/health.controller.js';

// Étape 14 du plan : le contrôle quotidien et la santé des sources (lecture),
// et le seul réglage de la carte, la date d'expiration du jeton Claude.
const router = Router();

router.get('/checks', asyncHandler(getHealthChecks));
router.get('/sources', asyncHandler(getHealthSources));
router.put('/jeton-claude', asyncHandler(putJetonClaude));

export default router;
