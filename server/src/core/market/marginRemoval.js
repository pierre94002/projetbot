/**
 * Retire la marge du bookmaker (overround) d'un jeu de cotes d'issues
 * mutuellement exclusives, pour obtenir des probabilités implicites
 * "nettes", comparables aux probabilités théoriques calculées par le
 * moteur. Générique (2 issues, 3 comme le 1N2 football, ou plus) — c'est
 * l'appelant qui sait combien d'issues et dans quel ordre.
 */
export function removeMargin(oddsList) {
  const safeOdds = oddsList.map((odds) => Math.max(1.01, Number(odds)));
  const implied = safeOdds.map((odds) => 1 / odds);

  let overround = implied.reduce((sum, p) => sum + p, 0);
  if (overround <= 1.0 || overround > 1.35) overround = 1.06;

  return {
    probabilities: implied.map((p) => p / overround),
    overroundPercent: Number(((overround - 1) * 100).toFixed(2))
  };
}
