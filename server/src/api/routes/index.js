import { Router } from 'express';
import matchesRoutes from './matches.routes.js';
import analysisRoutes from './analysis.routes.js';
import configRoutes from './config.routes.js';
import generatorRoutes from './generator.routes.js';
import sourcesRoutes from './sources.routes.js';
import teamStatsRoutes from './teamStats.routes.js';
import sportMonksRoutes from './sportMonks.routes.js';
import standingsRoutes from './standings.routes.js';
import betsRoutes from './bets.routes.js';
import predictionsRoutes from './predictions.routes.js';
import matchResultsRoutes from './matchResults.routes.js';
import aiAnalysisRoutes from './aiAnalysis.routes.js';
import matchAiAnalysisRoutes from './matchAiAnalysis.routes.js';
import matchAiRoutes from './matchAi.routes.js';
import flashscoreRoutes from './flashscore.routes.js';
import seasonCalendarRoutes from './seasonCalendar.routes.js';
import matchStatsRoutes from './matchStats.routes.js';
import dataVersionRoutes from './dataVersion.routes.js';
import refreshRoutes from './refresh.routes.js';
import matchNotesRoutes from './matchNotes.routes.js';
import favoritesRoutes from './favorites.routes.js';
import oddsRoutes from './odds.routes.js';
import screenerRoutes from './screener.routes.js';
import backupsRoutes from './backups.routes.js';
import recordersRoutes from './recorders.routes.js';
import claudeBudgetRoutes from './claudeBudget.routes.js';
import roadmapRoutes from './roadmap.routes.js';
import opportunitiesRoutes from './opportunities.routes.js';
import bookmakerAccountsRoutes from './bookmakerAccounts.routes.js';
import healthRoutes from './health.routes.js';
import benchRoutes from './bench.routes.js';
import engineHealthRoutes from './engineHealth.routes.js';
import bettingMapRoutes from './bettingMap.routes.js';
import marketKnowledgeRoutes from './marketKnowledge.routes.js';
import simulationRoutes from './simulation.routes.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'cotemaster-server' }));
// Étape 14 du plan : le contrôle quotidien des données et la santé des sources
// (GET /api/health/checks, /sources ; PUT /jeton-claude). `/api/health` seul reste ci-dessus.
router.use('/health', healthRoutes);

router.use('/matches', matchesRoutes);
router.use('/analysis', analysisRoutes);
router.use('/config', configRoutes);
router.use('/generator', generatorRoutes);
router.use('/sources', sourcesRoutes);
router.use('/team-stats', teamStatsRoutes);
router.use('/sportmonks', sportMonksRoutes);
router.use('/standings', standingsRoutes);
router.use('/bets', betsRoutes);
router.use('/predictions', predictionsRoutes);
router.use('/match-results', matchResultsRoutes);
router.use('/ai-analysis', aiAnalysisRoutes);
router.use('/match-ai-analysis', matchAiAnalysisRoutes);
// Étape 21 du plan : le carnet de notes de l'IA (lecture seule ; calculé chaque nuit par l'actualisation).
router.use('/match-ai', matchAiRoutes);
router.use('/flashscore', flashscoreRoutes);
router.use('/season-calendar', seasonCalendarRoutes);
router.use('/match-stats', matchStatsRoutes);
router.use('/data-version', dataVersionRoutes);
router.use('/refresh', refreshRoutes);
router.use('/match-notes', matchNotesRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/odds', oddsRoutes);
router.use('/screener', screenerRoutes);
router.use('/backups', backupsRoutes);
router.use('/recorders', recordersRoutes);
router.use('/claude-budget', claudeBudgetRoutes);
router.use('/roadmap', roadmapRoutes);
// Étape 8 du plan : la page « Opportunités du jour » (lecture seule).
router.use('/opportunities', opportunitiesRoutes);
// Étape 11 du plan : les fiches de vos comptes bookmakers (Réglages), non secrètes.
router.use('/bookmaker-accounts', bookmakerAccountsRoutes);
// Étape 19 du plan : le banc d'essai (onglet d'Historique moteur) — lecture, et un rejeu lancé sous le verrou.
router.use('/bench', benchRoutes);
// Étape 24 du plan : « Santé du moteur » — les feux et les résumés des autres étapes, assemblés sans rien calculer.
router.use('/engine-health', engineHealthRoutes);
// Étape 23 du plan : la carte « où parier », championnat × marché (lecture seule ; calculée par l'actualisation).
router.use('/betting-map', bettingMapRoutes);
// Étape 31 du plan : la page « Bookmakers » — ce que l'étape 22 a mesuré du marché (lecture seule ; calculé chaque nuit par l'actualisation).
router.use('/market-knowledge', marketKnowledgeRoutes);
// Étape 28 du plan : la simulation complète — fins de saison, enjeu, déroulé simulé, prix juste d'un ticket (lectures des lignes de nuit ; un interrupteur dans la base).
router.use('/simulation', simulationRoutes);

export default router;
