import { httpClient } from './httpClient.js';

// Étape 39 (lot 1a) : plus aucun `bankroll` dans la requête — la base de la mise est le capital de Pierre, lu par le
// serveur (Réglages › Gestion du risque, /api/config/capital), jamais un chiffre de l'écran.
export const matchesApi = {
  list: (source) => httpClient.get(`/matches?source=${source}`),
  getById: (matchId, source) => httpClient.get(`/matches/${encodeURIComponent(matchId)}?source=${source}`)
};
