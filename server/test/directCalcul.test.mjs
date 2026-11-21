/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie A — T-C1 à T-C13 : LE CALCUL EN DIRECT (calculDuDirect.js),
 * avec les décisions O1 (la clé de la table en mémoire, refaite sur le cas de critique\collision-cle.txt), O2 et R21 (les
 * coupes NOMMÉES), P1 (les 7 variantes), P2 (la variante affichée : les deux valeurs), et la critique du 11/11 : R7
 * (`direct-ancre` sans résiduel, bornée), R8 (la minute 0), R14 (les deux règles simples), R23 point 3 (T-C13 : une
 * propagation de RÉFÉRENCE naïve écrite ici, comparée CASE PAR CASE — jamais les marchés à 1e-10), R34 (imports), R35
 * points 1 et 7.
 *   node --test test/directCalcul.test.mjs        (depuis server/)
 * Modules purs : aucune copie de travail, aucune base, aucun réseau ; nombres inventés (aucun vrai match).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loiDuScoreFinal,
  regleSimple,
  resteDeLaRegleSimple,
  ancrer,
  lireLeFair,
  marchesDuDirect,
  varianteAfficheePour,
  moyennesDuChampionnat,
  lecturesDuDirect,
  minute0,
  cleDuCalcul,
  cleDeC0,
  IDS_DES_VARIANTES,
  EntreeInvalide
} from '../src/data/direct/calculDuDirect.js';
import {
  COUPES,
  ANCRAGE,
  REGLE_SIMPLE,
  ECART_DIT_PT,
  MASSE_NEGLIGEE_ERREUR,
  VARIANTES_CODEES,
  VARIANTES_AFFICHABLES,
  VARIANTE_AFFICHEE,
  MOYENNES_DES_CHAMPIONNATS,
  REPLI_CHAMPIONNAT,
  LIGNES
} from '../src/data/direct/reglagesDirect.js';
import { PARAMS, NB_CRENEAUX, TAILLE_GRILLE, LOI_TABLE } from '../src/data/simulation/reglages.js';
import { trancheDu, marchesDuScore } from '../src/data/simulation/simulationMatch.js';
import { grilleDesEntrees, alignerSurLe1N2 } from '../src/data/simulation/entreesSimulation.js';
import { PARAMS_SANS_EFFETS } from '../src/data/simulation/simulationMatchsEnfant.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ICI, '..', 'src');
const T = TAILLE_GRILLE;
const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const d0 = (creneau, h = 0, a = 0, rh = 0, ra = 0) => ({ creneau, h, a, rh, ra });
const loi = (lambda, mu, depuis, coupes, { part = 0, params = PARAMS } = {}) => loiDuScoreFinal({ lambda, mu, params, depuis, part, coupes });
const ecartMax = (g1, g2) => {
  let e = 0;
  for (let c = 0; c < T * T; c++) e = Math.max(e, Math.abs(g1[c] - g2[c]));
  return e;
};
const somme = (g) => g.reduce((s, x) => s + x, 0);
const un2 = (g) => {
  const c = [0, 0, 0];
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) c[i > j ? 0 : i === j ? 1 : 2] += g[i * T + j];
  return c;
};
/** Poisson(x) pour j < 8, le reste sur 8 : la loi d'un créneau (simulationMatch.js l. 111-126), par la formule directe. */
function loiCreneau(x) {
  const s = new Float64Array(9);
  let fact = 1;
  let cum = 0;
  for (let j = 0; j < 8; j++) {
    if (j > 0) fact *= j;
    s[j] = (Math.exp(-x) * x ** j) / fact;
    cum += s[j];
  }
  s[8] = Math.max(0, 1 - cum);
  return s;
}
const poisson = (j, x) => {
  let f = 1;
  for (let i = 2; i <= j; i++) f *= i;
  return (Math.exp(-x) * x ** j) / f;
};

// ------------------------------------------------------------ la référence naïve de T-C13 (R23 point 3)

/**
 * LA PROPAGATION DE RÉFÉRENCE, naïve (patron : critique\calcul\independant.mjs ; écrite depuis simulationMatch.js
 * l. 202-235 seulement) : ni boîte, ni classes précalculées, ni coupe ; les buts jusqu'à H − 1 en route, le plafond de 20
 * à la FIN (comme simulerMatch). `faute` : 14 (l'extérieur lit l'état après les buts du club qui reçoit), 15 (le rouge
 * lit l'écart d'avant les buts), 16 (multiplicateur extérieur lu avec d), 19 (la part jouée sur les buts, pas sur les
 * rouges) — les poses de la conception, pour montrer que T-C13 les voit.
 */
function reference({ lambda, mu, params = PARAMS, depuis, part = 0, faute = null, H = 30 }) {
  const { profil, MH, MA, rougeBande, rougeEtat, bandes } = params;
  const idx = (h, a, rh, ra) => ((h * H + a) * 3 + rh) * 3 + ra;
  let cur = new Float64Array(H * H * 9);
  let nxt = new Float64Array(H * H * 9);
  cur[idx(depuis.h, depuis.a, depuis.rh, depuis.ra)] = 1;
  for (let k = depuis.creneau; k < NB_CRENEAUX; k++) {
    const reste = k === depuis.creneau ? 1 - part : 1;
    const b = trancheDu(k);
    const bk = bandes.findIndex(([, de, a]) => k >= de && k <= a);
    const q0 = (bk >= 0 ? rougeBande[bk] : 0) * (faute === 19 ? 1 : reste);
    const lH = [];
    const lA = [];
    for (let c = 0; c < 15; c++) {
      lH.push(loiCreneau(lambda * profil[k] * MH[c * 3 + b] * reste));
      lA.push(loiCreneau(mu * profil[k] * MA[c * 3 + b] * reste));
    }
    nxt.fill(0);
    for (let h = 0; h < H; h++) {
      for (let a = 0; a < H; a++) {
        for (let rh = 0; rh < 3; rh++) {
          for (let ra = 0; ra < 3; ra++) {
            const m = cur[idx(h, a, rh, ra)];
            if (m === 0) continue;
            const d = clip(h - a, -2, 2);
            const r = clip(ra - rh, -1, 1);
            const pH = lH[(d + 2) * 3 + (r + 1)];
            for (let jh = 0; jh <= 8; jh++) {
              const wh = m * pH[jh];
              if (wh === 0) continue;
              const h2 = h + jh;
              const dA = faute === 14 ? clip(h2 - a, -2, 2) : d;
              const pA = lA[faute === 16 ? (dA + 2) * 3 + (-r + 1) : (-dA + 2) * 3 + (-r + 1)];
              for (let ja = 0; ja <= 8; ja++) {
                const w = wh * pA[ja];
                if (w === 0) continue;
                const a2 = a + ja;
                if (h2 >= H || a2 >= H) continue;
                const d2 = faute === 15 ? d : clip(h2 - a2, -2, 2);
                const qH = rh < 2 ? q0 * rougeEtat[d2 + 2] : 0;
                const qA = ra < 2 ? q0 * rougeEtat[-d2 + 2] : 0;
                nxt[idx(h2, a2, rh, ra)] += w * (1 - qH) * (1 - qA);
                if (qH > 0) nxt[idx(h2, a2, rh + 1, ra)] += w * qH * (1 - qA);
                if (qA > 0) nxt[idx(h2, a2, rh, ra + 1)] += w * (1 - qH) * qA;
                if (qH > 0 && qA > 0) nxt[idx(h2, a2, rh + 1, ra + 1)] += w * qH * qA;
              }
            }
          }
        }
      }
    }
    [cur, nxt] = [nxt, cur];
  }
  const g = new Float64Array(T * T);
  let dePlus = 0;
  let domPlus = 0;
  let extPlus = 0;
  for (let h = 0; h < H; h++) {
    for (let a = 0; a < H; a++) {
      for (let rh = 0; rh < 3; rh++) {
        for (let ra = 0; ra < 3; ra++) {
          const m = cur[idx(h, a, rh, ra)];
          if (m === 0) continue;
          g[Math.min(h, T - 1) * T + Math.min(a, T - 1)] += m;
          if (rh + ra > depuis.rh + depuis.ra) dePlus += m;
          if (rh > depuis.rh) domPlus += m;
          if (ra > depuis.ra) extPlus += m;
        }
      }
    }
  }
  return { g, dePlus, domPlus, extPlus };
}

