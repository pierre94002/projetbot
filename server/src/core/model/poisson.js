/**
 * Distribution de Poisson - utilisée pour modéliser le nombre de buts marqués
 * par une équipe sur un match, à partir d'un taux moyen attendu (lambda).
 */

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

export function poissonProbability(goals, expectedGoals) {
  return (Math.exp(-expectedGoals) * Math.pow(expectedGoals, goals)) / factorial(goals);
}
