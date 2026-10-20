import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getScreenerData } from '../controllers/screener.controller.js';

/** Écran de repérage : les matchs à venir classés par marché (cf. data/screener.js). */
const router = Router();

router.get('/', asyncHandler(getScreenerData));

export default router;
