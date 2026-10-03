import {
  listTeamMatchStats,
  getMatchStatsById,
  getTeamWebAverages,
  getMatchStatsStatus
} from '../../data/repositories/matchStatsWebRepository.js';
import { getCoverage } from '../../data/providers/espnMatchStatsRefresh.js';
import { readRefreshStatus } from '../../data/repositories/refreshStatusRepository.js';
import { isRefreshRunning } from '../../data/providers/refreshLock.js';
// La passe manuelle est LA MÊME que la passe automatique : FotMob seul,
// calendrier, classements officiels, rencontres nouvelles puis feuilles
// manquantes. Elle relançait autrefois ESPN.
import { refreshNow } from '../../jobs/matchStatsAutoRefresh.js';
import { playerSeasonStats, playerProfile, seasonsForLeague, leagueLeaders, cupBracket } from '../../data/db/matchStatsRead.js';
import { cupsForLeague } from '../../data/providers/leagueCups.js';
import { seasonLabel } from '../../data/providers/seasonWindows.js';
import { oddsProfile } from '../../data/db/oddsProfileRead.js';
import { buildMatchPreview } from '../../data/providers/lineupContext.js';
import { ageAt, birthdatesOf, infosOf, ensurePlayerBirthdate, ensureSquadBirthdates, ensureSquadsBirthdates, ensurePlayersInfo } from '../../data/db/playerBirthdates.js';
import { resolveTeamIds } from '../../data/db/teamIdResolver.js';
import { ApiError, requireStringParam, optionalPositiveInt } from '../middlewares/errorHandler.js';

/**
 * Profilage de cotes d'un match à venir : les matchs passés dont les cotes
 * ressemblaient aux siennes, et comment ils ont fini (oddsProfileRead.js).
 * Les cotes du jour viennent de l'appelant, qui les tient de The Odds API.
 */
export function getOddsProfile(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const cote = (valeur, nom, requise) => {
    if (valeur === undefined || valeur === '') {
      if (requise) throw new ApiError(400, `Le paramètre "${nom}" est requis (cote décimale).`);
      return null;
    }
    const n = Number(valeur);
    if (!Number.isFinite(n) || n <= 1) throw new ApiError(400, `Le paramètre "${nom}" doit être une cote décimale supérieure à 1.`);
    return n;
  };
  const odds = {
    home: cote(req.query.odds1, 'odds1', true),
    draw: cote(req.query.oddsDraw, 'oddsDraw', false),
    away: cote(req.query.odds2, 'odds2', true)
  };
  const tolerance = req.query.tolerance === undefined ? 13 : Number(req.query.tolerance);
  res.json(
    oddsProfile({
      league,
      home: req.query.home ?? null,
      away: req.query.away ?? null,
      kickoff: req.query.kickoff ?? null,
      odds,
      scope: req.query.scope,
      segment: req.query.segment,
      tolerance
    })
  );
}

/** Matchs d'une équipe avec stats d'équipe complètes + stats joueurs, match par match (import quotidien 7h30). */
export function getTeamMatchStats(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const limit = optionalPositiveInt(req.query.limit, 'limit');
  // La compétition, quand l'interface la connaît, désigne le bon club parmi les homonymes.
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;

  const matches = listTeamMatchStats(name, { limit, league });
  res.json({ teamName: name, count: matches.length, matches });
}

/** Moyennes des stats d'équipe sur les N derniers matchs importés (saison en cours). */
export function getTeamMatchStatsAverages(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const sampleSize = optionalPositiveInt(req.query.sampleSize, 'sampleSize');
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;

  const stats = getTeamWebAverages(name, sampleSize, { league });
  if (!stats) throw new ApiError(404, `Aucune statistique importée pour "${name}".`);
  res.json({ teamId: null, teamName: stats.teamName, stats });
}

/**
 * Page d'un match à venir : coup d'envoi exact, cadre (stade, météo, arbitre)
 * et composition décrite, tels que FotMob les publie (cf. lineupContext.js).
 * Gratuit : jamais de repli payant, contrairement à /team-stats/lineups-by-name.
 */
export async function getMatchPreview(req, res) {
  const homeName = requireStringParam(req.query.home, 'home');
  const commenceTimeIso = requireStringParam(req.query.commenceTime, 'commenceTime');
  const awayName = typeof req.query.away === 'string' ? req.query.away : null;
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;
  res.json(await buildMatchPreview({ homeName, awayName, commenceTimeIso, league }));
}

/**
 * Identifiants FotMob de clubs donnés par leur nom et leur compétition :
 * leurs logos dans toutes les listes de rencontres de l'interface
 * (01/10/2026). Corps : { teams: [{ name, league }] }.
 */
