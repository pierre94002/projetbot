/**
 * qualification.js — LA CHANCE DE SE QUALIFIER (étape 36 du plan, lot 1, 09/11/2026 ; la fiche v1, fixée avant le regard).
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge, aucun hasard ; un seul import, goalModel.js (la taille de la grille).
 *
 * Entrées : G, la grille des 90 minutes du match qui décide (21 × 21, indice dom × 21 + ext ; le club qui REÇOIT est
 * « dom ») ; l'avance au cumul vue de ce club (0 pour un match unique ou une finale) ; le format (dit, jamais calculé ici).
 *
 *   p90_dom = Σ G(i,j) sur i − j + avance > 0     p90_ext = Σ G(i,j) sur i − j + avance < 0
 *   p_egal  = Σ G(i,j) sur i − j + avance = 0     (égalité après 90 minutes, au cumul pour un retour)
 *   chance_dom = p90_dom + p_egal / 2             chance_ext = p90_ext + p_egal / 2
 *
 * Après 90 minutes : PILE OU FACE (prolongation et tirs au but), la décision de Pierre du 02/11/2026 pour les tirs au but ;
 * la prolongation modélisée n'est pas au lot 1 (Pierre ne joue pas « qualifié »). À l'écran, G est la grille de la page
 * (le 1N2 affiché, entreesSimulation.js) : les deux chiffres ne se contredisent jamais. Le lieu n'y entre jamais (T-N4).
 * -----------------------------------------------------------------------
 */

import { N_CALCUL } from '../../core/engine/goalModel.js';

const T = N_CALCUL + 1;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** La règle d'après 90 minutes de la fiche v1 : pile ou face. */
export const APRES_90 = 'pile-ou-face';

/**
 * Les trois masses d'une grille à une avance donnée : { p90Dom, p90Ext, pEgal } (leur somme = celle de la grille).
 * Lève sur une grille qui n'a pas 441 cases ou une avance non entière.
 */
export function issuesDeLaGrille(grille, avance = 0) {
  if (!((Array.isArray(grille) || ArrayBuffer.isView(grille)) && grille.length === T * T)) throw new RangeError(`issuesDeLaGrille : grille de ${T * T} cases attendue.`);
  if (!Number.isInteger(avance)) throw new RangeError('issuesDeLaGrille : avance entière attendue.');
  let p90Dom = 0;
  let p90Ext = 0;
  let pEgal = 0;
  for (let i = 0; i < T; i++) {
    for (let j = 0; j < T; j++) {
      const p = grille[i * T + j];
      if (!fini(p) || p === 0) continue;
      const d = i - j + avance;
      if (d > 0) p90Dom += p;
      else if (d < 0) p90Ext += p;
      else pEgal += p;
    }
  }
  return { p90Dom, p90Ext, pEgal };
}

/**
 * LA CHANCE DE QUALIFICATION (fiche v1). `grille` : la grille des 90 minutes (normalisée : sa somme fait 1) ; `avance` :
 * vue du club qui reçoit ; `format` : la règle d'après 90 minutes de la compétition (dite telle quelle). Rend
 * { dom: { p90, apres90, total }, ext: { … }, egal, apres90: 'pile-ou-face', format } — dom.total + ext.total = 1 (à la
 * masse de la grille près).
 */
export function chanceDeQualification({ grille, avance = 0, format = null }) {
  const { p90Dom, p90Ext, pEgal } = issuesDeLaGrille(grille, avance);
  const masse = p90Dom + p90Ext + pEgal;
  if (!(masse > 0)) throw new RangeError('chanceDeQualification : grille vide.');
  const dom = p90Dom / masse;
  const ext = p90Ext / masse;
  const egal = pEgal / masse;
  return {
    dom: { p90: dom, apres90: egal / 2, total: dom + egal / 2 },
    ext: { p90: ext, apres90: egal / 2, total: ext + egal / 2 },
    egal,
    apres90: APRES_90,
    format
  };
}

/** Le 1N2 À 90 MINUTES d'une grille (le match décisif seul, sans le cumul) : { home, draw, away }. */
export function unNDeuxDeLaGrille(grille) {
  const { p90Dom, p90Ext, pEgal } = issuesDeLaGrille(grille, 0);
  const masse = p90Dom + p90Ext + pEgal;
  return { home: p90Dom / masse, draw: pEgal / masse, away: p90Ext / masse };
}
