/**
 * Retire la marge du bookmaker (overround) d'un jeu de cotes 1N2 pour
 * obtenir des probabilités implicites "nettes", comparables aux
 * probabilités théoriques calculées par le moteur.
 */
export function removeBookmakerMargin(odds1, oddsDraw, odds2) {
  const safeOdds1 = Math.max(1.01, Number(odds1));
  const safeOddsDraw = Math.max(1.01, Number(oddsDraw));
  const safeOdds2 = Math.max(1.01, Number(odds2));

  const implied1 = 1 / safeOdds1;
  const impliedDraw = 1 / safeOddsDraw;
  const implied2 = 1 / safeOdds2;

  let overround = implied1 + impliedDraw + implied2;
  if (overround <= 1.0 || overround > 1.35) overround = 1.06;

  return {
    probability1: implied1 / overround,
    probabilityDraw: impliedDraw / overround,
    probability2: implied2 / overround,
    overroundPercent: Number(((overround - 1) * 100).toFixed(2))
  };
}
