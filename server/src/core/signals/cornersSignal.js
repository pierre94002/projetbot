/**
 * Signal croisé "corners" : les corners sont un proxy de pression offensive
 * continue, distinct de la qualité des occasions (xG). Un écart entre la part
 * de corners d'une équipe et sa part de xG peut se lire dans les deux sens
 * (pression sans qualité, ou occasions de but non captées par le xG) — pas
 * assez tranché pour modifier les buts attendus. `factorHome`/`factorAway`
 * sont conservés à titre indicatif (affichage) mais ne sont plus appliqués
 * au calcul, cf. oddsEngine.js.
 */
export function computeCornersAdjustment(expectedGoalsHome, expectedGoalsAway, expectedCornersHome, expectedCornersAway, maxAdjustment) {
  if (expectedCornersHome === undefined || expectedCornersHome === null || expectedCornersAway === undefined || expectedCornersAway === null) {
    return null;
  }

  const totalXg = expectedGoalsHome + expectedGoalsAway;
  const totalCorners = Number(expectedCornersHome) + Number(expectedCornersAway);
  if (totalXg <= 0 || totalCorners <= 0) return null;

  const xgShareHome = expectedGoalsHome / totalXg;
  const cornersShareHome = Number(expectedCornersHome) / totalCorners;
  const delta = cornersShareHome - xgShareHome;
  const boundedAdjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, delta));

  // Delta positif pour le domicile = plus de corners que sa part de xG ne le
  // laisserait supposer — lecture ambiguë (pression sans qualité, ou
  // occasions non captées par le xG), affichée telle quelle sans trancher.
  return {
    expectedCornersHome: Number(expectedCornersHome),
    expectedCornersAway: Number(expectedCornersAway),
    xgShareHome: Number(xgShareHome.toFixed(3)),
    cornersShareHome: Number(cornersShareHome.toFixed(3)),
    deltaPercent: Number((delta * 100).toFixed(2)),
    deviationPercent: Number((boundedAdjustment * 100).toFixed(2)),
    factorHome: 1 - boundedAdjustment,
    factorAway: 1 + boundedAdjustment
  };
}