/** Les 16 marchés comparés (R23 : 1N2, plus de 0,5 à 3,5, les deux marquent, buts de chaque équipe). */
function seize(g) {
  const m = marchesDuScore(g);
  const o = { home: m.home, draw: m.draw, away: m.away, over05: m.over05, over15: m.over15, over25: m.over25, over35: m.over35, btts: m.bothTeamsScore };
  for (const k of ['over05', 'over15', 'over25', 'over35']) {
    o[`dom_${k}`] = m.homeTeamGoals[k];
    o[`ext_${k}`] = m.awayTeamGoals[k];
  }
  return o;
}

/** Les 20 états de T-C13 (R23 point 3) : 5-4 à la 30e, deux rouges, part 0,37, créneaux 45, 46, 75, 76 et 91. */
const ETATS_T_C13 = [
  [1.45, 1.15, d0(0), 0],
  [2.8, 2.8, d0(0), 0],
  [2.5, 1.2, d0(29, 5, 4), 0],
  [1.6, 1.3, d0(29, 5, 4, 2, 2), 0.37],
  [1.62, 0.98, d0(10, 1, 0, 1, 0), 0.5],
  [0.9, 1.6, d0(33, 1, 0, 0, 1), 0.37],
  [1.4, 1.1, d0(44, 0, 0), 0.9],
  [1.45, 1.15, d0(45, 1, 1), 0],
  [2.1, 0.8, d0(45, 2, 0, 0, 1), 0.37],
  [1.2, 1.4, d0(46, 0, 1, 1, 0), 0],
  [1.8, 1.7, d0(46, 3, 3), 0.37],
  [1.5, 1.0, d0(60, 3, 0), 0.5],
  [1.3, 1.2, d0(74, 2, 1, 2, 0), 0],
  [1.45, 1.15, d0(75, 2, 1), 0.37],
  [1.1, 1.3, d0(76, 0, 0, 1, 1), 0],
  [1.7, 0.9, d0(80, 1, 1, 0, 2), 0.5],
  [1.0, 1.9, d0(89, 0, 2), 0.37],
  [2.4, 2.2, d0(90, 4, 4, 2, 2), 0],
  [2.4, 1.1, d0(91, 1, 1), 0],
  [1.45, 1.15, d0(91, 0, 0, 1, 0), 0.37]
];

test('T-C13 (R23 point 3) la propagation de RÉFÉRENCE naïve (sans boîte, sans classes, sans coupe, plafond à la fin) sur 20 états : CASE PAR CASE à 1e-10 aux coupes du banc, à 1e-13 sans coupe ; les marchés SEULEMENT à la masse négligée près (plus la masse déplacée par la troncature), jamais à 1e-10 ; les rouges de plus à 1e-12', () => {
  const pire = { banc: 0, aucune: 0, marche: 0 };
  for (const [lambda, mu, depuis, part] of ETATS_T_C13) {
    const qui = `${lambda}/${mu} ${JSON.stringify(depuis)} part ${part}`;
    const ref = reference({ lambda, mu, depuis, part });
    const banc = loi(lambda, mu, depuis, COUPES.banc, { part });
    const nue = loi(lambda, mu, depuis, COUPES.aucune, { part });
    const eB = ecartMax(banc.grille, ref.g);
    const eA = ecartMax(nue.grille, ref.g);
    assert.ok(eB <= 1e-10, `${qui} : coupes du banc, ${eB} par case`);
    assert.ok(eA <= 1e-13, `${qui} : sans coupe, ${eA} par case`);
    const tolMarche = banc.masseNegligee + 2 * NB_CRENEAUX * COUPES.banc.epsLoi + 1e-12;
    const mB = seize(banc.grille);
    const mR = seize(ref.g);
    for (const k of Object.keys(mR)) {
      assert.ok(Math.abs(mB[k] - mR[k]) <= tolMarche, `${qui} : ${k} ${mB[k]} contre ${mR[k]} (tolérance ${tolMarche})`);
      pire.marche = Math.max(pire.marche, Math.abs(mB[k] - mR[k]));
    }
    assert.ok(Math.abs(nue.rouges.dePlus - ref.dePlus) <= 1e-12, `${qui} : rouges de plus`);
    assert.ok(Math.abs(1 - nue.rouges.home[0] - ref.domPlus) <= 1e-12, `${qui} : rouge de plus du club qui reçoit`);
    assert.ok(Math.abs(1 - nue.rouges.away[0] - ref.extPlus) <= 1e-12, `${qui} : rouge de plus du visiteur`);
    pire.banc = Math.max(pire.banc, eB);
    pire.aucune = Math.max(pire.aucune, eA);
  }
  assert.ok(pire.banc > 0, 'les coupes du banc coupent quelque chose (sinon le test ne mesure rien)');
});

test('T-C13 (les poses 14, 15, 16 et 19 de la conception) : la référence munie de chaque faute s’écarte du module de plus de 1e-6 sur une case — T-C13 les verrait', () => {
  const depuis = d0(60, 1, 0);
  const part = 0.37;
  const nue = loi(1.6, 1.2, depuis, COUPES.aucune, { part });
  for (const faute of [14, 15, 16, 19]) {
    const e = ecartMax(nue.grille, reference({ lambda: 1.6, mu: 1.2, depuis, part, faute }).g);
    const r = reference({ lambda: 1.6, mu: 1.2, depuis, part, faute });
    const eRouges = Math.abs(1 - nue.rouges.home[0] - r.domPlus) + Math.abs(1 - nue.rouges.away[0] - r.extPlus);
    assert.ok(e > 1e-6 || eRouges > 1e-6, `faute ${faute} : écart ${e} (grille), ${eRouges} (rouges)`);
  }
});

// ------------------------------------------------------------ T-C1 à T-C6 : la loi du score final

const ETATS_T_C1 = [
  [1.45, 1.15, d0(0), 0],
  [2.8, 2.8, d0(0), 0],
  [1.45, 1.15, d0(29), 0.5],
  [2.5, 1.2, d0(29, 5, 0, 0, 1), 0],
  [1.62, 0.98, d0(33, 1, 0), 0.5],
  [1.2, 1.4, d0(45, 0, 1, 1, 0), 0.37],
  [1.45, 1.15, d0(46), 0],
  [1.8, 1.7, d0(46, 2, 2, 1, 1), 0],
  [1.45, 1.15, d0(60, 3, 0), 0.5],
  [1.3, 1.2, d0(75, 2, 1, 0, 2), 0.5],
  [2.4, 1.1, d0(90, 1, 1), 0.5],
  [1.45, 1.15, d0(91, 0, 0, 2, 2), 0.6]
];

