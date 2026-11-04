import { httpClient } from './httpClient.js';

// Étape 39 (lot 1a) : plus aucun `bankroll` dans la requête — la mise de l'analyse (son objet `mise`) est calculée par le
// serveur sur le capital de Pierre, s'il l'a réglé ; sinon en part du capital seulement.
export const analysisApi = {
  analyzeMatchById: (matchId, source, { includeCorners = false } = {}) =>
    httpClient.get(`/analysis/match/${encodeURIComponent(matchId)}?source=${source}&includeCorners=${includeCorners}`)
};
