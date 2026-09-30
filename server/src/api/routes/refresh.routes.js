import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getRefreshOverview, postRefresh, postResettle } from '../controllers/refresh.controller.js';

const router = Router();

router.get('/', asyncHandler(getRefreshOverview));
router.post('/', asyncHandler(postRefresh));
router.post('/resettle', asyncHandler(postResettle));

export default router;