test('T-C1 (R21 point 3) la grille somme à 1 − masseNegligee à 1e-12, sur 12 états, aux DEUX jeux de coupes : banc (négligée < 1e-8, plafonnée < 1e-8 : 6,5·10⁻⁹ mesurés par R21 à 2,5 / 1,2, 30e, 5-0, rouge visiteur) et direct (négligée + plafonnée < 1e-5, le seuil de F1)', () => {
  for (const [lambda, mu, depuis, part] of ETATS_T_C1) {
    const qui = `${lambda}/${mu} ${JSON.stringify(depuis)} part ${part}`;
    const banc = loi(lambda, mu, depuis, COUPES.banc, { part });
    const direct = loi(lambda, mu, depuis, COUPES.direct, { part });
    for (const [nom, r] of [['banc', banc], ['direct', direct]]) {
      assert.ok(Math.abs(r.somme + r.masseNegligee - 1) <= 1e-12, `${qui} (${nom}) : somme ${r.somme} + négligée ${r.masseNegligee}`);
      assert.equal(r.coupes, nom);
      assert.ok(r.grille.every((p) => p >= 0 && p <= 1));
    }
    assert.ok(banc.masseNegligee < 1e-8, `${qui} : négligée ${banc.masseNegligee} (banc)`);
    assert.ok(banc.massePlafonnee < 1e-8, `${qui} : plafonnée ${banc.massePlafonnee} (banc)`);
    assert.ok(direct.masseNegligee + direct.massePlafonnee < 1e-5, `${qui} : ${direct.masseNegligee} + ${direct.massePlafonnee} (direct)`);
    assert.ok(direct.masseNegligee < MASSE_NEGLIGEE_ERREUR);
  }
});

test('T-C2 (R21 : sans coupe) départ au créneau 91 : la loi des buts de plus = le produit des deux lois du créneau (formule fermée, 1e-12), part jouée et rouges compris', () => {
  for (const [lambda, mu, depuis, part] of [[2.4, 1.1, d0(91, 1, 1), 0], [1.6, 1.0, d0(91, 2, 0, 1, 0), 0.37], [0.9, 1.7, d0(91, 0, 3, 0, 2), 0.9], [1.45, 1.15, d0(91, 4, 4, 2, 2), 0.5]]) {
    const r = loi(lambda, mu, depuis, COUPES.aucune, { part });
    const d = clip(depuis.h - depuis.a, -2, 2);
    const rr = clip(depuis.ra - depuis.rh, -1, 1);
    const b = trancheDu(91);
    const xH = lambda * PARAMS.profil[91] * PARAMS.MH[((d + 2) * 3 + (rr + 1)) * 3 + b] * (1 - part);
    const xA = mu * PARAMS.profil[91] * PARAMS.MA[((-d + 2) * 3 + (-rr + 1)) * 3 + b] * (1 - part);
    const pH = loiCreneau(xH);
    const pA = loiCreneau(xA);
    const attendu = new Float64Array(T * T);
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) attendu[(depuis.h + i) * T + (depuis.a + j)] += pH[i] * pA[j];
    assert.ok(ecartMax(r.grille, attendu) <= 1e-12, `${JSON.stringify(depuis)} part ${part} : ${ecartMax(r.grille, attendu)}`);
  }
});

test('T-C3 PARAMS_SANS_EFFETS (passé par l’appelant, R34) depuis 0-0 : la grille = Poisson(λ) × Poisson(μ) à 1e-7 ; depuis la 60e à 1-0 : Poisson du profil restant, décalé du score', () => {
  assert.equal(somme(PARAMS.profil), 1);
  for (const [lambda, mu] of [[1.45, 1.15], [2.2, 0.7]]) {
    const r = loi(lambda, mu, d0(0), COUPES.banc, { params: PARAMS_SANS_EFFETS });
    const attendu = new Float64Array(T * T);
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) attendu[i * T + j] = poisson(i, lambda) * poisson(j, mu);
    assert.ok(ecartMax(r.grille, attendu) <= 1e-7, `${lambda}/${mu} : ${ecartMax(r.grille, attendu)}`);
    assert.ok(r.rouges.dePlus === 0, 'aucun rouge sans effets');
  }
  const resteProfil = PARAMS.profil.slice(60).reduce((s, x) => s + x, 0);
  const r = loi(1.45, 1.15, d0(60, 1, 0), COUPES.banc, { params: PARAMS_SANS_EFFETS });
  const attendu = new Float64Array(T * T);
  for (let i = 0; i + 1 < T; i++) for (let j = 0; j < T; j++) attendu[(1 + i) * T + j] = poisson(i, 1.45 * resteProfil) * poisson(j, 1.15 * resteProfil);
  assert.ok(ecartMax(r.grille, attendu) <= 1e-7);
});

test('T-C4 aucun score final sous le score de départ (chaîne et règle simple)', () => {
  for (const [depuis, part] of [[d0(30, 2, 1), 0.5], [d0(70, 0, 3, 1, 0), 0], [d0(91, 1, 1), 0.2], [d0(45, 4, 2, 0, 1), 0.37]]) {
    for (const g of [loi(1.5, 1.2, depuis, COUPES.direct, { part }).grille, regleSimple({ lambda: 1.5, mu: 1.2, depuis, part }).grille]) {
      for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (i < depuis.h || j < depuis.a) assert.equal(g[i * T + j], 0, `${JSON.stringify(depuis)} : case ${i}-${j}`);
    }
  }
});

test('T-C5 symétrie : échanger (λ, MH, rh, h) et (μ, MA, ra, a) transpose la grille (sans coupe, 1e-13)', () => {
  const miroir = { ...PARAMS, MH: PARAMS.MA, MA: PARAMS.MH };
  for (const [lambda, mu, depuis, part] of [[1.7, 1.0, d0(0), 0], [1.2, 1.5, d0(46, 2, 1, 1, 0), 0], [1.45, 1.15, d0(75, 0, 2, 0, 1), 0.37]]) {
    const g = loi(lambda, mu, depuis, COUPES.aucune, { part }).grille;
    const s = loi(mu, lambda, { creneau: depuis.creneau, h: depuis.a, a: depuis.h, rh: depuis.ra, ra: depuis.rh }, COUPES.aucune, { part, params: miroir }).grille;
    let e = 0;
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) e = Math.max(e, Math.abs(g[i * T + j] - s[j * T + i]));
    assert.ok(e <= 1e-13, `${JSON.stringify(depuis)} : ${e}`);
  }
});

test('T-C6 `part = 1` au dernier créneau : la grille est le score de départ, aucun rouge de plus ; une part croissante → moins de buts à venir', () => {
  const r = loi(1.8, 1.4, d0(91, 2, 1, 1, 0), COUPES.direct, { part: 1 });
  assert.equal(r.grille[2 * T + 1], 1);
  assert.equal(r.rouges.dePlus, 0);
  const aVenir = (g, h, a) => {
    let e = 0;
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) e += g[i * T + j] * (i + j - h - a);
    return e;
  };
  for (const k of [30, 45, 91]) {
    let avant = Number.POSITIVE_INFINITY;
    for (const part of [0, 0.25, 0.5, 0.75, 1]) {
      const e = aVenir(loi(1.45, 1.15, d0(k, 1, 0), COUPES.aucune, { part }).grille, 1, 0);
      assert.ok(e < avant, `créneau ${k}, part ${part} : ${e} buts à venir (avant : ${avant})`);
      avant = e;
    }
  }
});

