import { listAdaptedMatches } from '../../data/matchSources.js';
import { enrichMatchWithRealAverages } from '../../data/providers/matchEnrichment.js';
import { resolveBaseRates, computeMarketProbabilities } from './model.js';
import { deriveMarketPredictions, MARKET_LABELS } from './markets.js';

/**
 * Façade uniquement — aucun fichier de data/providers ni data/adapters n'a
 * bougé physiquement. Ce module réexporte l'existant derrière la frontière
 * `Sport` : c'est cette frontière qui compte structurellement, pas
 * l'emplacement des fichiers (déplacement cosmétique remis à plus tard si
 * besoin).
 */
export const football = {
  id: 'football',
  model: {
    resolveBaseRates,
    computeMarketProbabilities
  },
  markets: {
    deriveMarketPredictions,
    labels: MARKET_LABELS
  },
  provider: {
    listMatches: listAdaptedMatches,
    enrichMatch: enrichMatchWithRealAverages
  }
};
