import { httpClient } from './httpClient.js';

// « Santé du moteur » (étape 24 du plan) : les trois feux et les résumés des autres étapes, assemblés par le
// serveur. Lecture seule : la page ne lance rien et ne calcule rien — un bloc dont la donnée manque s'affiche
// « pas encore mesuré ».
export const engineHealthApi = {
  overview: () => httpClient.get('/engine-health')
};
