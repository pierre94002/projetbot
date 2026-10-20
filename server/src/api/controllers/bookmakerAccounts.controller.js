/**
 * bookmakerAccounts.controller.js — les fiches de vos comptes bookmakers (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * GET /api/bookmaker-accounts        une ligne par bookmaker de Pierre (Réglages
 *                                    › Paramètres du moteur), sa fiche ou null
 * PUT /api/bookmaker-accounts/:cle   { soldeDeclare, miseMaxAcceptee, limitation }
 *                                    — idempotent ; une fiche vide est retirée
 * Un réglage NON SECRET : jamais d'identifiant, de mot de passe ni de courriel
 * (refusés en 400, rien d'écrit). La fiche sert à SIGNALER un pari au-delà de
 * la mise acceptée — jamais à le refuser ni à agir sur un compte.
 * -----------------------------------------------------------------------
 */

import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { titreBookmaker, vosBookmakersDe, TITRES_BOOKMAKERS } from '../../core/engine/vosBookmakers.js';
import { ErreurGardeFous, LIMITATIONS } from '../../core/risk/gardeFous.js';
import { lireComptes, enregistrerCompte, CHAMPS_FICHE, BORNES_FICHE } from '../../data/repositories/comptesBookmakersRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

const enApiError = (error) => (error instanceof ErreurGardeFous ? new ApiError(error.statut, error.message) : error);

/** Vos bookmakers : ceux cochés dans Réglages (sinon la liste connue), plus ceux qui ont déjà une fiche. */
function vosBookmakers(comptes = {}) {
  const vos = vosBookmakersDe(getEngineConfig('football'));
  return [...new Set([...vos, ...Object.keys(comptes)])];
}

function vue(lu) {
  return {
    bookmakers: vosBookmakers(lu.comptes).map((cle) => ({ cle, titre: titreBookmaker(cle), fiche: lu.comptes[cle] ?? null })),
    limitations: LIMITATIONS,
    champs: CHAMPS_FICHE,
    bornes: BORNES_FICHE,
    source: lu.source,
    fichier: lu.fichier,
    champsIgnores: lu.champsIgnores ?? 0
  };
}

export function getBookmakerAccounts(req, res) {
  try {
    res.json(vue(lireComptes()));
  } catch (error) {
    throw enApiError(error);
  }
}

export function putBookmakerAccount(req, res) {
  try {
    const cle = String(req.params.cle ?? '');
    const lu = lireComptes();
    const autorises = [...new Set([...vosBookmakers(lu.comptes), ...Object.keys(TITRES_BOOKMAKERS)])];
    const r = enregistrerCompte(cle, req.body, { autorises });
    res.json({ ...vue(lireComptes()), enregistre: { cle: r.cle, titre: titreBookmaker(r.cle), fiche: r.fiche, ecrit: r.ecrit } });
  } catch (error) {
    throw enApiError(error);
  }
}
