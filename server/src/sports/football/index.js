import { listAdaptedMatches } from '../../data/matchSources.js';
import { enrichMatchWithRealAverages } from '../../data/providers/matchEnrichment.js';
import { resolveBaseRates, computeMarketProbabilities } from './model.js';
import { deriveMarketPredictions, MARKET_LABELS, MARCHES_CONNUS, distributionDuMarche } from './markets.js';
import { statExpectations, statLines } from './statMarkets.js';

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
    statExpectations,
    // Étape 8 : les cotes justes de chaque ligne de corners, tirs et tirs cadrés (binomiale négative mesurée).
    statLines,
    labels: MARKET_LABELS,
    // Étape 25 : les familles de marchés connues, et la distribution complète d'un marché à la ligne d'un pronostic.
    connus: MARCHES_CONNUS,
    distributionDuMarche
  },
  provider: {
    listMatches: listAdaptedMatches,
    enrichMatch: enrichMatchWithRealAverages
  }
};
