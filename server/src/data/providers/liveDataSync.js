import { getSportOddsRaw } from './oddsApiClient.js';
import { getCompetitionsRaw } from './footballDataClient.js';
import { saveOddsMatches, saveCompetitions } from '../repositories/fixturesRepository.js';

/**
 * Championnats suivis par CôteMaster côté The Odds API. Volontairement
 * restreint (chaque entrée consomme des crédits sur le plan gratuit) —
 * ajoutez-en ici si besoin, en gardant un œil sur le quota restant renvoyé
 * par chaque appel.
 */
export const TRACKED_SPORT_KEYS = [
  'soccer_spain_la_liga',
  'soccer_england_efl_cup',
  'soccer_china_superleague',
  'soccer_russia_premier_league'
];

/**
 * Récupère les cotes en direct pour chaque championnat suivi et remplace
 * l'instantané local (server/data/fixtures/odds/odds-snapshot.json). Ne se
 * déclenche jamais automatiquement : uniquement sur action explicite de
 * l'utilisateur, pour préserver le quota mensuel.
 */
export async function refreshLiveOdds() {
  const allMatches = [];
  let lastQuota = null;

  for (const sportKey of TRACKED_SPORT_KEYS) {
    const { matches, quota } = await getSportOddsRaw(sportKey);
    allMatches.push(...matches);
    lastQuota = quota;
  }

  saveOddsMatches(allMatches);
  return { matchesFetched: allMatches.length, sportsRefreshed: TRACKED_SPORT_KEYS, quota: lastQuota };
}

/** Récupère la liste des compétitions en direct et remplace l'instantané local. */
export async function refreshLiveCompetitions() {
  const competitions = await getCompetitionsRaw();
  saveCompetitions(competitions);
  return { competitionsFetched: competitions.length };
}
