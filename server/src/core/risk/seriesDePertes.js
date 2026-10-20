/**
 * seriesDePertes.js — la ZONE NORMALE des séries de pertes (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Perdre plusieurs paris d'affilée est normal, même avec de la value : la
 * question est « jusqu'où le hasard seul va-t-il, avec CES cotes ? ». On y
 * répond par un calcul EXACT (pas une simulation) : pour des paris
 * indépendants joués dans l'ordre, chacun avec sa probabilité de gagner,
 * la loi de la plus longue série de pertes.
 *
 * Programmation dynamique sur la longueur de la série EN COURS : après
 * chaque pari, la probabilité d'être en série de r pertes (r = 0 … N) sans
 * jamais avoir dépassé N. Un gain ramène à 0, une perte fait r + 1 ; la
 * masse qui passerait à N + 1 sort. P(plus longue série ≤ N) est ce qui
 * reste après le dernier pari. O(n × N) par valeur de N.
 *
 * « Série de pertes normale jusqu'à N » : le plus petit N tel que le hasard
 * ne fait pas pire 95 fois sur 100 (SEUIL_ZONE_NORMALE) sur ces n paris.
 * Une série en cours plus longue que N « sort de la zone normale » : le
 * hasard seul la donne moins d'une fois sur 20 — un signal, jamais une
 * preuve (le guide de lecture le dit : une série d'une dizaine de pertes sur
 * quelques centaines de paris n'a rien d'exceptionnel).
 *
 * Pur : ni disque, ni base, ni réseau.
 * -----------------------------------------------------------------------
 */

/** La zone normale : ce que le hasard ne dépasse pas 95 fois sur 100. */
export const SEUIL_ZONE_NORMALE = 0.95;
/** Tolérance des comparaisons de probabilités (sommes de flottants). */
const EPS = 1e-12;

const probaValide = (p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;

function controler(probasGain) {
  if (!Array.isArray(probasGain)) throw new TypeError('probasGain : une liste de probabilités de gain.');
  for (const [i, p] of probasGain.entries()) {
    if (!probaValide(p)) throw new RangeError(`probasGain[${i}] = ${p} : une probabilité entre 0 et 1.`);
  }
}

/**
 * P(la plus longue série de pertes ≤ N) — calcul exact.
 * @param {number[]} probasGain probabilité de GAGNER chaque pari, dans l'ordre où ils se règlent
 * @param {number} N longueur de série (entier ≥ 0)
 */
export function probabiliteSerieAuPlus(probasGain, N) {
  controler(probasGain);
  if (!Number.isInteger(N) || N < 0) throw new RangeError(`N = ${N} : un entier positif ou nul.`);
  if (N >= probasGain.length) return 1;
  let etat = new Float64Array(N + 1);
  etat[0] = 1;
  for (const p of probasGain) {
    const q = 1 - p;
    const suivant = new Float64Array(N + 1);
    let total = 0;
    for (let r = 0; r <= N; r++) total += etat[r];
    // Un gain, depuis n'importe quelle série : retour à 0.
    suivant[0] = total * p;
    // Une perte : la série s'allonge ; celle qui passerait à N + 1 sort du compte.
    for (let r = 0; r < N; r++) suivant[r + 1] += etat[r] * q;
    etat = suivant;
  }
  let reste = 0;
  for (let r = 0; r <= N; r++) reste += etat[r];
  return Math.min(1, Math.max(0, reste));
}

/** P(au moins une série d'au moins k pertes d'affilée) sur ces paris. */
export function probabiliteSerieAuMoins(probasGain, k) {
  if (!Number.isInteger(k) || k < 0) throw new RangeError(`k = ${k} : un entier positif ou nul.`);
  if (k === 0) return 1;
  return Math.max(0, 1 - probabiliteSerieAuPlus(probasGain, k - 1));
}

/**
 * La zone normale des séries de pertes pour ces paris.
 * @returns {{ n: number, seuil: number, jusqua: number|null, mediane: number|null,
 *   repartition: { serie: number, probaAuPlus: number }[] }}
 *   `jusqua` : « série de pertes normale jusqu'à N » ; `repartition` : P(plus longue ≤ k)
 *   de k = 0 jusqu'à `jusqua` + 2 (au plus n).
 */
export function zoneNormaleDesSeries(probasGain, { seuil = SEUIL_ZONE_NORMALE } = {}) {
  controler(probasGain);
  if (!(seuil > 0 && seuil < 1)) throw new RangeError(`seuil = ${seuil} : strictement entre 0 et 1.`);
  const n = probasGain.length;
  if (!n) return { n: 0, seuil, jusqua: null, mediane: null, repartition: [] };
  const repartition = [];
  let mediane = null;
  let jusqua = null;
  for (let N = 0; N <= n; N++) {
    const F = probabiliteSerieAuPlus(probasGain, N);
    repartition.push({ serie: N, probaAuPlus: F });
    if (mediane === null && F >= 0.5 - EPS) mediane = N;
    if (jusqua === null && F >= seuil - EPS) jusqua = N;
    if (jusqua !== null && (N >= jusqua + 2 || F >= 1 - EPS)) break;
  }
  return { n, seuil, jusqua, mediane, repartition };
}

/**
 * Les séries d'un carnet réglé, dans l'ordre : la série EN COURS (pertes à la
 * fin) et la PLUS LONGUE (la plus récente en cas d'égalité), avec leurs rangs.
 * @param {('won'|'lost')[]} issues
 */
export function seriesDuCarnet(issues = []) {
  let enCours = 0;
  let plusLongue = 0;
  let debutPlusLongue = null;
  let finPlusLongue = null;
  let debut = null;
  issues.forEach((issue, i) => {
    if (issue === 'lost') {
      if (enCours === 0) debut = i;
      enCours += 1;
      if (enCours >= plusLongue) {
        plusLongue = enCours;
        debutPlusLongue = debut;
        finPlusLongue = i;
      }
    } else if (issue === 'won') {
      enCours = 0;
      debut = null;
    } else {
      throw new RangeError(`issues[${i}] = ${issue} : « won » ou « lost » (un pari annulé ou en attente ne compte pas).`);
    }
  });
  return { enCours, plusLongue, debutPlusLongue, finPlusLongue };
}
