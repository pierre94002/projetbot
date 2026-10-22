import { httpClient } from './httpClient.js';

/**
 * La carte « où parier » (étape 23 du plan, cf. server/src/data/bettingMap.js) : championnat × marché, l'avantage
 * du moteur jugé par le garde-fou de la mesure. Lecture seule : la carte est calculée par l'actualisation. La page
 * Opportunités ne la lit qu'au clic « Afficher la carte » (~0,3 Mo) ; ses couleurs arrivent déjà sur chaque ligne.
 */
export const bettingMapApi = {
  get: ({ mois = null } = {}) => httpClient.get(`/betting-map${mois ? `?mois=${encodeURIComponent(mois)}` : ''}`)
};
