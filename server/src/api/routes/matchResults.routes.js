import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getMatchResults, postMatchResult } from '../controllers/matchResults.controller.js';

const router = Router();

router.get('/', asyncHandler(getMatchResults));
router.post('/', asyncHandler(postMatchResult));

export default router;
