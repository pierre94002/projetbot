import { listAdaptedMatches } from '../../data/matchSources.js';
import { enrichMatchWithRealAverages } from '../../data/providers/matchEnrichment.js';
import { resolveBaseRates, computeMarketProbabilities } from './model.js';

/**
 * Façade uniquement — aucun fichier de data/providers ni data/adapters n'a
 * bougé physiquement. Ce module réexporte l'existant derrière la frontière
 * `Sport` : c'est cette frontière qui compte structurellement, pas
 * l'emplacement des fichiers (déplacement cosmétique remis à plus tard si
 * besoin). `markets.deriveMarketPredictions` arrive à la phase suivante,
 * quand elle sera réellement branchée (voir sports/football/markets.js).
 */
export const football = {
  id: 'football',
  model: {
    resolveBaseRates,
    computeMarketProbabilities
  },
  markets: {},
  provider: {
    listMatches: listAdaptedMatches,
    enrichMatch: enrichMatchWithRealAverages
  }
};
