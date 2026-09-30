import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getForMatch, getForFixture, getAll, getStatus, postPreMatch, postPostMatch } from '../controllers/matchAiAnalysis.controller.js';

const router = Router();

router.get('/status', asyncHandler(getStatus));
router.get('/', asyncHandler(getAll));
router.get('/fixture', asyncHandler(getForFixture));
router.get('/match/:matchId', asyncHandler(getForMatch));
router.post('/match/:matchId', asyncHandler(postPreMatch));
router.post('/match/:matchId/post-match-review', asyncHandler(postPostMatch));

export default router;
