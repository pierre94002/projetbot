import { env } from '../../config/env.js';
import { noterAppelApiFootball } from '../relevesDesSources.js';

/**
 * Client HTTP brut pour l'API-Sports Football v3 (compte direct sur
 * api-football.com, authentification par l'en-tête x-apisports-key — pas la
 * variante RapidAPI). Ne fait aucune transformation métier : ce sont les
 * fonctions de `teamStatsService.js` qui interprètent les réponses.
 *
 * Étape 14 du plan (07/10/2026) : chaque appel RÉEL est noté
 * (data/relevesDesSources.js) — heure, statut, chemin, et le compteur du jour
 * que la source renvoie dans ses en-têtes (plan gratuit : 100 par jour). La
 * santé des sources lit ces notes : on n'appelle jamais API-Football pour
 * lire son compteur. Un appel refusé faute de clé n'est pas un appel.
 */
async function callApiFootball(path, params = {}, { fullBody = false } = {}) {
  if (!env.apiFootball.apiKey) {
    throw new Error("Clé API-Football manquante : renseignez API_FOOTBALL_KEY dans server/.env");
  }

  const url = new URL(`${env.apiFootball.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetch(url, {
      headers: { 'x-apisports-key': env.apiFootball.apiKey }
    });
  } catch (error) {
    noterAppelApiFootball({ chemin: path, ok: false, erreur: error });
    throw error;
  }
  noterAppelApiFootball({ chemin: path, ok: response.ok, statut: response.status, entetes: response.headers });

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
