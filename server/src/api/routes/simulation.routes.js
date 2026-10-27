import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getEtat, getSaison, getEnjeux, postPrixCombine, putAffichage } from '../controllers/simulation.controller.js';

/**
 * La simulation complète (étape 28 du plan, cf. data/simulation/) : des lectures des lignes rangées la nuit, le prix
 * juste d'un ticket (calculé au serveur, jamais une simulation) et le clic d'un interrupteur (simulation_state).
 * Rien ne part sur le réseau.
 */
const router = Router();

router.get('/etat', asyncHandler(getEtat));
router.get('/saison', asyncHandler(getSaison));
router.get('/enjeux', asyncHandler(getEnjeux));
router.post('/prix-combine', asyncHandler(postPrixCombine));
router.put('/affichage', asyncHandler(putAffichage));

export default router;
