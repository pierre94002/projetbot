import { httpClient } from './httpClient.js';

// Stats complètes d'équipe + stats joueurs match par match, importées chaque
// matin à 7h30 (cf. server/scripts/merge-match-stats.mjs).
export const matchStatsApi = {
  listByTeam: (name, limit) => httpClient.get(`/match-stats/team?name=${encodeURIComponent(name)}${limit ? `&limit=${limit}` : ''}`),
  getTeamAverages: (name, sampleSize) =>
    httpClient.get(`/match-stats/team-averages?name=${encodeURIComponent(name)}${sampleSize ? `&sampleSize=${sampleSize}` : ''}`),
  get: (matchId) => httpClient.get(`/match-stats/${encodeURIComponent(matchId)}`),
  status: () => httpClient.get('/match-stats/status')
};
