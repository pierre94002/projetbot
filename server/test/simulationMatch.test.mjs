/**
 * Étape 28 du plan — LA SIMULATION D'UN MATCH (conception §1.2-§1.6 et §6, tests T1, T2, T3, T4, T6).
 *   node --test test/simulationMatch.test.mjs        (depuis server/)
 *
 * Modules PURS (data/simulation/ : ni base, ni fichier, ni horloge) : appelés directement, sans base. Un essai en
 * plus tourne dans une COPIE ISOLÉE (isolement.mjs : réseau coupé, heure figée) à deux heures différentes : mêmes
 * octets, aucun appel réseau — la simulation ne dépend ni de l'heure ni du réseau.
 *
 *   T1 exactitude : 5 grilles (λ/μ 1,45/1,15 ; 0,9/0,9 ; 2,5/0,7 ; 1,2/1,6 ; 5/0,6, 7 % hors des 81 cases) ; marchés du
 *      score lus dans la grille ; dans les chemins, Σ poids par case = grille / couverte à 1e-12 ; masse non couverte
 *      < 0,5 % ; la grille de l'ancien modèle posée sur 21 × 21 (= computeScoreMatrix) ; table jointe = chemins.
 *   T2 graine : même entrée → mêmes chemins, mêmes marchés et mêmes octets ; bruit entre graines ≤ 0,5 pt en moyenne
 *      à N = 10 000 (mesuré 0,34-0,44), ≤ 0,25 pt à N = 40 000.
 *   T3 sommes : mi-temps 1N2 = 1 ; 9 cases = 1 ; Σ_i case(i, j) = P(fin j) ; premier but dom + ext + aucun = 1, aucun
 *      = la case 0-0.
 *   T4 monotonie : mi-temps plus de 0,5 ≥ plus de 1,5 ; P(1/1) ≤ min(P(mi-temps 1), P(1)) ; hasards nuls → aucun rouge.
 *   T6 sans effets ni grille : buts moyens = λ, μ à 1 %, 1re mi-temps 45,0 % ± 0,5 ; avec effets : nul − grille entre
 *      +0,2 et +1,6 pt ; Poisson EXACT à λ = 5 : buts moyens du créneau 91 = 5 × 0,0724 × M à 2 %, 3 buts possibles.
 *   Conventions : la mi-temps se relève APRÈS le créneau 45 ; « avant la 30e » = créneaux 0..29 (critique E9).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as SM from '../src/data/simulation/simulationMatch.js';
import * as R from '../src/data/simulation/reglages.js';
import { grilleDesButs, marchesDeLaGrille, casesRendues } from '../src/core/engine/goalModel.js';
import { computeScoreMatrix } from '../src/sports/football/scoreMatrix.js';
import { fichiersDuMoteur } from '../src/core/engine/engineVersions.js';

const T = 21;
const GRILLES = [[1.45, 1.15], [0.9, 0.9], [2.5, 0.7], [1.2, 1.6], [5, 0.6]];
const RHO = -0.05;
const graine = (l, m, role = 'candidate') => SM.graineDuMatch({ cle: `test|${l}|${m}`, role, lambda: l, mu: m, rho: RHO });
const memo = new Map();
/** Une simulation stratifiée (mémorisée : chaque grille une fois pour tout le fichier). */
function simulee(l, m) {
  const k = `${l}|${m}`;
  if (!memo.has(k)) {
    const g = grilleDesButs(l, m, RHO);
    memo.set(k, { g, ch: SM.simulerMatch({ lambda: l, mu: m, grille: g, params: R.PARAMS, n: R.N, seed: graine(l, m) }) });
  }
  return memo.get(k);
}
/** Le résultat 1N2 d'une case (0 domicile, 1 nul, 2 extérieur). */
const camp = (i, j) => (i > j ? 0 : i === j ? 1 : 2);
/** P(résultat final) dans le monde des chemins stratifiés : Σ des cases COUVERTES de la grille, / couverte. */
function stratifie(g, ch) {
  const n = new Int32Array(T * T);
  for (let p = 0; p < ch.n; p++) n[ch.ftH[p] * T + ch.ftA[p]]++;
  const r = [0, 0, 0];
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (n[i * T + j]) r[camp(i, j)] += g[i * T + j] / ch.couverte;
  return { r, n };
}
const variantesParams = (changements) => ({ ...R.PARAMS, ...changements });
const SANS_EFFETS = variantesParams({ MH: new Array(45).fill(1), MA: new Array(45).fill(1), rougeBande: new Array(8).fill(0) });

