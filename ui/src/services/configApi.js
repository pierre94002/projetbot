import { httpClient } from './httpClient.js';

export const configApi = {
  get: () => httpClient.get('/config'),
  update: (partialConfig) => httpClient.put('/config', partialConfig),
  reset: () => httpClient.post('/config/reset'),
  getTilt: () => httpClient.get('/config/tilt'),
  setCircuitBreaker: (active) => httpClient.put('/config/tilt', { circuitBreakerActive: active }),
  resetTilt: () => httpClient.post('/config/tilt/reset'),
  // Étape 11 du plan : les garde-fous de Pierre (null = aucun plafond).
  gardeFous: () => httpClient.get('/config/garde-fous'),
  setGardeFous: (reglage) => httpClient.put('/config/garde-fous', reglage),
  // Étape 25 du plan : les versions du moteur (lecture seule) et le retour à la version précédente
  // (`depuis` = la version en service vue à l'écran : un double clic ne recule jamais de deux versions).
  versions: () => httpClient.get('/config/versions'),
  revenirALaVersionPrecedente: (depuis) => httpClient.post('/config/versions/retour', { depuis }),
  // Étape 25, seconde moitié : adopter la candidate (seulement sur « retenu » ; la version et la candidate vues à l'écran)
  // et la passer au banc d'essai sur les matchs passés (verdict indicatif, lancé dans le serveur).
  adopterLaCandidate: (depuis, candidate) => httpClient.post('/config/versions/adopter', { depuis, candidate }),
  lancerLeBancDeLaCandidate: () => httpClient.post('/config/versions/candidate/banc', {})
};
