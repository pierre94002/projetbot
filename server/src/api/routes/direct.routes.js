import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getDirect, getDirectEnCours, getDirectMatch } from '../controllers/direct.controller.js';

// Étape 46 du plan (lot 1, partie B, 12/11/2026) : le direct — le tableau de tous les matchs suivis et le détail d'un match
// (lecture seule ; le module de lecture est chargé par import() dynamique dans le contrôleur). Correctifs D2 : la liste
// légère des matchs en cours (/en-cours), pour la puce « Direct » de toute l'appli.
const router = Router();

router.get('/', asyncHandler(getDirect));
router.get('/match', asyncHandler(getDirectMatch));
router.get('/en-cours', asyncHandler(getDirectEnCours));

export default router;
