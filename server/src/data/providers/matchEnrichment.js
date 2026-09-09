import {
  findBestTeamMatch,
  getGoalsAverage,
  getCornersAverage,
  getRecentForm,
  getAverageMatchStats,
  getLiveLineups,
  getLiveMatchDetails,
  getTeamPlayers
} from './teamStatsService.js';
import { resolveLeagueId, resolveCurrentSeason } from './leagueRegistry.js';
import { getResultsForTeam } from '../repositories/matchResultsRepository.js';

/**
 * Enrichit un match adapté (cf. matchSources.js) avec les moyennes réelles
 * de buts des deux équipes, récupérées via API-Football. Dégradation
 * silencieuse et PAR ÉQUIPE : chaque équipe (résolution du nom, buts, forme)
 * échoue indépendamment de l'autre — si Getafe est bloqué par le quota mais
 * Celta Vigo répond, on affiche quand même Celta Vigo plutôt que de tout
 * perdre. Seule une compétition non reconnue fait repartir le match
 * inchangé (baseline de ligue), puisqu'alors aucune des deux équipes n'a de
 * contexte exploitable. C'est un enrichissement automatique, pas une action
 * demandée explicitement par l'utilisateur.
 *
 * Les corners, lorsque `includeCorners` est vrai, sont récupérés à part :
 * une erreur à cette étape (ex. limite de débit atteinte) est cette fois
 * remontée à l'appelant plutôt que masquée, car l'utilisateur a cliqué sur un
 * bouton pour l'obtenir et doit savoir si ça a échoué — sans pour autant
 * perdre les buts déjà résolus avec succès.
 */
export async function enrichMatchWithRealAverages(match, { includeCorners = false, cornersSampleSize } = {}) {
  const resolved = await resolveGoalsEnrichment(match);
  if (!resolved) return match;

  const enrichedMatch = applyGoalsEnrichment(match, resolved);
  if (!includeCorners) return enrichedMatch;

  const [homeCorners, awayCorners] = await Promise.all([
    resolved.homeTeam
      ? getCornersAverage(resolved.homeTeam.id, resolved.leagueId, resolved.season, cornersSampleSize)
      : null,
    resolved.awayTeam
      ? getCornersAverage(resolved.awayTeam.id, resolved.leagueId, resolved.season, cornersSampleSize)
      : null
  ]);

  return applyCornersEnrichment(enrichedMatch, homeCorners, awayCorners);
}

async function resolveGoalsEnrichment(match) {
  let leagueId;
  try {
    leagueId = await resolveLeagueId(match.league);
  } catch {
    return null;
  }
  if (!leagueId) return null;

  const season = resolveCurrentSeason();
  const [homeTeam, awayTeam] = await Promise.all([
    findBestTeamMatch(match.home).catch(() => null),
    findBestTeamMatch(match.away).catch(() => null)
  ]);
  if (!homeTeam && !awayTeam) return null;

  const [homeGoalsRaw, awayGoalsRaw, homeForm, awayForm] = await Promise.all([
    homeTeam ? getGoalsAverage(homeTeam.id, leagueId, season).catch(() => null) : null,
    awayTeam ? getGoalsAverage(awayTeam.id, leagueId, season).catch(() => null) : null,
    homeTeam ? getRecentForm(homeTeam.id, leagueId, season).catch(() => null) : null,
    awayTeam ? getRecentForm(awayTeam.id, leagueId, season).catch(() => null) : null
  ]);

  const homeGoals = blendGoalsWithLocalResults(homeGoalsRaw, match.home);
  const awayGoals = blendGoalsWithLocalResults(awayGoalsRaw, match.away);

  return { leagueId, season, homeTeam, awayTeam, homeGoals, awayGoals, homeForm, awayForm };
}

/**
 * Mélange la moyenne de buts API-Football avec les résultats que
 * l'utilisateur a lui-même saisis via "Score final" (cf.
 * matchResultsRepository.js) — moyenne pondérée par le nombre de rencontres
 * de chaque source, sur "total" uniquement (le seul champ avec un vrai
 * fixturesPlayed pour pondérer ; c'est aussi le seul lu par
 * applyGoalsEnrichment ci-dessous pour alimenter le modèle Poisson). Utile
 * en particulier quand l'API ne couvre pas la saison en cours (plan gratuit)
 * et ne renvoie donc aucune moyenne : dans ce cas le résultat repose
 * uniquement sur les scores locaux plutôt que de rester vide.
 */
function blendGoalsWithLocalResults(apiGoals, teamName) {
  const localResults = getResultsForTeam(teamName);
  if (localResults.length === 0) return apiGoals;

  const apiFixturesPlayed = apiGoals?.fixturesPlayed ?? 0;
  const blendedFor = blendWeightedAverage(apiGoals?.for?.total, apiFixturesPlayed, localResults.map((r) => r.goalsFor));
  const blendedAgainst = blendWeightedAverage(apiGoals?.against?.total, apiFixturesPlayed, localResults.map((r) => r.goalsAgainst));

  return {
    for: { home: apiGoals?.for?.home ?? null, away: apiGoals?.for?.away ?? null, total: blendedFor },
    against: { home: apiGoals?.against?.home ?? null, away: apiGoals?.against?.away ?? null, total: blendedAgainst },
    fixturesPlayed: apiFixturesPlayed + localResults.length
  };
}

function blendWeightedAverage(apiAverage, apiFixturesPlayed, localValues) {
  const apiSum = apiAverage != null ? apiAverage * apiFixturesPlayed : 0;
  const apiN = apiAverage != null ? apiFixturesPlayed : 0;
  const totalN = apiN + localValues.length;
  if (totalN === 0) return null;
  const localSum = localValues.reduce((sum, value) => sum + value, 0);
  return Number(((apiSum + localSum) / totalN).toFixed(2));
}

