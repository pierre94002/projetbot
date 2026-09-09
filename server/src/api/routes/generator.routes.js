import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { postGenerateSampleMatches } from '../controllers/generator.controller.js';

const router = Router();

router.post('/sample-matches', asyncHandler(postGenerateSampleMatches));

export default router;
