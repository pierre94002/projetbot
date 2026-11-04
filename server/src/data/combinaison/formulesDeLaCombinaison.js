/**
 * formulesDeLaCombinaison.js — LES FORMULES PURES DE L'ÉTAPE 38 (lot 1a, 03-04/11/2026).
 * -----------------------------------------------------------------------
 * E1 (le mélange en log-cotes : un β par signal, appris ENSEMBLE face au marché, rétréci vers zéro), E2 (le recalage du
 * marché lui-même, α et β), E3 (le recalage monotone par dixièmes, 20 lignes fictives par dixième), le recalage de Cox
 * (rapporté, jamais un bras A de la confiance : monde COURBE), le rétrécissement par championnat (κ = σ²/τ²), la marge
 * retirée (marginRemoval.js), le FNV-1a des placebos, les pertes. Le cas nul EXACT : β = 0 rend P_M à l'octet (T-M1).
 * Pur : ni horloge, ni hasard, ni base, ni fichier (T-X3). Importe seulement la méthode puissance du moteur (lue, jamais
 * modifiée) et les réglages de l'étape.
 * -----------------------------------------------------------------------
 */

import { removeMargin } from '../../core/market/marginRemoval.js';
import { NEWTON, DIXIEMES, A_PRIORI } from './reglagesCombinaison.js';

/** La plus petite probabilité admise dans une perte (celle de bench/metrics.js : PROBA_MIN). */
export const PROBA_MIN = 1e-6;

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const borne = (p) => Math.min(1 - PROBA_MIN, Math.max(PROBA_MIN, p));

