import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { listMatches, getMatch } from '../controllers/matches.controller.js';

const router = Router();

router.get('/', asyncHandler(listMatches));
router.get('/:matchId', asyncHandler(getMatch));

export default router;
