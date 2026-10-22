import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getBettingMap } from '../controllers/bettingMap.controller.js';

/**
 * La carte « où parier » (étape 23 du plan, cf. data/bettingMap.js) : GET seulement — rien ne se calcule ni ne
 * s'écrit ici (l'actualisation calcule et range la carte), rien ne part sur le réseau.
 */
const router = Router();

router.get('/', asyncHandler(getBettingMap));

export default router;
