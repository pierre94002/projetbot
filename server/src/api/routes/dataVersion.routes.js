import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getDataVersionInfo } from '../controllers/dataVersion.controller.js';

const router = Router();

router.get('/', asyncHandler(getDataVersionInfo));

export default router;