test('R35 point 1 — plus de 2 rouges au départ : l’écart de rouges garde les comptes VRAIS (3 contre 2 ≠ 2 contre 2), seul « un rouge de plus » est borné ; `rougesPlafonnes` le dit', () => {
  const a = loi(1.45, 1.15, d0(60, 0, 0, 3, 2), COUPES.banc);
  const b = loi(1.45, 1.15, d0(60, 0, 0, 2, 2), COUPES.banc);
  assert.ok(ecartMax(a.grille, b.grille) > 1e-3, '3 contre 2 : le club qui reçoit joue toujours à un de moins');
  assert.deepEqual([a.rougesPlafonnes, b.rougesPlafonnes], [true, false]);
  assert.equal(a.rouges.dePlus, 0, 'plus aucun rouge possible des deux côtés');
  assert.ok(Math.abs(a.rouges.home[0] - a.somme) <= 1e-12 && Math.abs(a.rouges.away[0] - a.somme) <= 1e-12);
  const c = loi(1.45, 1.15, d0(60, 0, 0, 3, 1), COUPES.banc);
  assert.ok(c.rouges.away[1] > 0 && c.rouges.away[2] === 0 && c.rouges.home[1] === 0, 'le visiteur peut encore en prendre UN (1 → 2), le club qui reçoit aucun');
});

// ------------------------------------------------------------ T-C7, T-C8 : la minute 0 et l'ancrage (R7, R8)

/** L'exemple de la conception (§ 2.9) : service 1,60 / 1,00, ρ −0,075, page 62 / 22 / 16 ; nombres inventés. */
const EXEMPLE = Object.freeze({ grille: 'ancien-81', lambda: 1.6, mu: 1.0, rho: -0.075, fair: Object.freeze({ home: 0.62, draw: 0.22, away: 0.16 }) });

test('T-C7 (R7, R8, R21) la minute 0 : `direct-ancre` rend P(1) − P(2) de la grille FERMÉE à (λ′, μ′) = fair.home − fair.away (1e-9, hors borne) ; la lecture au coup d’envoi = C0 aux MÊMES coupes, à l’octet ; minute0.marches = { avant, direct, ecartPt, dit } sur l’exemple', () => {
  const anc = ancrer({ ligne: EXEMPLE });
  assert.equal(anc.fait, true);
  assert.equal(anc.borne, null);
  const g = grilleDesEntrees({ ...EXEMPLE, lambda: anc.lambda, mu: anc.mu });
  const u = un2(g);
  assert.ok(Math.abs(u[0] - u[2] - (EXEMPLE.fair.home - EXEMPLE.fair.away)) <= 1e-9);
  assert.ok(Math.abs(anc.lambda + anc.mu - (EXEMPLE.lambda + EXEMPLE.mu)) <= 1e-12);
  const lec = lecturesDuDirect({ ligne: EXEMPLE, depart: { creneau: 0, part: 0, h: 0, a: 0, rh: 0, ra: 0 }, coupes: COUPES.direct });
  assert.equal(lec.affichee, 'direct-ancre');
  const c0 = loi(anc.lambda, anc.mu, d0(0), COUPES.direct);
  assert.deepEqual(Array.from(lec.lectures['direct-ancre'].grille), Array.from(c0.grille), 'même calcul, mêmes coupes : mêmes octets');
  const m0 = minute0({ ligne: EXEMPLE, grilleC0: c0.grille });
  assert.equal(m0.avantDepuis, 'fair');
  const avant = marchesDuScore(grilleDesEntrees(EXEMPLE));
  const direct = marchesDuScore(c0.grille);
  const aligne = marchesDuScore(alignerSurLe1N2(grilleDesEntrees(EXEMPLE), EXEMPLE.fair));
  const attendus = {
    'result.home': [EXEMPLE.fair.home, direct.home],
    'result.draw': [EXEMPLE.fair.draw, direct.draw],
    'totalGoals.2.5.over': [avant.over25, direct.over25],
    'teamGoals.away.0.5.over': [avant.awayTeamGoals.over05, direct.awayTeamGoals.over05],
    'teamGoals.home.1.5.over': [avant.homeTeamGoals.over15, direct.homeTeamGoals.over15],
    'bothTeamsScore.yes': [avant.bothTeamsScore, direct.bothTeamsScore],
    'resultAndTotal.2.5.homeOver': [aligne.resultAndTotal[2.5].homeOver, direct.resultAndTotal[2.5].homeOver]
  };
  for (const [cle, [a, d]] of Object.entries(attendus)) {
    const m = m0.marches[cle];
    assert.ok(m, cle);
    assert.ok(Math.abs(m.avant - a) <= 1e-15 && Math.abs(m.direct - d) <= 1e-15, `${cle} : ${JSON.stringify(m)}`);
    assert.ok(Math.abs(m.ecartPt - 100 * (d - a)) <= 1e-12);
    assert.equal(m.dit, Math.abs(m.ecartPt) >= ECART_DIT_PT);
  }
  // R8 : avec l'ancrage, le saut passe aux buts par équipe ; le plus/moins bouge à peine.
  assert.ok(Math.abs(m0.marches['teamGoals.away.0.5.over'].ecartPt) > 3, 'le visiteur marque : le saut de R8');
  assert.ok(Math.abs(m0.marches['totalGoals.2.5.over'].ecartPt) < 1, 'plus de 2,5 : presque rien');
  assert.equal(Object.keys(m0.marches).length, 3 + 4 * (2 + 4 + 6) + 2, 'chaque marché montré, hors score exact');
  // Sans `fair` : « avant » = la grille seule.
  const sans = minute0({ ligne: { ...EXEMPLE, fair: null }, grilleC0: c0.grille });
  assert.equal(sans.avantDepuis, 'grille');
  assert.ok(Math.abs(sans.marches['result.home'].avant - avant.home) <= 1e-15);
});

