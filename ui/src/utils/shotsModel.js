/**
 * Modèle statistique pour les tirs / tirs cadrés — des stats jamais
 * modélisées par le moteur de buts (Poisson + Dixon-Coles, cf.
 * server/src/core/model/). Calculé ici côté client, directement à partir
 * des moyennes 34 champs déjà chargées ("Moyennes des deux équipes"), sans
 * aller-retour serveur : c'est un simple Poisson indépendant par équipe
 * (moyenne saison = lambda), SANS la corrélation Dixon-Coles — celle-ci est
 * calibrée spécifiquement pour les buts au football et ne se transpose pas
 * aux tirs sans données dédiées. Un modèle plus simple, donc.
 */
const MAX_SIMULATED = 40;

function poissonProbability(x, lambda) {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= x; i++) result *= lambda / i;
  return result;
}

/** Probabilité que "home" fasse plus / autant / moins que "away" sur la statistique. */
export function compareTeamsPoisson(lambdaHome, lambdaAway) {
  if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway)) return null;

  let probHome = 0;
  let probEqual = 0;
  let probAway = 0;

  for (let h = 0; h <= MAX_SIMULATED; h++) {
    const ph = poissonProbability(h, lambdaHome);
    for (let a = 0; a <= MAX_SIMULATED; a++) {
      const p = ph * poissonProbability(a, lambdaAway);
      if (h > a) probHome += p;
      else if (h === a) probEqual += p;
      else probAway += p;
    }
  }

  const total = probHome + probEqual + probAway || 1;
  return { home: probHome / total, equal: probEqual / total, away: probAway / total };
}

/** Plus/Moins d'une ligne donnée pour une seule équipe (même forme que teamGoalsLineOdds). */
export function teamLineOddsPoisson(lambda, line) {
  if (!Number.isFinite(lambda)) return null;

  let probOver = 0;
  for (let x = 0; x <= MAX_SIMULATED; x++) {
    if (x > line) probOver += poissonProbability(x, lambda);
  }
  const probUnder = Math.max(0, 1 - probOver);

  const overOdds = probOver > 0 ? Number((1 / probOver).toFixed(2)) : null;
  const underOdds = probUnder > 0 ? Number((1 / probUnder).toFixed(2)) : null;

  let best = null;
  if (overOdds != null) best = { side: 'over', odds: overOdds };
  if (underOdds != null && (!best || underOdds < best.odds)) best = { side: 'under', odds: underOdds };

  return { overOdds, underOdds, best };
}

export const TOTAL_SHOTS_LINES = [8.5, 10.5, 12.5, 14.5];
export const SHOTS_ON_TARGET_TEAM_LINES = [2.5, 3.5, 4.5, 5.5];
