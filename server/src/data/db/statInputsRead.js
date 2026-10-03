/**
 * statInputsRead.js — ce que chaque équipe produit et concède en corners,
 * tirs et tirs cadrés AVANT un match, lu dans le magasin : les entrées des
 * marchés de statistiques du moteur (cf. sports/football/statMarkets.js).
 * -----------------------------------------------------------------------
 * Ses 10 derniers matchs relevés, toutes compétitions, au moins 6 : c'est le
 * réglage mesuré le 01/10/2026 sur 36 400 matchs (étude du scratchpad, rejouée
 * sans fuite). Clubs par identifiant FotMob, jamais par nom (cf.
 * identityRegistry.js). Un 0 des deux côtés veut dire « non relevé » dans
 * team_stats (cf. settlementService.js), jamais « zéro corner ».
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { clubDuMagasin } from './oddsProfileRead.js';

export const STAT_SAMPLE = 10;
export const STAT_MIN_SAMPLE = 6;

const COLONNES = { corners: ['hc', 'ac'], shots: ['hs', 'as_'], shotsOnTarget: ['hsot', 'asot'] };

// Deux requêtes indexées (domicile, extérieur) plutôt qu'un OR qui balaierait la table par date.
const SELECTION = `SELECT m.date, m.home_id AS homeId,
         th.corner_kicks AS hc, ta.corner_kicks AS ac, th.total_shots AS hs, ta.total_shots AS as_,
         th.shots_on_goal AS hsot, ta.shots_on_goal AS asot
       FROM matches m
       JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
       JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'`;

function moyennesEquipe(teamId, avant, database) {
  const rows = database
    .prepare(
      `SELECT * FROM (${SELECTION} WHERE m.home_id = ? AND m.date < ? AND m.home_goals IS NOT NULL ORDER BY m.date DESC LIMIT 30)
       UNION ALL
       SELECT * FROM (${SELECTION} WHERE m.away_id = ? AND m.date < ? AND m.home_goals IS NOT NULL ORDER BY m.date DESC LIMIT 30)
       ORDER BY date DESC`
    )
    .all(teamId, avant, teamId, avant);
  const moyenne = (valeurs) => valeurs.reduce((s, x) => s + x, 0) / valeurs.length;
  const out = {};
  for (const [stat, [hk, ak]] of Object.entries(COLONNES)) {
    const releves = rows
      .filter((r) => r[hk] != null && r[ak] != null && !(Number(r[hk]) === 0 && Number(r[ak]) === 0))
      .slice(0, STAT_SAMPLE);
    if (releves.length < STAT_MIN_SAMPLE) {
      out[stat] = null;
      continue;
    }
    const aDomicile = (r) => String(r.homeId) === String(teamId);
    out[stat] = {
      for: moyenne(releves.map((r) => Number(aDomicile(r) ? r[hk] : r[ak]))),
      against: moyenne(releves.map((r) => Number(aDomicile(r) ? r[ak] : r[hk]))),
      sample: releves.length
    };
  }
  return out;
}

/**
 * `{ home: { corners, shots, shotsOnTarget }, away: {...} }`, chaque entrée
 * `{ for, against, sample }` ou `null` faute de 6 relevés ; `null` en entier
 * si l'une des deux équipes est inconnue du magasin.
 */
export function statInputsFromStore({ homeName, awayName, league = null, beforeDate, database = openDb() }) {
  const homeId = clubDuMagasin(homeName, league, database);
  const awayId = clubDuMagasin(awayName, league, database);
  if (!homeId || !awayId) return null;
  return { home: moyennesEquipe(homeId, beforeDate, database), away: moyennesEquipe(awayId, beforeDate, database) };
}
