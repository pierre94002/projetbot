import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { listWebStandingsLeagues } from '../../data/repositories/webStandingsRepository.js';
import { storeStatus } from '../../data/db/matchStatsRead.js';
import { hasStandings } from '../../data/providers/leagueCups.js';
import { ApiError, requireStringParam, optionalPositiveInt } from '../middlewares/errorHandler.js';

/**
 * Compétitions dont un classement est réellement disponible en local.
 *
 * Sert de source à la liste déroulante de "Statistiques ligue", qui se
 * limitait jusque-là aux compétitions ayant des COTES : les championnats
 * peuplés par la tâche quotidienne (Russie, Chine, League One/Two) avaient
 * donc classement et statistiques sans qu'aucun écran ne permette d'y
 * accéder. Les libellés renvoyés sont les clés du magasin lui-même, donc
 * résolubles par `getStandings` par construction.
 *
 * Deux sources réunies depuis que le classement se CALCULE sur les résultats
 * du magasin : s'en tenir au fichier de recherche web laissait hors de la
 * liste tout championnat ajouté depuis la dernière passe — la Pologne n'y
 * serait jamais apparue, alors que ses résultats sont là.
 */
export function getStandingsLeagues(req, res) {
  const leagues = [...new Set([...listWebStandingsLeagues(), ...storeStatus().leagues])]
    // Une coupe à élimination directe n'a pas de classement. Sans ce filtre,
    // la FA Cup en produisait un de 124 équipes, Port Vale troisième — une
    // table qui n'existe pas. Elle se consulte par son tableau, dans
    // l'onglet Coupes. Les compétitions à phase de groupes, elles, restent.
    .filter(hasStandings)
    .sort();
  res.json({ leagues });
}

/**
 * `season` est une année de DÉBUT de saison — 2023 désigne 2023-24. Absente,
 * c'est la saison la plus récente du magasin. Une saison passée n'existe que
 * là : les classements web et API-Football ne publient que celle en cours.
 */
export async function getStandings(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');

  const standings = await getStandingsByLeagueLabel(league, { season: season ?? null });
  if (!standings) {
    throw new ApiError(404, season
      ? `Aucun classement pour "${league}" en ${season}-${String(season + 1).slice(2)}.`
      : `Compétition introuvable pour "${league}".`);
  }

  res.json(standings);
}
