/**
 * calculDuDirect.js — LE CALCUL EN DIRECT (étape 46 du plan, lot 1, partie A ; conception § 2.2, § 2.3, § 2.9 à § 2.11,
 * décisions O1, O2, P1, P2, critique R7, R8, R14, R21, R23 point 4, R33, R34, R35 points 1 et 7).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge, ni hasard, ni réseau, ni process.env. N'importe que data/simulation/reglages.js,
 * simulationMatch.js, entreesSimulation.js (R34), core/model/poisson.js (la règle simple, § 2.11) et les réglages du
 * direct. PARAMS, trancheDu, marchesDuScore, grilleDesEntrees, alignerSurLe1N2 sont IMPORTÉS, jamais recopiés ;
 * PARAMS_SANS_EFFETS est PASSÉ par l'appelant (R34 : simulationMatchsEnfant.js n'est pas importé ici).
 *
 * loiDuScoreFinal({ lambda, mu, params, depuis: { creneau, h, a, rh, ra }, part, coupes })
 *   LA PROPAGATION EXACTE de la chaîne de simulerMatch (simulationMatch.js l. 202-233) du créneau de départ au créneau
 *   91 : état (h, a, rh, ra) dans un Float64Array(3969) d'indice ((h·21 + a)·3 + rh)·3 + ra ; dans chaque créneau, les
 *   BUTS lisent l'état du DÉBUT (d = clip(h − a), r = clip(ra − rh), tranche b) : x = λ·profil[k]·MH[iH]·reste, loi de
 *   Poisson pour 0..7 buts, le reste sur 8 (l'inversion de simulerMatch) ; puis les ROUGES sur l'écart d'APRÈS les buts,
 *   q = rougeBande[bande(k)]·reste, ×rougeEtat ; `reste` = 1 − part dans le créneau de départ, 1 ensuite.
 *   Les COUPES sont NOMMÉES et OBLIGATOIRES (R21) : COUPES.direct (1e-9 / 1e-8, le direct et C0), COUPES.banc, COUPES.oracle,
 *   COUPES.aucune. Rend { grille (441 cases), somme, masseNegligee, massePlafonnee, etatsMax, rougesPlafonnes, rouges:
 *   { dePlus, home: [p0, p1, p2], away: [p0, p1, p2] } (j rouges DE PLUS, R23 point 4), coupes }. Plus de 2 rouges au
 *   départ (R35 point 1) : les comptes VRAIS servent à l'écart de rouges r ; seul « un rouge de plus possible » est borné.
 *   Les buts sont plafonnés à 20 en route ; `massePlafonnee` est un majorant de la masse plafonnée (comptée à chaque
 *   créneau) : un état déjà plafonné qui marque encore est recompté (correctif K7 du 13/11, constat 7 du calcul ; F1, qui
 *   l'ajoute à la masse négligée, n'en est que plus sévère).
 * regleSimple({ lambda, mu, depuis, part }) : LA RÈGLE SIMPLE DU TEMPS RESTANT (§ 2.11) — 99 minutes-équivalent (45 + 3,
 *   45 + 6) ; au début du créneau k il reste (45 − k) + 54 (k ≤ 44), 54 (k = 45), (91 − k) + 6 (46..90), 6 (k = 91) ;
 *   avec la part jouée : moins part × longueur du créneau (1, 3 au créneau 45, 6 au 91) ; buts restants Poisson
 *   indépendants de moyennes λ·reste/99 et μ·reste/99 ; ni effet du score, ni rouge.
 * ancrer({ ligne }) : `ancre` SANS RÉSIDUEL (R7) — (λ′, μ′), λ′ + μ′ = λ + μ, la répartition trouvée par dichotomie (40 pas)
 *   sur la grille fermée de la ligne (grilleDesEntrees) pour que P(1) − P(2) = fair.home − fair.away ; λ′ et μ′ dans
 *   [0,30 ; 4,0] ; cible hors d'atteinte → ARRÊTÉ À LA BORNE, l'écart restant rendu ; jamais `direct-v1` pour cette raison.
 * lecturesDuDirect({ ligne, depart, variantes, … }) : LES 7 VARIANTES de P1 (aucune autre), la variante AFFICHÉE de P2.
 * marchesDuDirect(grille, { h, a }) : les marchés rendus (§ 2.10), `etat` calculé depuis le SCORE COURANT.
 * minute0({ ligne, grilleC0 }) : R8 — pour chaque marché, { avant, direct, ecartPt, dit }.
 * cleDuCalcul / cleDeC0 : la clé de la table en mémoire (O1) et celle de C0 (R35 point 7), nombres écrits par String().
 * -----------------------------------------------------------------------
 */