// ------------------------------------------------------------ réglages

test('réglages : paramètres recopiés par script (92 parts de somme 1, 45 + 45 multiplicateurs positifs, 8 bandes de rouges qui couvrent les 92 créneaux, 5 multiplicateurs d’état), gelés ; versions, N, fenêtre, convention « avant la 30e » ; 22 écarts mesurés sur V', () => {
  const P = R.PARAMS;
  assert.equal(P.profil.length, 92);
  assert.ok(Math.abs(P.profil.reduce((s, x) => s + x, 0) - 1) < 1e-12, 'Σ profil = 1');
  assert.ok(P.profil.every((x) => x > 0));
  assert.equal(P.MH.length, 45);
  assert.equal(P.MA.length, 45);
  assert.ok([...P.MH, ...P.MA].every((x) => x > 0), 'tous les multiplicateurs > 0');
  assert.equal(P.rougeBande.length, 8);
  assert.equal(P.rougeEtat.length, 5);
  const couverts = new Set();
  for (const [, de, a] of P.bandes) for (let k = de; k <= a; k++) couverts.add(k);
  assert.equal(couverts.size, 92, 'les 8 bandes couvrent les 92 créneaux');
  assert.ok(Object.isFrozen(P) && Object.isFrozen(P.MH) && Object.isFrozen(P.bandes[0]), 'gelés');
  // Le bloc 45+ pèse 3,42 % des buts, le bloc 90+ 7,24 % (s1) ; la 1re mi-temps 45,04 %.
  assert.ok(Math.abs(P.profil[45] - 0.0342) < 5e-4 && Math.abs(P.profil[91] - 0.0724) < 5e-4);
  assert.ok(Math.abs(P.profil.slice(0, 46).reduce((s, x) => s + x, 0) - 0.4504) < 5e-4);
  assert.equal(R.VERSION_SIMULATION, 1);
  assert.equal(R.N, 10000);
  assert.equal(R.FENETRE_H, 48);
  assert.equal(R.ECART_MAX, 0.1);
  assert.equal(R.CONVENTION_AVANT_30.dernierCreneau, 29);
  assert.deepEqual(R.SEUILS_ENJEU, { sans: 2, gros: 20 });
  assert.equal(Object.keys(R.ECARTS_MESURES_V.marches).length, 22);
  assert.equal(R.ECARTS_MESURES_V.marches.deuxMiTemps05.ecart, -2.26, 'un but dans chaque mi-temps : −2,26 pt (v1 §2)');
  assert.equal(R.ECARTS_MESURES_V.marches.htD.ecart, 0.15);
  for (const e of Object.values(R.ECARTS_MESURES_V.marches)) assert.ok(Math.abs(e.annonce - e.realise - e.ecart) < 0.011, `${e.libelle} : écart = annoncé − réalisé`);
});

// ------------------------------------------------------------ T1

