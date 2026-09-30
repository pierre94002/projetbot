/**
 * teamNewsResolver.js — ce que le calcul ne voit pas : blessures, suspensions,
 * changement d'entraîneur.
 * -----------------------------------------------------------------------
 * Gratuit, FotMob seul, jamais dans le pronostic chiffré ni la mise —
 * uniquement en lecture pour l'analyse IA avant-match (cf.
 * matchAiAnalysisService.js), comme le rappelle son propre prompt : le
 * marché intègre déjà ce genre d'information plus vite qu'un flux ne pourrait
 * la lui apporter (mesuré le 23/09/2026, cf. memory moteur 2026). Ici, il ne
 * s'agit que du COMMENTAIRE écrit pour Pierre, pas du calcul.
 *
 *   - BLESSURES ET SUSPENSIONS : liste `unavailable` de fetchProbableLineup,
 *     connue dès plusieurs jours avant le coup d'envoi (donnée d'effectif,
 *     pas de match). `internationalDuty` (en sélection) est écarté : ce
 *     n'est pas une actualité, c'est une semaine normale de calendrier.
 *   - CHANGEMENT D'ENTRAÎNEUR : reconstitué à partir des noms d'entraîneur
 *     déjà connus du magasin (matchs déjà importés) et, si connu, de celui
 *     du match en cours — PAS un flux d'actualité dédié, seulement ce que
 *     les compositions déjà vues laissent déduire. Silence total est
 *     possible (aucune composition récente en magasin) : ce n'est pas la
 *     preuve qu'il n'y a pas eu de changement, seulement qu'on ne sait pas.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { fetchProbableLineup } from './fotMobProvider.js';
import { resolveFotMobMatchId } from './lineupPrefetch.js';

/** Actualités écartées du commentaire : une semaine en sélection n'en est pas une. */
const TYPES_IGNORES = new Set(['internationalDuty']);

const LABEL_TYPE = { injury: 'blessure', suspension: 'suspension' };

function traduireAbsences(liste) {
  return (liste ?? [])
    .filter((a) => !TYPES_IGNORES.has(a.type))
    .map((a) => ({ name: a.name, type: LABEL_TYPE[a.type] ?? a.type ?? 'indisponible', expectedReturn: a.expectedReturn ?? null }));
}

/**
 * Les noms d'entraîneur déjà connus du magasin pour cette équipe, matchs
 * les plus récents en tête, un par match (null sauté). `avant` exclut le
 * match en cours d'analyse.
 */
function coachsConnus(teamId, avant, database, limite = 15) {
  if (!teamId) return [];
  const lignes = database
    .prepare(
      `SELECT date, lineups, CASE WHEN home_id = @id THEN 'home' ELSE 'away' END AS camp
       FROM matches
       WHERE (home_id = @id OR away_id = @id) AND date < @avant AND lineups IS NOT NULL
       ORDER BY date DESC LIMIT @limite`
    )
    .all({ id: teamId, avant, limite });
  const noms = [];
  for (const r of lignes) {
    try {
      const coach = JSON.parse(r.lineups)?.[r.camp]?.coach;
      if (coach) noms.push({ date: r.date, coach });
    } catch {
      // Ligne JSON corrompue : ignorée plutôt que de faire échouer la lecture.
    }
  }
  return noms;
}

/**
 * Changement d'entraîneur détecté depuis les compositions déjà vues, plus
 * celle du match analysé si elle est connue. `null` si rien n'est
 * détectable (silence, pas une preuve d'absence de changement).
 */
function detecterChangement(teamId, coachActuel, avant, database) {
  const historique = coachsConnus(teamId, avant, database);
  // Chronologique (plus ancien d'abord), puis le match analysé à la fin s'il
  // est connu — seuls les changements RÉELS comptent, pas une simple
  // répétition du même nom d'un match à l'autre.
  const suite = [...historique].reverse().map((h) => h.coach);
  if (coachActuel) suite.push(coachActuel);
  const distincts = suite.filter((nom, i) => i === 0 || nom !== suite[i - 1]);
  if (distincts.length < 2) return null;
  const [previousCoach, currentCoach] = distincts.slice(-2);
  // Date approximative : le match le plus récent où l'ancien nom apparaît
  // encore, dans l'historique déjà en magasin.
  const dernierAvecAncien = historique.find((h) => h.coach === previousCoach)?.date ?? null;
  return { previousCoach, currentCoach, since: dernierAvecAncien };
}

/**
 * Actualités d'équipe pour un match, par noms (n'importe quelle source).
 * `null` par équipe si le match n'est pas identifiable chez FotMob — jamais
 * une erreur qui ferait échouer l'analyse IA autour.
 *
 * @returns {{home: object|null, away: object|null}}
 */
export async function resolveTeamNews({ homeName, awayName, commenceTimeIso, league, database = openDb() }) {
  const vide = { home: null, away: null };
  if (!commenceTimeIso) return vide;

  let trouve;
  try {
    trouve = await resolveFotMobMatchId({ homeName, awayName, commenceTimeIso, league, database });
  } catch {
    return vide;
  }
  if (!trouve) return vide;

  const lineup = await fetchProbableLineup(trouve.matchId).catch(() => null);
  if (!lineup || (!lineup.home && !lineup.away)) return vide;

  const jour = String(commenceTimeIso).slice(0, 10);
  const cote = (team, teamName) => {
    if (!team) return null;
    const absences = traduireAbsences(team.unavailable);
    const changement = detecterChangement(team.teamId, team.coach, jour, database);
    if (!absences.length && !changement) return null;
    return {
      teamName: team.teamName ?? teamName,
      longTermAbsences: absences,
      coachChange: changement
    };
  };

  return { home: cote(lineup.home, homeName), away: cote(lineup.away, awayName) };
}
