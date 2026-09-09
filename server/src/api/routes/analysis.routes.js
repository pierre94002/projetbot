import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { analyzeMatchById } from '../controllers/analysis.controller.js';

const router = Router();

router.get('/match/:matchId', asyncHandler(analyzeMatchById));

export default router;
