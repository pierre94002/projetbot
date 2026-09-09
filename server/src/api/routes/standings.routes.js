import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getStandings } from '../controllers/standings.controller.js';

const router = Router();

router.get('/', asyncHandler(getStandings));

export default router;