test('T1 exactitude : 5 grilles, Σ poids par case = grille / couverte à 1e-12 dans les chemins, masse non couverte < 0,5 %, taille effective proche de N ; les marchés du score se lisent dans la grille', () => {
  for (const [l, m] of GRILLES) {
    const { g, ch } = simulee(l, m);
    const somme = new Float64Array(T * T);
    const n = new Int32Array(T * T);
    for (let p = 0; p < ch.n; p++) {
      somme[ch.ftH[p] * T + ch.ftA[p]] += ch.poids[p];
      n[ch.ftH[p] * T + ch.ftA[p]]++;
    }
    let couverte = 0;
    let pire = 0;
    for (let c = 0; c < T * T; c++) {
      if (n[c]) {
        couverte += g[c];
        pire = Math.max(pire, Math.abs(somme[c] - g[c] / ch.couverte));
      } else assert.equal(somme[c], 0);
    }
    assert.ok(pire < 1e-12, `λ ${l} μ ${m} : Σ poids par case = g / couverte (écart ${pire})`);
    assert.ok(Math.abs(couverte - ch.couverte) < 1e-12 && Math.abs(ch.couverte + ch.masseNonCouverte - 1) < 1e-12);
    assert.ok(ch.masseNonCouverte < 0.005, `λ ${l} μ ${m} : masse non couverte ${ch.masseNonCouverte}`);
    assert.ok(Math.abs(ch.poids.reduce((s, w) => s + w, 0) - 1) < 1e-12, 'Σ poids = 1');
    assert.ok(ch.tailleEffective > 9000 && ch.tailleEffective <= 10000, `taille effective ${ch.tailleEffective}`);
    // Les marchés du score : la grille elle-même (aucun bruit), jamais les chemins.
    assert.deepEqual(SM.marchesDuScore(g), marchesDeLaGrille(g));
    assert.ok(!('home' in SM.marchesDesChemins(ch)), 'les marchés de déroulé ne rendent aucun marché du score final');
  }
  assert.ok(casesRendues(grilleDesButs(5, 0.6, RHO)).horsGrille > 0.05, 'λ 5 / μ 0,6 : plus de 5 % de masse hors des 81 cases');
});

test('T1 la grille de l’ancien modèle posée sur 21 × 21 : 81 cases (le reste à 0), somme 1, marchés = computeScoreMatrix à 1e-12', () => {
  for (const [l, m] of [[1.45, 1.15], [0.9, 0.9], [2.5, 0.7], [0.6, 2.2]]) {
    const g = SM.grilleAncienne81(l, m, -0.075);
    let s = 0;
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) {
      if (i > 8 || j > 8) assert.equal(g[i * T + j], 0, `case ${i}-${j} hors des 81 : 0`);
      s += g[i * T + j];
    }
    assert.ok(Math.abs(s - 1) < 1e-12);
    const a = marchesDeLaGrille(g);
    const b = computeScoreMatrix(l, m, -0.075);
    const paires = [[a.home, b.home], [a.draw, b.draw], [a.away, b.away], [a.over25, b.over25], [a.over15, b.over15], [a.bothTeamsScore, b.bothTeamsScore], [a.homeTeamGoals.over15, b.homeTeamGoals.over15], [a.resultAndTotal[2.5].drawUnder, b.resultAndTotal[2.5].drawUnder]];
    for (const [x, y] of paires) assert.ok(Math.abs(x - y) < 1e-12, `λ ${l} μ ${m} : ${x} contre ${y}`);
  }
});

test('T1 la table jointe (7 octets par case, triée) redonne EXACTEMENT les marchés des chemins (1e-12) ; repondérée sur une autre grille, Σ poids par case = nouvelle grille / couverte', () => {
  for (const [l, m] of GRILLES) {
    const { g, ch } = simulee(l, m);
    const t = SM.tableJointe(ch);
    assert.ok(t instanceof Uint8Array && t.length % 7 === 0 && t.length > 0);
    const lu = SM.lireTableJointe(t, g);
    assert.equal(lu.n, R.N);
    assert.ok(Math.abs(lu.masseNonCouverte - ch.masseNonCouverte) < 1e-15);
    const a = SM.marchesDeDeroule(lu, { arrondi: null });
    const b = SM.marchesDesChemins(ch, { arrondi: null });
    for (const k of Object.keys(b)) {
      if (k === 'htFt') b.htFt.forEach((v, i) => assert.ok(Math.abs(v - a.htFt[i]) < 1e-12));
      else assert.ok(Math.abs(a[k] - b[k]) < 1e-12, `${k} : table ${a[k]} contre chemins ${b[k]}`);
    }
    // Repondération sur la grille d'une analyse plus récente (λ + 5 %).
    const g2 = grilleDesButs(l * 1.05, m, RHO);
    const lu2 = SM.lireTableJointe(t, g2);
    const parCase = new Float64Array(T * T);
    for (const c of lu2.cases) parCase[c.fh * T + c.fa] += c.w;
    for (let c = 0; c < T * T; c++) if (parCase[c] > 0) assert.ok(Math.abs(parCase[c] - g2[c] / lu2.couverte) < 1e-12);
  }
});