import { PARAMS, NB_CRENEAUX, CRENEAU_MI_TEMPS, TAILLE_GRILLE, BUTS_MAX_PAR_CRENEAU, ROUGES_MAX } from '../simulation/reglages.js';
import { trancheDu, marchesDuScore, EntreeInvalide } from '../simulation/simulationMatch.js';
import { grilleDesEntrees, alignerSurLe1N2 } from '../simulation/entreesSimulation.js';
import { poissonProbability } from '../../core/model/poisson.js';
import {
  COUPES,
  ANCRAGE,
  REGLE_SIMPLE,
  LIGNES,
  SCORE_EXACT_CASES,
  ECART_DIT_PT,
  MASSE_NEGLIGEE_ERREUR,
  VARIANTES_CODEES,
  VARIANTES_AFFICHABLES,
  VARIANTE_AFFICHEE,
  MOYENNES_DES_CHAMPIONNATS,
  REPLI_CHAMPIONNAT
} from './reglagesDirect.js';

export { EntreeInvalide };

const T = TAILLE_GRILLE;
const BMAX = BUTS_MAX_PAR_CRENEAU;
const NR = ROUGES_MAX + 1;
const NE = T * T * NR * NR;
const DERNIER = NB_CRENEAUX - 1;
const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const entierPositif = (x) => Number.isInteger(x) && x >= 0;

/** Les identifiants des variantes codées (P1), dans l'ordre de reglagesDirect.js. */
export const IDS_DES_VARIANTES = Object.freeze(VARIANTES_CODEES.map((v) => v.id));

// ------------------------------------------------------------ la loi d'un créneau

/** La loi du nombre de buts d'un créneau : Poisson(x) pour j < 8, le reste sur 8 (l'inversion de simulerMatch). */
function loiDuCreneau(x, sortie) {
  let p = Math.exp(-x);
  let cum = 0;
  for (let j = 0; j < BMAX; j++) {
    sortie[j] = p;
    cum += p;
    p = (p * x) / (j + 1);
  }
  sortie[BMAX] = Math.max(0, 1 - cum);
  return sortie;
}

/** La troncature d'une loi : J = le plus petit indice dont la masse AU-DELÀ est sous eps, posée sur J. Rend J. */
function tronquer(loi, eps) {
  let queue = 0;
  let j = BMAX;
  while (j > 0 && queue + loi[j] < eps) {
    queue += loi[j];
    loi[j] = 0;
    j--;
  }
  loi[j] += queue;
  return j;
}

const BANDES = new WeakMap();
/** L'indice de la bande des rouges de chaque créneau (−1 : aucune bande, jamais de rouge), gardé par jeu de paramètres. */
function bandesDe(params) {
  let b = BANDES.get(params);
  if (!b) {
    b = new Int8Array(NB_CRENEAUX);
    for (let k = 0; k < NB_CRENEAUX; k++) b[k] = params.bandes.findIndex(([, de, a]) => k >= de && k <= a);
    BANDES.set(params, b);
  }
  return b;
}

