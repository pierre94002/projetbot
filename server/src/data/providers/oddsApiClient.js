import { env } from '../../config/env.js';

/**
 * Client pour The Odds API (plan gratuit "Starter" : 500 crédits/mois). Le
 * coût en crédits dépend du nombre de régions et de marchés demandés, pas
 * du nombre de matchs renvoyés — d'où l'appel volontairement minimal
 * (1 région, marché h2h) et l'absence de tout rafraîchissement automatique
 * dans le reste de l'application.
 */
export async function getSportOddsRaw(sportKey, { regions = 'eu', markets = 'h2h', oddsFormat = 'decimal' } = {}) {
  if (!env.oddsApi.apiKey) {
    throw new Error('Clé The Odds API manquante : renseignez ODDS_API_KEY dans server/.env');
  }

  const url = new URL(`${env.oddsApi.baseUrl}/sports/${sportKey}/odds/`);
  url.searchParams.set('apiKey', env.oddsApi.apiKey);
  url.searchParams.set('regions', regions);
  url.searchParams.set('markets', markets);
  url.searchParams.set('oddsFormat', oddsFormat);

  const response = await fetch(url);
  const quota = {
    remaining: parseIntHeader(response.headers.get('x-requests-remaining')),
    used: parseIntHeader(response.headers.get('x-requests-used'))
  };

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`The Odds API a répondu ${response.status} : ${body.message ?? 'erreur inconnue'}`);
  }

  const matches = await response.json();
  return { matches, quota };
}

function parseIntHeader(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
