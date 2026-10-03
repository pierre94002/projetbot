/**
 * teamIdResolver.js — l'identifiant FotMob d'un club à partir de son nom et
 * de sa compétition, pour afficher son logo partout où l'appli montre une
 * rencontre (demande de Pierre le 01/10/2026 : « ce design partout où il y a
 * des rencontres »).
 * -----------------------------------------------------------------------
 * Les listes de l'appli viennent souvent de sources qui n'ont que des noms
 * (cotes, calendrier, pronostics, paris) : on les rapproche du magasin comme
 * partout ailleurs, par compétition, homonymes compris (cf. clubDuMagasin) —
 * jamais par ressemblance approximative. Résultats gardés quelques heures :
 * la page Matchs en redemande plusieurs centaines à chaque affichage.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { clubDuMagasin } from './oddsProfileRead.js';

const cache = new Map(); // `${league}\u0000${name}` -> { id, le }
const DUREE_MS = 6 * 3_600_000;
/** Au-delà, une demande est tronquée : l'interface redemande le reste. */
export const MAX_PAR_DEMANDE = 400;

/** [{ name, league }] -> [{ name, league, teamId }] (teamId null si le club est inconnu du magasin). */
export function resolveTeamIds(teams, { database = openDb() } = {}) {
  const out = [];
  for (const t of teams.slice(0, MAX_PAR_DEMANDE)) {
    const name = String(t?.name ?? '').trim();
    if (!name) continue;
    const league = t?.league ? String(t.league) : null;
    const cle = `${league ?? ''}\u0000${name}`;
    const connu = cache.get(cle);
    if (connu && Date.now() - connu.le < DUREE_MS) {
      out.push({ name, league, teamId: connu.id });
      continue;
    }
    let id = null;
    try {
      id = clubDuMagasin(name, league, database);
    } catch {
      id = null;
    }
    cache.set(cle, { id, le: Date.now() });
    out.push({ name, league, teamId: id });
  }
  return out;
}
