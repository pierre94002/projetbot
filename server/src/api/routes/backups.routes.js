import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getBackupsOverview, putBackupDestination, postBackupDestinationCheck } from '../controllers/backups.controller.js';

// Sauvegardes (étape 1 du plan) : l'état en lecture seule, et le choix de la
// destination de la copie hors disque (enregistrer, vérifier sans rien écrire).
const router = Router();

router.get('/', asyncHandler(getBackupsOverview));
router.put('/destination', asyncHandler(putBackupDestination));
router.post('/destination/check', asyncHandler(postBackupDestinationCheck));

export default router;
