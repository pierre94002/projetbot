import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getSportMonksLeagues } from '../controllers/sportMonks.controller.js';

const router = Router();

router.get('/leagues', asyncHandler(getSportMonksLeagues));

export default router;
