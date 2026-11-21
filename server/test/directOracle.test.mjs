/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie A — T-O1 à T-O5 : LE CALCUL EN DIRECT FACE À L'ORACLE, la
 * simulation de l'étape 28 (`simulerMatch({ depuis })`, les MÊMES réglages), et les tests EXACTS de O5 pour les poses
 * plus petites que la résolution de l'oracle.
 *   node --test test/directOracle.test.mjs        (depuis server/ ; environ une minute de processeur : fichier à part,
 *                                                  critique R23 point 5)
 *
 * Les règles de comparaison (décision O5, amendée par la critique R23) :
 *   - TROIS graines fixes (4601, 4602, 4603), n = 200 000 chemins par tirage — jamais changées pour obtenir du vert ;
 *   - le calcul exact aux coupes de l'oracle (COUPES.oracle) ;
 *   - chaque MARCHÉ (les 16 de R23 : 1N2, plus de 0,5 à 3,5, les deux marquent, buts de chaque équipe) et chaque compte
 *     de rouges DE PLUS (T-O3) à moins de 4 σ + 1e-4, σ = √(p(1 − p)/n) avec p EXACT (un marché décidé par le score :
 *     σ = 0, la marge seule) ;
 *   - chaque CASE d'au moins 50 tirages attendus à moins de 5 σ (R23 point 1) ;
 *   - le χ² de PEARSON sur les cases (au moins 5 attendus, le reste regroupé ; degrés = nombre de cases gardées) sous le
 *     quantile 1 − 0,001 / (nombre de tirages du test) (R23 point 2) ;
 *   - Σz² d'une même comparaison sur les trois graines (INDÉPENDANTES) sous le quantile 1 − 0,001 / (nombre de sommes)
 *     du χ² à 3 degrés — jamais Σz² sur les marchés d'un même tirage (corrélés, R23 point 2).
 * Les tests EXACTS de O5 : un créneau calculé À LA MAIN (le 91 : buts sur l'état du DÉBUT, rouge sur l'écart d'APRÈS, la
 *   part jouée sur les deux) ; deux créneaux contre l'ÉNUMÉRATION COMPLÈTE des chemins (90-91 ; 75-76 avec les créneaux
 *   suivants éteints : changement de tranche et de bande, plafond des rouges, plus de 2 rouges au départ).
 * T-O5 : la copie isolée (isolement.mjs : réseau coupé, heure figée à deux instants), script-direct-pur.mjs.
 * Nombres inventés ; aucun vrai match.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loiDuScoreFinal } from '../src/data/direct/calculDuDirect.js';
import { COUPES } from '../src/data/direct/reglagesDirect.js';
import { PARAMS, NB_CRENEAUX, TAILLE_GRILLE, BUTS_MAX_PAR_CRENEAU, ROUGES_MAX } from '../src/data/simulation/reglages.js';
import { simulerMatch, trancheDu, marchesDuScore } from '../src/data/simulation/simulationMatch.js';
import { PARAMS_SANS_EFFETS } from '../src/data/simulation/simulationMatchsEnfant.js';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { empreintes } from './aides/script-direct-pur.mjs';

const T = TAILLE_GRILLE;
const N = 200_000;
const GRAINES = Object.freeze([4601, 4602, 4603]);
const MARGE = 1e-4;
const clip = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const d0 = (creneau, h = 0, a = 0, rh = 0, ra = 0) => ({ creneau, h, a, rh, ra });
const exact = ({ lambda, mu, params = PARAMS, depuis, part = 0, coupes = COUPES.oracle }) => loiDuScoreFinal({ lambda, mu, params, depuis, part, coupes });

