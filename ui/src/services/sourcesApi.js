import { httpClient } from './httpClient.js';

export const sourcesApi = {
  list: () => httpClient.get('/sources'),
  refreshOdds: () => httpClient.post('/sources/odds/refresh'),
  refreshCompetitions: () => httpClient.post('/sources/competitions/refresh')
};
