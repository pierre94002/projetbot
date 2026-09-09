/**
 * Facteur structurel (poids moyen, borné à +/-6%) : pressing (PPDA) et
 * fatigue/rotation d'effectif. Chaque sous-facteur est plafonné puis moyenné
 * pour éviter qu'un signal isolé ne domine l'estimation.
 */
export function computeStructuralFactor(tacticalData) {
  if (!tacticalData) return 1.0;

  const factors = [];

  if (tacticalData.opponentPpda !== undefined && Number(tacticalData.teamPpda) > 0) {
    const ratio = Number(tacticalData.opponentPpda) / Number(tacticalData.teamPpda);
    const pressingFactor = 1.0 + Math.max(-0.06, Math.min(0.06, (ratio - 1.0) * 0.1));
    factors.push(pressingFactor);
  }

  if (tacticalData.restDays !== undefined && tacticalData.squadRotation !== undefined) {
    const isFatigued = Number(tacticalData.restDays) <= 3 && Number(tacticalData.squadRotation) < 0.5;
    factors.push(isFatigued ? 0.94 : 1.06);
  }

  if (factors.length === 0) return 1.0;

  const average = factors.reduce((sum, value) => sum + value, 0) / factors.length;
  return Math.max(0.94, Math.min(1.06, average));
}
