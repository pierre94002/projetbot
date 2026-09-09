/**
 * Décide de l'action à prendre pour un match à partir de son edge (avantage
 * face au marché) et calcule la mise conseillée via le critère de Kelly
 * fractionné, plafonnée par un pourcentage max de la bankroll.
 */
export function evaluateStakingDecision(edge, bankroll, rateHome, rateAway, config, tiltState = {}) {
  if (tiltState.circuitBreakerActive) {
    return { action: 'CIRCUIT_BREAKER_ACTIVE', stake: null };
  }
  if (edge < config.edgeThresholdMin || edge > config.edgeThresholdMax) {
    return { action: 'PASS', stake: null };
  }
  // Garde-fou de plausibilité : si le taux attendu de l'équipe recommandée est
  // très inférieur à celui de l'adversaire, un edge positif sent plus le bruit
  // de modèle qu'un vrai value bet. Seuil configurable par sport
  // (maxExpectedRateGap, cf. engineConfig.js) plutôt qu'en dur ici.
  if (rateHome < rateAway - (config.maxExpectedRateGap ?? 0.4)) {
    return { action: 'PASS', stake: null };
  }

  const rawStake = Number(bankroll) * config.kellyFraction * edge;
  const maxAllowedStake = Number(bankroll) * config.maxStakePercent;
  const recommendedStake = Math.min(rawStake, maxAllowedStake);

  return {
    action: 'RECOMMENDED',
    stake: Number(Math.max(0, recommendedStake).toFixed(2))
  };
}