function verifierParams(params) {
  const tableau = (v, n) => (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === n && Array.from(v).every((x) => fini(x) && x >= 0);
  if (!params || typeof params !== 'object') throw new EntreeInvalide('loiDuScoreFinal : paramètres absents.');
  if (!tableau(params.profil, NB_CRENEAUX) || !tableau(params.MH, 45) || !tableau(params.MA, 45)) throw new EntreeInvalide('loiDuScoreFinal : profil (92), MH et MA (45) attendus.');
  if (!Array.isArray(params.bandes) || !tableau(params.rougeBande, params.bandes.length) || !tableau(params.rougeEtat, 5)) throw new EntreeInvalide('loiDuScoreFinal : hasards des rouges absents.');
}

function verifierCoupes(coupes) {
  if (!coupes || typeof coupes !== 'object' || !fini(coupes.seuilEtat) || !fini(coupes.epsLoi) || coupes.seuilEtat < 0 || coupes.epsLoi < 0) {
    throw new EntreeInvalide('loiDuScoreFinal : les coupes sont obligatoires et nommées (R21) : COUPES.direct, COUPES.banc, COUPES.oracle ou COUPES.aucune.');
  }
}

/** Le départ vérifié : créneau 0..91, part dans [0 ; 1], buts 0..20 et rouges entiers positifs. */
function verifierDepart(depuis, part) {
  const d = depuis ?? {};
  if (!Number.isInteger(d.creneau) || d.creneau < 0 || d.creneau > DERNIER) throw new EntreeInvalide(`créneau de départ hors de 0..91 (${d.creneau}).`);
  if (!fini(part) || part < 0 || part > 1) throw new EntreeInvalide(`part jouée hors de [0 ; 1] (${part}).`);
  if (![d.h, d.a, d.rh ?? 0, d.ra ?? 0].every(entierPositif)) throw new EntreeInvalide('buts et rouges de départ : entiers positifs attendus.');
  if (d.h > T - 1 || d.a > T - 1) throw new EntreeInvalide(`plus de ${T - 1} buts au départ (${d.h}-${d.a}).`);
  return { creneau: d.creneau, h: d.h, a: d.a, rh: d.rh ?? 0, ra: d.ra ?? 0 };
}

// ------------------------------------------------------------ la propagation

/** LA LOI DU SCORE FINAL sachant l'état de départ (voir l'en-tête). */
export function loiDuScoreFinal({ lambda, mu, params = PARAMS, depuis, part = 0, coupes } = {}) {
  if (!fini(lambda) || !fini(mu) || lambda < 0 || mu < 0) throw new EntreeInvalide(`loiDuScoreFinal : λ et μ positifs attendus (${lambda}, ${mu}).`);
  verifierParams(params);
  verifierCoupes(coupes);
  const s0 = verifierDepart(depuis, part);
  const { profil, MH, MA, rougeBande, rougeEtat } = params;
  const bandeK = bandesDe(params);
  const seuil = coupes.seuilEtat;
  const epsLoi = coupes.epsLoi;
  // R35 point 1 : au-delà de 2 rouges, l'indice reste à 2 et le décalage garde le compte VRAI pour l'écart r.
  const offH = Math.max(0, s0.rh - ROUGES_MAX);
  const offA = Math.max(0, s0.ra - ROUGES_MAX);
  const rh0 = s0.rh - offH;
  const ra0 = s0.ra - offA;
  const idx = (h, a, rh, ra) => ((h * T + a) * NR + rh) * NR + ra;
  let cur = new Float64Array(NE);
  let tmp = new Float64Array(NE);
  cur[idx(s0.h, s0.a, rh0, ra0)] = 1;
  const hMin = s0.h;
  const aMin = s0.a;
  let hMax = hMin;
  let aMax = aMin;
  let masseNegligee = 0;
  let massePlafonnee = 0;
  let etatsMax = 1;
  const loisH = Array.from({ length: 15 }, () => new Float64Array(BMAX + 1));
  const loisA = Array.from({ length: 15 }, () => new Float64Array(BMAX + 1));
  const jMaxH = new Int8Array(15);
  const jMaxA = new Int8Array(15);
  for (let k = s0.creneau; k < NB_CRENEAUX; k++) {
    const reste = k === s0.creneau ? 1 - part : 1;
    const b = trancheDu(k);
    // Les 15 classes (d, r) du créneau : c = (d + 2)·3 + (r + 1) ; le multiplicateur d'indice c·3 + b.
    for (let c = 0; c < 15; c++) {
      loiDuCreneau(lambda * profil[k] * MH[c * 3 + b] * reste, loisH[c]);
      loiDuCreneau(mu * profil[k] * MA[c * 3 + b] * reste, loisA[c]);
      jMaxH[c] = tronquer(loisH[c], epsLoi);
      jMaxA[c] = tronquer(loisA[c], epsLoi);
    }
    const bk = bandeK[k];
    const pBande = (bk >= 0 ? rougeBande[bk] : 0) * reste;
    // 1. les buts (état du début du créneau) : cur → tmp
    tmp.fill(0);
    let actifs = 0;
    let nhMax = hMax;
    let naMax = aMax;
    for (let h = hMin; h <= hMax; h++) {
      for (let a = aMin; a <= aMax; a++) {
        const d = clip(h - a, -2, 2);
        for (let rh = 0; rh < NR; rh++) {
          for (let ra = 0; ra < NR; ra++) {
            const i = idx(h, a, rh, ra);
            const m = cur[i];
            if (m === 0) continue;
            if (m < seuil) {
              masseNegligee += m;
              continue;
            }
            actifs++;
            const r = clip(ra + offA - (rh + offH), -1, 1);
            const cH = (d + 2) * 3 + (r + 1);
            const cA = (-d + 2) * 3 + (-r + 1);
            const lH = loisH[cH];
            const lA = loisA[cA];
            const JH = jMaxH[cH];
            const JA = jMaxA[cA];
            for (let jh = 0; jh <= JH; jh++) {
              const mh = m * lH[jh];
              if (mh === 0) continue;
              let h2 = h + jh;
              let plafond = false;
              if (h2 > T - 1) {
                h2 = T - 1;
                plafond = true;
              }
              for (let ja = 0; ja <= JA; ja++) {
                const w = mh * lA[ja];
                if (w === 0) continue;
                let a2 = a + ja;
                if (a2 > T - 1) {
                  a2 = T - 1;
                  massePlafonnee += w;
                } else if (plafond) massePlafonnee += w;
                tmp[idx(h2, a2, rh, ra)] += w;
              }
              if (h2 > nhMax) nhMax = h2;
            }
            const a2max = Math.min(T - 1, a + JA);
            if (a2max > naMax) naMax = a2max;
          }
        }
      }
    }
    if (actifs > etatsMax) etatsMax = actifs;
    hMax = nhMax;
    aMax = naMax;
    // 2. les rouges, sur l'écart APRÈS les buts du créneau : tmp → cur
    [cur, tmp] = [tmp, cur];
    if (pBande > 0) {
      tmp.fill(0);
      for (let h = hMin; h <= hMax; h++) {
        for (let a = aMin; a <= aMax; a++) {
          const d2 = clip(h - a, -2, 2);
          const pH = pBande * rougeEtat[d2 + 2];
          const pA = pBande * rougeEtat[-d2 + 2];
          for (let rh = 0; rh < NR; rh++) {
            const qH = rh + offH < ROUGES_MAX ? pH : 0;
            for (let ra = 0; ra < NR; ra++) {
              const m = cur[idx(h, a, rh, ra)];
              if (m === 0) continue;
              const qA = ra + offA < ROUGES_MAX ? pA : 0;
              tmp[idx(h, a, rh, ra)] += m * (1 - qH) * (1 - qA);
              if (qH > 0) tmp[idx(h, a, rh + 1, ra)] += m * qH * (1 - qA);
              if (qA > 0) tmp[idx(h, a, rh, ra + 1)] += m * (1 - qH) * qA;
              if (qH > 0 && qA > 0) tmp[idx(h, a, rh + 1, ra + 1)] += m * qH * qA;
            }
          }
        }
      }
      [cur, tmp] = [tmp, cur];
    }
  }
  const grille = new Float64Array(T * T);
  const rougesH = [0, 0, 0];
  const rougesA = [0, 0, 0];
  let dePlus = 0;
  for (let h = hMin; h <= hMax; h++) {
    for (let a = aMin; a <= aMax; a++) {
      for (let rh = rh0; rh < NR; rh++) {
        for (let ra = ra0; ra < NR; ra++) {
          const m = cur[idx(h, a, rh, ra)];
          if (m === 0) continue;
          grille[h * T + a] += m;
          rougesH[rh - rh0] += m;
          rougesA[ra - ra0] += m;
          if (rh + ra > rh0 + ra0) dePlus += m;
        }
      }
    }
  }
  let somme = 0;
  for (let c = 0; c < grille.length; c++) somme += grille[c];
  return {
    grille,
    somme,
    masseNegligee,
    massePlafonnee,
    etatsMax,
    rougesPlafonnes: offH > 0 || offA > 0,
    rouges: { dePlus, home: rougesH, away: rougesA },
    coupes: coupes.nom ?? 'personnalisees'
  };
}

// ------------------------------------------------------------ la règle simple du temps restant (§ 2.11)

/** Les minutes-équivalent restantes au début du créneau k, moins la part jouée de sa longueur (1, 3 au 45, 6 au 91). */
export function resteDeLaRegleSimple(creneau, part = 0) {
  const { arretsPremiere, arretsSeconde } = REGLE_SIMPLE;
  const secondeEntiere = 45 + arretsSeconde;
  let reste;
  let longueur = 1;
  if (creneau <= CRENEAU_MI_TEMPS - 1) reste = CRENEAU_MI_TEMPS - creneau + arretsPremiere + secondeEntiere;
  else if (creneau === CRENEAU_MI_TEMPS) {
    reste = arretsPremiere + secondeEntiere;
    longueur = arretsPremiere;
  } else if (creneau < DERNIER) reste = DERNIER - creneau + arretsSeconde;
  else {
    reste = arretsSeconde;
    longueur = arretsSeconde;
  }
  return reste - part * longueur;
}

/** LA RÈGLE SIMPLE : la grille du score final (buts restants Poisson indépendants ajoutés au score courant, plafond 20). */
export function regleSimple({ lambda, mu, depuis, part = 0 } = {}) {
  if (!fini(lambda) || !fini(mu) || lambda < 0 || mu < 0) throw new EntreeInvalide(`regleSimple : λ et μ positifs attendus (${lambda}, ${mu}).`);
  const s0 = verifierDepart(depuis, part);
  const reste = resteDeLaRegleSimple(s0.creneau, part);
  const xH = (lambda * reste) / REGLE_SIMPLE.minutes;
  const xA = (mu * reste) / REGLE_SIMPLE.minutes;
  const loi = (x, n) => {
    const p = new Float64Array(n + 1);
    let s = 0;
    for (let j = 0; j < n; j++) {
      p[j] = poissonProbability(j, x);
      s += p[j];
    }
    p[n] = Math.max(0, 1 - s);
    return p;
  };
  const nH = T - 1 - s0.h;
  const nA = T - 1 - s0.a;
  const pH = loi(xH, nH);
  const pA = loi(xA, nA);
  const grille = new Float64Array(T * T);
  for (let i = 0; i < pH.length; i++) for (let j = 0; j < pA.length; j++) grille[(s0.h + i) * T + (s0.a + j)] = pH[i] * pA[j];
  let somme = 0;
  for (let c = 0; c < grille.length; c++) somme += grille[c];
  // La masse posée sur le plafond de 20 buts au-delà de ce qu'il vaut lui-même (plus de 20 buts pour un camp).
  const queueH = Math.max(0, pH[nH] - poissonProbability(nH, xH));
  const queueA = Math.max(0, pA[nA] - poissonProbability(nA, xA));
  return { grille, somme, reste, lambdaReste: xH, muReste: xA, masseNegligee: 0, massePlafonnee: 1 - (1 - queueH) * (1 - queueA) };
}

// ------------------------------------------------------------ l'ancrage (R7)

/** Le 1N2 affiché de la ligne (`fair`, objet ou tableau, texte JSON accepté) : trois probabilités finies, sinon null. */
export function lireLeFair(fair) {
  let f = fair;
  if (typeof f === 'string') {
    try {
      f = JSON.parse(f);
    } catch {
      return null;
    }
  }
  if (!f) return null;
  const t = Array.isArray(f) ? { home: f[0], draw: f[1], away: f[2] } : { home: f.home, draw: f.draw, away: f.away };
  return [t.home, t.draw, t.away].every((p) => fini(p) && p >= 0) ? t : null;
}

const unDeuxDe = (g) => {
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < T; i++) {
    for (let j = 0; j < T; j++) {
      if (i > j) p1 += g[i * T + j];
      else if (i < j) p2 += g[i * T + j];
    }
  }
  return p1 - p2;
};

