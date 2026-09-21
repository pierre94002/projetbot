import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  getTeamMatchStats,
  getTeamMatchStatsAverages,
  getMatchStats,
  getMatchStatsInfo,
  getMatchStatsCoverage,
  postMatchStatsRefresh,
  getPlayerStats,
  getLeagueSeasons
} from '../controllers/matchStats.controller.js';

const router = Router();

router.get('/status', asyncHandler(getMatchStatsInfo));
router.get('/coverage', asyncHandler(getMatchStatsCoverage));
router.post('/refresh', asyncHandler(postMatchStatsRefresh));
router.get('/team', asyncHandler(getTeamMatchStats));
router.get('/team-averages', asyncHandler(getTeamMatchStatsAverages));
router.get('/players', asyncHandler(getPlayerStats));
router.get('/seasons', asyncHandler(getLeagueSeasons));
// En dernier : ce motif attrape tout ce qui précède s'il est déclaré avant.
router.get('/:matchId', asyncHandler(getMatchStats));

export default router;
