/**
 * derouleMatch.controller.js — le DÉROULÉ d'un match joué, vu de l'interface (étape 45 du plan, 24/10/2026 : les « moments clés »
 * de la page d'un match).
 * -----------------------------------------------------------------------
 * GET /api/match-stats/:matchId/deroule   LECTURE SEULE : les événements déjà rangés au magasin pour ce match (buts, cartons,
 *                                         remplacements, penalties manqués), lus par la même fonction PURE que la revue
 *                                         d'après-match de l'IA (core/ai/derouleDuMatch.js, étape 43) — les faits sont donc ceux
 *                                         que l'IA reçoit, avec leurs pièges tenus (but contre son camp écrit pour l'équipe à qui il
 *                                         compte, penalty reconnu, deuxième jaune = rouge, score après chaque but, équipe « à dix »).
 *                                         Ne lance rien, n'écrit rien, n'appelle jamais Claude ni FotMob : c'est le contenu de la
 *                                         base, mis en ordre. Un match inconnu : 404. Un match sans événements : 200,
 *                                         `deroule.disponible: false` (l'écran le dit : « non publié », jamais « aucun but »).
 * -----------------------------------------------------------------------
 */

import { getMatchStatsById } from '../../data/repositories/matchStatsWebRepository.js';
import { lireDeroule } from '../../core/ai/derouleDuMatch.js';
import { resolveDbPath } from '../../data/db/matchStatsDb.js';
import { ApiError } from '../middlewares/errorHandler.js';

const estUnNombre = (x) => typeof x === 'number' && Number.isFinite(x);

export function getDerouleDuMatch(req, res) {
  const entry = getMatchStatsById(req.params.matchId);
  if (!entry) throw new ApiError(404, `Match introuvable : ${req.params.matchId}.`);
  const jouee = estUnNombre(entry.homeGoals) && estUnNombre(entry.awayGoals);
  const deroule = lireDeroule({
    events: Array.isArray(entry.events) ? entry.events : null,
    shotmap: Array.isArray(entry.shotmap) ? entry.shotmap : null,
    meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : null,
    score: jouee ? { home: entry.homeGoals, away: entry.awayGoals } : null
  });
  res.json({
    matchId: entry.matchId ?? req.params.matchId,
    date: entry.date ?? null,
    league: entry.league ?? null,
    home: { name: entry.homeName ?? null, id: entry.homeId ?? null },
    away: { name: entry.awayName ?? null, id: entry.awayId ?? null },
    jouee,
    // Les matchs lus depuis la mise en service de l'étape 43 portent les langues du texte minute par minute : c'est la marque
    // d'une lecture récente (blessures et raisons des cartons relevées). Les autres sont dits tels quels, jamais redemandés à FotMob.
    lectureRecente: typeof entry.meta?.tickerLangs === 'string',
    majLe: entry.updatedAt ?? null,
    provenance: { source: 'FotMob · événements du match rangés au magasin', fichier: resolveDbPath(), table: 'matches (colonnes events, shotmap, meta)' },
    deroule
  });
}
