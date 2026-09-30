/**
 * Dérive lambda/mu (buts attendus) à partir de la force offensive/défensive
 * relative de chaque équipe par rapport à la moyenne de sa ligue — le modèle
 * "structurel" classique, distinct du signal marché.
 *
 *   lambda = (homeAttack / leagueHomeAvg) * (awayDefense / leagueHomeAvg) * leagueHomeAvg
 *   mu     = (awayAttack / leagueAwayAvg) * (homeDefense / leagueAwayAvg) * leagueAwayAvg
 *
 * `awayDefense` est ce que l'équipe visiteuse encaisse À L'EXTÉRIEUR, donc ce
 * que marquent les équipes qui reçoivent : il se rapporte à la moyenne
 * DOMICILE de la ligue. Symétriquement pour `homeDefense`. Une équipe dans
 * la moyenne donne ainsi exactement la moyenne de la ligue.
 *
 * Corrigé le 23/09/2026. L'ancienne formule divisait chaque défense par la
 * moyenne de l'AUTRE camp et multipliait encore par l'avantage du terrain,
 * déjà contenu dans les moyennes domicile : sur 23 992 matchs rejoués, elle
 * attendait 1,85 but à domicile pour 1,52 réels, 0,98 à l'extérieur pour
 * 1,21, et donnait 55,5 % de victoires à domicile pour 43,9 % réelles. Le
 * moteur recommandait alors un pari à domicile dans un match sur deux.
 * `homeAdvantage` n'est plus appliqué ici pour cette raison ; il reste
 * accepté pour ne pas casser les appelants.
 */
export function computeStructuralExpectedGoals({
  homeAttack,
  homeDefense,
  awayAttack,
  awayDefense,
  leagueHomeAvg,
  leagueAwayAvg
}) {
  const safeLeagueHomeAvg = Math.max(0.1, leagueHomeAvg);
  const safeLeagueAwayAvg = Math.max(0.1, leagueAwayAvg);

  const lambda = (homeAttack / safeLeagueHomeAvg) * (awayDefense / safeLeagueHomeAvg) * safeLeagueHomeAvg;
  const mu = (awayAttack / safeLeagueAwayAvg) * (homeDefense / safeLeagueAwayAvg) * safeLeagueAwayAvg;

  return { lambda, mu };
}
