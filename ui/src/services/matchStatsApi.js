import { httpClient } from './httpClient.js';

// Stats complètes d'équipe + stats joueurs match par match, importées chaque
// matin à 7h30 (cf. server/scripts/merge-match-stats.mjs).
export const matchStatsApi = {
  listByTeam: (name, limit) => httpClient.get(`/match-stats/team?name=${encodeURIComponent(name)}${limit ? `&limit=${limit}` : ''}`),
  getTeamAverages: (name, sampleSize) =>
    httpClient.get(`/match-stats/team-averages?name=${encodeURIComponent(name)}${sampleSize ? `&sampleSize=${sampleSize}` : ''}`),
  get: (matchId) => httpClient.get(`/match-stats/${encodeURIComponent(matchId)}`),
  status: () => httpClient.get('/match-stats/status'),
  // Couverture par championnat et état du rafraîchissement automatique
  // (cf. server/src/jobs/matchStatsAutoRefresh.js).
  coverage: () => httpClient.get('/match-stats/coverage'),
  refresh: (limit) => httpClient.post('/match-stats/refresh', limit ? { limit } : {}),
  // Classement des joueurs d'une compétition, agrégé par la base — distinct
  // de teamStatsApi.getPlayersByName, qui interroge API-Football (plan
  // gratuit limité à 2024, et qui ne couvre pas tous les championnats).
  seasons: (league) => httpClient.get(`/match-stats/seasons?league=${encodeURIComponent(league)}`),
  players: (league, { season = null, team = null, minMinutes = null, limit = null } = {}) => {
    const params = new URLSearchParams({ league });
    if (season) params.set('season', season);
    if (team) params.set('team', team);
    if (minMinutes) params.set('minMinutes', minMinutes);
    if (limit) params.set('limit', limit);
    return httpClient.get(`/match-stats/players?${params}`);
  }
};
