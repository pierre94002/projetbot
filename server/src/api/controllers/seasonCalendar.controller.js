import { listSeasonCalendar, getSeasonCalendarStatus } from '../../data/repositories/seasonCalendarRepository.js';
import { teamUpcomingFixtures } from '../../data/db/teamUpcomingRead.js';
import { listAdaptedMatches } from '../../data/matchSources.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { optionalStringParam, requireStringParam, optionalPositiveInt } from '../middlewares/errorHandler.js';

const JOUR_MS = 86_400_000;

export function getSeasonCalendar(req, res) {
  const league = optionalStringParam(req.query.league, 'league');
  const season = optionalStringParam(req.query.season, 'season');
  const matches = listSeasonCalendar({ league, season, allSeasons: req.query.all === 'true' });
  res.json({ count: matches.length, season: season ?? null, matches });
}

export function getSeasonCalendarInfo(req, res) {
  res.json(getSeasonCalendarStatus());
}

/**
 * Calendrier à venir d'une équipe (page d'équipe, 01/10/2026). Chaque match
 * porte l'identifiant de SA page (`pageMatchId`) : celui des cotes quand il
 * est coté — la page montre alors les prix et l'heure exacte —, sinon celui
 * du calendrier, que /matches/:id et /analysis/match/:id savent retrouver
 * (cf. findAdaptedMatch). Un match reporté sans nouvelle date n'a pas de page.
 */
export function getTeamCalendar(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const league = optionalStringParam(req.query.league, 'league') ?? null;
  const from = optionalStringParam(req.query.from, 'from') ?? new Date().toISOString().slice(0, 10);
  const limit = optionalPositiveInt(req.query.limit, 'limit') ?? 20;

  const all = teamUpcomingFixtures(name, { league, from });
  const fixtures = all.slice(0, limit);
  let cotes = [];
  try {
    cotes = listAdaptedMatches('odds-api', 10000).filter((m) => m.hasOdds);
  } catch {
    // Relevé de cotes illisible à cet instant : les liens mènent aux pages sans cotes.
  }
  const matches = fixtures.map((f) => {
    const jour = Date.parse(`${f.date}T12:00:00Z`);
    const cote = cotes.find(
      (m) =>
        Math.abs(Date.parse(String(m.commenceTime ?? '').slice(0, 10) + 'T12:00:00Z') - jour) <= JOUR_MS &&
        teamNamesLikelyMatch(m.home, f.homeName) &&
        teamNamesLikelyMatch(m.away, f.awayName)
    );
    const status = f.status ?? 'scheduled';
    return {
      date: f.date,
      league: f.league ?? null,
      round: f.round ?? null,
      homeName: f.homeName,
      awayName: f.awayName,
      // Identifiants FotMob des deux clubs : leurs logos dans le calendrier.
      homeId: f.homeId ?? null,
      awayId: f.awayId ?? null,
      side: f.side,
      opponent: f.side === 'home' ? f.awayName : f.homeName,
      status,
      postponedFrom: f.postponedFrom ?? null,
      hasOdds: Boolean(cote),
      pageMatchId: cote?.matchId ?? (status === 'postponed' ? null : f.matchId ?? null),
      commenceTime: cote?.commenceTime ?? null
    };
  });
  res.json({ name, from, total: all.length, count: matches.length, matches });
}
