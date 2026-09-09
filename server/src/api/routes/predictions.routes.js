import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getPredictions, postPredictions, patchPredictionStatus, removePrediction } from '../controllers/predictions.controller.js';

const router = Router();

router.get('/', asyncHandler(getPredictions));
router.post('/', asyncHandler(postPredictions));
router.patch('/:entryId/status', asyncHandler(patchPredictionStatus));
router.delete('/:entryId', asyncHandler(removePrediction));

export default router;
