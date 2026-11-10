/**
 * effectif.controller.js — LES ARRIVÉES ET DÉPARTS d'un club, vus de l'interface (étape 35 du plan, lot 1b, 10/11/2026 : la carte
 * « Arrivées et départs » de la page de l'équipe).
 * -----------------------------------------------------------------------
 * GET /api/match-stats/effectif?club=<numéro>   LECTURE SEULE : la ligne que la passe de nuit des débuts de saison a rangée pour ce
 *                                              club (table debuts_clubs), les noms et pays de ses joueurs (l'annuaire), les clubs
 *                                              où un départ a été vu jouer — par identifiants FotMob seulement, jamais par un nom.
 *                                              Ne calcule rien, n'écrit rien, n'appelle ni FotMob ni Claude. Le module de lecture
 *                                              est chargé par import() DYNAMIQUE : s'il casse, cette route répond « illisible » et
 *                                              rien d'autre n'est touché. EXPLICATION SEULEMENT : le moteur ne lit pas l'effectif.
 * -----------------------------------------------------------------------
 */

import { openDb, resolveDbPath } from '../../data/db/matchStatsDb.js';
import { ApiError, requireStringParam } from '../middlewares/errorHandler.js';

export async function getEffectif(req, res) {
  const club = requireStringParam(req.query.club, 'club');
  if (!/^(fotmob-)?[1-9]\d*$/.test(club)) throw new ApiError(400, `Le paramètre "club" doit être un identifiant FotMob (« fotmob-123 » ou 123), reçu « ${club} ».`);
  let lecture;
  try {
    const { effectifDuClub } = await import('../../data/debutsDeSaison/debutsRead.js');
    lecture = effectifDuClub({ club, database: openDb() });
  } catch {
    lecture = { version: 1, etat: 'illisible', raison: 'lecture-ratee' };
  }
  res.json({ ...lecture, base: resolveDbPath(), generatedAt: new Date().toISOString() });
}
