import { httpClient } from './httpClient.js';

export const analysisApi = {
  analyzeMatchById: (matchId, source, bankroll, { includeCorners = false } = {}) =>
    httpClient.get(
      `/analysis/match/${encodeURIComponent(matchId)}?source=${source}&bankroll=${bankroll}&includeCorners=${includeCorners}`
    )
};