/** ℓ(p) = ln(p / (1 − p)). */
export const logit = (p) => Math.log(borne(p) / (1 - borne(p)));
/** σ(x) = 1 / (1 + e^−x). */
export const sigmoide = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/** FNV-1a 32 bits d'un texte (les placebos : jamais Math.random). */
export function fnv1a(texte) {
  let h = 0x811c9dc5;
  const s = String(texte);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** −ln p (p bornée à PROBA_MIN). */
export const perteLogDe = (p) => -Math.log(borne(p));

/** L'entropie croisée −Σ q_i ln p_i (la cible q = la clôture ; p bornées). */
export function entropieCroisee(p, q) {
  let s = 0;
  for (let i = 0; i < p.length; i++) s -= q[i] * Math.log(borne(p[i]));
  return s;
}

/** L'écart en points entre deux distributions : 100 × max_i |pA − pB|. */
export function pointsDEcart(pA, pB) {
  let m = 0;
  for (let i = 0; i < pA.length; i++) m = Math.max(m, Math.abs(pA[i] - pB[i]));
  return 100 * m;
}

/** La marge retirée d'une liste de cotes (méthode puissance du moteur) : les probabilités, ou null (cote manquante ou marge incohérente). */
export function enleverLaMarge(cotes) {
  if (!Array.isArray(cotes) || cotes.length < 2 || !cotes.every((o) => fini(o) && o > 1)) return null;
  const r = removeMargin(cotes);
  if (r.anomaly) return null;
  return [...r.probabilities];
}

/**
 * E1 — LE MÉLANGE EN LOG-COTES. pM : la distribution du marché (2 ou 3 issues) ; signaux : [P_k] (même forme) ;
 * betas : [β_k]. P(i) ∝ P_M(i) · Π_k (P_k(i) / P_M(i))^β_k, renormalisé (binaire : ℓ(P) = ℓ(P_M) + Σ β_k [ℓ(P_k) − ℓ(P_M)]).
 * Tous les β nuls : rend une COPIE de P_M, à l'octet, sans renormaliser (T-M1).
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

/** Le recalage de Cox d'une probabilité binaire : σ(α + β ℓ(p)) — RAPPORTÉ (jamais le bras A de la confiance). */
export const recalerParCox = (p, { alpha = 0, beta = 1 } = {}) => sigmoide(alpha + beta * logit(p));

/** E2 à trois issues : ln P(i) = α_i + β ln P_M(i) − ln Z, α_nul = 0. */
export function recalerLeMarche3(pM, { alphaDom = 0, alphaExt = 0, beta = 1 } = {}) {
  const a = [alphaDom, 0, alphaExt];
  const l = pM.map((p, i) => a[i] + beta * Math.log(borne(p)));
  const m = Math.max(...l);
  const e = l.map((x) => Math.exp(x - m));
  const t = e.reduce((x, y) => x + y, 0);
  return e.map((x) => x / t);
}

/**
 * LE LOGIT CONDITIONNEL (Newton, a priori gaussien) : la forme commune de E1 (β des signaux, offset ln P_M) et de E2
 * (α_i, β). Chaque ligne : { o: [offset par issue], x: [[valeur du paramètre j pour l'issue i] par paramètre], y: issue
 * réalisée (indice) } ; P(i) ∝ exp(o_i + Σ_j θ_j x_ji). `precision` : 1/σ0² par paramètre (0 = sans a priori).
 * Rend { theta, iterations, converge, information } (information = −hessienne au point, a priori compris).
 */
export function logitConditionnel(lignes, { nParams, precision = null, iterations = NEWTON.iterations, arret = NEWTON.arret, depart = null } = {}) {
  const m = nParams;
  const prec = precision ?? new Array(m).fill(0);
  const theta = depart ? [...depart] : new Array(m).fill(0);
  let it = 0;
  let converge = false;
  let H = null;
  for (; it < iterations; it++) {
    const g = new Array(m).fill(0);
    H = Array.from({ length: m }, () => new Array(m).fill(0));
    for (const l of lignes) {
      const k = l.o.length;
      const s = new Array(k);
      let mx = -Infinity;
      for (let i = 0; i < k; i++) {
        let v = l.o[i];
        for (let j = 0; j < m; j++) v += theta[j] * l.x[j][i];
        s[i] = v;
        if (v > mx) mx = v;
      }
      let t = 0;
      for (let i = 0; i < k; i++) {
        s[i] = Math.exp(s[i] - mx);
        t += s[i];
      }
      for (let i = 0; i < k; i++) s[i] /= t;
      const ex = new Array(m).fill(0);
      for (let j = 0; j < m; j++) for (let i = 0; i < k; i++) ex[j] += s[i] * l.x[j][i];
      for (let j = 0; j < m; j++) g[j] += l.x[j][l.y] - ex[j];
      for (let a = 0; a < m; a++) {
        for (let b = a; b < m; b++) {
          let c = 0;
          for (let i = 0; i < k; i++) c += s[i] * (l.x[a][i] - ex[a]) * (l.x[b][i] - ex[b]);
          H[a][b] += c;
          if (a !== b) H[b][a] += c;
        }
      }
    }
    for (let j = 0; j < m; j++) {
      g[j] -= prec[j] * theta[j];
      H[j][j] += prec[j];
    }
    const pas = resoudre(H, g);
    if (!pas) break;
    let max = 0;
    for (let j = 0; j < m; j++) {
      theta[j] += pas[j];
      max = Math.max(max, Math.abs(pas[j]));
    }
    if (max < arret) {
      converge = true;
      it++;
      break;
    }
  }
  return { theta, iterations: it, converge, information: H };
}

/** Résout H·x = g (Gauss avec pivot partiel) ; null si H est singulière. */
function resoudre(H, g) {
  const n = g.length;
  const A = H.map((r, i) => [...r, g[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r[n] / r[i]);
}

/**
 * Les lignes du logit conditionnel pour E1 : chaque observation { pM: [...], signaux: [[...]], y } → offset ln P_M,
 * x_k(i) = ln P_k(i) − ln P_M(i).
 */
export function lignesE1(observations) {
  return observations.map((ob) => ({
    o: ob.pM.map((p) => Math.log(borne(p))),
    x: ob.signaux.map((pk) => pk.map((p, i) => Math.log(borne(p)) - Math.log(borne(ob.pM[i])))),
    y: ob.y
  }));
}

/**
 * E1 — LES β APPRIS ENSEMBLE (jamais séparément puis additionnés) : β̂ = argmax Σ ln P(i*) − Σ β²/(2σ0²) ; et β̂ sans
 * a priori, rapporté. Rend { betas, sansAPriori, iterations, converge, ecartsTypes }.
 */
export function apprendreLesBetas(observations, { sigma0 = A_PRIORI.sigma0 } = {}) {
  if (!observations.length) return { betas: [], sansAPriori: [], iterations: 0, converge: false, ecartsTypes: [], n: 0 };
  const m = observations[0].signaux.length;
  const lignes = lignesE1(observations);
  const avec = logitConditionnel(lignes, { nParams: m, precision: new Array(m).fill(1 / (sigma0 * sigma0)) });
  const sans = logitConditionnel(lignes, { nParams: m, precision: new Array(m).fill(0) });
  const ecartsTypes = avec.information ? avec.information.map((r, j) => (r[j] > 0 ? 1 / Math.sqrt(r[j]) : null)) : new Array(m).fill(null);
  return { betas: avec.theta, sansAPriori: sans.theta, iterations: avec.iterations, converge: avec.converge, ecartsTypes, n: observations.length };
}

/**
 * E2 — LE RECALAGE DU MARCHÉ (sans a priori) : binaire { alpha, beta } de σ(α + β ℓ(P_M)) ; trois issues { alphaDom,
 * alphaExt, beta } de ln P(i) = α_i + β ln P_M(i) − ln Z. observations : { pM: [...], y }.
 */
export function apprendreLeRecalageDuMarche(observations) {
  if (!observations.length) return null;
  const k = observations[0].pM.length;
  if (k === 2) {
    const lignes = observations.map((ob) => ({ o: [0, 0], x: [[1, 0], [logit(ob.pM[0]), 0]], y: ob.y }));
    const r = logitConditionnel(lignes, { nParams: 2, depart: [0, 1] });
    return { alpha: r.theta[0], beta: r.theta[1], iterations: r.iterations, converge: r.converge, n: observations.length };
  }
  const lignes = observations.map((ob) => ({ o: [0, 0, 0], x: [[1, 0, 0], [0, 0, 1], ob.pM.map((p) => Math.log(borne(p)))], y: ob.y }));
  const r = logitConditionnel(lignes, { nParams: 3, depart: [0, 0, 1] });
  return { alphaDom: r.theta[0], alphaExt: r.theta[1], beta: r.theta[2], iterations: r.iterations, converge: r.converge, n: observations.length };
}

/** Le recalage de Cox appris (binaire) sur { p, y } : { alpha, beta } — rapporté seulement. */
export function apprendreCox(points) {
  if (!points.length) return null;
  const lignes = points.map((pt) => ({ o: [0, 0], x: [[1, 0], [logit(pt.p), 0]], y: pt.y === 1 ? 0 : 1 }));
  const r = logitConditionnel(lignes, { nParams: 2, depart: [0, 1] });
  return { alpha: r.theta[0], beta: r.theta[1], n: points.length };
}

/** Le dixième d'une probabilité (0 … 9), par les 9 bornes fixes. */
export function dixiemeDe(p) {
  let k = 0;
  while (k < DIXIEMES.bornes.length && p >= DIXIEMES.bornes[k]) k++;
  return k;
}

/**
 * LA TABLE DES DIXIÈMES (E3 ; le recalage commun et par classe de la confiance) : points { p, y } (y ∈ [0, 1] : une issue
 * 0/1, ou la probabilité de clôture), 10 cases par les 9 bornes fixes ; centre = moyenne des p de la case ; fréquence =
 * (Σ y + fictives × r) / (n + fictives), r = le centre (sans données, la table rend l'identité) ou, avec `vers`, la
 * fréquence que donne la table `vers` au centre (le recalage par classe est ramené vers le recalage COMMUN : sans écart
 * propre à la classe, les deux bras se rejoignent) ; puis rendue MONOTONE (regroupement des voisins en désordre, pondéré).
 * Les cases vides sont omises.
 */
export function tableDesDixiemes(points, { fictives = DIXIEMES.fictives, vers = null } = {}) {
  const n = new Array(10).fill(0);
  const sp = new Array(10).fill(0);
  const sy = new Array(10).fill(0);
  for (const pt of points) {
    const k = dixiemeDe(pt.p);
    n[k]++;
    sp[k] += pt.p;
    sy[k] += pt.y;
  }
  let blocs = [];
  for (let k = 0; k < 10; k++) {
    if (!n[k]) continue;
    const c = sp[k] / n[k];
    const r = vers ? recalerParDixiemes(c, vers) : c;
    blocs.push({ centres: [c], poids: n[k] + fictives, f: (sy[k] + fictives * r) / (n[k] + fictives), n: n[k] });
  }
  // Le regroupement des voisins en désordre (« pool adjacent violators »), pondéré par n + fictives.
  let change = true;
  while (change) {
    change = false;
    const suite = [];
    for (const b of blocs) {
      suite.push(b);
      while (suite.length >= 2 && suite[suite.length - 2].f > suite[suite.length - 1].f) {
        const y = suite.pop();
        const x = suite.pop();
        const poids = x.poids + y.poids;
        suite.push({ centres: [...x.centres, ...y.centres], poids, f: (x.f * x.poids + y.f * y.poids) / poids, n: x.n + y.n });
        change = true;
      }
    }
    blocs = suite;
  }
  const centres = [];
  const frequences = [];
  for (const b of blocs) for (const c of b.centres) {
    centres.push(c);
    frequences.push(b.f);
  }
  return { centres, frequences, n: points.length };
}

/** Le recalage par dixièmes : interpolation linéaire entre les centres ; aux bords, proportionnel vers 0 et vers 1. */
export function recalerParDixiemes(p, table) {
  const c = table?.centres ?? [];
  const f = table?.frequences ?? [];
  if (!c.length) return p;
  if (p <= c[0]) return borne(c[0] > 0 ? (p * f[0]) / c[0] : f[0]);
  const d = c.length - 1;
  if (p >= c[d]) return borne(c[d] < 1 ? 1 - ((1 - p) * (1 - f[d])) / (1 - c[d]) : f[d]);
  let k = 0;
  while (k < d && p > c[k + 1]) k++;
  const t = c[k + 1] > c[k] ? (p - c[k]) / (c[k + 1] - c[k]) : 0;
  return borne(f[k] + t * (f[k + 1] - f[k]));
}

/** L'écart moyen pondéré (en points) entre deux tables sur les mêmes points (ampleur de la confiance). */
export function ecartDesTables(points, tA, tB) {
  if (!points.length) return 0;
  let s = 0;
  for (const pt of points) s += Math.abs(recalerParDixiemes(pt.p, tA) - recalerParDixiemes(pt.p, tB));
  return (100 * s) / points.length;
}

/**
 * LE RÉTRÉCISSEMENT PAR CHAMPIONNAT (forme de la 33) : écarts [{ ligue, delta, variance }] ; τ² par les moments
 * (max(0, moyenne(δ²) − moyenne(var))) ; δ retenu = δ̂ · τ² / (τ² + var) (= n/(n + κ), κ = σ²/τ²). τ² = 0 rend 0 partout.
 */
export function retrecirParChampionnat(ecarts) {
  const lus = ecarts.filter((e) => fini(e.delta) && fini(e.variance) && e.variance > 0);
  if (!lus.length) return { tau2: 0, parLigue: {} };
  const m2 = lus.reduce((s, e) => s + e.delta * e.delta, 0) / lus.length;
  const mv = lus.reduce((s, e) => s + e.variance, 0) / lus.length;
  const tau2 = Math.max(0, m2 - mv);
  const parLigue = {};
  for (const e of lus) parLigue[e.ligue] = tau2 > 0 ? (e.delta * tau2) / (tau2 + e.variance) : 0;
  return { tau2, parLigue };
}

/** Une permutation déterministe (Fisher-Yates semé par FNV-1a) — pour les placebos « classes permutées dans une journée ». */
export function permutationSemee(n, graine) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let h = fnv1a(String(graine)) || 1;
  for (let i = n - 1; i > 0; i--) {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
