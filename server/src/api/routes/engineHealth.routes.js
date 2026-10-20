import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getEngineHealth } from '../controllers/engineHealth.controller.js';

// Étape 24 du plan : la page « Santé du moteur » (lecture seule — elle assemble des résumés déjà écrits, ne calcule rien).
const router = Router();

router.get('/', asyncHandler(getEngineHealth));

export default router;
