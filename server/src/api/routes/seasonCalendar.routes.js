import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getSeasonCalendar, getSeasonCalendarInfo } from '../controllers/seasonCalendar.controller.js';

const router = Router();

router.get('/', asyncHandler(getSeasonCalendar));
router.get('/status', asyncHandler(getSeasonCalendarInfo));

export default router;
