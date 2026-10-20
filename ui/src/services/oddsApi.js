import { httpClient } from './httpClient.js';

/**
 * Cotes GRATUITES (04/10/2026) : relevées par l'appli chez ESPN,
 * football-data.co.uk, 365Scores, Kalshi et Smarkets, sans clé ni quota
 * (cf. server/src/data/providers/freeOdds.js).
 */
export const oddsApi = {
  /** Toutes les cotes d'un match, par source, bookmaker et marché, et la probabilité qu'elles donnent. */
  fixture: ({ home, away, league, commenceTime, matchKey = null }) => {
    const params = new URLSearchParams({ home, away, commenceTime });
    if (league) params.set('league', league);
    if (matchKey) params.set('matchKey', matchKey);
    return httpClient.get(`/odds/fixture?${params.toString()}`);
  },
  /** État de la collecte : boucle, dernier relevé, rattrapage de l'historique. */
  status: () => httpClient.get('/odds/status'),
  /** Pour chaque compétition : ce qu'on a en cotes, et ce qui manque. */
  coverage: ({ days = 7, force = false } = {}) => httpClient.get(`/odds/coverage?days=${days}${force ? '&force=1' : ''}`),
  /** Relevé immédiat des cotes des trois prochains jours (gratuit). */
  refresh: () => httpClient.post('/odds/refresh'),
  /** Les chutes de cotes des matchs à venir, de la plus forte à la plus faible (cf. droppingOdds.js). */
  dropping: ({ days = 3, minDrop = 5, force = false } = {}) =>
    httpClient.get(`/odds/dropping?days=${days}&minDrop=${minDrop}${force ? '&force=1' : ''}`),
  /** La valeur de clôture des pronostics du moteur (`predictions`) ou des paris (`bets`) (cf. closingValue.js). */
  closingValue: ({ scope = 'predictions', force = false } = {}) =>
    httpClient.get(`/odds/closing-value?scope=${scope}${force ? '&force=1' : ''}`),

  // ---- Les cotes de VOS bookmakers (étape 7 du plan) : aucune de ces routes n'appelle The Odds API.
  /** Le réglage de fraîcheur des cotes (délai, règle des compositions). */
  fraicheur: () => httpClient.get('/odds/fraicheur'),
  /** Enregistre le réglage de fraîcheur (idempotent). */
  enregistrerFraicheur: ({ maxAgeMinutes, avantCompos }) => httpClient.put('/odds/fraicheur', { maxAgeMinutes, avantCompos }),
  /** Quand un relevé payant vaut le coup (information seulement : le relevé reste le bouton de Réglages › Données). */
  conseilReleve: () => httpClient.get('/odds/conseil-releve'),
  /** Les cotes saisies à la main d'un match, avec leur value, leur heure et leur fraîcheur. */
  saisies: (matchId) => httpClient.get(`/odds/saisies?matchId=${encodeURIComponent(matchId)}`),
  /** Saisit (ou corrige) une cote vue chez un de vos bookmakers : { matchId, bookmaker, marketId, sens, ligne, equipe, joueur, cote }. */
  saisir: (saisie) => httpClient.put('/odds/saisies', saisie),
  /** Retire une cote saisie : { matchId, cle }. */
  retirerSaisie: ({ matchId, cle }) => httpClient.put('/odds/saisies/retrait', { matchId, cle })
};