test('T-C8 (R7) `ancre` : λ′ + μ′ = λ + μ ; `fair` égal au 1N2 de la grille → (λ′, μ′) = (λ, μ) à 1e-6 ; un cas près de la borne, des cas hors d’atteinte (arrêtés à la borne nommée, jamais direct-v1), une pose « bornes retirées » ; sans `fair` → direct-v1', () => {
  const ligne = { grille: 'modele-buts-441', lambda: 1.4, mu: 1.1, rho: -0.05 };
  const [p1, pn, p2] = un2(grilleDesEntrees(ligne));
  const neutre = ancrer({ ligne: { ...ligne, fair: { home: p1, draw: pn, away: p2 } } });
  assert.ok(Math.abs(neutre.lambda - 1.4) <= 1e-6 && Math.abs(neutre.mu - 1.1) <= 1e-6, JSON.stringify(neutre));
  // Près de la borne, mais atteignable : μ′ = 0,31.
  const cibleBas = un2(grilleDesEntrees({ ...ligne, lambda: 2.5 - 0.31, mu: 0.31 }));
  const pres = ancrer({ ligne: { ...ligne, fair: { home: cibleBas[0], draw: cibleBas[1], away: cibleBas[2] } } });
  assert.deepEqual([pres.fait, pres.borne], [true, null]);
  assert.ok(Math.abs(pres.mu - 0.31) <= 1e-6 && Math.abs(pres.ecart) <= 1e-9, JSON.stringify(pres));
  // Hors d'atteinte, vers le bas : 1,2 / 0,9 et 82 / 13 / 5 (R7 point 2) → μ′ = 0,30, C0 73,7 %.
  const bas = { grille: 'ancien-81', lambda: 1.2, mu: 0.9, rho: -0.075, fair: { home: 0.82, draw: 0.13, away: 0.05 } };
  const aBorne = ancrer({ ligne: bas });
  assert.deepEqual([aBorne.fait, aBorne.borne], [true, 'mu-min']);
  assert.ok(Math.abs(aBorne.mu - ANCRAGE.min) <= 1e-12 && aBorne.ecart < -0.01, JSON.stringify(aBorne));
  assert.ok(Math.abs(aBorne.lambda + aBorne.mu - 2.1) <= 1e-12);
  const c0 = un2(loi(aBorne.lambda, aBorne.mu, d0(0), COUPES.banc).grille);
  assert.equal((100 * c0[0]).toFixed(1), '73.7', 'le chiffre de R7 point 2');
  const lec = lecturesDuDirect({ ligne: bas, depart: { creneau: 0, part: 0, h: 0, a: 0, rh: 0, ra: 0 }, variantes: ['direct-v1', 'direct-ancre'], coupes: COUPES.direct });
  assert.equal(lec.affichee, 'direct-ancre', 'à la borne, la variante affichée reste l’ancrée');
  assert.ok(ecartMax(lec.lectures['direct-ancre'].grille, lec.lectures['direct-v1'].grille) > 0.01);
  const deuxieme = ancrer({ ligne: { grille: 'ancien-81', lambda: 1.0, mu: 0.8, rho: -0.075, fair: { home: 0.86, draw: 0.1, away: 0.04 } } });
  assert.equal((100 * un2(loi(deuxieme.lambda, deuxieme.mu, d0(0), COUPES.banc).grille)[0]).toFixed(1), '67.1', 'le second chiffre de R7 point 2');
  // Hors d'atteinte vers le haut (λ′ ≤ 4,0) et de l'autre côté (λ′ ≥ 0,30).
  const haut = ancrer({ ligne: { ...ligne, lambda: 3.0, mu: 1.5, fair: { home: 0.97, draw: 0.02, away: 0.01 } } });
  assert.deepEqual([haut.borne, Number(haut.lambda.toFixed(12)), Number(haut.mu.toFixed(12))], ['lambda-max', 4, 0.5]);
  const visiteur = ancrer({ ligne: { ...ligne, lambda: 0.9, mu: 1.2, fair: { home: 0.03, draw: 0.1, away: 0.87 } } });
  assert.deepEqual([visiteur.borne, Number(visiteur.lambda.toFixed(12))], ['lambda-min', 0.3]);
  // La pose « bornes retirées » : la même cible est alors atteinte, avec μ′ sous 0,30 — c'est la borne qui arrête.
  const libre = ancrer({ ligne: bas, bornes: { min: 1e-4, max: 99, pas: 40 } });
  assert.ok(libre.mu < ANCRAGE.min && Math.abs(libre.ecart) <= 1e-9 && libre.borne === null, JSON.stringify(libre));
  // Sans `fair` : rien d'ancré, la variante se lit comme direct-v1.
  const sansFair = ancrer({ ligne: { ...ligne, fair: null } });
  assert.deepEqual([sansFair.fait, sansFair.raison], [false, 'sans-fair']);
  const l2 = lecturesDuDirect({ ligne: { ...ligne, fair: null }, depart: { creneau: 50, part: 0.5, h: 1, a: 0, rh: 0, ra: 0 }, variantes: ['direct-v1', 'direct-ancre', 'temps-restant', 'temps-restant-ancre'], coupes: COUPES.direct });
  assert.equal(l2.affichee, 'direct-v1');
  assert.deepEqual(Array.from(l2.lectures['direct-ancre'].grille), Array.from(l2.lectures['direct-v1'].grille));
  assert.deepEqual(Array.from(l2.lectures['temps-restant-ancre'].grille), Array.from(l2.lectures['temps-restant'].grille));
  assert.deepEqual(ANCRAGE, { min: 0.3, max: 4, pas: 40 });
  assert.equal(ancrer({ ligne: { ...ligne, lambda: 0.25, mu: 0.25, fair: { home: 0.4, draw: 0.3, away: 0.3 } } }).raison, 'total-hors-bornes');
  assert.deepEqual(lireLeFair('[0.5,0.3,0.2]'), { home: 0.5, draw: 0.3, away: 0.2 });
  assert.equal(lireLeFair('pas du json'), null);
});

// ------------------------------------------------------------ T-C9, T-C10 : les marchés, la règle simple (R14)

test('T-C9 marchesDuDirect : `acquis` et `impossible` viennent du SCORE (plus de 1,5 à 1-1 ; les deux marquent à 1-1), jamais d’une probabilité égale à 1 ; un but annulé (1-1 → 1-0) rouvre les lignes', () => {
  const g = loi(1.45, 1.15, d0(70, 1, 1), COUPES.direct).grille;
  const a = marchesDuDirect(g, { h: 1, a: 1 });
  assert.deepEqual([a.totalGoals['1.5'].etat, a.totalGoals['1.5'].etats], ['acquis', { over: 'acquis', under: 'impossible' }]);
  assert.equal(a.totalGoals['2.5'].etat, 'ouvert');
  assert.deepEqual([a.bothTeamsScore.etat, a.bothTeamsScore.etats], ['acquis', { yes: 'acquis', no: 'impossible' }]);
  assert.deepEqual([a.teamGoals.home['0.5'].etat, a.teamGoals.home['1.5'].etat], ['acquis', 'ouvert']);
  assert.deepEqual(a.resultAndTotal['1.5'].etats, { homeOver: 'ouvert', homeUnder: 'impossible', drawOver: 'ouvert', drawUnder: 'impossible', awayOver: 'ouvert', awayUnder: 'impossible' });
  const b = marchesDuDirect(g, { h: 1, a: 0 });
  assert.deepEqual([b.totalGoals['1.5'].etat, b.bothTeamsScore.etat, b.teamGoals.away['0.5'].etat, b.resultAndTotal['1.5'].etats.drawUnder], ['ouvert', 'ouvert', 'ouvert', 'ouvert']);
  // Une grille où « plus de 1,5 » vaut 1 à 0-0 (fabriquée) : la ligne reste ouverte.
  const sure = new Float64Array(T * T);
  sure[2 * T + 0] = 1;
  const c = marchesDuDirect(sure, { h: 0, a: 0 });
  assert.deepEqual([c.totalGoals['1.5'].over, c.totalGoals['1.5'].etat], [1, 'ouvert']);
  assert.equal(a.scoreExact.cases.length, 8);
  assert.ok(Math.abs(a.scoreExact.cases.reduce((s, x) => s + x.p, 0) + a.scoreExact.autre - 1) <= 1e-5);
  assert.ok(a.scoreExact.cases.every((x, i, t) => i === 0 || t[i - 1].p >= x.p));
  assert.ok(Math.abs(a.result.home + a.result.draw + a.result.away - 1) <= 1e-5);
  assert.deepEqual(Object.keys(a.totalGoals), LIGNES.map(String));
});

