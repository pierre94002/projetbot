/**
 * Étape 27 (le modèle de buts unique) : ce que partagent ses essais — ce n'est PAS un fichier de test.
 *
 * REGLAGES_MODELE_DE_BUTS : la clé `modeleDeButs` de la candidate (conception de l'étape 27, §1.2 ; mesurée par
 * mesures/modele m1 à m7 ; le démarrage à froid E6 retenu par m7 le 21/10/2026). Le code ne déclare la candidate
 * qu'à la livraison suivante (étape 3 de la conception) : les essais la POSENT eux-mêmes sur les réglages de la
 * copie.
 *
 * Une grille Poisson × Dixon-Coles écrite ICI, indépendamment de core/engine/goalModel.js : les essais de
 * cohérence comparent le code à elle, jamais le code à lui-même.
 */

export const REGLAGES_MODELE_DE_BUTS = Object.freeze({
  version: 1,
  rho: -0.05,
  demiVies: Object.freeze({ attaque: 35, defense: 25 }),
  prior: 8,
  statistique: 'mix',
  poidsXg: 0.7,
  changementDeChampionnat: 'remise-a-zero',
  ancrage: Object.freeze({ ligne: 2.5, methode: 'total-equilibre' }),
  melange: Object.freeze({ avecPlusMoins: Object.freeze({ wT: 0.1, wS: 0.1 }), sans: Object.freeze({ wT: 0.55, wS: 0.1 }) }),
  demarrageAFroid: Object.freeze({ matchs: 8 }),
  bornes: Object.freeze([0.2, 6])
});

/** Une copie modifiable des réglages du modèle, avec des changements (`{ rho: -0.2 }`…). */
export const reglagesDuModele = (changements = {}) => ({ ...JSON.parse(JSON.stringify(REGLAGES_MODELE_DE_BUTS)), ...changements });

/** Les réglages du moteur `config` avec la clé `modeleDeButs` (la candidate). */
export const avecLeModele = (config, changements = {}) => ({ ...JSON.parse(JSON.stringify(config)), modeleDeButs: reglagesDuModele(changements) });

// ------------------------------------------------------------ une grille écrite à part (l'oracle)

/** P(X = k) d'une loi de Poisson de moyenne m, par récurrence (sans factorielle). */
export function poisson(k, m) {
  let p = Math.exp(-m);
  for (let i = 1; i <= k; i++) p *= m / i;
  return p;
}

/** τ de Dixon-Coles (borné à 0,01 comme l'appli). */
export function tau(i, j, l, m, rho) {
  if (i === 0 && j === 0) return Math.max(0.01, 1 - l * m * rho);
  if (i === 1 && j === 0) return Math.max(0.01, 1 + m * rho);
  if (i === 0 && j === 1) return Math.max(0.01, 1 + l * rho);
  if (i === 1 && j === 1) return Math.max(0.01, 1 - rho);
  return 1;
}

/** La grille 0..n × 0..n (tableau de lignes), renormalisée ; `brute` : avant renormalisation, et sa somme. */
export function grille(l, m, rho, n = 20) {
  const g = [];
  let somme = 0;
  for (let i = 0; i <= n; i++) {
    const ligne = [];
    for (let j = 0; j <= n; j++) {
      const p = poisson(i, l) * poisson(j, m) * tau(i, j, l, m, rho);
      ligne.push(p);
      somme += p;
    }
    g.push(ligne);
  }
  return { cases: g.map((ligne) => ligne.map((p) => p / somme)), somme };
}

/** Somme des cases de la grille qui vérifient `garder(i, j)`. */
export function masse(g, garder) {
  let s = 0;
  for (let i = 0; i < g.length; i++) for (let j = 0; j < g[i].length; j++) if (garder(i, j)) s += g[i][j];
  return s;
}
