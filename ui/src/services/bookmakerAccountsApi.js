import { httpClient } from './httpClient.js';

/**
 * Étape 11 du plan : les fiches de vos comptes bookmakers — solde déclaré, mise
 * maximale acceptée connue, limitation, date de mise à jour. Jamais
 * d'identifiant ni de mot de passe (le serveur les refuse).
 */
export const bookmakerAccountsApi = {
  list: () => httpClient.get('/bookmaker-accounts'),
  save: (cle, fiche) => httpClient.put(`/bookmaker-accounts/${encodeURIComponent(cle)}`, fiche)
};
