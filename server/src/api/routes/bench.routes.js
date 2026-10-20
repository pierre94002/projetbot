import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getBench, postBenchRun } from '../controllers/bench.controller.js';
import { getStatValue, postStatValueRun } from '../controllers/statValue.controller.js';

// Le banc d'essai (étape 19 du plan) : l'état en lecture seule (note de départ, derniers rejeux) et le
// lancement d'un rejeu dans le serveur, sous le verrou d'actualisation.
// La valeur de chaque statistique (étape 18) : le dernier calcul en lecture seule, et son lancement à la
// main dans le serveur, sous le même verrou (nom « valeur-des-stats »).
const router = Router();

router.get('/', asyncHandler(getBench));
router.post('/run', asyncHandler(postBenchRun));
router.get('/stat-value', asyncHandler(getStatValue));
router.post('/stat-value/run', asyncHandler(postStatValueRun));

export default router;
