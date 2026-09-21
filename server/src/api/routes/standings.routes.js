import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getStandings, getStandingsLeagues } from '../controllers/standings.controller.js';

const router = Router();

router.get('/leagues', asyncHandler(getStandingsLeagues));
router.get('/', asyncHandler(getStandings));

export default router;