test('T-C10 (R14) regleSimple : restes 99, 54, 51, 6 aux créneaux 0, 45, 46, 91 (moins la part jouée de la longueur du créneau : 1, 3 au 45, 6 au 91) ; Poisson indépendants ajoutés au score ; ni rouge ni effet du score ; `temps-restant-championnat` lit la table recopiée, sinon le repli 1,45 / 1,15', () => {
  assert.deepEqual([0, 45, 46, 91].map((k) => resteDeLaRegleSimple(k)), [99, 54, 51, 6]);
  assert.deepEqual([0, 30, 44, 60, 90].map((k) => resteDeLaRegleSimple(k)), [99, 69, 55, 37, 7]);
  assert.deepEqual([[0, 0.5], [45, 0.5], [46, 0.5], [91, 0.5], [91, 1]].map(([k, p]) => resteDeLaRegleSimple(k, p)), [98.5, 52.5, 50.5, 3, 0]);
  assert.deepEqual(REGLE_SIMPLE, { minutes: 99, arretsPremiere: 3, arretsSeconde: 6 });
  for (const [depuis, part] of [[d0(0), 0], [d0(60, 3, 0, 2, 0), 0.5], [d0(91, 1, 1), 0.2]]) {
    const r = regleSimple({ lambda: 1.45, mu: 1.15, depuis, part });
    const R = resteDeLaRegleSimple(depuis.creneau, part);
    let e = 0;
    for (let i = 0; depuis.h + i < T - 1; i++) for (let j = 0; depuis.a + j < T - 1; j++) e = Math.max(e, Math.abs(r.grille[(depuis.h + i) * T + depuis.a + j] - poisson(i, (1.45 * R) / 99) * poisson(j, (1.15 * R) / 99)));
    assert.ok(e <= 1e-15, `${JSON.stringify(depuis)} : ${e}`);
    assert.ok(Math.abs(r.somme - 1) <= 1e-12);
  }
  // Ni effet du score ni rouge : la loi des buts à venir est la même à 0-0 et à 3-0 à deux rouges.
  const a = regleSimple({ lambda: 1.45, mu: 1.15, depuis: d0(60), part: 0.5 }).grille;
  const b = regleSimple({ lambda: 1.45, mu: 1.15, depuis: d0(60, 3, 0, 2, 0), part: 0.5 }).grille;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) assert.equal(a[i * T + j], b[(i + 3) * T + j]);
  // R14 : la table des championnats (clé matches.league), recopiée par script ; sinon le repli.
  const cle = Object.keys(MOYENNES_DES_CHAMPIONNATS.championnats)[0];
  const t = moyennesDuChampionnat(cle);
  assert.deepEqual([t.source, t.domicile, t.exterieur], ['table', MOYENNES_DES_CHAMPIONNATS.championnats[cle].domicile, MOYENNES_DES_CHAMPIONNATS.championnats[cle].exterieur]);
  assert.deepEqual(moyennesDuChampionnat('Championnat inconnu'), { domicile: LOI_TABLE.domicile, exterieur: LOI_TABLE.exterieur, source: 'repli', matchs: null });
  assert.deepEqual(REPLI_CHAMPIONNAT, { domicile: 1.45, exterieur: 1.15 });
  const ligne = { grille: 'modele-buts-441', lambda: 1.7, mu: 0.9, rho: -0.05, fair: null };
  const depart = { creneau: 50, part: 0.5, h: 0, a: 1, rh: 0, ra: 0 };
  const lec = lecturesDuDirect({ ligne, depart, variantes: ['temps-restant-championnat'], coupes: COUPES.direct, championnat: cle });
  assert.deepEqual(Array.from(lec.lectures['temps-restant-championnat'].grille), Array.from(regleSimple({ lambda: t.domicile, mu: t.exterieur, depuis: depart, part: 0.5 }).grille));
  assert.equal(lec.moyennes.source, 'table');
  const repli = lecturesDuDirect({ ligne, depart, variantes: ['temps-restant-championnat'], coupes: COUPES.direct, championnat: null });
  assert.deepEqual(Array.from(repli.lectures['temps-restant-championnat'].grille), Array.from(regleSimple({ lambda: 1.45, mu: 1.15, depuis: depart, part: 0.5 }).grille));
});

// ------------------------------------------------------------ T-C11 : entrées fautives

test('T-C11 entrées fautives : lève EntreeInvalide (λ négatif, créneau 92, part 1,2, buts non entiers, plus de 20 buts, coupes absentes, variante inconnue, sans-effets sans PARAMS_SANS_EFFETS, réglage d’affichage inconnu)', () => {
  const ok = { lambda: 1.4, mu: 1.1, depuis: d0(10), part: 0, coupes: COUPES.direct };
  assert.doesNotThrow(() => loiDuScoreFinal(ok));
  for (const faux of [{ lambda: -0.1 }, { mu: Number.NaN }, { depuis: d0(92) }, { depuis: d0(-1) }, { part: 1.2 }, { part: -0.1 }, { depuis: { ...d0(10), h: 1.5 } }, { depuis: { ...d0(10), ra: -1 } }, { depuis: d0(10, 21, 0) }, { coupes: undefined }, { coupes: { seuilEtat: 1e-9 } }, { params: { ...PARAMS, profil: PARAMS.profil.slice(1) } }]) {
    assert.throws(() => loiDuScoreFinal({ ...ok, ...faux }), EntreeInvalide, JSON.stringify(faux));
  }
  assert.throws(() => regleSimple({ lambda: -1, mu: 1, depuis: d0(0) }), EntreeInvalide);
  assert.throws(() => regleSimple({ lambda: 1, mu: 1, depuis: d0(95) }), EntreeInvalide);
  const ligne = { grille: 'modele-buts-441', lambda: 1.4, mu: 1.1, rho: -0.05, fair: null };
  const depart = { creneau: 10, part: 0.5, h: 0, a: 0, rh: 0, ra: 0 };
  assert.throws(() => lecturesDuDirect({ ligne, depart, variantes: ['aligne-1n2'], coupes: COUPES.direct }), EntreeInvalide, 'ni aligne-1n2 ni strate (P1)');
  assert.throws(() => lecturesDuDirect({ ligne, depart, variantes: ['direct-sans-effets'], coupes: COUPES.direct }), EntreeInvalide);
  assert.throws(() => lecturesDuDirect({ ligne, depart }), EntreeInvalide, 'coupes obligatoires');
  assert.throws(() => lecturesDuDirect({ ligne: { lambda: null }, depart, coupes: COUPES.direct }), EntreeInvalide);
  assert.throws(() => varianteAfficheePour(ligne, 'strate'), EntreeInvalide);
  assert.throws(() => ancrer({ ligne: { ...ligne, lambda: 0 } }), EntreeInvalide);
});

// ------------------------------------------------------------ P1, P2, R21 : les variantes

