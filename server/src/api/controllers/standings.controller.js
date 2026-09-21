import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { listWebStandingsLeagues } from '../../data/repositories/webStandingsRepository.js';
import { storeStatus } from '../../data/db/matchStatsRead.js';
import { ApiError, requireStringParam } from '../middlewares/errorHandler.js';

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
  const leagues = [...new Set([...listWebStandingsLeagues(), ...storeStatus().leagues])].sort();
  res.json({ leagues });
}

export async function getStandings(req, res) {
  const league = requireStringParam(req.query.league, 'league');

  const standings = await getStandingsByLeagueLabel(league);
  if (!standings) throw new ApiError(404, `Compétition introuvable pour "${league}".`);

  res.json(standings);
}