// ------------------------------------------------------------ T2

test('T2 graine : même entrée → mêmes chemins, mêmes marchés, mêmes octets de la table ; la graine porte la clé, le rôle, la version, λ, μ, ρ', () => {
  const g = grilleDesButs(1.45, 1.15, RHO);
  const seed = graine(1.45, 1.15);
  const a = SM.simulerMatch({ lambda: 1.45, mu: 1.15, grille: g, params: R.PARAMS, n: 5000, seed });
  const b = SM.simulerMatch({ lambda: 1.45, mu: 1.15, grille: g, params: R.PARAMS, n: 5000, seed });
  for (const k of ['ftH', 'ftA', 'htH', 'htA', 'premierSlot', 'premierCamp', 'rougesH', 'rougesA', 'poids']) assert.deepEqual(a[k], b[k], k);
  assert.deepEqual(SM.marchesDesChemins(a), SM.marchesDesChemins(b));
  assert.deepEqual(SM.tableJointe(a), SM.tableJointe(b));
  const base = { cle: 'fd:EPL|2026-10-27|1|2', role: 'candidate', lambda: 1.451, mu: 1.152, rho: -0.05 };
  const s0 = SM.graineDuMatch(base);
  assert.equal(s0, SM.graineDuMatch({ ...base }), 'même entrée, même graine');
  for (const autre of [{ cle: 'fd:EPL|2026-10-27|1|3' }, { role: 'service' }, { lambda: 1.452 }, { mu: 1.151 }, { rho: -0.075 }, { version: 2 }]) assert.notEqual(SM.graineDuMatch({ ...base, ...autre }), s0, JSON.stringify(autre));
  assert.equal(SM.graineDuMatch({ ...base, lambda: 1.4512 }), s0, 'λ à 3 décimales');
  assert.throws(() => SM.simulerMatch({ lambda: 1, mu: 1, params: R.PARAMS, n: 10 }), /graine est obligatoire/);
});

test('T2 bruit entre graines : écart-type moyen ≤ 0,5 pt et maximal ≤ 1 pt à N = 10 000 (mesuré 0,34-0,44 et 0,74) ; ≤ 0,25 pt en moyenne à N = 40 000', () => {
  const g = grilleDesButs(1.45, 1.15, RHO);
  const cles = ['htH', 'htD', 'htA', 'htO05', 'htO15', 'deuxMiTemps05', 'h2plusQueH1', 'premierDom', 'premierExt', 'premierAvant30', 'meneMiTempsGagne', 'rougeAuMoinsUn'];
  const ecarts = (n) => {
    const series = [1, 2, 3, 4, 5].map((s) => SM.marchesDesChemins(SM.simulerMatch({ lambda: 1.45, mu: 1.15, grille: g, params: R.PARAMS, n, seed: graine(1.45, 1.15) + s }), { arrondi: null }));
    return [...cles.map((k) => series.map((x) => x[k])), ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => series.map((x) => x.htFt[c]))].map((v) => {
      const mo = v.reduce((s, x) => s + x, 0) / v.length;
      return 100 * Math.sqrt(v.reduce((s, x) => s + (x - mo) ** 2, 0) / (v.length - 1));
    });
  };
  const e1 = ecarts(10000);
  const moyenne1 = e1.reduce((s, x) => s + x, 0) / e1.length;
  assert.ok(moyenne1 <= 0.5 && Math.max(...e1) <= 1, `N = 10 000 : écart-type moyen ${moyenne1.toFixed(3)} pt, maximal ${Math.max(...e1).toFixed(3)} pt`);
  const e4 = ecarts(40000);
  const moyenne4 = e4.reduce((s, x) => s + x, 0) / e4.length;
  assert.ok(moyenne4 <= 0.25, `N = 40 000 : écart-type moyen ${moyenne4.toFixed(3)} pt`);
});

