/**
 * combiner.js — LA COMBINAISON DANS LE MOTEUR (étape 38 du plan, lot 2a, 16/11/2026 ; conception § 6.1).
 * -----------------------------------------------------------------------
 * Le seul endroit où le pourcentage d'une famille de marchés peut s'écarter de son ancre (le marché) : le mélange en
 * log-cotes E1, un poids β par signal, lu dans poidsDeLaCombinaison.js (des constantes recopiées PAR SCRIPT de la note
 * du banc, jamais un réglage, jamais une ligne de la base).
 *
 * AU LOT 2a, TOUS LES β SONT NULS (le banc du 04/11/2026 n'a rien prouvé) : le combiner est « à l'identité ».
 *   - le 1N2 (combinerLe1N2) rend la fusion d'avant, la même expression dans le même ordre, à l'octet :
 *       poids.market · P_marché + poids.structural · P_structurel + poids.exogenous · P_exogène
 *     (oddsEngine.js l'écrivait lui-même ; les deux derniers poids sont des vestiges, retirés avec le lot 2 de la 32) ;
 *   - toute autre famille (combinerLaFamille) rend son ancre telle quelle.
 * Avec un β non nul (lot 2b, jamais avant l'adoption de la candidate propre de la famille) : P(i) ∝ P_M(i) · Π_k
 * (P_k(i) / P_M(i))^β_k, renormalisé — la formule mesurée au banc (data/combinaison/formulesDeLaCombinaison.js, E1),
 * recopiée ici parce que le moteur n'importe jamais data/.
 *
 * Pur : ni horloge, ni hasard, ni base, ni fichier, ni réseau. N'importe que les poids.
 * -----------------------------------------------------------------------
 */

import { POIDS_DE_LA_COMBINAISON } from './poidsDeLaCombinaison.js';

/** La plus petite probabilité admise dans un logarithme (celle du banc : PROBA_MIN). */
const PROBA_MIN = 1e-6;
const borne = (p) => Math.min(1 - PROBA_MIN, Math.max(PROBA_MIN, p));

/** Les β d'une famille ({ signal: β }) ; une famille inconnue n'a aucun signal. */
export function poidsDeLaFamille(famille, poids = POIDS_DE_LA_COMBINAISON) {
  return poids?.familles?.[famille] ?? {};
}

/** Vrai si tous les β de la famille sont nuls (ou si elle n'en a pas) : le combiner est alors à l'identité. */
export function aLIdentite(famille, poids = POIDS_DE_LA_COMBINAISON) {
  return Object.values(poidsDeLaFamille(famille, poids)).every((b) => b === 0);
}

/**
 * E1 — le mélange en log-cotes. pM : la distribution de l'ancre (2 ou 3 issues) ; signaux : [P_k] (même forme) ;
 * betas : [β_k]. Tous les β nuls : rend une COPIE de pM, à l'octet, sans renormaliser.
 */
export function melangerEnLogCotes(pM, signaux = [], betas = []) {
  if (!Array.isArray(pM) || pM.length < 2) throw new RangeError('melangerEnLogCotes : la distribution du marché est obligatoire.');
  if (signaux.length !== betas.length) throw new RangeError('melangerEnLogCotes : un β par signal.');
  if (betas.every((b) => b === 0)) return [...pM];
  const l = pM.map((p, i) => {
    let s = Math.log(borne(p));
    for (let k = 0; k < signaux.length; k++) s += betas[k] * (Math.log(borne(signaux[k][i])) - Math.log(borne(p)));
    return s;
  });
  const m = Math.max(...l);
  const e = l.map((x) => Math.exp(x - m));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

/**
 * Une famille quelconque : son ancre `pM` et ses signaux ({ nom: distribution }). À β nuls : `pM` lui-même (le même
 * objet, rien n'est recalculé). Un signal absent ou sans poids ne pèse pas.
 */
export function combinerLaFamille(famille, pM, signaux = {}, poids = POIDS_DE_LA_COMBINAISON) {
  if (aLIdentite(famille, poids)) return pM;
  const betas = poidsDeLaFamille(famille, poids);
  const noms = Object.keys(betas).filter((nom) => betas[nom] !== 0 && Array.isArray(signaux?.[nom]));
  return melangerEnLogCotes(pM, noms.map((nom) => signaux[nom]), noms.map((nom) => betas[nom]));
}

/**
 * LE 1N2 DU MOTEUR. `marche` : [domicile, nul, extérieur] (la cote juste des bookmakers de référence, le repli, ou le
 * modèle de buts tempéré faute de cote) ; `structurel`, `exogene` : { home, draw, away } du modèle de buts ; `fusion` : les
 * poids du réglage (config.weights). À β nuls : la fusion d'avant, à l'octet. Avec un β (lot 2b) : le mélange en
 * log-cotes de cette fusion avec la partie statistique.
 * @returns {{ home: number, draw: number, away: number }}
 */
export function combinerLe1N2({ marche, structurel, exogene, fusion }, poids = POIDS_DE_LA_COMBINAISON) {
  const [marketProbHome, marketProbDraw, marketProbAway] = marche;
  const resultat = {
    home: fusion.market * marketProbHome + fusion.structural * structurel.home + fusion.exogenous * exogene.home,
    draw: fusion.market * marketProbDraw + fusion.structural * structurel.draw + fusion.exogenous * exogene.draw,
    away: fusion.market * marketProbAway + fusion.structural * structurel.away + fusion.exogenous * exogene.away
  };
  if (aLIdentite('1n2', poids)) return resultat;
  const [home, draw, away] = combinerLaFamille('1n2', [resultat.home, resultat.draw, resultat.away], { statistiques: [structurel.home, structurel.draw, structurel.away] }, poids);
  return { home, draw, away };
}
