/**
 * Détermine une paire d'Expected Goals de référence pour un match, en
 * l'absence de statistiques avancées, à partir du niveau de la compétition.
 * Sert de point de départ avant lissage et pondération par les autres facteurs.
 */
const BASELINE_BY_TIER = {
  topTier: { xgHome: 1.64, xgAway: 1.19 },
  lowScoring: { xgHome: 1.44, xgAway: 1.26 },
  standard: { xgHome: 1.52, xgAway: 1.12 }
};

const TOP_TIER_SPORT_KEYS = ['spain_la_liga', 'soccer_epl'];
const LOW_SCORING_SPORT_KEYS = ['china_superleague', 'russia'];

export function getLeagueBaselineXg(sportKey, competitionMeta) {
  const isTopTier = competitionMeta?.plan === 'TIER_ONE' || TOP_TIER_SPORT_KEYS.some((key) => sportKey?.includes(key));
  if (isTopTier) return BASELINE_BY_TIER.topTier;

  const isLowScoring = LOW_SCORING_SPORT_KEYS.some((key) => sportKey?.includes(key));
  if (isLowScoring) return BASELINE_BY_TIER.lowScoring;

  return BASELINE_BY_TIER.standard;
}