// ------------------------------------------------------------ T3

test('T3 sommes : mi-temps 1N2 = 1, 9 cases = 1, Σ_i case(i, j) = P(fin j) des chemins stratifiés (à 1e-12, et à la masse non couverte près de la grille), premier but dom + ext + aucun = 1, aucun = la case 0-0', () => {
  for (const [l, m] of GRILLES) {
    const { g, ch } = simulee(l, m);
    const d = SM.marchesDesChemins(ch, { arrondi: null });
    assert.ok(Math.abs(d.htH + d.htD + d.htA - 1) < 1e-12, 'mi-temps 1N2 = 1');
    assert.ok(Math.abs(d.htFt.reduce((s, x) => s + x, 0) - 1) < 1e-12, '9 cases = 1');
    assert.ok(Math.abs(d.miTempsConnue - 1) < 1e-12, 'mi-temps connue pour tous les chemins');
    const { r } = stratifie(g, ch);
    const grille = marchesDeLaGrille(g);
    const fin = [grille.home, grille.draw, grille.away];
    for (let j = 0; j < 3; j++) {
      const colonne = d.htFt[j] + d.htFt[3 + j] + d.htFt[6 + j];
      assert.ok(Math.abs(colonne - r[j]) < 1e-12, `fin ${j} : Σ_i case(i, j) = P(fin j) stratifié`);
      assert.ok(Math.abs(colonne - fin[j]) <= ch.masseNonCouverte + 1e-12, `fin ${j} : à la masse non couverte près de la grille`);
    }
    assert.ok(Math.abs(d.premierDom + d.premierExt + d.premierAucun - 1) < 1e-12, 'premier but : dom + ext + aucun = 1');
    assert.equal(d.premierInconnu, 0);
    assert.ok(Math.abs(d.premierAucun - g[0] / ch.couverte) < 1e-12, '« aucun » = la case 0-0 (stratifiée)');
    assert.ok(Math.abs(d.premierAucun - g[0]) <= ch.masseNonCouverte, '« aucun » = la case 0-0 de la grille, à la masse non couverte près');
    assert.ok(Math.abs(d.meneMiTempsGagne - d.retourDom - d.retourExt) < 1e-12);
  }
});

// ------------------------------------------------------------ T4

test('T4 monotonie : mi-temps plus de 0,5 ≥ plus de 1,5 ; P(1/1) ≤ min(P(mi-temps 1), P(1)) ; hasards des rouges nuls → aucun rouge', () => {
  for (const [l, m] of GRILLES) {
    const { g, ch } = simulee(l, m);
    const d = SM.marchesDesChemins(ch, { arrondi: null });
    assert.ok(d.htO05 >= d.htO15);
    assert.ok(d.htO05 + d.ht00 - 1 < 1e-12 && Math.abs(d.htO05 + d.ht00 - 1) < 1e-12);
    const { r } = stratifie(g, ch);
    assert.ok(d.htFt[0] <= Math.min(d.htH, r[0]) + 1e-15);
    assert.ok(d.htFt[8] <= Math.min(d.htA, r[2]) + 1e-15);
    assert.ok(d.deuxMiTemps05 <= d.htO05 + 1e-15);
  }
  const sansRouges = variantesParams({ rougeBande: new Array(8).fill(0) });
  const ch = SM.simulerMatch({ lambda: 1.45, mu: 1.15, grille: grilleDesButs(1.45, 1.15, RHO), params: sansRouges, n: 4000, seed: 9 });
  assert.equal(SM.marchesDesChemins(ch, { arrondi: null }).rougeAuMoinsUn, 0, 'hasards nuls : P(rouge) = 0');
  assert.ok(ch.rougesH.every((x) => x === 0) && ch.rougesA.every((x) => x === 0));
});

// ------------------------------------------------------------ conventions

