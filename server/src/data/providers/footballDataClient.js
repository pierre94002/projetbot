import { env } from '../../config/env.js';

/**
 * Client pour football-data.org (plan gratuit : 10 requêtes/minute,
 * 12 compétitions couvertes). Authentification par l'en-tête X-Auth-Token.
 */
async function callFootballData(path) {
  if (!env.footballData.apiKey) {
    throw new Error('Clé football-data.org manquante : renseignez FOOTBALL_DATA_API_KEY dans server/.env');
  }

  const response = await fetch(`${env.footballData.baseUrl}${path}`, {
    headers: { 'X-Auth-Token': env.footballData.apiKey }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`football-data.org a répondu ${response.status} : ${body.message ?? 'erreur inconnue'}`);
  }

  return response.json();
}

export async function getCompetitionsRaw() {
  const body = await callFootballData('/competitions');
  return body.competitions ?? [];
}
