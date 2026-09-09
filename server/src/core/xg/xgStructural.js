/**
 * Dérive lambda/mu (buts attendus) à partir de la force offensive/défensive
 * relative de chaque équipe par rapport à la moyenne de sa ligue — le modèle
 * "structurel" classique de Dixon-Coles, distinct du signal marché.
 *
 * lambda = (homeAttack / leagueHomeAvg) * (awayDefense / leagueAwayAvg) * leagueHomeAvg * homeAdvantage
 * mu     = (awayAttack / leagueAwayAvg) * (homeDefense / leagueHomeAvg) * leagueAwayAvg
 */
export function computeStructuralExpectedGoals({
  homeAttack,
  homeDefense,
  awayAttack,
  awayDefense,
  leagueHomeAvg,
  leagueAwayAvg,
  homeAdvantage
}) {
  const safeLeagueHomeAvg = Math.max(0.1, leagueHomeAvg);
  const safeLeagueAwayAvg = Math.max(0.1, leagueAwayAvg);

  const lambda = (homeAttack / safeLeagueHomeAvg) * (awayDefense / safeLeagueAwayAvg) * safeLeagueHomeAvg * homeAdvantage;
  const mu = (awayAttack / safeLeagueAwayAvg) * (homeDefense / safeLeagueHomeAvg) * safeLeagueAwayAvg;

  return { lambda, mu };
}
