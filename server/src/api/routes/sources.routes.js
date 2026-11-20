import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { listSources, postRefreshOdds, postRefreshOddsCible, postRefreshCompetitions } from '../controllers/sources.controller.js';

const router = Router();

router.get('/', asyncHandler(listSources));
router.post('/odds/refresh', asyncHandler(postRefreshOdds));
// Relevé ciblé (18/11/2026) : les seuls championnats de la vague, sur le clic confirmé de Pierre (Réglages).
router.post('/odds/refresh-cible', asyncHandler(postRefreshOddsCible));
router.post('/competitions/refresh', asyncHandler(postRefreshCompetitions));

export default router;
