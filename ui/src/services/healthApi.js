import { httpClient } from './httpClient.js';

// Étape 14 du plan : le contrôle quotidien des données et la santé des sources
// (server/src/api/controllers/health.controller.js). Tout est LU : un état
// préparé par la dernière passe d'actualisation et les notes des sources —
// jamais un appel aux sources elles-mêmes. Seule écriture : la date
// d'expiration du jeton Claude, saisie par Pierre.
export const healthApi = {
  checks: () => httpClient.get('/health/checks'),
  sources: () => httpClient.get('/health/sources'),
  setJetonClaude: (expireLe) => httpClient.put('/health/jeton-claude', { expireLe })
};
