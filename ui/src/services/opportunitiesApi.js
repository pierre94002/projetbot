import { httpClient } from './httpClient.js';

/**
 * La page « Opportunités du jour » (étape 8 du plan, cf. server/src/data/opportunities.js) :
 * une ligne par pari possible, avec le verdict du moteur, la cote de vos bookmakers et son
 * heure, le mouvement de cote, l'état de la composition. Lecture seule : le calcul est celui
 * du Repérage, préparé en arrière-plan (`status` vaut `computing`, avec `progress`, tant qu'il tourne).
 */
export const opportunitiesApi = {
  get: ({ force = false } = {}) => httpClient.get(`/opportunities${force ? '?force=1' : ''}`),
  /** Les seules opportunités vertes : ce que lit la surveillance des notifications du navigateur. */
  vertes: () => httpClient.get('/opportunities/vertes')
};
