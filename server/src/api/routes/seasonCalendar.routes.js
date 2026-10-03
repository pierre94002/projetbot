import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getSeasonCalendar, getSeasonCalendarInfo, getTeamCalendar } from '../controllers/seasonCalendar.controller.js';

const router = Router();

router.get('/', asyncHandler(getSeasonCalendar));
router.get('/status', asyncHandler(getSeasonCalendarInfo));
router.get('/team', asyncHandler(getTeamCalendar));

export default router;
