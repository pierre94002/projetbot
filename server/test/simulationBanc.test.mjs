/**
 * Étape 28 du plan — LE BANC DE LA SIMULATION (conception §3.3 et §6, test T13 ; décision du 27/10 sur la
 * reconstitution de λ, μ).
 *   node --test test/simulationBanc.test.mjs        (depuis server/)
 *
 * Module PUR (data/simulation/simulationBanc.js), sans base. Le banc complet (v1 et v2 rejoués sur les 17 818 et
 * 17 526 matchs de la moitié V) tourne dans les scripts du scratchpad de l'étape 28 (partieA/t13) : trop long pour la
 * suite. Ici :
 *   - λ, μ d'une grille connue, arrondie à 6 décimales, retrouvés à 1e-4 et la garde (2e-6 par case) passe — par les
 *     moindres carrés (défaut, décision du 27/10) ; le rapport de la conception §3.3 reste disponible ; une grille qui
 *     n'est pas celle du modèle de buts (ancienne grille, autre ρ) ne passe pas la garde ;
 *   - les lignes du juge (une par match × marché, bloc = le match, date du match) passent le contrôle du juge ;
 *   - jamais d'alignement sur le 1N2 au banc : grille brute, à l'octet ;
 *   - ce qui est arrivé : mi-temps, mi-temps/fin, premier but, « avant la 30e » (convention figée), rouges ; sans
 *     minutes (P2), premier but inconnu ;
 *   - les 14 combinés de v2 lus dans la grille par jambes.js, à l'octet des sommes de cases ;
 *   - simulationBanc.js n'est importé ni par la nuit ni par une route.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR } from './aides/isolement.mjs';
import * as B from '../src/data/simulation/simulationBanc.js';
import * as SM from '../src/data/simulation/simulationMatch.js';
import * as R from '../src/data/simulation/reglages.js';
import { alignerSurLe1N2 } from '../src/data/simulation/entreesSimulation.js';
import { grilleDesButs, casesRendues, marchesDeLaGrille } from '../src/core/engine/goalModel.js';
import { comparer } from '../src/bench/guard.js';
import { jourValide } from '../src/bench/lancements.js';

const T = 21;
const RHO = -0.05;
const rendues6 = (g) => casesRendues(g).cases.map((c) => Number(c.p.toFixed(6)));

// ------------------------------------------------------------ λ, μ depuis les 81 cases

test('T13 reconstitution (décision du 27/10) : une grille connue arrondie à 6 décimales → λ et μ retrouvés à 1e-4 et la garde passe (moindres carrés, la méthode par défaut) ; le rapport de la conception reste disponible', () => {
  for (const [l, m] of [[1.4371, 1.1213], [0.9123, 2.3456], [2.71, 0.43], [4.1, 0.9], [0.62, 0.55], [3.34, 2.54]]) {
    const cases = rendues6(grilleDesButs(l, m, RHO));
    const r = B.reconstituerLambdaMu(cases, RHO);
    assert.equal(r.methode, 'moindres-carres');
    assert.ok(Math.abs(r.lambda - l) < 1e-4 && Math.abs(r.mu - m) < 1e-4, `λ ${l} μ ${m} : retrouvés ${r.lambda}, ${r.mu}`);
    assert.equal(r.rejouable, true, `λ ${l} μ ${m} : garde (écart ${r.ecart})`);
    assert.ok(r.ecart <= B.GARDE_DES_CASES && r.ecart <= 1e-6, `écart ${r.ecart} : l’arrondi lui-même`);
    const p = B.reconstituerLambdaMu(cases, RHO, { methode: 'rapport' });
    assert.equal(p.methode, 'rapport');
    assert.ok(Math.abs(p.lambda - l) < 2e-3 && Math.abs(p.mu - m) < 2e-3, `rapport : ${p.lambda}, ${p.mu}`);
  }
  assert.equal(B.GARDE_DES_CASES, 2e-6, 'garde inchangée');
});

test('T13 reconstitution : une grille qui n’est pas celle du modèle de buts ne passe pas la garde (ancienne grille 81 renormalisée, autre ρ) ; entrées invalides refusées', () => {
  const ancienne = SM.grilleAncienne81(1.4, 1.1, -0.075);
  assert.equal(B.reconstituerLambdaMu(rendues6(ancienne), RHO).rejouable, false, 'ancienne grille : non rejouable');
  assert.equal(B.reconstituerLambdaMu(rendues6(grilleDesButs(1.4, 1.1, -0.2)), RHO).rejouable, false, 'ρ −0,2 lu avec ρ −0,05 : non rejouable');
  assert.equal(B.reconstituerLambdaMu(rendues6(grilleDesButs(1.4, 1.1, -0.2)), -0.2).rejouable, true, 'avec son ρ : rejouable');
  const vide = new Array(81).fill(0);
  vide[0] = 1;
  assert.equal(B.reconstituerLambdaMu(vide, RHO).rejouable, false);
  assert.throws(() => B.reconstituerLambdaMu(new Array(80).fill(0), RHO), /81 cases/);
  assert.throws(() => B.reconstituerLambdaMu(rendues6(ancienne), RHO, { methode: 'autre' }), /méthode inconnue/);
});

// ------------------------------------------------------------ ce qui est arrivé

test('T13 issues : mi-temps, mi-temps/fin, retournement, un but dans chaque mi-temps, premier but et « avant la 30e » (créneaux 0..29 ; 28 = la convention de v1), rouges ; sans minutes (P2), premier but et « avant la 30e » inconnus', () => {
  const y = B.issuesDuMatch({ hg: 2, ag: 1, hHt: 0, aHt: 1, buts: [[50, 0], [29, 1], [80, 0]], rouges: [[70, 1]] });
  assert.deepEqual([y.htA, y.htD, y.htH, y.htFt6, y.htFt0, y.retourDom, y.retourExt, y.deuxMiTemps05, y.h2plusQueH1, y.htO05, y.htO15], [1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0]);
  assert.deepEqual([y.premierDom, y.premierExt, y.premierAvant30, y.rougeAuMoinsUn], [0, 1, 1, 1], 'premier but : le plus tôt (créneau 29, l’extérieur) ; avant 30:00');
  assert.equal(B.issuesDuMatch({ hg: 2, ag: 1, hHt: 0, aHt: 1, buts: [[29, 1]], rouges: [] }, { dernierCreneauAvant30: 28 }).premierAvant30, 0, 'convention de v1');
  const p2 = B.issuesDuMatch({ hg: 0, ag: 0, hHt: 0, aHt: 0, buts: null, rouges: 0 });
  assert.deepEqual([p2.premierDom, p2.premierExt, p2.premierAvant30, p2.rougeAuMoinsUn, p2.htFt4, p2.htD], [null, null, null, 0, 1, 1]);
  assert.ok(Object.values(B.issuesDuMatch({ hg: null, ag: 1 })).every((v) => v === null), 'sans score : rien');
  assert.equal(B.issuesDuMatch({ hg: 1, ag: 0 }).htD, null, 'sans mi-temps : marchés de mi-temps inconnus');
  for (const k of B.BESOIN_DES_MINUTES) assert.ok(B.MARCHES_JUGES.includes(k));
  assert.equal(B.MARCHES_JUGES.length, 22);
  assert.equal(B.BLOC_DEROULE.length, 18);
});

// ------------------------------------------------------------ les lignes du juge

test('T13 lignes du juge : une par match × marché connu, bloc = le match, date du match ; le juge les accepte (controlerLigne) ; perte log bornée comme v1 (p à [1e-6, 1 − 1e-6]) et comme v2 (issue à [1e-9, 1 − 1e-9])', () => {
  const matchs = [
    { cle: 'm1', date: '2026-10-03', lambda: 1.45, mu: 1.15, issues: { hg: 2, ag: 1, hHt: 1, aHt: 1, buts: [[12, 0], [40, 1], [77, 0]], rouges: [] } },
    { cle: 'm2', date: '2026-10-04', lambda: 0.9, mu: 1.3, issues: { hg: 0, ag: 0, hHt: 0, aHt: 0, buts: [], rouges: [[88, 0]] } },
    { cle: 'm3', date: '2026-10-05', lambda: 2.2, mu: 0.8, issues: { hg: 3, ag: 0, hHt: 2, aHt: 0, buts: null, rouges: 1 } }
  ];
  const sansEffets = { ...R.PARAMS, MH: new Array(45).fill(1), MA: new Array(45).fill(1), rougeBande: new Array(8).fill(0) };
  const lignes = matchs.map((m) => {
    const seed = SM.graineDuMatch({ cle: m.cle, role: 'banc', lambda: m.lambda, mu: m.mu, rho: RHO });
    const annonces = {
      avec: B.annoncesDuMatch({ lambda: m.lambda, mu: m.mu, rho: RHO, params: R.PARAMS, n: 2000, seed }).p,
      sans: B.annoncesDuMatch({ lambda: m.lambda, mu: m.mu, rho: RHO, params: sansEffets, n: 2000, seed }).p
    };
    return B.ligneDuMatch({ cle: m.cle, date: m.date, annonces, issues: B.issuesDuMatch(m.issues) });
  });
  const juge = B.lignesDuJuge(lignes, { a: 'sans', b: 'avec', marches: B.MARCHES_JUGES });
  assert.equal(juge.length, 22 + 22 + 19, 'm3 sans minutes : 3 marchés de moins');
  for (const l of juge) {
    assert.ok(jourValide(l.date) && typeof l.bloc === 'string' && Number.isFinite(l.a) && Number.isFinite(l.b));
  }
  const r = comparer(juge, { mode: 'moyenne', sens: 'min', minBlocs: 2, tirages: 100 });
  assert.equal(r.n.matchs, 3);
  assert.equal(r.n.lignes, juge.length);
  const c = B.calibration(lignes, { variante: 'avec' });
  assert.equal(c.htD.n, 3);
  assert.equal(c.premierDom.n, 2);
  // Bornes de la perte.
  assert.ok(Math.abs(B.perteLog(1, 0) - -Math.log(1e-6)) < 1e-9, 'p bornée à 1 − 1e-6 (comme v1 : 1 − (1 − 1e-6), à l’arrondi près)');
  assert.equal(B.perteLog(0, 1, { plancher: 1e-9, sur: 'issue' }), -Math.log(1e-9));
  assert.ok(Math.abs(B.perteLog(0.3, 1) - B.perteLog(0.3, 1, { plancher: 1e-9, sur: 'issue' })) < 1e-15);
});

test('T13 jamais d’alignement sur le 1N2 au banc : les annonces et les combinés partent de la grille BRUTE (à l’octet), et le banc n’a pas de 1N2 affiché à lire', () => {
  const g = grilleDesButs(1.62, 1.04, RHO);
  const seed = 123;
  const direct = SM.marchesDesChemins(SM.simulerMatch({ lambda: 1.62, mu: 1.04, grille: g, params: R.PARAMS, n: 3000, seed }), { arrondi: null });
  const banc = B.annoncesDuMatch({ lambda: 1.62, mu: 1.04, rho: RHO, params: R.PARAMS, n: 3000, seed }).p;
  for (const k of B.MARCHES_JUGES) assert.equal(banc[k], k.startsWith('htFt') ? direct.htFt[Number(k.slice(4))] : direct[k], k);
  const lignes = B.lignesDesCombines({ lambda: 1.62, mu: 1.04, rho: RHO, hg: 2, ag: 0 });
  const brute = (f) => { let s = 0; for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (f(i, j)) s += g[i * T + j]; return s; };
  assert.equal(lignes[0].pG, brute((i, j) => i > j && i + j > 2.5), '« 1 & plus de 2,5 » : somme des cases brutes, à l’octet');
  const alignee = alignerSurLe1N2(g, { home: 0.6, draw: 0.22, away: 0.18 });
  let sAlignee = 0;
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (i > j && i + j > 2.5) sAlignee += alignee[i * T + j];
  assert.ok(Math.abs(lignes[0].pG - sAlignee) > 0.01, 'une grille alignée donnerait autre chose');
  const code = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'simulation', 'simulationBanc.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/alignerSurLe1N2|\bfair\b/.test(code), 'aucune lecture du 1N2 affiché dans le banc');
});

test('T13 les 14 combinés de v2 : pG = somme des cases de la grille brute (même ordre, à l’octet), pI = produit des simples, p0 = grille ρ = 0 ; issues au score de la 90e ; « 1 & dom. plus de 1,5 » = « 1 & plus de 1,5 » et « 1 & les deux marquent » = « 1 & plus de 2,5 & les deux marquent » (comme v2)', () => {
  assert.equal(B.COMBINES_DU_BANC.length, 14);
  const lam = 1.38;
  const mu = 1.21;
  const g = grilleDesButs(lam, mu, RHO);
  const g0 = grilleDesButs(lam, mu, 0);
  const somme = (gr, f) => { let s = 0; for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (f(i, j)) s += gr[i * T + j]; return s; };
  const f = [
    (i, j) => i > j && i + j > 2.5, (i, j) => i > j && i + j < 2.5, (i, j) => i === j && i + j < 2.5, (i, j) => i < j && i + j > 2.5, (i, j) => i > j && i > 0 && j > 0,
    (i, j) => i < j && i > 0 && j > 0, (i, j) => i === j && i > 0, (i, j) => i + j > 2.5 && i > 0 && j > 0, (i, j) => i > j && i > 1.5, (i, j) => i > j && j === 0,
    (i, j) => i > j && i + j > 1.5, (i, j) => i > j && i + j > 2.5 && i > 0 && j > 0, (i, j) => i + j < 3.5 && i > 0 && j > 0, (i, j) => i >= j && i + j < 3.5
  ];
  const simples = { 1: (i, j) => i > j, N: (i, j) => i === j, 2: (i, j) => i < j, '1N': (i, j) => i >= j, o25: (i, j) => i + j > 2.5, u25: (i, j) => i + j < 2.5, o15: (i, j) => i + j > 1.5, u35: (i, j) => i + j < 3.5, btts: (i, j) => i > 0 && j > 0, d15: (i, j) => i > 1.5, e05u: (i, j) => j === 0 };
  const legs = [['1', 'o25'], ['1', 'u25'], ['N', 'u25'], ['2', 'o25'], ['1', 'btts'], ['2', 'btts'], ['N', 'btts'], ['o25', 'btts'], ['1', 'd15'], ['1', 'e05u'], ['1', 'o15'], ['1', 'o25', 'btts'], ['u35', 'btts'], ['1N', 'u35']];
  for (const [hg, ag] of [[2, 1], [0, 0], [1, 3], [4, 0]]) {
    const l = B.lignesDesCombines({ lambda: lam, mu, rho: RHO, hg, ag });
    l.forEach((x, c) => {
      assert.equal(x.pG, somme(g, f[c]), `${x.nom} : pG`);
      assert.equal(x.p0, somme(g0, f[c]), `${x.nom} : p0`);
      assert.equal(x.pI, legs[c].reduce((s, k) => s * somme(g, simples[k]), 1), `${x.nom} : pI`);
      assert.equal(x.r, f[c](hg, ag) ? 1 : 0, `${x.nom} : issue ${hg}-${ag}`);
      assert.equal(x.lG, -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, x.r ? x.pG : 1 - x.pG))));
    });
    assert.equal(l[8].pG, l[10].pG);
    assert.equal(l[4].pG, l[11].pG);
  }
  assert.ok(Math.abs(marchesDeLaGrille(g).home - somme(g, simples[1])) < 1e-15);
});

test('T13 simulationBanc.js n’est importé ni par la nuit ni par une route (aucun fichier de src/ ne l’importe)', () => {
  const src = path.join(SERVEUR, 'src');
  const fautifs = fs
    .readdirSync(src, { recursive: true })
    .map(String)
    .filter((f) => /\.m?js$/.test(f) && !f.endsWith('simulationBanc.js'))
    .filter((f) => /simulationBanc/.test(fs.readFileSync(path.join(src, f), 'utf8')));
  assert.deepEqual(fautifs, []);
});