/**
 * L'ANCRAGE sans résiduel, borné (R7). `ligne` : { lambda, mu, rho, grille, fair }. `bornes` : { min, max, pas } (ANCRAGE ;
 * un test peut les retirer). Rend { fait, raison, lambda, mu, borne, cible, ecart } : `fait` faux sans `fair` (la variante
 * se lit alors comme direct-v1) ; `borne` = null, 'lambda-min', 'lambda-max', 'mu-min' ou 'mu-max' quand la cible est
 * hors d'atteinte ; `ecart` = (P(1) − P(2)) atteint − cible.
 */
export function ancrer({ ligne, bornes = ANCRAGE } = {}) {
  const lambda = ligne?.lambda;
  const mu = ligne?.mu;
  if (!fini(lambda) || !fini(mu) || lambda <= 0 || mu <= 0 || !fini(ligne?.rho)) throw new EntreeInvalide('ancrer : λ, μ (positifs) et ρ attendus.');
  const f = lireLeFair(ligne.fair);
  if (!f) return { fait: false, raison: 'sans-fair', lambda, mu, borne: null, cible: null, ecart: null };
  const total = lambda + mu;
  const cible = f.home - f.away;
  const sMin = Math.max(bornes.min / total, 1 - bornes.max / total);
  const sMax = Math.min(bornes.max / total, 1 - bornes.min / total);
  if (!(sMin <= sMax)) return { fait: false, raison: 'total-hors-bornes', lambda, mu, borne: null, cible, ecart: null };
  const ecartDe = (s) => unDeuxDe(grilleDesEntrees({ grille: ligne.grille, lambda: s * total, mu: (1 - s) * total, rho: ligne.rho })) - cible;
  const borneDe = (s) => {
    const l = s * total;
    const m = (1 - s) * total;
    if (Math.abs(l - bornes.min) < 1e-12) return 'lambda-min';
    if (Math.abs(l - bornes.max) < 1e-12) return 'lambda-max';
    if (Math.abs(m - bornes.min) < 1e-12) return 'mu-min';
    return 'mu-max';
  };
  const eMin = ecartDe(sMin);
  if (eMin >= 0) return { fait: true, raison: null, lambda: sMin * total, mu: (1 - sMin) * total, borne: eMin > 0 ? borneDe(sMin) : null, cible, ecart: eMin };
  const eMax = ecartDe(sMax);
  if (eMax <= 0) return { fait: true, raison: null, lambda: sMax * total, mu: (1 - sMax) * total, borne: eMax < 0 ? borneDe(sMax) : null, cible, ecart: eMax };
  let lo = sMin;
  let hi = sMax;
  for (let n = 0; n < bornes.pas; n++) {
    const milieu = (lo + hi) / 2;
    if (ecartDe(milieu) < 0) lo = milieu;
    else hi = milieu;
  }
  const s = (lo + hi) / 2;
  return { fait: true, raison: null, lambda: s * total, mu: (1 - s) * total, borne: null, cible, ecart: ecartDe(s) };
}