test('conventions : la mi-temps se relève APRÈS le créneau 45 (un but du 45+ compte en 1re mi-temps) ; « avant la 30e » = créneaux 0 à 29 (un but noté 30’ compte, un but noté 31’ non)', () => {
  const seul = (k) => {
    const profil = new Array(92).fill(0);
    profil[k] = 1;
    return variantesParams({ profil, MH: new Array(45).fill(1), MA: new Array(45).fill(1), rougeBande: new Array(8).fill(0) });
  };
  // Tous les buts au créneau 45 (temps additionnel de la 1re mi-temps) : mi-temps = score final.
  let ch = SM.simulerMatch({ lambda: 3, mu: 2, params: seul(45), n: 3000, seed: 1 });
  for (let p = 0; p < ch.n; p++) assert.ok(ch.htH[p] === ch.ftH[p] && ch.htA[p] === ch.ftA[p], 'bloc 45+ dans la 1re mi-temps');
  assert.ok(ch.ftH.some((x) => x > 0));
  // Tous les buts au créneau 46 (minute 46) : mi-temps 0-0.
  ch = SM.simulerMatch({ lambda: 3, mu: 2, params: seul(46), n: 3000, seed: 1 });
  for (let p = 0; p < ch.n; p++) assert.ok(ch.htH[p] === 0 && ch.htA[p] === 0, 'minute 46 en 2e mi-temps');
  // Premier but au créneau 29 (minute 30) : « avant la 30e » ; au créneau 30 (minute 31) : non.
  ch = SM.simulerMatch({ lambda: 3, mu: 2, params: seul(29), n: 3000, seed: 1 });
  let d = SM.marchesDesChemins(ch, { arrondi: null });
  assert.ok(Math.abs(d.premierAvant30 - (1 - d.premierAucun)) < 1e-12 && d.premierAvant30 > 0.9, 'créneau 29 : avant la 30e');
  assert.equal(SM.marchesDesChemins(ch, { arrondi: null, dernierCreneauAvant30: 28 }).premierAvant30, 0, 'la convention de v1 (minutes 1 à 29) l’excluait');
  ch = SM.simulerMatch({ lambda: 3, mu: 2, params: seul(30), n: 3000, seed: 1 });
  d = SM.marchesDesChemins(ch, { arrondi: null });
  assert.equal(d.premierAvant30, 0, 'créneau 30 (minute 31) : pas avant la 30e');
  // La table jointe porte le même drapeau.
  const lu = SM.lireTableJointe(SM.tableJointe(SM.simulerMatch({ lambda: 3, mu: 2, params: seul(29), n: 3000, seed: 1 })), grilleDesButs(3, 2, RHO));
  assert.ok(lu.cases.filter((c) => c.pc !== 2).every((c) => c.avant30));
  // Un départ en cours de match (le direct) : rien avant le créneau de départ, mi-temps inconnue après la pause.
  const dep = SM.simulerMatch({ lambda: 1.45, mu: 1.15, params: R.PARAMS, n: 2000, seed: 3, depuis: { slot: 60, h: 1, a: 0, rh: 0, ra: 0 } });
  for (let p = 0; p < dep.n; p++) assert.ok(dep.htH[p] === SM.MI_TEMPS_INCONNUE && dep.ftH[p] >= 1 && dep.premierCamp[p] === SM.PREMIER_INCONNU);
});

// ------------------------------------------------------------ T6

test('T6 sans effets ni rouges ni grille, N = 40 000 : buts moyens = λ et μ à 1 %, part de la 1re mi-temps 45,0 % ± 0,5 (et à μ = 0,7, où 1 % ne vaut que 1,7 écart-type à 40 000, N = 200 000)', () => {
  for (const [l, m, n] of [[1.45, 1.15, 40000], [2.5, 0.7, 200000]]) {
    const ch = SM.simulerMatch({ lambda: l, mu: m, params: SANS_EFFETS, n, seed: 17 });
    let h = 0;
    let a = 0;
    let h1 = 0;
    for (let p = 0; p < ch.n; p++) {
      h += ch.ftH[p];
      a += ch.ftA[p];
      h1 += ch.htH[p] + ch.htA[p];
    }
    assert.ok(Math.abs(h / ch.n / l - 1) < 0.01, `λ ${l} : ${h / ch.n}`);
    assert.ok(Math.abs(a / ch.n / m - 1) < 0.01, `μ ${m} : ${a / ch.n}`);
    assert.ok(Math.abs((100 * h1) / (h + a) - 45.0) <= 0.5, `1re mi-temps ${((100 * h1) / (h + a)).toFixed(2)} %`);
  }
});

