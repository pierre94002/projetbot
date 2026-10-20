import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getClaudeBudget, putClaudeBudgetSetting } from '../controllers/claudeBudget.controller.js';

// Budget Claude (étape 4 du plan) : l'état en lecture seule, et le réglage du
// budget choisi par Pierre (PUT idempotent, jamais server/.env).
const router = Router();

router.get('/', asyncHandler(getClaudeBudget));
router.put('/reglage', asyncHandler(putClaudeBudgetSetting));

export default router;
