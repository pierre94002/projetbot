import { httpClient } from './httpClient.js';

export const teamStatsApi = {
  search: (query) => httpClient.get(`/team-stats/search?query=${encodeURIComponent(query)}`),
  getGoals: (teamId, league, season) => httpClient.get(`/team-stats/${teamId}/goals?league=${league}&season=${season}`),
  getCorners: (teamId, league, season, sampleSize) =>
    httpClient.get(`/team-stats/${teamId}/corners?league=${league}&season=${season}${sampleSize ? `&sampleSize=${sampleSize}` : ''}`),
  getBulkForm: (matches) => httpClient.post('/team-stats/form/bulk', { matches }),
  getFullHistoryByName: (name, league) =>
    httpClient.get(`/team-stats/form-by-name?name=${encodeURIComponent(name)}&league=${encodeURIComponent(league)}&full=true`),
  getFixtureStatistics: (fixtureId) => httpClient.get(`/team-stats/fixtures/${fixtureId}/statistics`),
  getAverageStatsByName: (name, league, sampleSize = 10) =>
    httpClient.get(
      `/team-stats/average-stats-by-name?name=${encodeURIComponent(name)}&league=${encodeURIComponent(league)}&sampleSize=${sampleSize}`
    ),
  getLineupsByName: (name, commenceTime, away, league) =>
    httpClient.get(
      `/team-stats/lineups-by-name?name=${encodeURIComponent(name)}&commenceTime=${encodeURIComponent(commenceTime)}` +
        (away ? `&away=${encodeURIComponent(away)}` : '') +
        (league ? `&league=${encodeURIComponent(league)}` : '')
    ),
  getLiveMatchByName: (name, commenceTime) =>
    httpClient.get(`/team-stats/live-match-by-name?name=${encodeURIComponent(name)}&commenceTime=${encodeURIComponent(commenceTime)}`),
  getPlayersByName: (name, season, league) =>
    httpClient.get(
      `/team-stats/players-by-name?name=${encodeURIComponent(name)}${season ? `&season=${season}` : ''}${league ? `&league=${encodeURIComponent(league)}` : ''}`
    )
};
