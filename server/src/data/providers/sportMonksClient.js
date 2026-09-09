import { env } from '../../config/env.js';

/**
 * Client pour SportMonks Football API v3 (plan gratuit permanent, mais
 * limité à une sélection de championnats qui ne recoupe pas les données
 * actuelles de CôteMaster — branché pour exploration, pas encore utilisé
 * dans l'analyse). Authentification par le paramètre de requête `api_token`.
 */
async function callSportMonks(path, params = {}) {
  if (!env.sportMonks.apiKey) {
    throw new Error('Clé SportMonks manquante : renseignez SPORTMONKS_API_KEY dans server/.env');
  }

  const url = new URL(`${env.sportMonks.baseUrl}${path}`);
  url.searchParams.set('api_token', env.sportMonks.apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok || body.message) {
    throw new Error(`SportMonks a répondu : ${body.message ?? response.status}`);
  }

  return body.data;
}

export function getLeaguesRaw() {
  return callSportMonks('/leagues');
}

export function searchTeamsRaw(query) {
  return callSportMonks('/teams/search/' + encodeURIComponent(query));
}