test('T6 avec effets, sans grille, N = 40 000 (graine 3, celle de la mesure) : le nul brut dépasse la grille ρ −0,05 de +0,2 à +1,6 pt (mesuré +0,86 à 1,45/1,15, +0,37 à 0,9/0,9)', () => {
  for (const [l, m] of [[1.45, 1.15], [0.9, 0.9]]) {
    const ch = SM.simulerMatch({ lambda: l, mu: m, params: R.PARAMS, n: 40000, seed: 3 });
    let nul = 0;
    for (let p = 0; p < ch.n; p++) if (ch.ftH[p] === ch.ftA[p]) nul++;
    const ecart = 100 * (nul / ch.n - marchesDeLaGrille(grilleDesButs(l, m, RHO)).draw);
    assert.ok(ecart >= 0.2 && ecart <= 1.6, `λ ${l} μ ${m} : nul brut − grille = ${ecart.toFixed(2)} pt`);
  }
});

test('T6 Poisson EXACT (critique E4) : à λ = 5, les buts moyens du créneau 91 = 5 × 0,0724 × M de l’état à 2 % (égalité, supériorité numérique, mène de 2), et 3 buts ou plus dans le créneau sont possibles', () => {
  const etats = [
    { nom: 'égalité à 11 contre 11', depuis: { slot: 91, h: 0, a: 0, rh: 0, ra: 0 }, iH: ((0 + 2) * 3 + 1) * 3 + 2, iA: ((0 + 2) * 3 + 1) * 3 + 2 },
    { nom: 'domicile en supériorité', depuis: { slot: 91, h: 0, a: 0, rh: 0, ra: 1 }, iH: ((0 + 2) * 3 + 2) * 3 + 2, iA: ((0 + 2) * 3 + 0) * 3 + 2 },
    { nom: 'domicile mène de 2', depuis: { slot: 91, h: 2, a: 0, rh: 0, ra: 0 }, iH: ((2 + 2) * 3 + 1) * 3 + 2, iA: ((-2 + 2) * 3 + 1) * 3 + 2 }
  ];
  let troisOuPlus = 0;
  for (const e of etats) {
    const ch = SM.simulerMatch({ lambda: 5, mu: 3, params: R.PARAMS, n: 400000, seed: 5, depuis: e.depuis });
    let h = 0;
    let a = 0;
    for (let p = 0; p < ch.n; p++) {
      const gh = ch.ftH[p] - e.depuis.h;
      h += gh;
      a += ch.ftA[p] - e.depuis.a;
      if (gh >= 3) troisOuPlus++;
    }
    const attenduH = 5 * R.PARAMS.profil[91] * R.PARAMS.MH[e.iH];
    const attenduA = 3 * R.PARAMS.profil[91] * R.PARAMS.MA[e.iA];
    assert.ok(Math.abs(h / ch.n / attenduH - 1) < 0.02, `${e.nom} : domicile ${(h / ch.n).toFixed(4)} contre ${attenduH.toFixed(4)}`);
    assert.ok(Math.abs(a / ch.n / attenduA - 1) < 0.02, `${e.nom} : extérieur ${(a / ch.n).toFixed(4)} contre ${attenduA.toFixed(4)} (multiplicateur vu de l’extérieur)`);
  }
  assert.ok(troisOuPlus > 5000, `3 buts ou plus dans un créneau : ${troisOuPlus} chemins (impossible avec l’ancienne boucle à 2 buts)`);
  // L'inversion elle-même : P(X ≤ k) exacte.
  for (const x of [0.03, 0.36, 0.64, 2]) {
    let p = Math.exp(-x);
    let cum = p;
    for (let k = 0; k < 4; k++) {
      assert.equal(SM.poissonInverse(cum - 1e-12, x), k, `x ${x} : juste sous P(X ≤ ${k})`);
      assert.equal(SM.poissonInverse(Math.min(cum + 1e-12, 1 - 1e-15), x), k + 1, `x ${x} : juste au-dessus`);
      p = (p * x) / (k + 1);
      cum += p;
    }
  }
});