// ------------------------------------------------------------ les marchés rendus (§ 2.10)

const cleDeLigne = (L) => String(L).replace('.', '');

/** Les états d'une ligne « plus de / moins de » : passée par le score → le plus est acquis, le moins impossible. */
const etatsDeLigne = (passee) => (passee ? { etat: 'acquis', etats: { over: 'acquis', under: 'impossible' } } : { etat: 'ouvert', etats: { over: 'ouvert', under: 'ouvert' } });

/**
 * LES MARCHÉS d'une grille, avec l'`etat` de chaque ligne calculé depuis le SCORE COURANT (`acquis` dès que le score la
 * passe ; jamais depuis une probabilité égale à 1) : un but annulé (score qui baisse) rouvre les lignes de lui-même.
 * `etat` dit la ligne (le « plus de », le « oui ») ; `etats` dit chaque issue : `acquis`, `impossible` (le « moins de »
 * d'une ligne passée, le « non » des deux marquent, les issues « moins de » du résultat + total) ou `ouvert`. Le résultat
 * reste toujours ouvert en jeu (un score peut encore changer de camp), tout comme le score exact.
 */
export function marchesDuDirect(grille, { h = 0, a = 0 } = {}) {
  const m = marchesDuScore(grille);
  const totalGoals = {};
  const teamGoals = { home: {}, away: {} };
  const resultAndTotal = {};
  for (const L of LIGNES) {
    const over = m[`over${cleDeLigne(L)}`];
    totalGoals[String(L)] = { over, under: 1 - over, ...etatsDeLigne(h + a > L) };
    const dom = m.homeTeamGoals[`over${cleDeLigne(L)}`];
    const ext = m.awayTeamGoals[`over${cleDeLigne(L)}`];
    teamGoals.home[String(L)] = { over: dom, under: 1 - dom, ...etatsDeLigne(h > L) };
    teamGoals.away[String(L)] = { over: ext, under: 1 - ext, ...etatsDeLigne(a > L) };
    const passee = h + a > L;
    const etats = {};
    for (const issue of ['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder']) etats[issue] = passee && issue.endsWith('Under') ? 'impossible' : 'ouvert';
    resultAndTotal[String(L)] = { ...m.resultAndTotal[L], etat: passee ? 'acquis' : 'ouvert', etats };
  }
  const cases = [];
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (grille[i * T + j] > 0) cases.push({ home: i, away: j, p: grille[i * T + j] });
  cases.sort((x, y) => y.p - x.p || x.home - y.home || x.away - y.away);
  const premieres = cases.slice(0, SCORE_EXACT_CASES);
  const autre = Math.max(0, 1 - premieres.reduce((s, c) => s + c.p, 0));
  const deux = h > 0 && a > 0;
  return {
    result: { home: m.home, draw: m.draw, away: m.away },
    totalGoals,
    bothTeamsScore: { yes: m.bothTeamsScore, no: 1 - m.bothTeamsScore, etat: deux ? 'acquis' : 'ouvert', etats: { yes: deux ? 'acquis' : 'ouvert', no: deux ? 'impossible' : 'ouvert' } },
    teamGoals,
    resultAndTotal,
    scoreExact: { cases: premieres, autre }
  };
}

