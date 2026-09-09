import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getStatus, postConnect, postDisconnect, postRun, getHistory } from '../controllers/aiAnalysis.controller.js';

const router = Router();

router.get('/status', asyncHandler(getStatus));
router.post('/connect', asyncHandler(postConnect));
router.post('/disconnect', asyncHandler(postDisconnect));
router.post('/run', asyncHandler(postRun));
router.get('/history', asyncHandler(getHistory));

export default router;
