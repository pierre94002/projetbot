/**
 * calibration.controller.js — LA CALIBRATION DU MOIS vue de l'interface (étape 20 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * GET /api/predictions/calibration[?mois=AAAA-MM]   LECTURE SEULE : le bilan
 *     du mois demandé (le mois en cours par défaut) — figé tel qu'il a été
 *     figé, jamais recalculé ; le mois en cours tel que l'actualisation l'a
 *     PRÉPARÉ (data/runtime/calibration-en-cours.json) ; sinon `bilan: null`
 *     et la raison dans `preparation` (« pas encore mesuré ») —, la liste des
 *     mois figés (leurs chiffres clés, pour l'évolution), les mois qu'on peut
 *     regarder, le prochain gel, les règles du calcul (tranches, juge) et la
 *     provenance (src/data/calibration.js). 400 : mois illisible ou à venir ;
 *     503 : la base ne se lit pas à cet instant (la page le dit et garde ses
 *     tableaux). RIEN N'EST CALCULÉ dans la requête (étape 24 : le calcul de
 *     6 s au premier appel, c'était lui) ; le gel et la préparation n'ont pas
 *     de route : c'est l'étape « calibrationMensuelle » de l'actualisation,
 *     seule à écrire.
 * -----------------------------------------------------------------------
 */

import { calibrationPourLaRoute, CalibrationInvalide } from '../../data/calibration.js';
import { ApiError } from '../middlewares/errorHandler.js';

export async function getCalibration(req, res) {
  const brut = req.query?.mois;
  if (brut !== undefined && typeof brut !== 'string') throw new ApiError(400, 'Le paramètre « mois » doit être un seul mois, AAAA-MM.');
  const mois = typeof brut === 'string' && brut.trim() ? brut.trim() : null;
  try {
    res.json(await calibrationPourLaRoute({ mois }));
  } catch (error) {
    if (error instanceof CalibrationInvalide) throw new ApiError(400, error.message);
    throw new ApiError(503, `Calibration indisponible pour l’instant : ${String(error?.message ?? error).slice(0, 300)}`);
  }
}
