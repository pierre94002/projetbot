import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getBookmakerAccounts, putBookmakerAccount } from '../controllers/bookmakerAccounts.controller.js';

// Étape 11 du plan : une fiche par compte bookmaker (solde déclaré, mise maximale acceptée, limitation) — jamais de secret.
const router = Router();

router.get('/', asyncHandler(getBookmakerAccounts));
router.put('/:cle', asyncHandler(putBookmakerAccount));

export default router;
