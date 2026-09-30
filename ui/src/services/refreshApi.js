import { httpClient } from './httpClient.js';

// Actualisation complète de l'appli (server/src/jobs/matchStatsAutoRefresh.js) :
// état, dernières passes, lancement manuel, correction des statuts anciens
// qui contredisent un score final sûr.
export const refreshApi = {
  overview: () => httpClient.get('/refresh'),
  run: () => httpClient.post('/refresh', {}),
  resettle: (keys) => httpClient.post('/refresh/resettle', { keys })
};
