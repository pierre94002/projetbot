import { httpClient } from './httpClient.js';

export const predictionsApi = {
  list: () => httpClient.get('/predictions'),
  record: (entries) => httpClient.post('/predictions', { entries }),
  updateStatus: (entryId, status) => httpClient.patch(`/predictions/${entryId}/status`, { status }),
  remove: (entryId) => httpClient.delete(`/predictions/${entryId}`),
  // Étape 20 du plan : la calibration d'un mois (AAAA-MM ; sans mois, le mois en cours). Lecture seule : un mois
  // écoulé est figé une fois par l'actualisation ; le mois en cours est préparé chaque nuit par elle (étape 24 :
  // la route le lit, elle ne le calcule plus).
  calibration: (mois = null) => httpClient.get(mois ? `/predictions/calibration?mois=${encodeURIComponent(mois)}` : '/predictions/calibration')
};
