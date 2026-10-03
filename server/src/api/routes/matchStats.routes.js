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
  getPlayerProfile,
  postTeamIds,
  postPlayersInfo,
  getLeagueSeasons,
  getLeagueLeaders,
  getLeagueCups,
  getCupBracket,
  getOddsProfile,
  getMatchPreview
} from '../controllers/matchStats.controller.js';

const router = Router();

router.get('/status', asyncHandler(getMatchStatsInfo));
router.get('/coverage', asyncHandler(getMatchStatsCoverage));
router.post('/refresh', asyncHandler(postMatchStatsRefresh));
router.get('/team', asyncHandler(getTeamMatchStats));
router.get('/team-averages', asyncHandler(getTeamMatchStatsAverages));
router.get('/players', asyncHandler(getPlayerStats));
router.get('/player/:playerId', asyncHandler(getPlayerProfile));
// Identifiants de clubs par nom et compétition : leurs logos dans les listes de rencontres.
router.post('/team-ids', asyncHandler(postTeamIds));
// Âge et nationalité de joueurs, pour toutes les listes de joueurs de l'interface.
router.post('/players-info', asyncHandler(postPlayersInfo));
router.get('/seasons', asyncHandler(getLeagueSeasons));
router.get('/leaders', asyncHandler(getLeagueLeaders));
router.get('/cups', asyncHandler(getLeagueCups));
router.get('/bracket', asyncHandler(getCupBracket));
router.get('/odds-profile', asyncHandler(getOddsProfile));
// Avant les routes à paramètre : « preview » n'est pas un identifiant de match.
router.get('/preview', asyncHandler(getMatchPreview));
// En dernier : ce motif attrape tout ce qui précède s'il est déclaré avant.
router.get('/:matchId', asyncHandler(getMatchStats));

export default router;
