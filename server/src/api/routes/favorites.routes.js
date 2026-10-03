import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getFavoritesList, putFavoriteTeam, putFavoriteLeague } from '../controllers/favorites.controller.js';

const router = Router();

router.get('/', asyncHandler(getFavoritesList));
router.put('/teams', asyncHandler(putFavoriteTeam));
router.put('/leagues', asyncHandler(putFavoriteLeague));

export default router;
