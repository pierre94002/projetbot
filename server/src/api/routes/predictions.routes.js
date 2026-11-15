import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getPredictions, postPredictions, patchPredictionStatus, removePrediction } from '../controllers/predictions.controller.js';
import { getCalibration } from '../controllers/calibration.controller.js';
// Lot 0 (masque des buts, data/masqueDesButs.js) : le journal sans les pronostics de buts EN ATTENTE d'un match pas encore
// commencé (ils reviennent au coup d'envoi) ; l'historique réglé reste. Réponse < 400 seulement, comme la route de l'analyse.
import { journalSansButsAVenir } from '../../data/masqueDesButs.js';

const router = Router();

export const sansButsAVenir = (req, res, next) => { const json = res.json.bind(res); res.json = (c) => json(res.statusCode < 400 ? journalSansButsAVenir(c) : c); next(); };

router.get('/', sansButsAVenir, asyncHandler(getPredictions));
// Étape 20 du plan : la calibration du mois (lecture seule ; le gel est une étape de l'actualisation).
router.get('/calibration', asyncHandler(getCalibration));
router.post('/', asyncHandler(postPredictions));
router.patch('/:entryId/status', asyncHandler(patchPredictionStatus));
router.delete('/:entryId', asyncHandler(removePrediction));

export default router;
