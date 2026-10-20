/**
 * cotesVosBookmakers.controller.js — les cotes de VOS bookmakers : fraîches, archivées, saisies (étape 7 du plan).
 * -----------------------------------------------------------------------
 * GET /api/odds/fraicheur          le réglage de fraîcheur (délai, règle des
 *                                  compositions), d'où il vient.
 * PUT /api/odds/fraicheur          { maxAgeMinutes, avantCompos } : enregistré
 *                                  dans data/runtime/fraicheur-cotes.json ;
 *                                  idempotent ; 400 si refusé.
 * GET /api/odds/conseil-releve     LECTURE SEULE : quand un relevé payant vaut
 *                                  le coup (championnats, crédits, moment).
 *                                  Ne lance AUCUN relevé : le bouton reste
 *                                  celui de Réglages › Données.
 * GET /api/odds/saisies?matchId=   les cotes saisies d'un match, avec leur value,
 *                                  leur heure et leur fraîcheur.
 * PUT /api/odds/saisies            { matchId, bookmaker, marketId, sens, ligne,
 *                                  equipe, joueur, cote } : saisie ou correction,
 *                                  idempotente ; 400 si refusée, 404 si le match
 *                                  est introuvable.
 * PUT /api/odds/saisies/retrait    { matchId, cle } : retire une saisie,
 *                                  idempotent ; 404 si la saisie est inconnue.
 * Aucune de ces routes n'appelle The Odds API, ni aucune API payante, ni Claude.
 * -----------------------------------------------------------------------
 */

import { lireReglageFraicheur, enregistrerReglageFraicheur, ReglageFraicheurInvalide } from '../../data/repositories/fraicheurCotesRepository.js';
import { BORNES_DELAI_MINUTES, REGLAGE_FRAICHEUR_DEFAUT, COMPOS_ANNONCEES_MINUTES } from '../../core/engine/fraicheurCotes.js';
import { conseilReleveActuel } from '../../data/conseilReleve.js';
import { etatDesSaisies, enregistrerSaisie, retirerSaisie, SaisieInvalide, SaisieIntrouvable } from '../../data/saisiesCotes.js';
import { ApiError } from '../middlewares/errorHandler.js';

const etatReglage = () => ({ ...lireReglageFraicheur(), defaut: REGLAGE_FRAICHEUR_DEFAUT, bornes: BORNES_DELAI_MINUTES, composAnnonceesMinutes: COMPOS_ANNONCEES_MINUTES });

export function getFraicheur(req, res) {
  res.json(etatReglage());
}

export function putFraicheur(req, res) {
  const { maxAgeMinutes, avantCompos } = req.body ?? {};
  let r;
  try {
    r = enregistrerReglageFraicheur({ maxAgeMinutes, avantCompos });
  } catch (error) {
    if (error instanceof ReglageFraicheurInvalide) throw new ApiError(400, error.message);
    throw error;
  }
  res.json({ ...etatReglage(), enregistrement: { change: r.change, fichier: r.fichier, misDeCote: r.misDeCote ?? null } });
}

export function getConseilReleve(req, res) {
  res.json(conseilReleveActuel());
}

/** Les erreurs de la saisie, dans leur code HTTP. */
function traduire(error) {
  if (error instanceof SaisieInvalide) return new ApiError(400, error.message);
  if (error instanceof SaisieIntrouvable) return new ApiError(404, error.message);
  return error;
}

export async function getSaisies(req, res) {
  try {
    res.json(await etatDesSaisies({ matchId: req.query.matchId, source: req.query.source || 'odds-api' }));
  } catch (error) {
    throw traduire(error);
  }
}

export async function putSaisie(req, res) {
  try {
    res.json(await enregistrerSaisie(req.body ?? {}));
  } catch (error) {
    throw traduire(error);
  }
}

export async function putRetraitSaisie(req, res) {
  try {
    res.json(await retirerSaisie(req.body ?? {}));
  } catch (error) {
    throw traduire(error);
  }
}
