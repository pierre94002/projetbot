import { httpClient } from './httpClient.js';

export const sourcesApi = {
  list: () => httpClient.get('/sources'),
  refreshOdds: () => httpClient.post('/sources/odds/refresh'),
  // Relevé ciblé (18/11/2026) : seulement les championnats de la vague, sur le clic confirmé de Pierre (Réglages).
  refreshOddsCible: (cles) => httpClient.post('/sources/odds/refresh-cible', { cles }),
  refreshCompetitions: () => httpClient.post('/sources/competitions/refresh')
};
