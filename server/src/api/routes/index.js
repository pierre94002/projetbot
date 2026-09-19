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
import flashscoreRoutes from './flashscore.routes.js';
import seasonCalendarRoutes from './seasonCalendar.routes.js';
import matchStatsRoutes from './matchStats.routes.js';
import dataVersionRoutes from './dataVersion.routes.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'cotemaster-server' }));

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
router.use('/flashscore', flashscoreRoutes);
router.use('/season-calendar', seasonCalendarRoutes);
router.use('/match-stats', matchStatsRoutes);
router.use('/data-version', dataVersionRoutes);

export default router;
