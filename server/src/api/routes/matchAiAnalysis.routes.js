import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getForMatch, getForFixture, getAll, getStatus, postPreMatch, postPostMatch } from '../controllers/matchAiAnalysis.controller.js';
import { getBulletins } from '../controllers/bulletins.controller.js';
import { getDossiers, getApercu } from '../controllers/aiDossiers.controller.js';

const router = Router();

router.get('/status', asyncHandler(getStatus));
// Étape 42 du plan : le bulletin du jour et le bilan de la semaine écrits par l'IA (lecture seule ; écrits par l'actualisation).
router.get('/bulletins', asyncHandler(getBulletins));
// Étape 44 du plan : la mémoire de l'IA, les dossiers des équipes et des championnats (lecture seule ; écrits par l'actualisation).
router.get('/dossiers', asyncHandler(getDossiers));
router.get('/dossiers/apercu', asyncHandler(getApercu));
router.get('/', asyncHandler(getAll));
router.get('/fixture', asyncHandler(getForFixture));
router.get('/match/:matchId', asyncHandler(getForMatch));
router.post('/match/:matchId', asyncHandler(postPreMatch));
router.post('/match/:matchId/post-match-review', asyncHandler(postPostMatch));

export default router;
