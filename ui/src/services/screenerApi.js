import { httpClient } from './httpClient.js';

/**
 * L'écran de repérage (04/10/2026) : les matchs à venir classés par marché,
 * avec la probabilité du moteur, la cote du marché et le contexte de la
 * saison (cf. server/src/data/screener.js). Le calcul tourne en arrière-plan :
 * `status` vaut `computing` (avec `progress`) tant qu'il n'est pas fini.
 */
export const screenerApi = {
  get: ({ force = false } = {}) => httpClient.get(`/screener${force ? '?force=1' : ''}`)
};
