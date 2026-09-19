import { listSeasonCalendar, getSeasonCalendarStatus } from '../../data/repositories/seasonCalendarRepository.js';
import { optionalStringParam } from '../middlewares/errorHandler.js';

export function getSeasonCalendar(req, res) {
  const league = optionalStringParam(req.query.league, 'league');
  const matches = listSeasonCalendar({ league, allSeasons: req.query.all === 'true' });
  res.json({ count: matches.length, matches });
}

export function getSeasonCalendarInfo(req, res) {
  res.json(getSeasonCalendarStatus());
}
