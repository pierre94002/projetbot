import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getFlashscoreStatus, postFlashscoreRefresh } from '../controllers/flashscore.controller.js';

const router = Router();

router.get('/status', asyncHandler(getFlashscoreStatus));
router.post('/refresh', asyncHandler(postFlashscoreRefresh));

export default router;
