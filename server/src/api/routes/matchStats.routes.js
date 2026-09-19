import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getTeamMatchStats, getTeamMatchStatsAverages, getMatchStats, getMatchStatsInfo } from '../controllers/matchStats.controller.js';

const router = Router();

router.get('/status', asyncHandler(getMatchStatsInfo));
router.get('/team', asyncHandler(getTeamMatchStats));
router.get('/team-averages', asyncHandler(getTeamMatchStatsAverages));
router.get('/:matchId', asyncHandler(getMatchStats));

export default router;