function applyGoalsEnrichment(match, resolved) {
  const homeGoalsAvg = resolved.homeGoals?.for?.total;
  const awayGoalsAvg = resolved.awayGoals?.for?.total;

  return {
    ...match,
    expectedGoals:
      homeGoalsAvg != null && awayGoalsAvg != null
        ? { home: homeGoalsAvg, away: awayGoalsAvg, provider: 'api-football' }
        : match.expectedGoals,
    teamStats: {
      home: { name: resolved.homeTeam?.name ?? match.home, goals: resolved.homeGoals, form: resolved.homeForm, corners: null },
      away: { name: resolved.awayTeam?.name ?? match.away, goals: resolved.awayGoals, form: resolved.awayForm, corners: null }
    }
  };
}

function applyCornersEnrichment(match, homeCorners, awayCorners) {
  return {
    ...match,
    expectedCorners:
      homeCorners?.average != null && awayCorners?.average != null
        ? { home: homeCorners.average, away: awayCorners.average }
        : match.expectedCorners,
    teamStats: {
      home: { ...match.teamStats.home, corners: homeCorners },
      away: { ...match.teamStats.away, corners: awayCorners }
    }
  };
}

const FORM_BATCH_SIZE = 4;

/**
 * Résout la forme récente de plusieurs équipes en une fois (ex. toute une
 * liste de matchs affichée à l'écran), en dédupliquant les équipes qui
 * apparaissent plusieurs fois et en traitant par petits lots pour rester
 * sous la limite de débit par minute d'API-Football. Chaque équipe échoue
 * indépendamment (limite atteinte, équipe introuvable…) sans bloquer les
 * autres — c'est une action groupée explicitement déclenchée, pas un
 * enrichissement automatique.
 */
export async function resolveFormForTeams(teamRequests) {
  const uniqueByKey = new Map();
  for (const request of teamRequests) {
    const key = `${request.name.toLowerCase()}|${request.league}`;
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, request);
  }

  const resultsByKey = new Map();
  const entries = [...uniqueByKey.entries()];

  for (let i = 0; i < entries.length; i += FORM_BATCH_SIZE) {
    const batch = entries.slice(i, i + FORM_BATCH_SIZE);
    await Promise.all(
      batch.map(async ([key, request]) => {
        resultsByKey.set(key, await resolveSingleTeamForm(request));
      })
    );
  }

  return (request) => resultsByKey.get(`${request.name.toLowerCase()}|${request.league}`) ?? null;
}

/**
 * Résout la forme récente d'une seule équipe par son nom (ex. clic sur un
 * nom d'équipe dans la liste des matchs, pour voir son historique complet).
 */
export async function resolveTeamFormByName(name, league, sampleSize) {
  return resolveSingleTeamForm({ name, league }, sampleSize);
}

async function resolveSingleTeamForm(request, sampleSize) {
  try {
    const leagueId = await resolveLeagueId(request.league);
    if (!leagueId) return null;

    const team = await findBestTeamMatch(request.name);
    if (!team) return null;

    const form = await getRecentForm(team.id, leagueId, resolveCurrentSeason(), sampleSize);
    return { teamId: team.id, teamName: team.name, form };
  } catch {
    return null;
  }
}

/**
 * Moyennes de toutes les statistiques détaillées disponibles pour une
 * équipe par son nom (ex. clic sur une équipe dans le panneau d'analyse).
 */
export async function resolveAverageStatsByName(name, league, sampleSize) {
  const leagueId = await resolveLeagueId(league);
  if (!leagueId) return null;

  const team = await findBestTeamMatch(name);
  if (!team) return null;

  const stats = await getAverageMatchStats(team.id, leagueId, resolveCurrentSeason(), sampleSize);
  return { teamId: team.id, teamName: team.name, stats };
}

/**
 * Composition en direct d'un match réel, par nom d'équipe domicile + date de
 * coup d'envoi (ex. clic sur un match dans la liste). Ne dépend pas de la
 * ligue : `/fixtures` filtre déjà par équipe + date + saison.
 */
export async function resolveLiveLineups(homeName, commenceTimeIso) {
  const team = await findBestTeamMatch(homeName).catch(() => null);
  if (!team) return { available: false, reason: 'team_not_found' };

  const date = commenceTimeIso.slice(0, 10);
  const season = new Date(commenceTimeIso).getFullYear();
  return getLiveLineups(team.id, date, season);
}

/**
 * Score + statistiques en direct d'un match réel, par nom d'équipe domicile +
 * date de coup d'envoi — même principe que resolveLiveLineups.
 */
export async function resolveLiveMatchDetails(homeName, commenceTimeIso) {
  const team = await findBestTeamMatch(homeName).catch(() => null);
  if (!team) return { available: false, reason: 'team_not_found' };

  const date = commenceTimeIso.slice(0, 10);
  const season = new Date(commenceTimeIso).getFullYear();
  return getLiveMatchDetails(team.id, date, season);
}

/**
 * Effectif + stats individuelles des joueurs d'une équipe par son nom. Pas
 * de dépendance à la ligue non plus (`/players` ne filtre que par équipe +
 * saison) — saison par défaut = la plus récente disponible sur le plan
 * actuel (2024), ajustable via le paramètre.
 */
export async function resolvePlayersByName(name, season) {
  const team = await findBestTeamMatch(name).catch(() => null);
  if (!team) return null;

  const result = await getTeamPlayers(team.id, season ?? resolveCurrentSeason());
  return { teamId: team.id, teamName: team.name, ...result };
}