// ------------------------------------------------------------ pureté et frontière (part de T12)

const SRC = path.join(SERVEUR, 'src');
const MODULES_28 = ['reglages.js', 'simulationMatch.js', 'entreesSimulation.js', 'jambes.js', 'saisons.js', 'simulationBanc.js'].map((f) => path.join(SRC, 'data', 'simulation', f));
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
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

test('pureté et frontière (part de T12) : les modules de l’étape 28 n’ont ni horloge, ni hasard non amorcé, ni base, ni fichier, ni réseau ; aucun n’est dans l’empreinte du moteur ni atteint depuis elle ; aucun fichier de l’étape 28 sous core/ ni sports/', () => {
  for (const f of MODULES_28) {
    if (!fs.existsSync(f)) continue;
    const code = sansCommentaires(f);
    for (const interdit of [/Date\.now/, /new Date\s*\(/, /Math\.random/, /openDb/, /DatabaseSync/, /node:fs/, /from 'fs'/, /readFileSync|writeFileSync/, /\bfetch\s*\(/, /node:child_process/, /process\.env/]) assert.ok(!interdit.test(code), `${path.basename(f)} : ${interdit}`);
  }
  const duMoteur = fichiersDuMoteur();
  assert.ok(!duMoteur.some((r) => r.startsWith('data/simulation/')), 'data/simulation hors de l’empreinte');
  const graphe = [...atteints(duMoteur.map((r) => path.join(SRC, r)))].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  assert.ok(!graphe.some((r) => r.startsWith('data/simulation/')), 'aucun fichier de l’empreinte n’atteint data/simulation');
  const sous = (d) => (fs.existsSync(path.join(SRC, d)) ? fs.readdirSync(path.join(SRC, d), { recursive: true }).map(String) : []);
  for (const d of ['core', 'sports']) assert.ok(!sous(d).some((f) => /simulation|saisons?\.|jambes\.|enjeux?\./i.test(path.basename(f))), `aucun fichier de l’étape 28 sous ${d}/`);
});

// ------------------------------------------------------------ copie isolée : réseau coupé, heure figée

test('copie isolée (réseau coupé, heure figée à deux instants différents) : mêmes octets que l’appel direct, aucun appel réseau', () => {
  const copie = preparerCopie({ base: false });
  try {
    const script = path.join(SERVEUR, 'test', 'aides', 'script-simulation-pure.mjs');
    const a = executer(copie, script, { maintenant: '2026-10-05T12:00:00.000Z' });
    const b = executer(copie, script, { maintenant: '2031-03-17T04:00:00.000Z' });
    for (const r of [a, b]) {
      assert.equal(r.code, 0, r.erreurs.slice(-2000));
      assert.equal(r.reseau, false, 'aucun appel réseau');
      assert.ok(r.json?.ok, r.sortie.slice(-1000));
    }
    assert.deepEqual(a.json.empreintes, b.json.empreintes, 'mêmes octets à deux heures différentes');
    // L'appel direct, dans ce processus : les mêmes octets.
    const g = grilleDesButs(1.37, 1.21, RHO);
    const ch = SM.simulerMatch({ lambda: 1.37, mu: 1.21, grille: g, params: R.PARAMS, n: 3000, seed: SM.graineDuMatch({ cle: 'isole', role: 'candidate', lambda: 1.37, mu: 1.21, rho: RHO }) });
    const sha1 = (x) => crypto.createHash('sha1').update(x).digest('hex');
    assert.equal(a.json.empreintes.table, sha1(SM.tableJointe(ch)));
    assert.equal(a.json.empreintes.marches, sha1(JSON.stringify(SM.marchesDesChemins(ch))));
  } finally {
    copie.nettoyer();
  }
});
