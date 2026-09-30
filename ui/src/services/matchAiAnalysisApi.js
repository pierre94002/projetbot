import { httpClient } from './httpClient.js';

export const matchAiAnalysisApi = {
  getStatus: () => httpClient.get('/match-ai-analysis/status'),
  getAll: () => httpClient.get('/match-ai-analysis'),
  getForMatch: (matchId) => httpClient.get(`/match-ai-analysis/match/${encodeURIComponent(matchId)}`),
  // Page de match : retrouvée par équipes, compétition et date (cf. getForFixture côté serveur).
  getForFixture: ({ home, away, league, date }) => {
    const params = new URLSearchParams({ home, away, date });
    if (league) params.set('league', league);
    return httpClient.get(`/match-ai-analysis/fixture?${params.toString()}`);
  },
  runPreMatch: (matchId, { home, away, league, engineResult }) =>
    httpClient.post(`/match-ai-analysis/match/${encodeURIComponent(matchId)}`, { home, away, league, engineResult }),
  runPostMatch: (matchId) => httpClient.post(`/match-ai-analysis/match/${encodeURIComponent(matchId)}/post-match-review`)
};
