import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getForMatch, postPreMatch, postPostMatch } from '../controllers/matchAiAnalysis.controller.js';

const router = Router();

router.get('/match/:matchId', asyncHandler(getForMatch));
router.post('/match/:matchId', asyncHandler(postPreMatch));
router.post('/match/:matchId/post-match-review', asyncHandler(postPostMatch));

export default router;
