import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getAllBets, postBet, patchBetLegStatus, removeBet, getSuivi } from '../controllers/bets.controller.js';

const router = Router();

router.get('/', asyncHandler(getAllBets));
// Étape 11 du plan : le suivi des paris (Performance paris), en lecture seule.
router.get('/suivi', asyncHandler(getSuivi));
router.post('/', asyncHandler(postBet));
router.patch('/:betId/legs/:legIndex/status', asyncHandler(patchBetLegStatus));
router.delete('/:betId', asyncHandler(removeBet));

export default router;