// ------------------------------------------------------------ le χ² (quantile haut, écrit ici)

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function lnGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const y = z - 1;
  let x = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) x += LANCZOS[i] / (y + i);
  const t = y + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(x);
}
/** Q(a, x), la fonction gamma incomplète régularisée HAUTE (série sous a + 1, fraction continue au-delà). */
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const pre = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let somme = del;
    for (let i = 0; i < 10000 && Math.abs(del) > Math.abs(somme) * 1e-16; i++) {
      ap += 1;
      del *= x / ap;
      somme += del;
    }
    return 1 - somme * Math.exp(pre);
  }
  const PETIT = 1e-300;
  let b = x + 1 - a;
  let c = 1 / PETIT;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < PETIT) d = PETIT;
    c = b + an / c;
    if (Math.abs(c) < PETIT) c = PETIT;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(pre) * h;
}
/** Le seuil x du χ² à k degrés tel que P(X > x) = alpha (dichotomie sur Q(k/2, x/2)). */
function seuilKhi2(alpha, k) {
  let lo = 0;
  let hi = Math.max(10, 2 * k);
  while (gammaQ(k / 2, hi / 2) > alpha) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gammaQ(k / 2, mid / 2) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------ les marchés, l'oracle, les comparaisons

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

/**
 * UN TIRAGE de l'oracle (simulerMatch, n = 200 000, sans grille : poids 1/n), résumé en comptes : les 441 cases du score
 * final (plafonné à 20 comme la grille), les rouges DE PLUS de chaque camp (0, 1, 2) et « au moins un rouge de plus ».
 */
function tirage({ lambda, mu, params, depuis, graine }) {
  const ch = simulerMatch({ lambda, mu, params, n: N, seed: graine, depuis: { slot: depuis.creneau, h: depuis.h, a: depuis.a, rh: depuis.rh, ra: depuis.ra } });
  const cases = new Float64Array(T * T);
  const rougesH = [0, 0, 0];
  const rougesA = [0, 0, 0];
  let dePlus = 0;
  for (let p = 0; p < N; p++) {
    cases[ch.ftH[p] * T + ch.ftA[p]]++;
    const mh = ch.rougesH[p] - depuis.rh;
    const ma = ch.rougesA[p] - depuis.ra;
    if (mh < 0 || mh > ROUGES_MAX || ma < 0 || ma > ROUGES_MAX) assert.fail(`rouges de plus hors de 0..2 (${mh}, ${ma})`);
    rougesH[mh]++;
    rougesA[ma]++;
    if (mh + ma > 0) dePlus++;
  }
  return { n: N, cases, rougesH, rougesA, dePlus };
}

/** Le χ² de Pearson (R23 point 2) : cases d'au moins 5 attendus, le reste regroupé (posé sur la plus petite case gardée s'il attend moins de 5). */
function pearson(g, cases, n) {
  let khi2 = 0;
  let degres = 0;
  let eReste = 0;
  let oReste = 0;
  let petite = null;
  for (let c = 0; c < T * T; c++) {
    const e = n * g[c];
    if (e >= 5) {
      khi2 += (cases[c] - e) ** 2 / e;
      degres++;
      if (!petite || e < petite.e) petite = { e, o: cases[c] };
    } else {
      eReste += e;
      oReste += cases[c];
    }
  }
  if (eReste >= 5) {
    khi2 += (oReste - eReste) ** 2 / eReste;
    degres++;
  } else if (eReste > 0 || oReste > 0) {
    khi2 += -((petite.o - petite.e) ** 2) / petite.e + (petite.o + oReste - (petite.e + eReste)) ** 2 / (petite.e + eReste);
  }
  return { khi2, degres };
}

/**
 * LES COMPARAISONS d'un tirage à la loi exacte (voir l'en-tête) : marchés et rouges de plus à 4 σ + 1e-4, cases d'au moins
 * 50 attendus à 5 σ, χ² de Pearson. Rend les écarts réduits z (null : comparaison décidée, σ nul) pour Σz² sur les graines.
 */
function comparer(ex, ti, qui, nTirages, bilan) {
  const n = ti.n;
  const z = {};
  const p1 = (nom, p, q) => {
    const s = Math.sqrt(Math.max(0, p * (1 - p)) / n);
    const e = Math.abs(q - p);
    assert.ok(e <= 4 * s + MARGE, `${qui} : ${nom}, exact ${p.toFixed(6)}, oracle ${q.toFixed(6)} (${s > 0 ? (e / s).toFixed(2) : '∞'} σ)`);
    z[nom] = p * (1 - p) > 1e-9 ? (q - p) / s : null;
    if (z[nom] !== null) bilan.pireSigma = Math.max(bilan.pireSigma, Math.abs(z[nom]));
  };
  const pE = seize(ex.grille);
  const pO = seize(Array.from(ti.cases, (c) => c / n));
  for (const k of Object.keys(pE)) p1(k, pE[k], pO[k]);
  // T-O3 : les rouges DE PLUS (R23 point 4).
  p1('rouges.dePlus', ex.rouges.dePlus, ti.dePlus / n);
  for (const j of [1, 2]) {
    p1(`rouges.home+${j}`, ex.rouges.home[j], ti.rougesH[j] / n);
    p1(`rouges.away+${j}`, ex.rouges.away[j], ti.rougesA[j] / n);
  }
  // Les cases d'au moins 50 attendus, à 5 σ.
  for (let c = 0; c < T * T; c++) {
    const e = n * ex.grille[c];
    if (e < 50) continue;
    bilan.cases++;
    const s = Math.sqrt(e * (1 - ex.grille[c]));
    const r = Math.abs(ti.cases[c] - e) / s;
    bilan.pireCase = Math.max(bilan.pireCase, r);
    assert.ok(r <= 5, `${qui} : case ${Math.floor(c / T)}-${c % T}, attendu ${e.toFixed(1)}, tiré ${ti.cases[c]} (${r.toFixed(2)} σ)`);
  }
  // Le χ² de Pearson du tirage.
  const { khi2, degres } = pearson(ex.grille, ti.cases, n);
  const seuil = seuilKhi2(0.001 / nTirages, degres);
  bilan.pireKhi2 = Math.max(bilan.pireKhi2, khi2 / seuil);
  assert.ok(khi2 <= seuil, `${qui} : χ² de Pearson ${khi2.toFixed(1)} pour ${degres} degrés, seuil ${seuil.toFixed(1)}`);
  bilan.tirages++;
  return z;
}

/**
 * UNE CAMPAGNE d'oracle : pour chaque état, la loi exacte (COUPES.oracle) et trois tirages ; puis Σz² de chaque
 * comparaison sur les trois graines. `etats` : [{ qui, lambda, mu, depuis, part, params, paramsTirage }] (`paramsTirage` : les réglages de l’oracle s’ils diffèrent).
 */
function campagne(nom, etats) {
  const nTirages = etats.length * GRAINES.length;
  const bilan = { tirages: 0, cases: 0, pireSigma: 0, pireCase: 0, pireKhi2: 0, sommes: 0, pireSomme: 0 };
  const sommes = new Map();
  for (const e of etats) {
    const params = e.params ?? PARAMS;
    const ex = exact({ lambda: e.lambda, mu: e.mu, params, depuis: e.depuis, part: e.part ?? 0 });
    assert.ok(ex.masseNegligee + ex.massePlafonnee < 1e-10, `${nom} ${e.qui} : masse négligée ou plafonnée ${ex.masseNegligee + ex.massePlafonnee} aux coupes de l’oracle`);
    for (const graine of GRAINES) {
      const ti = tirage({ lambda: e.lambda, mu: e.mu, params: e.paramsTirage ?? params, depuis: e.depuis, graine });
      const z = comparer(ex, ti, `${nom} ${e.qui} (graine ${graine})`, nTirages, bilan);
      for (const [k, v] of Object.entries(z)) {
        if (v === null) continue;
        const cle = `${e.qui} | ${k}`;
        if (!sommes.has(cle)) sommes.set(cle, []);
        sommes.get(cle).push(v);
      }
    }
  }
  const completes = [...sommes].filter(([, zs]) => zs.length === GRAINES.length);
  const seuil = seuilKhi2(0.001 / Math.max(1, completes.length), GRAINES.length);
  for (const [cle, zs] of completes) {
    const s = zs.reduce((t, v) => t + v * v, 0);
    bilan.sommes++;
    bilan.pireSomme = Math.max(bilan.pireSomme, s / seuil);
    assert.ok(s <= seuil, `${nom} ${cle} : Σz² sur les trois graines ${s.toFixed(2)}, seuil ${seuil.toFixed(2)} (z = ${zs.map((v) => v.toFixed(2)).join(' ; ')})`);
  }
  return bilan;
}
const dire = (b) =>
  `${b.tirages} tirages ; pire marché ou rouge ${b.pireSigma.toFixed(2)} σ ; ${b.cases} cases ≥ 50 attendus, pire ${b.pireCase.toFixed(2)} σ ; ` +
  `χ² le plus haut à ${(100 * b.pireKhi2).toFixed(0)} % de son seuil ; ${b.sommes} sommes Σz², la plus haute à ${(100 * b.pireSomme).toFixed(0)} % de son seuil`;

/** Le créneau k0 entamé de `part` (conception § 2.4) : profil[k0] × (1 − part) et la bande de rouges coupée pour que k0 seul ait rougeBande × (1 − part). */
function paramsEntames(params, k0, part) {
  const profil = Array.from(params.profil);
  profil[k0] *= 1 - part;
  const bandes = [];
  const rougeBande = [];
  params.bandes.forEach(([nom, de, a], i) => {
    if (k0 < de || k0 > a) {
      bandes.push([nom, de, a]);
      rougeBande.push(params.rougeBande[i]);
      return;
    }
    if (de < k0) {
      bandes.push([`${nom} avant`, de, k0 - 1]);
      rougeBande.push(params.rougeBande[i]);
    }
    bandes.push([`${nom} entamé`, k0, k0]);
    rougeBande.push(params.rougeBande[i] * (1 - part));
    if (k0 < a) {
      bandes.push([`${nom} après`, k0 + 1, a]);
      rougeBande.push(params.rougeBande[i]);
    }
  });
  return { ...params, profil, bandes, rougeBande };
}

/** Les créneaux après `dernier` ÉTEINTS (ni but, ni rouge) : la propagation d'un départ k s'arrête de fait après `dernier`. */
function paramsEteintsApres(params, dernier) {
  const profil = Array.from(params.profil, (x, k) => (k <= dernier ? x : 0));
  const bandes = [];
  const rougeBande = [];
  params.bandes.forEach(([nom, de, a], i) => {
    if (de > dernier) {
      bandes.push([nom, de, a]);
      rougeBande.push(0);
    } else if (a <= dernier) {
      bandes.push([nom, de, a]);
      rougeBande.push(params.rougeBande[i]);
    } else {
      bandes.push([nom, de, dernier]);
      rougeBande.push(params.rougeBande[i]);
      bandes.push([`${nom} éteinte`, dernier + 1, a]);
      rougeBande.push(0);
    }
  });
  return { ...params, profil, bandes, rougeBande };
}

// ------------------------------------------------------------ le χ² écrit ici : quatre valeurs de table

test('le quantile du χ² écrit dans ce test redonne les tables (3,841 ; 23,209 ; 16,266 ; 39,252)', () => {
  for (const [alpha, k, attendu] of [
    [0.05, 1, 3.841459],
    [0.01, 10, 23.209251],
    [0.001, 3, 16.266236],
    [0.001, 16, 39.252354]
  ]) {
    const x = seuilKhi2(alpha, k);
    assert.ok(Math.abs(x - attendu) < 1e-4, `χ² ${k} degrés à ${alpha} : ${x} au lieu de ${attendu}`);
  }
});

// ------------------------------------------------------------ T-O1 à T-O4 : l'oracle

/** Les six états de T-O1 (conception § 8) : créneaux par la table de R34 (34e → 33, pause → 46, 75e → 75, 90+ → 91, 60e → 60). */
const ETATS_T_O1 = [
  { qui: 'coup d’envoi', lambda: 1.45, mu: 1.15, depuis: d0(0) },
  { qui: '34e 1-0', lambda: 1.62, mu: 0.98, depuis: d0(33, 1, 0) },
  { qui: 'pause 0-1, un rouge au club qui reçoit', lambda: 1.3, mu: 1.2, depuis: d0(46, 0, 1, 1, 0) },
  { qui: '75e 2-1', lambda: 1.45, mu: 1.15, depuis: d0(75, 2, 1) },
  { qui: 'début du 90+ à 1-1', lambda: 1.45, mu: 1.15, depuis: d0(91, 1, 1) },
  { qui: '3-0 à la 60e', lambda: 1.5, mu: 1.0, depuis: d0(60, 3, 0) }
];

test('T-O1 six états (coup d’envoi ; 34e 1-0 ; pause 0-1 avec un rouge ; 75e 2-1 ; début du 90+ ; 3-0 à la 60e) contre simulerMatch, trois graines, n = 200 000 : marchés et rouges de plus à 4 σ + 1e-4, cases ≥ 50 attendus à 5 σ, χ² de Pearson, Σz² sur les graines', (t) => {
  const b = campagne('T-O1', ETATS_T_O1);
  assert.equal(b.tirages, 18);
  t.diagnostic(`T-O1 : ${dire(b)}`);
});

const ETATS_T_O2 = [
  { qui: 'créneau 45 entamé de 0,3 à 1-0', lambda: 1.6, mu: 1.2, depuis: d0(45, 1, 0), part: 0.3 },
  { qui: 'créneau 80 entamé de 0,5 à 1-1, un rouge au club qui reçoit', lambda: 1.45, mu: 1.15, depuis: d0(80, 1, 1, 1, 0), part: 0.5 },
  { qui: 'créneau 91 entamé de 0,6 à 2-1', lambda: 2.4, mu: 1.1, depuis: d0(91, 2, 1), part: 0.6 }
].map((e) => ({ ...e, paramsTirage: paramsEntames(PARAMS, e.depuis.creneau, e.part) }));

test('T-O2 le créneau entamé (parts 0,3 ; 0,5 ; 0,6 aux créneaux 45, 80, 91) contre simulerMatch avec le profil et la bande de rouges réduits ; et, EXACT, la part jouée = ces réglages réduits à 1e-14 par case', (t) => {
  for (const e of ETATS_T_O2) {
    const avecPart = exact({ lambda: e.lambda, mu: e.mu, depuis: e.depuis, part: e.part, coupes: COUPES.aucune });
    const reduits = exact({ lambda: e.lambda, mu: e.mu, params: e.paramsTirage, depuis: e.depuis, part: 0, coupes: COUPES.aucune });
    for (let c = 0; c < T * T; c++) assert.ok(Math.abs(avecPart.grille[c] - reduits.grille[c]) <= 1e-14, `${e.qui} : case ${c}`);
    for (const k of ['home', 'away']) for (const j of [0, 1, 2]) assert.ok(Math.abs(avecPart.rouges[k][j] - reduits.rouges[k][j]) <= 1e-14, `${e.qui} : rouges ${k}[${j}]`);
  }
  const b = campagne('T-O2', ETATS_T_O2);
  assert.equal(b.tirages, 9);
  t.diagnostic(`T-O2 : ${dire(b)}`);
});

test('T-O3 « au moins un rouge de plus » et les rouges de plus de chaque camp contre les chemins — comparés dans CHAQUE tirage de T-O1, T-O2 et T-O4 (comparer) ; ici en plus : 3 rouges au départ (R35 point 1 : le compte VRAI fait l’écart) et un camp déjà à 2', (t) => {
  const etats = [
    { qui: '50e 1-1, 3 rouges au club qui reçoit', lambda: 1.45, mu: 1.15, depuis: d0(50, 1, 1, 3, 0) },
    { qui: '20e 0-0, 2 rouges au club qui reçoit, 1 au visiteur', lambda: 1.45, mu: 1.15, depuis: d0(20, 0, 0, 2, 1) }
  ];
  for (const e of etats) {
    const ex = exact(e);
    assert.ok(Math.abs(ex.rouges.home[0] - ex.somme) <= 1e-15, `${e.qui} : aucun rouge de plus possible pour le club qui reçoit`);
    assert.equal(ex.rouges.home[1] + ex.rouges.home[2], 0);
    assert.ok(ex.rouges.away[1] > 0, `${e.qui} : un rouge de plus possible pour le visiteur`);
  }
  assert.equal(exact(etats[0]).rougesPlafonnes, true);
  assert.equal(exact(etats[1]).rougesPlafonnes, false);
  const b = campagne('T-O3', etats);
  assert.equal(b.tirages, 6);
  t.diagnostic(`T-O3 (états en plus) : ${dire(b)}`);
});

test('T-O4 PARAMS_SANS_EFFETS contre l’oracle sans effets (coup d’envoi ; 75e 2-1) : mêmes règles', (t) => {
  const etats = [
    { qui: 'sans effets, coup d’envoi', lambda: 1.45, mu: 1.15, depuis: d0(0) },
    { qui: 'sans effets, 75e 2-1', lambda: 1.45, mu: 1.15, depuis: d0(75, 2, 1) }
  ].map((e) => ({ ...e, params: PARAMS_SANS_EFFETS }));
  for (const e of etats) assert.equal(exact(e).rouges.dePlus, 0, `${e.qui} : aucun rouge sans effets`);
  const b = campagne('T-O4', etats);
  assert.equal(b.tirages, 6);
  t.diagnostic(`T-O4 : ${dire(b)}`);
});

// ------------------------------------------------------------ O5 : les tests EXACTS

/** Poisson(x) pour j < 8, le reste sur 8 : la loi d'un créneau (simulationMatch.js l. 111-126), par la formule directe. */
function loiCreneau(x) {
  const s = new Float64Array(BUTS_MAX_PAR_CRENEAU + 1);
  let fact = 1;
  let cum = 0;
  for (let j = 0; j < BUTS_MAX_PAR_CRENEAU; j++) {
    if (j > 0) fact *= j;
    s[j] = (Math.exp(-x) * x ** j) / fact;
    cum += s[j];
  }
  s[BUTS_MAX_PAR_CRENEAU] = Math.max(0, 1 - cum);
  return s;
}
const bandeDe = (params, k) => params.bandes.findIndex(([, de, a]) => k >= de && k <= a);

test('O5 (exact) un créneau À LA MAIN — le 91 à 2-1, un rouge au visiteur, parts 0 et 0,37 : buts sur l’état du DÉBUT, rouge sur l’écart d’APRÈS, la part sur les deux ; cases et rouges à 1e-15, et les trois poses (14, 15, 19) vues', () => {
  const lambda = 2.4;
  const mu = 1.1;
  const depuis = d0(91, 2, 1, 0, 1);
  const { profil, MH, MA, rougeBande, rougeEtat } = PARAMS;
  const b = trancheDu(91);
  assert.equal(b, 2);
  const bande = bandeDe(PARAMS, 91);
  assert.equal(PARAMS.bandes[bande][0], '90+');
  // État du début : d = clip(2 − 1) = 1, r = clip(ra − rh) = clip(1 − 0) = 1 ; classes c = (d + 2)·3 + (r + 1).
  const cH = (1 + 2) * 3 + (1 + 1);
  const cA = (-1 + 2) * 3 + (-1 + 1);
  assert.equal(cA, 3);
  for (const part of [0, 0.37]) {
    const reste = 1 - part;
    const main = ({ faute = null } = {}) => {
      const pH = loiCreneau(lambda * profil[91] * MH[cH * 3 + b] * reste);
      const pAjuste = loiCreneau(mu * profil[91] * MA[cA * 3 + b] * reste);
      // Pose 19 : la part jouée sur les buts seulement, pas sur le hasard du rouge.
      const q = rougeBande[bande] * (faute === 19 ? 1 : reste);
      const g = new Float64Array(T * T);
      let domPlus = 0;
      let extPlus = 0;
      let aucun = 0;
      for (let jh = 0; jh <= BUTS_MAX_PAR_CRENEAU; jh++) {
        // Pose 14 : le visiteur lirait l'état APRÈS les buts du club qui reçoit (d = clip(2 + jh − 1), r inchangé).
        const pA = faute === 14 ? loiCreneau(mu * profil[91] * MA[((-clip(1 + jh, -2, 2) + 2) * 3 + (-1 + 1)) * 3 + b] * reste) : pAjuste;
        for (let ja = 0; ja <= BUTS_MAX_PAR_CRENEAU; ja++) {
          const w = pH[jh] * pA[ja];
          g[(2 + jh) * T + (1 + ja)] += w;
          // Pose 15 : le rouge lirait l'écart d'AVANT les buts (1) au lieu de celui d'après (1 + jh − ja).
          const e = faute === 15 ? 1 : clip(2 + jh - (1 + ja), -2, 2);
          const qH = depuis.rh < ROUGES_MAX ? q * rougeEtat[e + 2] : 0;
          const qA = depuis.ra < ROUGES_MAX ? q * rougeEtat[-e + 2] : 0;
          domPlus += w * qH;
          extPlus += w * qA;
          aucun += w * (1 - qH) * (1 - qA);
        }
      }
      return { g, domPlus, extPlus, dePlus: 1 - aucun };
    };
    const r = exact({ lambda, mu, depuis, part, coupes: COUPES.aucune });
    const juste = main();
    let pire = 0;
    for (let c = 0; c < T * T; c++) pire = Math.max(pire, Math.abs(r.grille[c] - juste.g[c]));
    assert.ok(pire <= 1e-15, `part ${part} : ${pire} par case`);
    assert.ok(Math.abs(r.rouges.home[1] - juste.domPlus) <= 1e-15, `part ${part} : rouge de plus du club qui reçoit`);
    assert.ok(Math.abs(r.rouges.away[1] - juste.extPlus) <= 1e-15, `part ${part} : rouge de plus du visiteur`);
    assert.ok(Math.abs(r.rouges.dePlus - juste.dePlus) <= 1e-15, `part ${part} : au moins un rouge de plus`);
    assert.equal(r.rouges.home[2], 0);
    assert.equal(r.rouges.away[2], 0);
    // Les poses : chacune s'écarte de la valeur juste de bien plus que la tolérance (le test les voit).
    const f14 = main({ faute: 14 });
    let e14 = 0;
    for (let c = 0; c < T * T; c++) e14 = Math.max(e14, Math.abs(f14.g[c] - r.grille[c]));
    assert.ok(e14 > 1e-6, `part ${part} : pose 14 vue (${e14})`);
    assert.ok(Math.abs(main({ faute: 15 }).domPlus - r.rouges.home[1]) > 1e-7, `part ${part} : pose 15 vue`);
    if (part > 0) assert.ok(Math.abs(main({ faute: 19 }).dePlus - r.rouges.dePlus) > 1e-5, 'pose 19 vue');
  }
});

/**
 * L'ÉNUMÉRATION COMPLÈTE des chemins de deux créneaux k et k + 1 (buts 0..8 de chaque côté, rouge ou non de chaque côté,
 * à chaque créneau : 324 × 324 chemins), la part jouée sur le premier ; les comptes VRAIS de rouges font l'écart r, un
 * rouge de plus seulement sous 2 (simulationMatch.js l. 225-226).
 */
function enumerer({ lambda, mu, params, depuis, part = 0 }) {
  const { profil, MH, MA, rougeBande, rougeEtat } = params;
  const g = new Float64Array(T * T);
  const home = [0, 0, 0];
  const away = [0, 0, 0];
  let dePlus = 0;
  let chemins = 0;
  const creneau = (k, reste, h, a, rh, ra, w, suite) => {
    const b = trancheDu(k);
    const d = clip(h - a, -2, 2);
    const r = clip(ra - rh, -1, 1);
    const pH = loiCreneau(lambda * profil[k] * MH[((d + 2) * 3 + (r + 1)) * 3 + b] * reste);
    const pA = loiCreneau(mu * profil[k] * MA[((-d + 2) * 3 + (-r + 1)) * 3 + b] * reste);
    const bk = bandeDe(params, k);
    const q = (bk >= 0 ? rougeBande[bk] : 0) * reste;
    for (let jh = 0; jh <= BUTS_MAX_PAR_CRENEAU; jh++) {
      for (let ja = 0; ja <= BUTS_MAX_PAR_CRENEAU; ja++) {
        const h2 = h + jh;
        const a2 = a + ja;
        const e = clip(h2 - a2, -2, 2);
        const qH = rh < ROUGES_MAX ? q * rougeEtat[e + 2] : 0;
        const qA = ra < ROUGES_MAX ? q * rougeEtat[-e + 2] : 0;
        for (const [xh, ph] of [[0, 1 - qH], [1, qH]]) {
          for (const [xa, pa] of [[0, 1 - qA], [1, qA]]) {
            suite(h2, a2, rh + xh, ra + xa, w * pH[jh] * pA[ja] * ph * pa);
          }
        }
      }
    }
  };
  const k = depuis.creneau;
  creneau(k, 1 - part, depuis.h, depuis.a, depuis.rh, depuis.ra, 1, (h, a, rh, ra, w) =>
    creneau(k + 1, 1, h, a, rh, ra, w, (h2, a2, rh2, ra2, w2) => {
      chemins++;
      g[Math.min(h2, T - 1) * T + Math.min(a2, T - 1)] += w2;
      home[rh2 - depuis.rh] += w2;
      away[ra2 - depuis.ra] += w2;
      if (rh2 + ra2 > depuis.rh + depuis.ra) dePlus += w2;
    })
  );
  return { g, rouges: { dePlus, home, away }, chemins };
}

test('O5 (exact) deux créneaux contre l’ÉNUMÉRATION COMPLÈTE des chemins : 90-91 (réglages de service), 75-76 avec les créneaux suivants éteints (changement de tranche 1 → 2 et de bande « 61-75 » → « 76-90 », rouges plafonnés à 2, 3 rouges au départ) ; cases à 1e-15, rouges à 1e-14 (sommes de 10⁵ chemins : l’ordre des additions, 1,2e-15 mesuré ; une pose s’écarte de plus de 1e-7)', () => {
  const eteints = paramsEteintsApres(PARAMS, 76);
  assert.equal(trancheDu(75), 1);
  assert.equal(trancheDu(76), 2);
  assert.notEqual(bandeDe(PARAMS, 75), bandeDe(PARAMS, 76));
  const cas = [
    { qui: '90-91, 1-0, un rouge au club qui reçoit, part 0,5', lambda: 2.4, mu: 1.1, params: PARAMS, depuis: d0(90, 1, 0, 1, 0), part: 0.5 },
    { qui: '90-91, 0-0, part 0', lambda: 1.45, mu: 1.15, params: PARAMS, depuis: d0(90, 0, 0), part: 0 },
    { qui: '75-76 éteints après, 2-1, un rouge au club qui reçoit, part 0,37', lambda: 2.4, mu: 1.6, params: eteints, depuis: d0(75, 2, 1, 1, 0), part: 0.37 },
    { qui: '75-76 éteints après, 2-2, 3 rouges au club qui reçoit et 1 au visiteur, part 0', lambda: 2.4, mu: 1.6, params: eteints, depuis: d0(75, 2, 2, 3, 1), part: 0 }
  ];
  for (const c of cas) {
    const en = enumerer(c);
    assert.equal(en.chemins, 324 * 324);
    const r = exact({ lambda: c.lambda, mu: c.mu, params: c.params, depuis: c.depuis, part: c.part, coupes: COUPES.aucune });
    let pire = 0;
    for (let i = 0; i < T * T; i++) pire = Math.max(pire, Math.abs(r.grille[i] - en.g[i]));
    assert.ok(pire <= 1e-15, `${c.qui} : ${pire} par case`);
    assert.ok(Math.abs(r.rouges.dePlus - en.rouges.dePlus) <= 1e-14, `${c.qui} : au moins un rouge de plus (${r.rouges.dePlus} contre ${en.rouges.dePlus})`);
    for (const camp of ['home', 'away']) {
      for (const j of [0, 1, 2]) assert.ok(Math.abs(r.rouges[camp][j] - en.rouges[camp][j]) <= 1e-14, `${c.qui} : rouges ${camp}[${j}] (${r.rouges[camp][j]} contre ${en.rouges[camp][j]})`);
    }
  }
  // Le cas à 3 rouges : le club qui reçoit n'en prend plus, le visiteur au plus un (1 → 2).
  const trois = enumerer(cas[3]);
  assert.equal(trois.rouges.home[1] + trois.rouges.home[2], 0);
  assert.equal(trois.rouges.away[2], 0);
  assert.ok(trois.rouges.away[1] > 0);
  // Les créneaux éteints n'ajoutent rien : la loi de 75 à 91 est celle de 75-76.
  assert.equal(eteints.profil.slice(77).every((x) => x === 0), true);
  assert.equal(NB_CRENEAUX, 92);
});

// ------------------------------------------------------------ T-O5 : la copie isolée

test('T-O5 copie isolée (réseau coupé, heure figée à deux instants différents) : mêmes octets entre eux et que l’appel direct, aucun appel réseau', async () => {
  const copie = preparerCopie({ base: false });
  try {
    const script = path.join(SERVEUR, 'test', 'aides', 'script-direct-pur.mjs');
    const a = executer(copie, script, { maintenant: '2026-10-05T12:00:00.000Z' });
    const b = executer(copie, script, { maintenant: '2031-03-17T04:00:00.000Z' });
    for (const r of [a, b]) {
      assert.equal(r.code, 0, r.erreurs.slice(-2000));
      assert.equal(r.reseau, false, 'aucun appel réseau');
      assert.ok(r.json?.ok, r.sortie.slice(-1000));
    }
    assert.equal(a.json.horloge, '2026-10-05T12:00:00.000Z', 'heure figée au premier instant');
    assert.equal(b.json.horloge, '2031-03-17T04:00:00.000Z', 'heure figée au second instant');
    assert.deepEqual(a.json.empreintes, b.json.empreintes, 'mêmes octets à deux heures différentes');
    assert.deepEqual(Object.keys(a.json.empreintes).sort(), ['cles', 'etats', 'instantanes', 'lectures', 'memoire', 'minute0']);
    // L'appel direct, dans ce processus (horloge vraie) : les mêmes octets.
    assert.deepEqual(await empreintes(path.join(SERVEUR, 'src')), a.json.empreintes, 'mêmes octets que l’appel direct');
  } finally {
    copie.nettoyer();
  }
});
