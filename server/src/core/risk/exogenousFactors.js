/**
 * Facteur exogène (poids faible, +/- 2% max) : conditions météo et état du
 * terrain. Impact volontairement borné car peu fiable statistiquement.
 */
export function computeExogenousFactor(matchContext) {
  if (!matchContext) return 1.0;

  // Vent fort/pluie et terrain dégradé RÉDUISENT la qualité technique du jeu
  // (contrôle de balle, précision des passes, occasions nettes) : le score
  // brut doit baisser sous 1.0, pas monter — c'était inversé.
  let rawScore = 1.0;
  if (matchContext.criticalWeather === 'strong_wind' || matchContext.criticalWeather === 'heavy_rain') {
    rawScore = 0.75;
  }
  if (matchContext.pitchCondition === 'degraded_turf') {
    rawScore *= 0.9;
  }

  const normalizedImpact = 1.0 + (rawScore - 1.0) * 0.1;
  return Math.max(0.98, Math.min(1.02, normalizedImpact));
}
