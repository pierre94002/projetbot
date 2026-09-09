import { adaptOddsApiMatch, indexCompetitionsByName } from './adapters/oddsApiAdapter.js';
import { adaptSampleMatch } from './adapters/sampleMatchAdapter.js';
import { loadOddsMatches, loadCompetitions, loadSampleMatches } from './repositories/fixturesRepository.js';

export const DATA_SOURCE_KEYS = ['odds-api', 'sample'];

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
    return loadOddsMatches()
      .map((rawMatch) => adaptOddsApiMatch(rawMatch, competitionsByName, bankroll))
      .filter(Boolean);
  }
  throw new Error(`Source de données inconnue : ${source}`);
}
