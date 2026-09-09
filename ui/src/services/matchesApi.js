import { httpClient } from './httpClient.js';

export const matchesApi = {
  list: (source, bankroll) => httpClient.get(`/matches?source=${source}&bankroll=${bankroll}`),
  getById: (matchId, source, bankroll) => httpClient.get(`/matches/${encodeURIComponent(matchId)}?source=${source}&bankroll=${bankroll}`)
};
