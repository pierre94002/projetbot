import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getAllBets, postBet, patchBetLegStatus, removeBet } from '../controllers/bets.controller.js';

const router = Router();

router.get('/', asyncHandler(getAllBets));
router.post('/', asyncHandler(postBet));
router.patch('/:betId/legs/:legIndex/status', asyncHandler(patchBetLegStatus));
router.delete('/:betId', asyncHandler(removeBet));

export default router;
