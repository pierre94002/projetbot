import { listSeasonCalendar, getSeasonCalendarStatus } from '../../data/repositories/seasonCalendarRepository.js';
import { optionalStringParam } from '../middlewares/errorHandler.js';

export function getSeasonCalendar(req, res) {
  const league = optionalStringParam(req.query.league, 'league');
  const season = optionalStringParam(req.query.season, 'season');
  const matches = listSeasonCalendar({ league, season, allSeasons: req.query.all === 'true' });
  res.json({ count: matches.length, season: season ?? null, matches });
}

export function getSeasonCalendarInfo(req, res) {
  res.json(getSeasonCalendarStatus());
}
