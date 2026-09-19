import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { ApiError, requireStringParam } from '../middlewares/errorHandler.js';

export async function getStandings(req, res) {
  const league = requireStringParam(req.query.league, 'league');

  const standings = await getStandingsByLeagueLabel(league);
  if (!standings) throw new ApiError(404, `Compétition introuvable pour "${league}".`);

  res.json(standings);
}