export function postTeamIds(req, res) {
  const teams = Array.isArray(req.body?.teams) ? req.body.teams : null;
  if (!teams) throw new ApiError(400, 'Le corps doit contenir « teams » : [{ name, league }].');
  res.json({ results: resolveTeamIds(teams) });
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
/** Délai au-delà duquel le classement s'affiche sans attendre les effectifs encore en lecture. */
const ATTENTE_AGES_MS = 8000;

export async function getPlayerStats(req, res) {
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
  // Âges (01/10/2026) : les effectifs des clubs du classement, lus chez
  // FotMob au plus une fois par semaine ; au-delà de quelques secondes, le
  // classement part sans attendre et la lecture se termine pour la fois suivante.
  const lecture = ensureSquadsBirthdates(players.map((p) => p.teamId)).catch(() => {});
  await Promise.race([lecture, new Promise((resolve) => setTimeout(resolve, ATTENTE_AGES_MS))]);
  const infos = infosOf(players.map((p) => p.playerId));
  const avecAge = players.map((p) => {
    const info = infos.get(p.playerId);
    return { ...p, age: ageAt(info?.birthDate), countryCode: info?.countryCode ?? null, countryName: info?.countryName ?? null };
  });
  // Le libellé de saison dépend de la compétition — « 2025 » pour un
  // championnat d'année civile, « 2025-26 » ailleurs — et c'est au serveur
  // de le dire : l'interface ne sait pas quel championnat est lequel.
  res.json({ league, season: season ?? null, seasonLabel: season ? seasonLabel(league, season) : null, team, role, count: avecAge.length, players: avecAge });
}

/**
 * Fiche d'un joueur (page /joueur/:id de l'interface) : saison toutes
 * compétitions, par compétition et match par match. Identifiant FotMob
 * seulement — c'est celui que portent les compositions et les classements.
 */
export async function getPlayerProfile(req, res) {
  const playerId = requireStringParam(req.params.playerId, 'playerId');
  if (!/^fotmob-\d+$/.test(playerId)) throw new ApiError(400, `Identifiant de joueur inattendu : ${playerId}`);
  const season = optionalPositiveInt(req.query.season, 'season');
  const profile = playerProfile(playerId, { season: season ?? null });
  if (!profile) throw new ApiError(404, `Joueur introuvable dans le magasin : ${playerId}`);
  // Âge (01/10/2026) : l'effectif de son club d'abord — une lecture sert à
  // tous ses coéquipiers —, sa propre page FotMob à défaut.
  await ensureSquadBirthdates(profile.teamId);
  const birthDate = birthdatesOf([playerId]).get(playerId) ?? (await ensurePlayerBirthdate(playerId));
  // Nationalité : l'effectif de son club, sinon sa page (lue ci-dessus si besoin).
  let info = infosOf([playerId]).get(playerId) ?? null;
  if (!info?.countryCode) {
    await ensurePlayerBirthdate(playerId);
    info = infosOf([playerId]).get(playerId) ?? info;
  }
  res.json({ ...profile, birthDate: birthDate ?? null, age: ageAt(birthDate), countryCode: info?.countryCode ?? null, countryName: info?.countryName ?? null });
}

/**
 * Buteurs, passeurs et clean sheets d'une compétition, en un seul appel.
 *
 * Les trois listes voyagent ensemble parce qu'elles s'affichent ensemble —
 * trois onglets d'un même panneau. Les séparer imposerait trois
 * aller-retours pour un écran que l'utilisateur parcourt d'un coup d'œil.
 */
export async function getLeagueLeaders(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');
  const limit = optionalPositiveInt(req.query.limit, 'limit');

  const leaders = leagueLeaders(league, {
    season: season ?? null,
    ...(limit === undefined ? {} : { limit })
  });
  // Nationalité et âge de chacun (01/10/2026) : les effectifs de leurs clubs,
  // quelques secondes au plus, la lecture finit pour la fois suivante.
  const listes = Object.entries(leaders).filter(([, v]) => Array.isArray(v));
  const joueurs = listes.flatMap(([, v]) => v);
  const lecture = ensureSquadsBirthdates(joueurs.map((p) => p.teamId)).catch(() => {});
  await Promise.race([lecture, new Promise((resolve) => setTimeout(resolve, ATTENTE_AGES_MS))]);
  const infos = infosOf(joueurs.map((p) => p.playerId));
  const avecPays = (p) => {
    const info = infos.get(p.playerId);
    return { ...p, age: ageAt(info?.birthDate), countryCode: info?.countryCode ?? null, countryName: info?.countryName ?? null };
  };
  res.json({ ...leaders, ...Object.fromEntries(listes.map(([cle, v]) => [cle, v.map(avecPays)])) });
}

/**
 * Âge et nationalité de joueurs quelconques (page d'un match joué, listes de
 * l'interface) : { ids: ['fotmob-<n>', …] } -> { players: { id: { age,
 * birthDate, countryCode, countryName } } }. Les effectifs de leurs clubs
 * sont lus chez FotMob si besoin (gratuit), quelques secondes au plus.
 */
export async function postPlayersInfo(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
  if (!ids) throw new ApiError(400, 'Le corps doit contenir « ids » : [identifiants de joueurs].');
  const infos = await ensurePlayersInfo(ids);
  res.json({ players: Object.fromEntries(infos) });
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
  // « Dernier passage » : la dernière passe de l'actualisation complète
  // (refresh-status.json), et non plus le témoin figé de l'ancien
  // rafraîchissement ESPN.
  const etat = readRefreshStatus();
  res.json({ ...getCoverage(), refresh: { running: isRefreshRunning(), last: etat.history?.[0] ?? null } });
}

/**
 * Relance le rafraîchissement sans attendre la prochaine passe automatique.
 *
 * Répond tout de suite : une passe complète dure plusieurs minutes, on ne
 * laisse pas la requête HTTP ouverte pendant ce temps. L'avancement se suit
 * sur GET /api/match-stats/coverage.
 */
export function postMatchStatsRefresh(req, res) {
  // Même passe que POST /api/refresh ; le verrou est lu entre processus.
  const alreadyRunning = isRefreshRunning();
  if (!alreadyRunning) {
    refreshNow().catch((error) => {
      console.error(`[stats] rafraîchissement manuel en échec : ${error.message}`);
    });
  }
  res.status(202).json({ started: !alreadyRunning, alreadyRunning });
}
