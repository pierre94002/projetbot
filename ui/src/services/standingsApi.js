import { httpClient } from './httpClient.js';

export const standingsApi = {
  /**
   * Classement d'une compétition. `season` est une année de début ; `table`
   * choisit une table quand la compétition en publie plusieurs (conférences,
   * Apertura/Clausura). La réponse porte `official` (table FotMob) ou non
   * (calculée sur les résultats), `seasonLabel` et la liste `tables`.
   */
  get: (league, { season = null, table = null } = {}) => {
    const params = new URLSearchParams({ league });
    if (season) params.set('season', season);
    if (table) params.set('table', table);
    return httpClient.get(`/standings?${params.toString()}`);
  },
  listLeagues: () => httpClient.get('/standings/leagues')
};
