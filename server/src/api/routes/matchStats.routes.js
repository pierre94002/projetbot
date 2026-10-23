import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  getTeamMatchStats,
  getTeamMatchStatsAverages,
  getLeagueAverages,
  getMatchStats,
  getMatchStatsInfo,
  getMatchStatsCoverage,
  postMatchStatsRefresh,
  getPlayerStats,
  getPlayerProfile,
  postTeamIds,
  postPlayersInfo,
  getLeagueSeasons,
  getXgTable,
  getLeagueLeaders,
  getLeagueCups,
  getCupBracket,
  getOddsProfile,
  getMatchPreview,
  getMatchStatsHealth,
  getFdHistory,
  getLeagueBenchmarks,
  getDayTable,
  getTeamStrength,
  getPlayerRatings,
  getTeamStyle,
  getStyleDuel
} from '../controllers/matchStats.controller.js';

const router = Router();

router.get('/status', asyncHandler(getMatchStatsInfo));
router.get('/coverage', asyncHandler(getMatchStatsCoverage));
// Le carnet de santé des données (étape 12 du plan) : un état préparé, en lecture seule.
router.get('/health', asyncHandler(getMatchStatsHealth));
// L'historique football-data depuis 2000 (étape 13 du plan) : un résumé préparé, en lecture seule.
router.get('/fd-history', asyncHandler(getFdHistory));
// La table du jour J (étape 17 du plan) : l'état noté par la dernière nuit, en lecture seule.
router.get('/day-table', asyncHandler(getDayTable));
// L'indice de force des équipes (étape 29 du plan) : calculé chaque nuit, en lecture seule.
router.get('/team-strength', asyncHandler(getTeamStrength));
// Les fiches des joueurs par poste (étape 30 du plan) : calculées chaque nuit, en lecture seule ; affichage seulement.
router.get('/player-ratings', asyncHandler(getPlayerRatings));
// Les styles de jeu (étape 37 du plan) : calculés chaque nuit, en lecture seule ; explication seulement.
router.get('/team-style', asyncHandler(getTeamStyle));
router.get('/style-duel', asyncHandler(getStyleDuel));
router.post('/refresh', asyncHandler(postMatchStatsRefresh));
router.get('/team', asyncHandler(getTeamMatchStats));
router.get('/team-averages', asyncHandler(getTeamMatchStatsAverages));
// Les moyennes de toutes les équipes d'un championnat, depuis le magasin (FotMob).
router.get('/league-averages', asyncHandler(getLeagueAverages));
// Les repères de chaque championnat (étape 15 du plan) : calculés chaque nuit, en lecture seule.
router.get('/benchmarks', asyncHandler(getLeagueBenchmarks));
router.get('/players', asyncHandler(getPlayerStats));
router.get('/player/:playerId', asyncHandler(getPlayerProfile));
// Identifiants de clubs par nom et compétition : leurs logos dans les listes de rencontres.
router.post('/team-ids', asyncHandler(postTeamIds));
// Âge et nationalité de joueurs, pour toutes les listes de joueurs de l'interface.
router.post('/players-info', asyncHandler(postPlayersInfo));
router.get('/seasons', asyncHandler(getLeagueSeasons));
router.get('/xg-table', asyncHandler(getXgTable));
router.get('/leaders', asyncHandler(getLeagueLeaders));
router.get('/cups', asyncHandler(getLeagueCups));
router.get('/bracket', asyncHandler(getCupBracket));
router.get('/odds-profile', asyncHandler(getOddsProfile));
// Avant les routes à paramètre : « preview » n'est pas un identifiant de match.
router.get('/preview', asyncHandler(getMatchPreview));
// En dernier : ce motif attrape tout ce qui précède s'il est déclaré avant.
router.get('/:matchId', asyncHandler(getMatchStats));

export default router;
