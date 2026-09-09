import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { ApiError } from '../middlewares/errorHandler.js';

export async function getStandings(req, res) {
  const league = req.query.league;
  if (!league) throw new ApiError(400, 'Le paramètre "league" est requis.');

  const standings = await getStandingsByLeagueLabel(league);
  if (!standings) throw new ApiError(404, `Compétition introuvable pour "${league}".`);

  res.json(standings);
}
