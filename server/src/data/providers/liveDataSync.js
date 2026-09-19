import { getSportOddsRaw } from './oddsApiClient.js';
import { getCompetitionsRaw } from './footballDataClient.js';
import { saveOddsMatches, saveCompetitions } from '../repositories/fixturesRepository.js';

/**
 * Championnats suivis par CôteMaster côté The Odds API. Liste choisie le
 * 2026-09-14 (5 grands championnats + leurs 2e divisions + coupes
 * européennes) — remplace un premier choix arbitraire (La Liga/EFL Cup/
 * Russie/Chine) qui ne correspondait à aucun besoin précis.
 *
 * Volontairement ABSENTS, faute de données exploitables :
 * - League One et League Two (3e et 4e divisions anglaises), retirées le
 *   2026-09-19 : les cotes existent, mais aucune source d'historique ni de
 *   statistiques ne les couvre (38 des 48 équipes n'avaient strictement
 *   aucune donnée), donc le moteur n'avait rien pour les analyser.
 * - La Serie C italienne, absente du catalogue de The Odds API (vérifié via
 *   GET /v4/sports).
 *
 * Chaque entrée consomme un crédit par appel (plan gratuit "Starter" :
 * 500/mois), sans rafraîchissement automatique ailleurs dans l'appli (cf.
 * oddsApiClient.js) — ajoutez-en ici si besoin, en gardant un œil sur le
 * quota restant renvoyé par chaque appel.
 */
export const TRACKED_SPORT_KEYS = [
  'soccer_epl',
  'soccer_efl_champ',
  'soccer_england_efl_cup',
  'soccer_spain_la_liga',
  'soccer_spain_segunda_division',
  'soccer_italy_serie_a',
  'soccer_italy_serie_b',
  'soccer_germany_bundesliga',
  'soccer_germany_bundesliga2',
  'soccer_france_ligue_one',
  'soccer_france_ligue_two',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league'
];

/**
 * Récupère les cotes en direct pour chaque championnat suivi et remplace
 * l'instantané local (server/data/fixtures/odds/odds-snapshot.json). Ne se
 * déclenche jamais automatiquement : uniquement sur action explicite de
 * l'utilisateur, pour préserver le quota mensuel. Une compétition en échec
 * (coupe entre deux tours, clé hors saison) n'annule pas les autres : on
 * sauvegarde ce qui a répondu et on remonte la liste des échecs.
 */
export async function refreshLiveOdds() {
  const allMatches = [];
  const sportsRefreshed = [];
  const failures = [];
  let lastQuota = null;

  for (const sportKey of TRACKED_SPORT_KEYS) {
    try {
      const { matches, quota } = await getSportOddsRaw(sportKey);
      allMatches.push(...matches);
      sportsRefreshed.push(sportKey);
      lastQuota = quota ?? lastQuota;
    } catch (error) {
      failures.push({ sportKey, message: error.message });
    }
  }

  if (!sportsRefreshed.length) {
    throw new Error(`Aucune compétition n'a pu être rafraîchie : ${failures.map((f) => `${f.sportKey} (${f.message})`).join(' ; ')}`);
  }

  saveOddsMatches(allMatches);
  return { matchesFetched: allMatches.length, sportsRefreshed, failures, quota: lastQuota };
}

/** Récupère la liste des compétitions en direct et remplace l'instantané local. */
export async function refreshLiveCompetitions() {
  const competitions = await getCompetitionsRaw();
  saveCompetitions(competitions);
  return { competitionsFetched: competitions.length };
}
