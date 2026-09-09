import { searchTeams, getGoalsAverage, getCornersAverage, getFixtureStatistics } from '../../data/providers/teamStatsService.js';
import {
  resolveFormForTeams,
  resolveTeamFormByName,
  resolveAverageStatsByName,
  resolveLiveLineups,
  resolveLiveMatchDetails,
  resolvePlayersByName
} from '../../data/providers/matchEnrichment.js';
import { ApiError } from '../middlewares/errorHandler.js';

export async function getSearchTeams(req, res) {
  const query = req.query.query;
  if (!query || query.trim().length < 2) {
    throw new ApiError(400, 'Le paramètre "query" doit contenir au moins 2 caractères.');
  }
  const teams = await searchTeams(query.trim());
  res.json({ teams });
}

export async function getTeamGoals(req, res) {
  const teamId = Number(req.params.teamId);
  const league = Number(req.query.league);
  const season = Number(req.query.season);
  if (!league || !season) throw new ApiError(400, 'Les paramètres "league" et "season" sont requis.');

  const goals = await getGoalsAverage(teamId, league, season);
  res.json({ teamId, league, season, goals });
}

export async function getTeamCorners(req, res) {
  const teamId = Number(req.params.teamId);
  const league = Number(req.query.league);
  const season = Number(req.query.season);
  const sampleSize = req.query.sampleSize ? Number(req.query.sampleSize) : undefined;
  if (!league || !season) throw new ApiError(400, 'Les paramètres "league" et "season" sont requis.');

  const corners = await getCornersAverage(teamId, league, season, sampleSize);
  res.json({ teamId, league, season, corners });
}

/**
 * Forme récente de toutes les équipes d'une liste de matchs, en un seul
 * aller-retour. Coûte jusqu'à 2 appels API par équipe unique (déduplication
 * des équipes qui reviennent plusieurs fois dans la liste) — action groupée
 * explicite, jamais déclenchée automatiquement.
 */
export async function postBulkForm(req, res) {
  const matches = req.body?.matches;
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new ApiError(400, 'Le corps de la requête doit contenir un tableau "matches" non vide.');
  }

  const teamRequests = matches.flatMap((match) => [
    { name: match.home, league: match.league },
    { name: match.away, league: match.league }
  ]);

  const resolveForm = await resolveFormForTeams(teamRequests);

  const results = matches.map((match) => ({
    matchId: match.matchId,
    home: resolveForm({ name: match.home, league: match.league }),
    away: resolveForm({ name: match.away, league: match.league })
  }));

  res.json({ results });
}

/**
 * Historique d'une équipe par son nom (ex. clic sur un nom d'équipe dans la
 * liste des matchs). `full=true` renvoie toute la saison plutôt qu'un
 * échantillon — même coût en appels API (la liste de rencontres est
 * toujours récupérée en entier), simplement pas tronquée côté réponse.
 */
export async function getTeamFormByName(req, res) {
  const name = req.query.name;
  const league = req.query.league;
  const sampleSize = req.query.full === 'true' ? null : req.query.sampleSize ? Number(req.query.sampleSize) : undefined;
  if (!name || !league) throw new ApiError(400, 'Les paramètres "name" et "league" sont requis.');

  const result = await resolveTeamFormByName(name, league, sampleSize);
  if (!result) throw new ApiError(404, `Équipe ou compétition introuvable pour "${name}" / "${league}".`);

  res.json(result);
}

/**
 * Moyennes de toutes les statistiques détaillées disponibles pour une équipe
 * par son nom, sur ses N derniers matchs (défaut 10). Coûte jusqu'à N appels
 * API — action explicite, jamais déclenchée automatiquement.
 */
export async function getTeamAverageStatsByName(req, res) {
  const name = req.query.name;
  const league = req.query.league;
  const sampleSize = req.query.sampleSize ? Number(req.query.sampleSize) : undefined;
  if (!name || !league) throw new ApiError(400, 'Les paramètres "name" et "league" sont requis.');

  const result = await resolveAverageStatsByName(name, league, sampleSize);
  if (!result) throw new ApiError(404, `Équipe ou compétition introuvable pour "${name}" / "${league}".`);

  res.json(result);
}

/**
 * Composition en direct d'un match réel, par nom d'équipe domicile + heure
 * de coup d'envoi. Renvoie toujours 200 avec `available: false` (et une
 * raison) quand la compo n'est pas accessible — jamais publiée pour un match
 * si lointain, saison hors plan gratuit, équipe introuvable — ce n'est pas
 * une erreur serveur, juste un contenu absent.
 */
export async function getLineupsByName(req, res) {
  const name = req.query.name;
  const commenceTime = req.query.commenceTime;
  if (!name || !commenceTime) throw new ApiError(400, 'Les paramètres "name" et "commenceTime" sont requis.');

  const result = await resolveLiveLineups(name, commenceTime);
  res.json(result);
}

/**
 * Score + statistiques en direct d'un match réel, par nom d'équipe domicile +
 * heure de coup d'envoi. Même contrat que getLineupsByName : toujours 200
 * avec `available: false` (et une raison) plutôt qu'une erreur serveur
 * quand la donnée n'est pas accessible (ex. saison hors plan gratuit).
 */
export async function getLiveMatchByName(req, res) {
  const name = req.query.name;
  const commenceTime = req.query.commenceTime;
  if (!name || !commenceTime) throw new ApiError(400, 'Les paramètres "name" et "commenceTime" sont requis.');

  const result = await resolveLiveMatchDetails(name, commenceTime);
  res.json(result);
}

/** Effectif + stats individuelles des joueurs d'une équipe par son nom, pour une saison (défaut : la plus récente disponible). */
export async function getPlayersByName(req, res) {
  const name = req.query.name;
  const season = req.query.season ? Number(req.query.season) : undefined;
  if (!name) throw new ApiError(400, 'Le paramètre "name" est requis.');

  const result = await resolvePlayersByName(name, season);
  if (!result) throw new ApiError(404, `Équipe introuvable pour "${name}".`);

  res.json(result);
}

/** Statistiques détaillées d'un match terminé (tirs, possession, corners, cartons, xG…). */
export async function getFixtureStats(req, res) {
  const fixtureId = Number(req.params.fixtureId);
  if (!fixtureId) throw new ApiError(400, 'Identifiant de match invalide.');

  const teams = await getFixtureStatistics(fixtureId);
  if (teams.length === 0) throw new ApiError(404, `Statistiques introuvables pour le match ${fixtureId}.`);

  res.json({ fixtureId, teams });
}
