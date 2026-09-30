import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { storeStatus } from '../../data/db/matchStatsRead.js';
import { hasStandings } from '../../data/providers/leagueCups.js';
import { seasonLabel, seasonBounds, currentSeason } from '../../data/providers/seasonWindows.js';
import { listPendingPostponements } from '../../data/repositories/seasonCalendarRepository.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { ApiError, requireStringParam, optionalPositiveInt } from '../middlewares/errorHandler.js';

/**
 * Compétitions dont un classement est réellement disponible en local.
 *
 * Sert de source à la liste déroulante de "Statistiques ligue". Les
 * libellés renvoyés sont les clés du magasin lui-même, donc résolubles par
 * `getStandings` par construction. Le magasin est la seule source : le
 * fichier de recherche web qui s'y ajoutait ne venait pas de FotMob.
 */
export function getStandingsLeagues(req, res) {
  const leagues = storeStatus().leagues
    // Une coupe à élimination directe n'a pas de classement. Sans ce filtre,
    // la FA Cup en produisait un de 124 équipes, Port Vale troisième — une
    // table qui n'existe pas. Elle se consulte par son tableau, dans
    // l'onglet Coupes. Les compétitions à phase de groupes, elles, restent.
    .filter(hasStandings)
    .sort();
  res.json({ leagues });
}

/**
 * `season` est une année de DÉBUT de saison — 2023 désigne 2023-24 en
 * Europe, l'année civile 2023 dans les Amériques et les pays nordiques.
 * Absente, c'est la saison la plus récente du magasin. `table` choisit une
 * table quand la compétition en publie plusieurs (conférences, Apertura /
 * Clausura) ; la réponse les liste toutes.
 */
export async function getStandings(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');
  const table = typeof req.query.table === 'string' && req.query.table.trim() ? req.query.table.trim() : null;

  const standings = await getStandingsByLeagueLabel(league, { season: season ?? null, table });
  if (!standings) {
    throw new ApiError(404, season
      ? `Aucun classement pour "${league}" en ${seasonLabel(league, season)}.`
      : `Compétition introuvable pour "${league}".`);
  }

  // Matchs reportés de la saison affichée, encore à jouer : les équipes
  // concernées ont un match de moins, le tableau le dit.
  const [from, to] = seasonBounds(league, standings.season ?? season ?? currentSeason(league));
  const postponed = listPendingPostponements(league, { from, to });
  const concerne = (row) => (p) => teamNamesLikelyMatch(row.teamName, p.homeName) || teamNamesLikelyMatch(row.teamName, p.awayName);
  res.json({
    ...standings,
    rows: (standings.rows ?? []).map((row) => ({ ...row, postponedMatches: postponed.filter(concerne(row)).length })),
    postponed
  });
}