test('P1 — les 7 variantes codées, aucune autre : toutes finies, dans [0 ; 1], somme 1 à la masse négligée près ; chacune est le calcul qu’elle dit (sans effets avec PARAMS_SANS_EFFETS PASSÉ, rouges ignorés à 0-0, règles simples)', () => {
  assert.deepEqual(IDS_DES_VARIANTES, ['direct-v1', 'direct-sans-effets', 'temps-restant', 'direct-rouges-ignores', 'temps-restant-championnat', 'direct-ancre', 'temps-restant-ancre']);
  assert.deepEqual(VARIANTES_CODEES.map((v) => v.id), IDS_DES_VARIANTES);
  const ligne = { grille: 'ancien-81', lambda: 1.6, mu: 1.0, rho: -0.075, fair: { home: 0.62, draw: 0.22, away: 0.16 } };
  const depart = { creneau: 62, part: 0.5, h: 1, a: 1, rh: 1, ra: 0 };
  const lec = lecturesDuDirect({ ligne, depart, variantes: [...IDS_DES_VARIANTES], paramsSansEffets: PARAMS_SANS_EFFETS, coupes: COUPES.direct, championnat: 'Championnat inconnu' });
  assert.deepEqual(Object.keys(lec.lectures), IDS_DES_VARIANTES);
  for (const [id, l] of Object.entries(lec.lectures)) {
    assert.ok(l.grille.every((p) => Number.isFinite(p) && p >= 0 && p <= 1), id);
    assert.ok(Math.abs(l.somme + l.masseNegligee - 1) <= 1e-12, `${id} : ${l.somme}`);
    assert.equal(l.raison, null, id);
    assert.ok(l.marches && Math.abs(l.marches.result.home + l.marches.result.draw + l.marches.result.away - l.somme) <= 1e-12, id);
  }
  const memes = (a, b) => assert.deepEqual(Array.from(a), Array.from(b));
  memes(lec.lectures['direct-v1'].grille, loi(1.6, 1.0, d0(62, 1, 1, 1, 0), COUPES.direct, { part: 0.5 }).grille);
  memes(lec.lectures['direct-sans-effets'].grille, loi(1.6, 1.0, d0(62, 1, 1, 1, 0), COUPES.direct, { part: 0.5, params: PARAMS_SANS_EFFETS }).grille);
  memes(lec.lectures['direct-rouges-ignores'].grille, loi(1.6, 1.0, d0(62, 1, 1, 0, 0), COUPES.direct, { part: 0.5 }).grille);
  memes(lec.lectures['temps-restant'].grille, regleSimple({ lambda: 1.6, mu: 1.0, depuis: depart, part: 0.5 }).grille);
  memes(lec.lectures['direct-ancre'].grille, loi(lec.ancrage.lambda, lec.ancrage.mu, d0(62, 1, 1, 1, 0), COUPES.direct, { part: 0.5 }).grille);
  memes(lec.lectures['temps-restant-ancre'].grille, regleSimple({ lambda: lec.ancrage.lambda, mu: lec.ancrage.mu, depuis: depart, part: 0.5 }).grille);
  assert.ok(lec.lectures['direct-v1'].rouges && lec.lectures['temps-restant'].rouges === null);
  // Par défaut, seule la variante affichée est calculée.
  assert.deepEqual(Object.keys(lecturesDuDirect({ ligne, depart, coupes: COUPES.direct }).lectures), ['direct-ancre']);
  // L'ancrage gardé pour le match est réutilisé tel quel.
  const garde = { fait: true, lambda: 1.9, mu: 0.7, borne: null };
  memes(lecturesDuDirect({ ligne, depart, coupes: COUPES.direct, ancrage: garde }).lectures['direct-ancre'].grille, loi(1.9, 0.7, d0(62, 1, 1, 1, 0), COUPES.direct, { part: 0.5 }).grille);
});

test('P2 — la variante affichée, ses DEUX valeurs : « ancre-si-fair » (défaut avant le verdict) → direct-ancre avec un `fair`, direct-v1 sans ; « direct-v1 » → direct-v1 toujours', () => {
  assert.equal(VARIANTE_AFFICHEE, 'ancre-si-fair');
  assert.deepEqual(VARIANTES_AFFICHABLES, ['ancre-si-fair', 'direct-v1']);
  const avec = { grille: 'ancien-81', lambda: 1.6, mu: 1.0, rho: -0.075, fair: { home: 0.62, draw: 0.22, away: 0.16 } };
  const sans = { ...avec, fair: null };
  assert.deepEqual([varianteAfficheePour(avec), varianteAfficheePour(sans)], ['direct-ancre', 'direct-v1']);
  assert.deepEqual([varianteAfficheePour(avec, 'direct-v1'), varianteAfficheePour(sans, 'direct-v1')], ['direct-v1', 'direct-v1']);
  const depart = { creneau: 20, part: 0.5, h: 0, a: 0, rh: 0, ra: 0 };
  const v1 = lecturesDuDirect({ ligne: avec, depart, varianteAffichee: 'direct-v1', coupes: COUPES.direct });
  assert.deepEqual([v1.affichee, Object.keys(v1.lectures), v1.ancrage], ['direct-v1', ['direct-v1'], null]);
  const anc = lecturesDuDirect({ ligne: avec, depart, varianteAffichee: 'ancre-si-fair', coupes: COUPES.direct });
  assert.deepEqual([anc.affichee, Object.keys(anc.lectures), anc.ancrage.fait], ['direct-ancre', ['direct-ancre'], true]);
});

test('R21 point 4 — le garde-fou du direct : une masse négligée de plus de 1e-4 rend la lecture « erreur », sans marchés ; les coupes nommées sont celles de reglagesDirect', () => {
  assert.deepEqual(COUPES, { direct: { nom: 'direct', seuilEtat: 1e-9, epsLoi: 1e-8 }, banc: { nom: 'banc', seuilEtat: 1e-12, epsLoi: 1e-11 }, oracle: { nom: 'oracle', seuilEtat: 1e-15, epsLoi: 1e-14 }, aucune: { nom: 'aucune', seuilEtat: 0, epsLoi: 0 } });
  const ligne = { grille: 'modele-buts-441', lambda: 1.45, mu: 1.15, rho: -0.05, fair: null };
  const grossieres = { nom: 'grossieres', seuilEtat: 1e-3, epsLoi: 1e-3 };
  const r = lecturesDuDirect({ ligne, depart: { creneau: 0, part: 0, h: 0, a: 0, rh: 0, ra: 0 }, coupes: grossieres });
  const l = r.lectures['direct-v1'];
  assert.ok(l.masseNegligee > MASSE_NEGLIGEE_ERREUR, `${l.masseNegligee}`);
  assert.deepEqual([l.raison, l.marches], ['erreur', null]);
  const bon = lecturesDuDirect({ ligne, depart: { creneau: 0, part: 0, h: 0, a: 0, rh: 0, ra: 0 }, coupes: COUPES.direct }).lectures['direct-v1'];
  assert.equal(bon.raison, null);
});

// ------------------------------------------------------------ O1 et R35 point 7 : les clés

