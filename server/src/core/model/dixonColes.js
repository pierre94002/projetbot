/**
 * Correction de Dixon-Coles : ajuste la double distribution de Poisson pour
 * corriger la sous-estimation des scores faibles (0-0, 1-0, 0-1, 1-1), où
 * les deux issues sont statistiquement corrélées (paramètre rho).
 */
export function dixonColesAdjustment(homeGoals, awayGoals, lambda, mu, rho) {
  // τ(1,0) doit utiliser mu (l'équipe qui n'a PAS marqué est l'extérieur,
  // donc c'est SON taux attendu qui module la correction) et τ(0,1) doit
  // utiliser lambda (symétrique) — lambda/mu étaient inversés ici par
  // rapport à la formule Dixon-Coles standard.
  if (homeGoals === 0 && awayGoals === 0) return Math.max(0.01, 1 - lambda * mu * rho);
  if (homeGoals === 1 && awayGoals === 0) return Math.max(0.01, 1 + mu * rho);
  if (homeGoals === 0 && awayGoals === 1) return Math.max(0.01, 1 + lambda * rho);
  if (homeGoals === 1 && awayGoals === 1) return Math.max(0.01, 1 - rho);
  return 1;
}
