import {
  listTeamMatchStats,
  getMatchStatsById,
  getTeamWebAverages,
  getMatchStatsStatus
} from '../../data/repositories/matchStatsWebRepository.js';
import { getCoverage, getRefreshStatus } from '../../data/providers/espnMatchStatsRefresh.js';
import { isRefreshRunning } from '../../data/providers/refreshLock.js';
// La passe manuelle est LA MÊME que la passe automatique : FotMob seul,
// calendrier, classements officiels, rencontres nouvelles puis feuilles
// manquantes. Elle relançait autrefois ESPN.
import { refreshNow } from '../../jobs/matchStatsAutoRefresh.js';
import { playerSeasonStats, seasonsForLeague, leagueLeaders, cupBracket } from '../../data/db/matchStatsRead.js';
import { cupsForLeague } from '../../data/providers/leagueCups.js';
import { seasonLabel } from '../../data/providers/seasonWindows.js';
import { ApiError, requireStringParam, optionalPositiveInt } from '../middlewares/errorHandler.js';

/** Matchs d'une équipe avec stats d'équipe complètes + stats joueurs, match par match (import quotidien 7h30). */
export function getTeamMatchStats(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const limit = optionalPositiveInt(req.query.limit, 'limit');

  const matches = listTeamMatchStats(name, { limit });
  res.json({ teamName: name, count: matches.length, matches });
}

/** Moyennes des stats d'équipe sur les N derniers matchs importés (saison en cours). */
export function getTeamMatchStatsAverages(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const sampleSize = optionalPositiveInt(req.query.sampleSize, 'sampleSize');

  const stats = getTeamWebAverages(name, sampleSize);
  if (!stats) throw new ApiError(404, `Aucune statistique importée pour "${name}".`);
  res.json({ teamId: null, teamName: stats.teamName, stats });
}

export function getMatchStats(req, res) {
  const entry = getMatchStatsById(req.params.matchId);
  if (!entry) throw new ApiError(404, `Statistiques introuvables pour le match ${req.params.matchId}.`);
  res.json(entry);
}

export function getMatchStatsInfo(req, res) {
  res.json(getMatchStatsStatus());
}

/**
 * Classement des joueurs d'une compétition, agrégé par la base.
 *
 * Distinct de `/team-stats/players-by-name`, qui interroge API-Football :
 * celui-ci lit le magasin local (FotMob/ESPN), donc il couvre la saison en
 * cours et les championnats hors plan gratuit.
 */
export function getPlayerStats(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');
  const team = req.query.team === undefined || req.query.team === '' ? null : requireStringParam(req.query.team, 'team');
  const minMinutes = optionalPositiveInt(req.query.minMinutes, 'minMinutes');
  const limit = optionalPositiveInt(req.query.limit, 'limit');
  const ROLES = ['field', 'goalkeeper', 'defender', 'midfielder', 'forward'];
  const role = ROLES.includes(req.query.role) ? req.query.role : 'field';

  const players = playerSeasonStats({
    league,
    season: season ?? null,
    team,
    role,
    ...(minMinutes === undefined ? {} : { minMinutes }),
    ...(limit === undefined ? {} : { limit })
  });
  // Le libellé de saison dépend de la compétition — « 2025 » pour un
  // championnat d'année civile, « 2025-26 » ailleurs — et c'est au serveur
  // de le dire : l'interface ne sait pas quel championnat est lequel.
  res.json({ league, season: season ?? null, seasonLabel: season ? seasonLabel(league, season) : null, team, role, count: players.length, players });
}

/**
 * Buteurs, passeurs et clean sheets d'une compétition, en un seul appel.
 *
 * Les trois listes voyagent ensemble parce qu'elles s'affichent ensemble —
 * trois onglets d'un même panneau. Les séparer imposerait trois
 * aller-retours pour un écran que l'utilisateur parcourt d'un coup d'œil.
 */
export function getLeagueLeaders(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');
  const limit = optionalPositiveInt(req.query.limit, 'limit');

  res.json(leagueLeaders(league, {
    season: season ?? null,
    ...(limit === undefined ? {} : { limit })
  }));
}

/**
 * Coupes rattachées à un championnat, avec ce que le magasin en connaît.
 *
 * Ne rend que celles qui ont effectivement des rencontres : une coupe
 * déclarée mais jamais importée donnerait un onglet vide, et l'utilisateur
 * n'a aucun moyen de deviner que c'est l'import qui manque.
 */
export function getLeagueCups(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const cups = cupsForLeague(league)
    .map((name) => ({ name, seasons: seasonsForLeague(name) }))
    .filter((cup) => cup.seasons.length > 0);
  res.json({ league, count: cups.length, cups });
}

/** Le tableau d'une coupe : ses rencontres groupées par tour. */
export function getCupBracket(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');

  const bracket = cupBracket(league, { season: season ?? null });
  if (!bracket) throw new ApiError(404, `Aucune rencontre en magasin pour "${league}".`);
  res.json(bracket);
}

/** Saisons disponibles pour une compétition, la plus récente d'abord. */
export function getLeagueSeasons(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  res.json({ league, seasons: seasonsForLeague(league) });
}

/** Couverture des statistiques, championnat par championnat. */
export function getMatchStatsCoverage(req, res) {
  res.json({ ...getCoverage(), refresh: { running: isRefreshRunning(), last: getRefreshStatus() } });
}

/**
 * Relance le rafraîchissement sans attendre la prochaine passe automatique.
 *
 * Répond tout de suite : une passe complète dure plusieurs minutes, on ne
 * laisse pas la requête HTTP ouverte pendant ce temps. L'avancement se suit
 * sur GET /api/match-stats/coverage.
 */
export function postMatchStatsRefresh(req, res) {
  const alreadyRunning = isRefreshRunning();
  if (!alreadyRunning) {
    refreshNow().catch((error) => {
      console.error(`[stats] rafraîchissement manuel en échec : ${error.message}`);
    });
  }
  res.status(202).json({ started: !alreadyRunning, alreadyRunning });
}