// ------------------------------------------------------------ les variantes (P1, P2, R14)

/** La variante AFFICHÉE (P2) : 'ancre-si-fair' → direct-ancre avec un `fair`, direct-v1 sans ; 'direct-v1' → direct-v1. */
export function varianteAfficheePour(ligne, reglage = VARIANTE_AFFICHEE) {
  if (!VARIANTES_AFFICHABLES.includes(reglage)) throw new EntreeInvalide(`variante affichée inconnue (${reglage}).`);
  if (reglage === 'direct-v1') return 'direct-v1';
  return lireLeFair(ligne?.fair) ? 'direct-ancre' : 'direct-v1';
}

/** Les buts moyens du championnat (R14) : la table recopiée par script, sinon le repli 1,45 / 1,15 (LOI_TABLE). */
export function moyennesDuChampionnat(championnat, table = MOYENNES_DES_CHAMPIONNATS) {
  const c = championnat ? table?.championnats?.[championnat] : null;
  if (c && fini(c.domicile) && fini(c.exterieur)) return { domicile: c.domicile, exterieur: c.exterieur, source: 'table', matchs: c.matchs ?? null };
  return { domicile: REPLI_CHAMPIONNAT.domicile, exterieur: REPLI_CHAMPIONNAT.exterieur, source: 'repli', matchs: null };
}

