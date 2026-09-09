import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  getSearchTeams,
  getTeamGoals,
  getTeamCorners,
  postBulkForm,
  getTeamFormByName,
  getTeamAverageStatsByName,
  getFixtureStats,
  getLineupsByName,
  getLiveMatchByName,
  getPlayersByName
} from '../controllers/teamStats.controller.js';

const router = Router();

router.get('/search', asyncHandler(getSearchTeams));
router.post('/form/bulk', asyncHandler(postBulkForm));
router.get('/form-by-name', asyncHandler(getTeamFormByName));
router.get('/average-stats-by-name', asyncHandler(getTeamAverageStatsByName));
router.get('/lineups-by-name', asyncHandler(getLineupsByName));
router.get('/live-match-by-name', asyncHandler(getLiveMatchByName));
router.get('/players-by-name', asyncHandler(getPlayersByName));
router.get('/fixtures/:fixtureId/statistics', asyncHandler(getFixtureStats));
router.get('/:teamId/goals', asyncHandler(getTeamGoals));
router.get('/:teamId/corners', asyncHandler(getTeamCorners));

export default router;
