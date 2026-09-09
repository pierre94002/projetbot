import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { listSources, postRefreshOdds, postRefreshCompetitions } from '../controllers/sources.controller.js';

const router = Router();

router.get('/', asyncHandler(listSources));
router.post('/odds/refresh', asyncHandler(postRefreshOdds));
router.post('/competitions/refresh', asyncHandler(postRefreshCompetitions));

export default router;