/**
 * LES LECTURES DU DIRECT : `ligne` = { lambda, mu, rho, grille, fair } (la ligne « service » de la nuit) ; `depart` =
 * { creneau, part, h, a, rh, ra } (etatDuMatch) ; `variantes` = les identifiants à calculer (par défaut la seule variante
 * affichée) ; `paramsSansEffets` = PARAMS_SANS_EFFETS, PASSÉ par l'appelant (obligatoire pour direct-sans-effets) ;
 * `coupes` = obligatoires (COUPES.direct en direct) ; `championnat` = la clé `matches.league` (R14) ; `ancrage` = le
 * résultat d'ancrer() déjà gardé pour ce match (sinon calculé ici). Une lecture dont la masse négligée dépasse 1e-4 est
 * rendue `raison: 'erreur'`, jamais montrée (R21 point 4). Rend { affichee, ancrage, moyennes, lectures: { id: {…} } }.
 */
export function lecturesDuDirect({ ligne, depart, variantes = null, varianteAffichee = VARIANTE_AFFICHEE, params = PARAMS, paramsSansEffets = null, coupes, championnat = null, ancrage = null } = {}) {
  if (!ligne || !fini(ligne.lambda) || !fini(ligne.mu)) throw new EntreeInvalide('lecturesDuDirect : la ligne d’avant-match (λ, μ) est obligatoire.');
  verifierCoupes(coupes);
  const affichee = varianteAfficheePour(ligne, varianteAffichee);
  const ids = variantes ?? [affichee];
  for (const id of ids) if (!IDS_DES_VARIANTES.includes(id)) throw new EntreeInvalide(`variante inconnue (${id}) : seules les 7 de P1 sont codées.`);
  const part = depart?.part ?? 0;
  const besoinAncrage = ids.some((id) => id === 'direct-ancre' || id === 'temps-restant-ancre');
  const anc = besoinAncrage ? ancrage ?? ancrer({ ligne }) : ancrage;
  const moyennes = ids.includes('temps-restant-championnat') ? moyennesDuChampionnat(championnat) : null;
  const chaine = (lambda, mu, p, d) => loiDuScoreFinal({ lambda, mu, params: p, depuis: d, part, coupes });
  const simple = (lambda, mu) => regleSimple({ lambda, mu, depuis: depart, part });
  const calculs = {
    'direct-v1': () => chaine(ligne.lambda, ligne.mu, params, depart),
    'direct-sans-effets': () => {
      if (!paramsSansEffets) throw new EntreeInvalide('direct-sans-effets : PARAMS_SANS_EFFETS doit être passé par l’appelant (R34).');
      return chaine(ligne.lambda, ligne.mu, paramsSansEffets, depart);
    },
    'temps-restant': () => simple(ligne.lambda, ligne.mu),
    'direct-rouges-ignores': () => chaine(ligne.lambda, ligne.mu, params, { ...depart, rh: 0, ra: 0 }),
    'temps-restant-championnat': () => simple(moyennes.domicile, moyennes.exterieur),
    'direct-ancre': () => (anc?.fait ? chaine(anc.lambda, anc.mu, params, depart) : chaine(ligne.lambda, ligne.mu, params, depart)),
    'temps-restant-ancre': () => (anc?.fait ? simple(anc.lambda, anc.mu) : simple(ligne.lambda, ligne.mu))
  };
  const lectures = {};
  for (const id of ids) {
    const r = calculs[id]();
    const enErreur = !(r.masseNegligee <= MASSE_NEGLIGEE_ERREUR);
    lectures[id] = {
      grille: r.grille,
      somme: r.somme,
      masseNegligee: r.masseNegligee,
      massePlafonnee: r.massePlafonnee ?? 0,
      rouges: r.rouges ?? null,
      raison: enErreur ? 'erreur' : null,
      marches: enErreur ? null : marchesDuDirect(r.grille, { h: depart.h, a: depart.a })
    };
  }
  return { affichee, ancrage: anc ?? null, moyennes, lectures };
}

