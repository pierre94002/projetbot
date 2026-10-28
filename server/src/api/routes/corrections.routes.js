import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getCorrections, getTri, getJournal, postProposer, postBanc, postAccepter, postRefuser, postRetirer } from '../controllers/corrections.controller.js';

const router = Router();

// Étape 26 du plan : la boucle de correction — lectures (état, tri du mois, journal) et les clics de Pierre (proposer,
// mesurer au banc, mettre à l'essai, refuser, retirer par le retour arrière de Réglages). Cf. corrections.controller.js.
router.get('/', asyncHandler(getCorrections));
router.get('/tri', asyncHandler(getTri));
router.get('/journal', asyncHandler(getJournal));
router.post('/proposer', asyncHandler(postProposer));
router.post('/:id/banc', asyncHandler(postBanc));
router.post('/:id/accepter', asyncHandler(postAccepter));
router.post('/:id/refuser', asyncHandler(postRefuser));
router.post('/:id/retirer', asyncHandler(postRetirer));

export default router;
