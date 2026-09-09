import { getFixturesStatus } from '../../data/repositories/fixturesRepository.js';
import { DATA_SOURCE_KEYS } from '../../data/matchSources.js';
import { refreshLiveOdds, refreshLiveCompetitions } from '../../data/providers/liveDataSync.js';

export function listSources(req, res) {
  res.json({ sources: DATA_SOURCE_KEYS, fixtures: getFixturesStatus() });
}

/** Rafraîchit les cotes en direct depuis The Odds API — consomme du quota, jamais automatique. */
export async function postRefreshOdds(req, res) {
  const result = await refreshLiveOdds();
  res.json(result);
}

/** Rafraîchit la liste des compétitions en direct depuis football-data.org. */
export async function postRefreshCompetitions(req, res) {
  const result = await refreshLiveCompetitions();
  res.json(result);
}