// ------------------------------------------------------------ la minute 0 (R8)

/** Les marchés d'un jeu de marchés à plat : { 'result.home': p, 'totalGoals.2.5.over': p, … } (les probabilités seules). */
function aPlat(m) {
  const o = {};
  for (const k of ['home', 'draw', 'away']) o[`result.${k}`] = m.result[k];
  for (const L of LIGNES) {
    const l = String(L);
    o[`totalGoals.${l}.over`] = m.totalGoals[l].over;
    o[`totalGoals.${l}.under`] = m.totalGoals[l].under;
    o[`teamGoals.home.${l}.over`] = m.teamGoals.home[l].over;
    o[`teamGoals.home.${l}.under`] = m.teamGoals.home[l].under;
    o[`teamGoals.away.${l}.over`] = m.teamGoals.away[l].over;
    o[`teamGoals.away.${l}.under`] = m.teamGoals.away[l].under;
    for (const issue of ['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder']) o[`resultAndTotal.${l}.${issue}`] = m.resultAndTotal[l][issue];
  }
  o['bothTeamsScore.yes'] = m.bothTeamsScore.yes;
  o['bothTeamsScore.no'] = m.bothTeamsScore.no;
  return o;
}

/**
 * LA MINUTE 0 (R8) : pour chaque marché montré (hors score exact : son « avant » vient d'un troisième modèle que la ligne
 * ne porte pas), { avant, direct, ecartPt, dit }. « avant » = le pronostic de la LIGNE d'avant-match, recalculé : le 1N2
 * = `fair` quand la ligne en a un, sinon celui de la grille ; totaux, deux marquent, buts par équipe =
 * marchesDuScore(grilleDesEntrees(ligne)) ; résultat + total = la grille alignée sur `fair` (alignerSurLe1N2). « direct » =
 * C0, la grille de la variante affichée au coup d'envoi (0-0, créneau 0, part 0), aux coupes du direct (O2). `dit` :
 * |écart| ≥ ECART_DIT_PT points.
 */
export function minute0({ ligne, grilleC0 } = {}) {
  const g = grilleDesEntrees(ligne);
  const avant = marchesDuDirect(g, { h: 0, a: 0 });
  const f = lireLeFair(ligne.fair);
  if (f) {
    avant.result = { home: f.home, draw: f.draw, away: f.away };
    const aligne = marchesDuDirect(alignerSurLe1N2(g, f), { h: 0, a: 0 });
    avant.resultAndTotal = aligne.resultAndTotal;
  }
  const a = aPlat(avant);
  const d = aPlat(marchesDuDirect(grilleC0, { h: 0, a: 0 }));
  const marches = {};
  for (const cle of Object.keys(a)) {
    const ecartPt = 100 * (d[cle] - a[cle]);
    marches[cle] = { avant: a[cle], direct: d[cle], ecartPt, dit: Math.abs(ecartPt) >= ECART_DIT_PT };
  }
  return { avantDepuis: f ? 'fair' : 'grille', marches };
}

// ------------------------------------------------------------ les clés (O1, R35 point 7)

const leFair = (fair) => {
  const f = lireLeFair(fair);
  return f ? [f.home, f.draw, f.away] : [null, null, null];
};

/**
 * LA CLÉ DE LA TABLE EN MÉMOIRE (O1) : fotmobId | cleDeNuit | grille | λ | μ | ρ | fair.home | fair.draw | fair.away |
 * créneau | part | h | a | rh | ra | variante — les nombres écrits par String(), jamais arrondis (deux matchs d'une même
 * nuit, au même état, n'ont jamais la même clé : collision-cle.txt). La GRILLE de la ligne (« ancien-81 »,
 * « modele-buts-441 ») y entre depuis le correctif K9 du 13/11 (constat 9 du calcul) : l'ancrage en dépend.
 */
export function cleDuCalcul({ fotmobId, cleDeNuit, grille, lambda, mu, rho, fair, creneau, part, h, a, rh, ra, variante }) {
  return [fotmobId, cleDeNuit, grille, lambda, mu, rho, ...leFair(fair), creneau, part, h, a, rh, ra, variante].map((x) => String(x)).join('|');
}

/** La clé de C0 (R35 point 7) : celle de O1 moins l'état (la grille comprise, K9) — jamais `calcule_le` seul. */
export function cleDeC0({ fotmobId, cleDeNuit, grille, lambda, mu, rho, fair, variante }) {
  return [fotmobId, cleDeNuit, grille, lambda, mu, rho, ...leFair(fair), variante].map((x) => String(x)).join('|');
}

/** Les coupes nommées, réexportées pour l'appelant (B) et les tests. */
export { COUPES };
