import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { listWebStandingsLeagues } from '../../data/repositories/webStandingsRepository.js';
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
 */
export function getStandingsLeagues(req, res) {
  res.json({ leagues: listWebStandingsLeagues() });
}

export async function getStandings(req, res) {
  const league = requireStringParam(req.query.league, 'league');

  const standings = await getStandingsByLeagueLabel(league);
  if (!standings) throw new ApiError(404, `Compétition introuvable pour "${league}".`);

  res.json(standings);
}
