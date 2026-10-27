/**
 * entreesSimulation.js — DE QUELS BUTS ATTENDUS PART LA SIMULATION (étape 28 du plan, conception §1.1).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge. Une seule porte d'entrée, `entreesDeLAnalyse`, qui LIT un résultat
 * d'analyzeMatch (jamais un calcul du moteur refait) :
 *   - sans la clé `modeleDeButs` (le service d'aujourd'hui) : λ, μ = expectedGoals de l'ancien modèle, ρ =
 *     defaultCorrelation des réglages, grille « ancien-81 » (la formule de computeScoreMatrix posée sur 21 × 21) ;
 *   - avec la clé (la candidate à blanc aujourd'hui, le service après l'adoption de l'étape 27) : λ, μ, ρ du résumé
 *     `modeleDeButs` (3 décimales), grille « modele-buts-441 » = grilleDesButs(λ, μ, ρ) de goalModel.js — jamais
 *     les 81 cases de distributions.scoreExact (la masse au-delà de 8 buts y manque) ;
 *   - fair = distributions.result (le 1N2 affiché) : pour l'alignement de l'ÉCRAN et d'un COMBINÉ seulement,
 *     jamais au banc ni dans les lignes rangées (grille brute).
 * -----------------------------------------------------------------------
 */

import { grilleDesButs } from '../../core/engine/goalModel.js';
import { grilleAncienne81, EntreeInvalide } from './simulationMatch.js';
import { TAILLE_GRILLE } from './reglages.js';

/** Les deux grilles possibles (colonne `grille` des lignes rangées). */
export const GRILLES = Object.freeze({ modeleDeButs: 'modele-buts-441', ancien: 'ancien-81' });

const T = TAILLE_GRILLE;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const trois = (x) => Number(x.toFixed(3));

/** Le 1N2 affiché { home, draw, away } (ou [h, n, a]), contrôlé ; null s'il manque. */
function lireFair(fair) {
  if (!fair) return null;
  const f = Array.isArray(fair) ? { home: fair[0], draw: fair[1], away: fair[2] } : { home: fair.home, draw: fair.draw, away: fair.away };
  return [f.home, f.draw, f.away].every((p) => fini(p) && p >= 0) ? f : null;
}

/**
 * Les entrées de la simulation lues dans un résultat d'analyzeMatch. `config` : les réglages du moteur qui ont fait
 * ce calcul (pour ρ de l'ancien modèle). Rend { grille, lambda, mu, rho, fair, engineVersion } ; lève EntreeInvalide
 * quand les buts attendus manquent (la nuit compte la rencontre et la nomme).
 */
export function entreesDeLAnalyse(resultat, config) {
  if (!resultat || typeof resultat !== 'object') throw new EntreeInvalide('entreesDeLAnalyse : résultat d’analyse absent.');
  const fair = lireFair(resultat.distributions?.result);
  const engineVersion = Number.isInteger(resultat.engineVersion) ? resultat.engineVersion : null;
  const mb = resultat.modeleDeButs;
  if (mb) {
    const lambda = mb.expectedGoals?.home;
    const mu = mb.expectedGoals?.away;
    if (!fini(lambda) || !fini(mu) || lambda <= 0 || mu <= 0 || !fini(mb.rho)) throw new EntreeInvalide('entreesDeLAnalyse : buts attendus du modèle de buts absents.');
    return { grille: GRILLES.modeleDeButs, lambda: trois(lambda), mu: trois(mu), rho: mb.rho, fair, engineVersion };
  }
  const lambda = resultat.expectedGoals?.home;
  const mu = resultat.expectedGoals?.away;
  const rho = config?.defaultCorrelation;
  if (!fini(lambda) || !fini(mu) || lambda <= 0 || mu <= 0) throw new EntreeInvalide('entreesDeLAnalyse : buts attendus de l’analyse absents.');
  if (!fini(rho)) throw new EntreeInvalide('entreesDeLAnalyse : defaultCorrelation absente des réglages.');
  return { grille: GRILLES.ancien, lambda: trois(lambda), mu: trois(mu), rho, fair, engineVersion };
}

/** La grille (Float64Array de 441, indice home × 21 + away) que définissent des entrées rangées : la même à l'octet. */
export function grilleDesEntrees(e) {
  if (!e || !fini(e.lambda) || !fini(e.mu) || !fini(e.rho)) throw new EntreeInvalide('grilleDesEntrees : entrées incomplètes.');
  if (e.grille === GRILLES.modeleDeButs) return grilleDesButs(e.lambda, e.mu, e.rho);
  if (e.grille === GRILLES.ancien) return grilleAncienne81(e.lambda, e.mu, e.rho);
  throw new EntreeInvalide(`grilleDesEntrees : grille inconnue « ${String(e.grille)} ».`);
}

/**
 * La grille ALIGNÉE sur le 1N2 affiché (l'écran, un combiné ; jamais le banc) : chaque case (i, j) × fair[camp] /
 * grille[camp], camp = 1, N ou 2 selon i ≷ j — ce que fait alignResultAndTotal dans le moteur. La répartition des
 * scores À RÉSULTAT DONNÉ reste celle de la grille. Un nouveau tableau ; la grille reçue n'est pas touchée.
 */
export function alignerSurLe1N2(grille, fair) {
  if (!((Array.isArray(grille) || ArrayBuffer.isView(grille)) && grille.length === T * T)) throw new EntreeInvalide('alignerSurLe1N2 : grille de 441 cases attendue.');
  const f = lireFair(fair);
  if (!f) throw new EntreeInvalide('alignerSurLe1N2 : 1N2 affiché absent.');
  const camp = [0, 0, 0];
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) camp[i > j ? 0 : i === j ? 1 : 2] += grille[i * T + j];
  const cible = [f.home, f.draw, f.away];
  const facteur = camp.map((m, c) => (m > 0 ? cible[c] / m : 0));
  const sortie = new Float64Array(T * T);
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) sortie[i * T + j] = grille[i * T + j] * facteur[i > j ? 0 : i === j ? 1 : 2];
  return sortie;
}
