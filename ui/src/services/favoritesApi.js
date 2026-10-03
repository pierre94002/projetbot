import { httpClient } from './httpClient.js';

/**
 * Les équipes et championnats favoris (03/10/2026). `favorite` dit l'état
 * voulu (true : ajouter, false : retirer) ; chaque appel renvoie les favoris
 * à jour : { teams, leagues, updatedAt }.
 */
export const favoritesApi = {
  list: () => httpClient.get('/favorites'),
  setTeam: ({ id = null, name, league = null }, favorite) => httpClient.put('/favorites/teams', { id, name, league, favorite }),
  setLeague: (name, favorite) => httpClient.put('/favorites/leagues', { name, favorite })
};
