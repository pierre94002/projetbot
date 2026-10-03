/**
 * favorites.controller.js — les équipes et championnats favoris (03/10/2026).
 * -----------------------------------------------------------------------
 * GET /api/favorites          { teams: [{ id, name, league, addedAt, aliases }], leagues, updatedAt }
 * PUT /api/favorites/teams    { id?, name, league?, favorite: true|false }
 * PUT /api/favorites/leagues  { name, favorite: true|false }
 * Les deux PUT renvoient les favoris à jour. « favorite » dit l'état voulu,
 * jamais « basculer » : rejouer la même demande ne change rien.
 * Une demande invalide répond 400 ; une panne (fichier illisible, disque
 * tenu par OneDrive) remonte telle quelle (500).
 * -----------------------------------------------------------------------
 */

import { getFavorites, setFavoriteTeam, setFavoriteLeague, FavoritesValidationError } from '../../data/repositories/favoritesRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

const chaineOuRien = (valeur) => valeur === undefined || valeur === null || typeof valeur === 'string';

/** Les erreurs de validation en 400, les autres telles quelles. */
function enRequete(action) {
  try {
    return action();
  } catch (error) {
    if (error instanceof FavoritesValidationError) throw new ApiError(400, error.message);
    throw error;
  }
}

export function getFavoritesList(req, res) {
  res.json(getFavorites());
}

export function putFavoriteTeam(req, res) {
  const { id, name, league, favorite } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) throw new ApiError(400, '"name" est requis.');
  if (typeof favorite !== 'boolean') throw new ApiError(400, '"favorite" doit valoir true ou false.');
  if (!chaineOuRien(id) || !chaineOuRien(league)) throw new ApiError(400, '"id" et "league" sont des chaînes.');
  res.json(enRequete(() => setFavoriteTeam({ id, name, league }, favorite)));
}

export function putFavoriteLeague(req, res) {
  const { name, favorite } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) throw new ApiError(400, '"name" est requis.');
  if (typeof favorite !== 'boolean') throw new ApiError(400, '"favorite" doit valoir true ou false.');
  res.json(enRequete(() => setFavoriteLeague({ name }, favorite)));
}
