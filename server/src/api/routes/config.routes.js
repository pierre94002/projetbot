import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getConfig, putConfig, postResetConfig, getTilt, putTilt, postResetTilt, getGardeFous, putGardeFous, getVersions, postRetourVersion, postAdopterVersion, postBancCandidate } from '../controllers/config.controller.js';

const router = Router();

router.get('/', asyncHandler(getConfig));
router.put('/', asyncHandler(putConfig));
router.post('/reset', asyncHandler(postResetConfig));

router.get('/tilt', asyncHandler(getTilt));
router.put('/tilt', asyncHandler(putTilt));
router.post('/tilt/reset', asyncHandler(postResetTilt));

// Étape 11 du plan : les garde-fous de Pierre (mise maximale par pari, perte maximale par semaine).
router.get('/garde-fous', asyncHandler(getGardeFous));
router.put('/garde-fous', asyncHandler(putGardeFous));

// Étape 25 du plan : les versions du moteur (lecture seule) et le retour à la version précédente (un clic, confirmé).
router.get('/versions', asyncHandler(getVersions));
router.post('/versions/retour', asyncHandler(postRetourVersion));
// Étape 25, seconde moitié : adopter la candidate (seulement sur « retenu », confirmé) et la passer au banc avant l'essai (indicatif).
router.post('/versions/adopter', asyncHandler(postAdopterVersion));
router.post('/versions/candidate/banc', asyncHandler(postBancCandidate));

export default router;
