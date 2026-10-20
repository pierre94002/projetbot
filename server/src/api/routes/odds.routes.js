import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getFixtureOdds, getOddsStatus, getOddsCoverage, postOddsRefresh, getDroppingOdds, getClosingValue } from '../controllers/odds.controller.js';
import { getFraicheur, putFraicheur, getConseilReleve, getSaisies, putSaisie, putRetraitSaisie } from '../controllers/cotesVosBookmakers.controller.js';

/**
 * Cotes gratuites (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets), cf. odds.controller.js ;
 * et, depuis l'étape 7 du plan, les cotes de VOS bookmakers (cf. cotesVosBookmakers.controller.js) :
 * leur fraîcheur, le conseil de relevé (information seulement), la saisie à la main.
 * Aucune route ici n'appelle The Odds API : le relevé payant reste POST /api/sources/odds/refresh,
 * au clic de Pierre.
 */
const router = Router();

router.get('/fixture', asyncHandler(getFixtureOdds));
router.get('/status', asyncHandler(getOddsStatus));
router.get('/coverage', asyncHandler(getOddsCoverage));
router.post('/refresh', asyncHandler(postOddsRefresh));
router.get('/dropping', asyncHandler(getDroppingOdds));
router.get('/closing-value', asyncHandler(getClosingValue));

router.get('/fraicheur', asyncHandler(getFraicheur));
router.put('/fraicheur', asyncHandler(putFraicheur));
router.get('/conseil-releve', asyncHandler(getConseilReleve));
router.get('/saisies', asyncHandler(getSaisies));
router.put('/saisies', asyncHandler(putSaisie));
router.put('/saisies/retrait', asyncHandler(putRetraitSaisie));

export default router;