test('O1 — la clé de la table en mémoire, refaite sur le cas de critique\\collision-cle.txt : deux matchs d’une même nuit, au même état, ont deux clés et deux calculs (A 49,1 / 28,8 / 22,1 ; B 20,2 / 28,9 / 51,0) ; CHAQUE composante change la clé, la GRILLE comprise (K9) ; les nombres ne sont jamais arrondis', () => {
  const nuit = '2026-11-13T23:41:07.000Z';
  const etat = { creneau: 11, part: 0.5, h: 0, a: 0, rh: 0, ra: 0, variante: 'direct-v1' };
  const A = { fotmobId: 4600001, cleDeNuit: nuit, grille: 'ancien-81', lambda: 1.62, mu: 0.98, rho: -0.05, fair: null, ...etat };
  const B = { ...A, fotmobId: 4600002, lambda: 0.9, mu: 1.6 };
  assert.notEqual(cleDuCalcul(A), cleDuCalcul(B));
  const pct = (m) => [m.home, m.draw, m.away].map((p) => (100 * p).toFixed(1)).join(' / ');
  const gA = loi(1.62, 0.98, d0(11), COUPES.banc, { part: 0.5 }).grille;
  const gB = loi(0.9, 1.6, d0(11), COUPES.banc, { part: 0.5 }).grille;
  assert.equal(pct(marchesDuScore(gA)), '49.1 / 28.8 / 22.1');
  assert.equal(pct(marchesDuScore(gB)), '20.2 / 28.9 / 51.0');
  const base = { ...A, fair: { home: 0.5, draw: 0.3, away: 0.2 } };
  const variantes = {
    fotmobId: 4600003,
    cleDeNuit: '2026-11-14T23:41:07.000Z',
    grille: 'modele-buts-441',
    lambda: 1.6200000001,
    mu: 0.981,
    rho: -0.06,
    fair: [{ home: 0.51, draw: 0.3, away: 0.2 }, { home: 0.5, draw: 0.31, away: 0.2 }, { home: 0.5, draw: 0.3, away: 0.21 }],
    creneau: 12,
    part: 0.6,
    h: 1,
    a: 1,
    rh: 1,
    ra: 1,
    variante: 'direct-ancre'
  };
  const vues = new Set([cleDuCalcul(base)]);
  for (const [champ, valeurs] of Object.entries(variantes)) {
    for (const v of [].concat(valeurs)) {
      const k = cleDuCalcul({ ...base, [champ]: v });
      assert.notEqual(k, cleDuCalcul(base), `${champ} : la clé doit changer`);
      vues.add(k);
    }
  }
  assert.equal(vues.size, 1 + 16, 'seize composantes (la grille comprise, K9), seize clés différentes');
  assert.ok(cleDuCalcul(base).includes('|ancien-81|1.62|0.98|-0.05|0.5|0.3|0.2|11|0.5|0|0|0|0|direct-v1'), cleDuCalcul(base));
  // Correctif K9 (13/11, constat 9 du calcul) : deux lignes IDENTIQUES sauf la grille → deux clés, pour le calcul, pour C0 et
  // pour l'ancrage (la clé de l'ancrage est cleDeC0 de la variante « ancrage », lectureDuDirect.js).
  const autreGrille = { ...base, grille: 'modele-buts-441' };
  assert.notEqual(cleDuCalcul(autreGrille), cleDuCalcul(base), 'K9 : la grille change la clé du calcul');
  assert.notEqual(cleDeC0(autreGrille), cleDeC0(base), 'K9 : la grille change la clé de C0');
  assert.notEqual(cleDeC0({ ...autreGrille, variante: 'ancrage' }), cleDeC0({ ...base, variante: 'ancrage' }), 'K9 : la grille change la clé de l’ancrage');
  // R35 point 7 : la clé de C0 = celle de O1 moins l'état ; jamais `calcule_le` seul.
  const c0 = cleDeC0(base);
  for (const champ of ['creneau', 'part', 'h', 'a', 'rh', 'ra']) assert.equal(cleDeC0({ ...base, [champ]: variantes[champ] }), c0, `${champ} ne change pas C0`);
  for (const champ of ['fotmobId', 'cleDeNuit', 'grille', 'lambda', 'mu', 'rho', 'variante']) assert.notEqual(cleDeC0({ ...base, [champ]: [].concat(variantes[champ])[0] }), c0, `${champ} change C0`);
  assert.notEqual(cleDeC0(A), cleDeC0(B), 'les deux matchs de la même nuit ont deux C0');
  assert.notEqual(c0, nuit);
});

// ------------------------------------------------------------ T-C12 : pureté et imports (R34)

const DIRECT = path.join(SRC, 'data', 'direct');
const PURS = ['libelleDuDirect.js', 'etatDuDirect.js', 'memoireDuDirect.js', 'calculDuDirect.js', 'reglagesDirect.js'].map((f) => path.join(DIRECT, f));
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const importsDe = (f) => [...fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  return vus;
}

test('T-C12 (R34) les modules purs de la 46 : ni horloge, ni hasard, ni base, ni fichier, ni réseau, ni process.env ; calculDuDirect n’importe que reglages.js, simulationMatch.js, entreesSimulation.js, poisson.js et les réglages du direct ; le graphe COMPLET ne touche ni la nuit, ni l’enfant de la simulation, ni base, fournisseur, tâche ou route ; aucun tableau de 92 nombres sous data/direct/', () => {
  const interdits = [/Date\.now/, /new Date\s*\(/, /performance\.now/, /Math\.random/, /openDb/, /DatabaseSync/, /node:fs/, /from 'fs'/, /readFileSync|writeFileSync/, /\bfetch\s*\(/, /node:child_process/, /process\.env/];
  for (const f of PURS) {
    const code = sansCommentaires(f);
    for (const interdit of interdits) assert.ok(!interdit.test(code), `${path.basename(f)} : ${interdit}`);
  }
  assert.deepEqual(importsDe(path.join(DIRECT, 'calculDuDirect.js')).sort(), ['../../core/model/poisson.js', '../simulation/entreesSimulation.js', '../simulation/reglages.js', '../simulation/simulationMatch.js', './reglagesDirect.js']);
  assert.deepEqual(importsDe(path.join(DIRECT, 'etatDuDirect.js')).sort(), ['./libelleDuDirect.js', './reglagesDirect.js']);
  assert.deepEqual(importsDe(path.join(DIRECT, 'memoireDuDirect.js')).sort(), ['./etatDuDirect.js', './libelleDuDirect.js', './reglagesDirect.js']);
  assert.deepEqual(importsDe(path.join(DIRECT, 'libelleDuDirect.js')), []);
  assert.deepEqual(importsDe(path.join(DIRECT, 'reglagesDirect.js')), ['../simulation/reglages.js']);
  const graphe = [...atteints(PURS)].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const r of graphe) {
    assert.ok(!/^(db|data\/db|providers|jobs|api|config|services|data\/enregistreurs)\//.test(r), `graphe : ${r}`);
    assert.ok(!/simulationNuit|simulationMatchsEnfant|matchEnrichment|lineupPrefetch/.test(r), `graphe : ${r}`);
    const code = sansCommentaires(path.join(SRC, r));
    for (const interdit of [/Date\.now/, /Math\.random/, /openDb/, /DatabaseSync/, /node:fs/, /\bfetch\s*\(/, /node:child_process/, /process\.env/]) assert.ok(!interdit.test(code), `${r} : ${interdit}`);
  }
  assert.ok(graphe.includes('data/simulation/simulationMatch.js') && graphe.includes('data/simulation/reglages.js'));
  for (const f of fs.readdirSync(DIRECT)) {
    const code = sansCommentaires(path.join(DIRECT, f));
    for (const m of code.matchAll(/\[([^\[\]]*)\]/g)) assert.ok(m[1].split(',').filter((x) => /^\s*-?\d/.test(x)).length < 40, `${f} : un tableau de nombres recopié ?`);
  }
  // PARAMS est IMPORTÉ : sans `params`, la loi est celle de PARAMS, à l'octet.
  assert.deepEqual(Array.from(loiDuScoreFinal({ lambda: 1.4, mu: 1.1, depuis: d0(40), coupes: COUPES.direct }).grille), Array.from(loi(1.4, 1.1, d0(40), COUPES.direct).grille));
});
