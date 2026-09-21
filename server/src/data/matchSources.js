import { adaptOddsApiMatch, indexCompetitionsByName } from './adapters/oddsApiAdapter.js';
import { adaptSampleMatch } from './adapters/sampleMatchAdapter.js';
import { adaptSeasonCalendarMatch } from './adapters/seasonCalendarAdapter.js';
import { loadOddsMatches, loadCompetitions, loadSampleMatches } from './repositories/fixturesRepository.js';
import { listSeasonCalendar } from './repositories/seasonCalendarRepository.js';

export const DATA_SOURCE_KEYS = ['odds-api', 'sample'];

/** Fenêtre autour du prochain match d'une compétition : une journée de championnat s'étale du vendredi au lundi. */
const MATCHDAY_SPAN_DAYS = 4;

/**
 * Complète les matchs cotés par la PROCHAINE JOURNÉE des compétitions qui
 * n'ont aucune cote.
 *
 * Les bookmakers n'ouvrent les divisions inférieures et les marchés
 * secondaires qu'à l'approche du coup d'envoi : la Russie, la Chine, la
 * Bundesliga 2 et la Ligue 2 disparaissaient donc totalement de la page
 * Matchs pendant des semaines, alors que leur calendrier, leur classement et
 * leurs statistiques sont complets en local.
 *
 * Volontairement limité à la prochaine journée : le calendrier contient
 * jusqu'à 469 rencontres à venir pour une seule compétition, les verser
 * entières rendrait la liste inutilisable. Les compétitions DÉJÀ cotées ne
 * sont pas complétées du tout — sans quoi un même match apparaîtrait deux
 * fois, une fois avec sa cote et une fois sans.
 */
function listUpcomingCalendarMatches(coveredLeagues, bankroll) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = listSeasonCalendar({ allSeasons: true }).filter(
    (entry) => entry.status !== 'finished' && entry.date >= today && entry.league && !coveredLeagues.has(entry.league)
  );

  const firstDateByLeague = new Map();
  for (const entry of upcoming) {
    const known = firstDateByLeague.get(entry.league);
    if (!known || entry.date < known) firstDateByLeague.set(entry.league, entry.date);
  }

  const out = [];
  for (const entry of upcoming) {
    const first = firstDateByLeague.get(entry.league);
    const dayGap = (Date.parse(entry.date) - Date.parse(first)) / 86400000;
    if (dayGap > MATCHDAY_SPAN_DAYS) continue;
    const adapted = adaptSeasonCalendarMatch(entry, bankroll);
    if (adapted) out.push(adapted);
  }
  return out;
}

/**
 * Point d'entrée unique pour charger et adapter les matchs d'une source de
 * données vers le contrat d'entrée du moteur. Utilisé à la fois pour la
 * navigation des matchs (UI) et pour l'exécution du pipeline complet.
 */
export function listAdaptedMatches(source, bankroll = 10000) {
  if (source === 'sample') {
    return loadSampleMatches().map((rawMatch) => adaptSampleMatch(rawMatch, bankroll));
  }
  if (source === 'odds-api') {
    const competitionsByName = indexCompetitionsByName(loadCompetitions());
    const priced = loadOddsMatches()
      .map((rawMatch) => adaptOddsApiMatch(rawMatch, competitionsByName, bankroll))
      .filter(Boolean)
      .map((match) => ({ ...match, hasOdds: true }));

    const covered = new Set(priced.map((match) => match.league).filter(Boolean));
    return [...priced, ...listUpcomingCalendarMatches(covered, bankroll)];
  }
  throw new Error(`Source de données inconnue : ${source}`);
}
