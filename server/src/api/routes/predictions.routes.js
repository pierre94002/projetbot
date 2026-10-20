import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getPredictions, postPredictions, patchPredictionStatus, removePrediction } from '../controllers/predictions.controller.js';
import { getCalibration } from '../controllers/calibration.controller.js';

const router = Router();

router.get('/', asyncHandler(getPredictions));
// Étape 20 du plan : la calibration du mois (lecture seule ; le gel est une étape de l'actualisation).
router.get('/calibration', asyncHandler(getCalibration));
router.post('/', asyncHandler(postPredictions));
router.patch('/:entryId/status', asyncHandler(patchPredictionStatus));
router.delete('/:entryId', asyncHandler(removePrediction));

export default router;
