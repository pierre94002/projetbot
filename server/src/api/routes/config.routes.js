import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getConfig, putConfig, postResetConfig, getTilt, putTilt, postResetTilt } from '../controllers/config.controller.js';

const router = Router();

router.get('/', asyncHandler(getConfig));
router.put('/', asyncHandler(putConfig));
router.post('/reset', asyncHandler(postResetConfig));

router.get('/tilt', asyncHandler(getTilt));
router.put('/tilt', asyncHandler(putTilt));
router.post('/tilt/reset', asyncHandler(postResetTilt));

export default router;
