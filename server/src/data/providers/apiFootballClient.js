import { env } from '../../config/env.js';

/**
 * Client HTTP brut pour l'API-Sports Football v3 (compte direct sur
 * api-football.com, authentification par l'en-tête x-apisports-key — pas la
 * variante RapidAPI). Ne fait aucune transformation métier : ce sont les
 * fonctions de `teamStatsService.js` qui interprètent les réponses.
 */
async function callApiFootball(path, params = {}, { fullBody = false } = {}) {
  if (!env.apiFootball.apiKey) {
    throw new Error("Clé API-Football manquante : renseignez API_FOOTBALL_KEY dans server/.env");
  }

  const url = new URL(`${env.apiFootball.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { 'x-apisports-key': env.apiFootball.apiKey }
  });

  if (response.status === 429) {
    throw new Error('Limite de débit API-Football atteinte (plan gratuit : 100 requêtes/jour) — réessayez plus tard.');
  }
  if (!response.ok) {
    throw new Error(`API-Football a répondu ${response.status} sur ${path}`);
  }

  const body = await response.json();
  if (body.errors?.rateLimit) {
    throw new Error('Limite de débit API-Football atteinte (trop de requêtes par minute) — réessayez dans un instant.');
  }
  if (body.errors && (Array.isArray(body.errors) ? body.errors.length > 0 : Object.keys(body.errors).length > 0)) {
    throw new Error(`Erreur API-Football : ${JSON.stringify(body.errors)}`);
  }

  // /players a besoin de body.paging (nombre de pages) en plus de
  // body.response — toutes les autres fonctions de ce fichier n'utilisent
  // que la liste de résultats, d'où ce flag plutôt qu'un changement de
  // contrat global.
  return fullBody ? body : body.response;
}

export function searchTeamsRaw(query) {
  return callApiFootball('/teams', { search: query });
}

export function searchLeaguesRaw(query) {
  return callApiFootball('/leagues', { search: query });
}

/** Réponse à part : /teams/statistics renvoie un objet unique, pas une liste. */
export function getTeamStatisticsRaw(teamId, leagueId, season) {
  return callApiFootball('/teams/statistics', { team: teamId, league: leagueId, season });
}

/**
 * Le paramètre "last" n'est pas autorisé sur le plan gratuit : on récupère
 * toutes les rencontres de la saison et on sélectionne les plus récentes
 * côté serveur (cf. teamStatsService.js).
 */
export function getTeamFixturesRaw(teamId, leagueId, season) {
  return callApiFootball('/fixtures', { team: teamId, league: leagueId, season });
}

export function getFixtureStatisticsRaw(fixtureId) {
  return callApiFootball('/fixtures/statistics', { fixture: fixtureId });
}

/** Le classement est renvoyé imbriqué : response[0].league.standings[0] est le tableau des équipes. */
export function getStandingsRaw(leagueId, season) {
  return callApiFootball('/standings', { league: leagueId, season });
}

/** "season" reste obligatoire même en filtrant par équipe + date (l'API le rejette sinon). */
export function searchFixturesByTeamAndDateRaw(teamId, date, season) {
  return callApiFootball('/fixtures', { team: teamId, date, season });
}

/** Composition publiée par les clubs — généralement disponible ~1h avant le coup d'envoi, pas avant. */
export function getFixtureLineupsRaw(fixtureId) {
  return callApiFootball('/fixtures/lineups', { fixture: fixtureId });
}

/** Paginé (20 joueurs/page) — d'où fullBody:true pour lire body.paging.total. */
export function getPlayersRaw(teamId, season, page = 1) {
  return callApiFootball('/players', { team: teamId, season, page }, { fullBody: true });
}
