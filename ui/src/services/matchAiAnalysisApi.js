import { httpClient } from './httpClient.js';

export const matchAiAnalysisApi = {
  getForMatch: (matchId) => httpClient.get(`/match-ai-analysis/match/${encodeURIComponent(matchId)}`),
  runPreMatch: (matchId, { home, away, league, engineResult }) =>
    httpClient.post(`/match-ai-analysis/match/${encodeURIComponent(matchId)}`, { home, away, league, engineResult }),
  runPostMatch: (matchId) => httpClient.post(`/match-ai-analysis/match/${encodeURIComponent(matchId)}/post-match-review`)
};
