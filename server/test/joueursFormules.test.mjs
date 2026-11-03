/**
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1a, 03/11/2026) — les formules et les lois (pures).
 *   node --test test/joueursFormules.test.mjs        (depuis server/)
 *
 * T-L1 la règle P, ses cinq cas (0 sans xG, 1 écart penalty, 1 écart 0, 2 absent multiple de 0,785, 3 absent sous 0,70,
 *      4 inconnu) ; un « inconnu » retire au camp ses signaux np, pen et xa (jamais un 0 fabriqué) ; le repli (année cassée) ;
 * T-L2 les parts se rajoutent : Σ p (titulaires + bloc) = 1 ; Σ g = 1 − q_csc ; un joueur sans identifiant garde sa part ;
 *      un titulaire de plus fait baisser les autres ; le bloc des remplaçants est compté (critique, constat 2) ;
 * T-L3 marque et passeur en Poisson(λ·g) (critique, constat 9) : Σ_k P(K = k) = 1, P(marque) = 1 − e^(−λg) ; la marge de
 *      grilleDesButs (goalModel.js) = Poisson(λ) à 1e-6 (la garde qui justifie la simplification) ;
 * T-L4 tirs cadrés : binomiale négative (1/k > 0), binomiale (1/k < 0, n ≥ 15), Poisson à 0 ; moyenne et variance
 *      μ + μ²/k à 1e-9 ; égalité avec la loi de la 33 (loiDesCartons) à 1e-12 ; la perte = perteDesComptes de la 33 ;
 * T-L5 averti : Bernoulli plafonnée à 0,95 ; la perte = perteLogBinaire du banc ; plancher 1e-6 = PROBA_MIN ;
 * T-L6 minutes attendues et chance d'entrer : rappel (3), plafond 90, R_T ≥ 0 ;
 * T-L7 cote juste = 1/P, deux décimales ; « — » sous 0,005 et au-dessus de 0,995 ;
 * T-L8 la grille des κ est finie (aucun infini), triée ; κ = κm × T̄ ; le rappel tend vers le repère quand κ grandit ;
 * T-L9 le recalage par dixièmes (critique, constat 5) : appris sur des points, monotone, dans [0, 1], la table d'une
 *      calibration parfaite rend P presque inchangé ; le critère « calibré » (écart moyen, pire décile, erreurs types).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/data/joueurs/formulesDesJoueurs.js';
import * as R from '../src/data/joueurs/reglagesJoueurs.js';
import { loiDesCartons, perteDesComptes, CONSTANTES_DES_CARTONS } from '../src/data/cartons/formulesDesCartons.js';
import { perteLogBinaire, PROBA_MIN } from '../src/bench/metrics.js';
import { grilleDesButs } from '../src/core/engine/goalModel.js';
import { BASE_STATISTIQUE } from '../src/data/contexte/bancDuContexte.js';

const proche = (a, b, eps, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} ≠ ${b} (±${eps})`);
const ligne = (o) => ({ id: 1, titulaire: true, poste: 4, minutes: 90, xg: null, xgnp: null, shotsOnTarget: null, assists: null, xa: null, rating: 7, touches: 30, passes: 20, ...o });

test('T-L1 la règle P : ses cinq cas, l’inconnu qui retire le camp de np, pen et xa (jamais un 0), le repli d’une année cassée', () => {
  assert.deepEqual(F.regleP({ xg: null, xgnp: null }), { cas: '0-sans-xg', k: 0, np: 0 });
  assert.deepEqual(F.regleP({ xg: 1.12, xgnp: 0.33 }), { cas: '1-ecart-penalty', k: 1, np: 0.33 });
  assert.deepEqual(F.regleP({ xg: 1.9, xgnp: 0.33 }), { cas: '1-ecart-penalty', k: 2, np: 0.33 });
  assert.deepEqual(F.regleP({ xg: 0.45, xgnp: 0.4 }), { cas: '1-ecart-0', k: 0, np: 0.4 });
  assert.deepEqual(F.regleP({ xg: 0.79, xgnp: null }), { cas: '2-absent-multiple', k: 1, np: 0 });
  assert.deepEqual(F.regleP({ xg: 1.57, xgnp: null }), { cas: '2-absent-multiple', k: 2, np: 0 });
  assert.deepEqual(F.regleP({ xg: 0.12, xgnp: null }), { cas: '3-absent-petit', k: 0, np: 0.12 });
  assert.deepEqual(F.regleP({ xg: 0.95, xgnp: null }), { cas: '4-inconnu', k: null, np: null });
  // Le repli écrit d'avance : tout « absent » devient inconnu.
  assert.equal(F.regleP({ xg: 0.79, xgnp: null }, { inconnuSiAbsent: true }).cas, '4-inconnu');
  assert.equal(F.regleP({ xg: 0.12, xgnp: null }, { inconnuSiAbsent: true }).cas, '4-inconnu');
  // Un camp avec une ligne inconnue perd np, pen et xa ; il garde les tirs cadrés et l'averti.
  const lignes = [ligne({ id: 1, xg: 0.95, shotsOnTarget: 2 }), ligne({ id: 2, xg: 0.3, xgnp: 0.3, shotsOnTarget: 1 })];
  const r = F.relevesDUnCamp({ lignes, evenements: [], camp: 'home', butsDuCamp: 0, cadresDEquipe: 3, cartonsReleves: true });
  assert.equal(r.releves.aXg, false);
  assert.equal(r.releves.inconnuP, true);
  assert.equal(r.totaux.np, 0, 'aucun but : « buteurs relevés » (0 = 0), lu au déroulé et non à l’xG');
  assert.equal(r.releves.np, 'buts');
  assert.equal(r.parJoueur.get(1).x.np, 0);
  assert.equal(r.releves.sot, true);
  assert.equal(r.totaux.sot, 3);
  // Sans buteurs relevés, rien n'est fabriqué : null partout.
  const r2 = F.relevesDUnCamp({ lignes, evenements: [], camp: 'home', butsDuCamp: 1, cadresDEquipe: 3, cartonsReleves: true });
  assert.equal(r2.releves.np, null);
  assert.equal(r2.parJoueur.get(1).x.np, null);
  assert.equal(r2.totaux.np, null);
  // Un camp à xG : les signaux par la règle P.
  const r3 = F.relevesDUnCamp({ lignes: [ligne({ id: 1, xg: 0.79 }), ligne({ id: 2, xg: 0.3, xgnp: 0.3 })], evenements: [], camp: 'home', butsDuCamp: 1, cadresDEquipe: 0, cartonsReleves: false });
  assert.equal(r3.releves.aXg, true);
  assert.equal(r3.parJoueur.get(1).x.np, 0);
  assert.equal(r3.parJoueur.get(1).x.pen, 1);
  proche(r3.totaux.np, 0.3, 1e-12);
  assert.equal(r3.totaux.pen, 1);
});

test('T-L2 les parts se rajoutent : Σ p (titulaires + bloc) = 1, Σ g = 1 − q_csc, le joueur sans identifiant garde sa part, un titulaire de plus fait baisser les autres', () => {
  const parts = [0.2, 0.1, 0.05, 0.3];
  const minutes = [90, 80, 90, 70];
  const RT = F.minutesDuBloc(minutes);
  assert.equal(RT, 990 - 330);
  const n = F.normaliser(parts, minutes, 0.08, RT);
  proche(n.p.reduce((s, x) => s + x, 0) + n.pBloc, 1, 1e-12, 'Σ p = 1');
  assert.ok(n.pBloc > 0, 'le bloc des remplaçants est compté');
  const qCsc = 0.03;
  const qPen = 0.09;
  const t = F.normaliser([0.01, 0.01, 0.4, 0.01], minutes, 0.01, RT);
  const g = n.p.map((p, i) => F.partDesButs(p, t.p[i], qCsc, qPen));
  const gBloc = F.partDesButs(n.pBloc, t.pBloc, qCsc, qPen);
  proche(g.reduce((s, x) => s + x, 0) + gBloc, 1 - qCsc, 1e-12, 'Σ g = 1 − q_csc');
  // Un titulaire de plus fait baisser les autres.
  const n2 = F.normaliser([...parts, 0.25], [...minutes, 90], 0.08, F.minutesDuBloc([...minutes, 90]));
  for (let i = 0; i < parts.length; i++) assert.ok(n2.p[i] < n.p[i], `titulaire ${i}`);
  // Les minutes du bloc ne sont jamais négatives.
  assert.equal(F.minutesDuBloc(new Array(12).fill(90)), 0);
});

test('T-L3 marque et passeur en Poisson(λ·g) : la loi se somme à 1 ; P(marque) = 1 − e^(−λg) ; la marge de grilleDesButs = Poisson(λ) à 1e-6', () => {
  for (const lg of [0.01, 0.2, 0.9, 2.5]) {
    let s = 0;
    for (let k = 0; k < 40; k++) s += F.poisson(k, lg);
    proche(s, 1, 1e-12, `Σ P(K = k), λg = ${lg}`);
    proche(F.probaMarque(lg, 1), 1 - Math.exp(-lg), 1e-15);
    proche(F.perteDUneLigne('marque', { lambdaG: lg, k: 1 }), -Math.log(lg * Math.exp(-lg)), 1e-12);
  }
  proche(F.probaPasseur(1.5, 0.6, 0.1), 1 - Math.exp(-0.09), 1e-15);
  // La marge de la grille de Dixon-Coles (ρ de la base) est exactement Poisson(λ) : l'amincissement EST Poisson(λ·g).
  for (const [l, m] of [[0.3, 1.2], [1.4, 1.1], [2.8, 0.6], [5.5, 0.4]]) {
    const g = grilleDesButs(l, m, BASE_STATISTIQUE.rho);
    const taille = Math.round(Math.sqrt(g.length));
    const marge = [];
    for (let i = 0; i < 8; i++) {
      let s = 0;
      for (let j = 0; j < taille; j++) s += g[i * taille + j];
      marge.push(s);
    }
    for (let i = 0; i < 8; i++) proche(marge[i], F.poisson(i, l), 1e-6, `marge P(X = ${i}), λ = ${l}`);
  }
});

test('T-L4 tirs cadrés : binomiale négative, binomiale sous une sous-dispersion (n ≥ 15), Poisson à 0 ; moments ; la loi et la perte de la 33', () => {
  const N = 60;
  for (const [mu, invK] of [[0.8, 0.3], [1.6, 0.05], [0.6, 0], [1.2, -0.03], [0.4, -0.2]]) {
    const { pmf } = F.loiDesTirsCadres(mu, invK, N);
    let s = 0;
    let m1 = 0;
    let m2 = 0;
    pmf.forEach((p, k) => {
      s += p;
      m1 += k * p;
      m2 += k * k * p;
    });
    proche(s, 1, 1e-9, `Σ, μ ${mu}, 1/k ${invK}`);
    proche(m1, mu, 1e-9, 'moyenne');
    const n = invK < -1e-6 ? Math.max(CONSTANTES_DES_CARTONS.minBinomiale, Math.round(-1 / invK)) : null;
    const variance = n ? mu * (1 - mu / n) : mu + mu * mu * invK;
    proche(m2 - m1 * m1, variance, 1e-9, 'variance');
    const c = loiDesCartons(mu, invK, N);
    pmf.forEach((p, k) => proche(p, c.pmf[k], 1e-12, 'loi de la 33'));
    for (const x of [0, 1, 3]) assert.equal(F.perteDUneLigne('cadres', { x, mu, invK }), perteDesComptes(x, mu, invK));
  }
  const p = F.probasCadres(1.2, 0.1);
  assert.ok(p.auMoinsUn > p.auMoinsDeux && p.auMoinsDeux > 0);
});

test('T-L5 averti : Bernoulli plafonnée à 0,95 ; la perte est perteLogBinaire du banc ; plancher 1e-6 = PROBA_MIN', () => {
  assert.equal(R.PLAFOND_AVERTI, 0.95);
  assert.equal(F.probaAverti(10, 1, 0.5), 0.95);
  proche(F.probaAverti(2.1, 0.9, 0.1), 0.189, 1e-12);
  assert.equal(F.perteDUneLigne('averti', { p: 0.2, averti: true }), perteLogBinaire(0.2, true).valeur);
  assert.equal(F.perteDUneLigne('averti', { p: 0.2, averti: false }), perteLogBinaire(0.2, false).valeur);
  assert.equal(R.PLANCHER, PROBA_MIN);
  assert.equal(R.PLANCHER, CONSTANTES_DES_CARTONS.plancher);
  assert.equal(R.JUGE.plancher, PROBA_MIN);
});

test('T-L6 minutes attendues (rappel de 3 titularisations, plafond 90) et chance d’entrer (rappel de 3 présences)', () => {
  assert.equal(F.minutesAttendues(0, 0, 80), 80, 'sans titularisation : le repère du poste');
  proche(F.minutesAttendues(2 * 60, 2, 84), (120 + 3 * 84) / 5, 1e-12);
  assert.equal(F.minutesAttendues(10 * 95, 10, 90), 90, 'jamais au-delà de 90');
  proche(F.chanceDEntrer(1, 4, 0.4), (1 + 1.2) / 7, 1e-12);
  assert.equal(R.RAPPELS.minutes, 3);
  assert.equal(R.RAPPELS.entree, 3);
});

test('T-L7 la cote juste : 1/P à deux décimales ; « — » (null) sous 0,005 et au-dessus de 0,995', () => {
  assert.equal(F.coteJuste(0.23), 4.35);
  assert.equal(F.coteJuste(0.5), 2);
  assert.equal(F.coteJuste(0.004), null);
  assert.equal(F.coteJuste(0.996), null);
  assert.equal(F.coteJuste(Number.NaN), null);
  assert.equal((4.35).toLocaleString('fr-FR'), '4,35');
});

test('T-L8 la grille des κ : finie, triée, sans infini ; le rappel tend vers le repère quand κ grandit, vers le joueur quand il diminue', () => {
  assert.deepEqual([...R.GRILLE_KAPPA], [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256]);
  assert.ok(R.GRILLE_KAPPA.every((k) => Number.isFinite(k) && k > 0));
  const X = 3;
  const E = 10;
  const rep = 0.1;
  assert.equal(F.partRappelee(X, E, rep, Infinity), rep);
  assert.ok(Math.abs(F.partRappelee(X, E, rep, 1e6) - rep) < 1e-5);
  assert.ok(Math.abs(F.partRappelee(X, E, rep, 1e-6) - X / E) < 1e-5);
  assert.equal(F.partRappelee(0, 0, rep, 4), rep, 'sans apparition : le repère');
});

test('T-L9 le recalage par dixièmes (critique, constat 5) : monotone, dans [0, 1], presque l’identité sur une calibration parfaite ; le critère « calibré »', () => {
  // Des points bien calibrés : y ~ Bernoulli(p) avec un générateur à graine.
  let a = 34 >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const pts = [];
  for (let i = 0; i < 20000; i++) {
    const p = 0.02 + 0.6 * u();
    pts.push([p, u() < p ? 1 : 0]);
  }
  const t = F.apprendreLesDixiemes(pts);
  assert.equal(t.centres.length, 10);
  for (let i = 1; i < 10; i++) assert.ok(t.frequences[i] >= t.frequences[i - 1], 'monotone');
  // Des fréquences brutes NON monotones (le 5e dixième réalise plus que le 6e) : la table les rend monotones (moyennes groupées).
  const bosse = [];
  for (let d = 0; d < 10; d++) for (let k = 0; k < 100; k++) bosse.push([0.05 + d * 0.05 + k * 1e-5, k < (d === 4 ? 60 : d === 5 ? 20 : 10 + 5 * d) ? 1 : 0]);
  const tb = F.apprendreLesDixiemes(bosse);
  for (let i = 1; i < tb.frequences.length; i++) assert.ok(tb.frequences[i] >= tb.frequences[i - 1] - 1e-15, `monotone malgré la bosse (${tb.frequences.join(', ')})`);
  assert.ok(Math.abs(tb.frequences[4] - tb.frequences[5]) < 1e-12, 'les deux dixièmes en désordre sont groupés');
  let prec = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const q = F.recaler(t, p);
    assert.ok(q >= prec - 1e-12 && q >= 0 && q <= 1, `monotone et dans [0, 1] (${p})`);
    prec = q;
  }
  for (const p of [0.1, 0.3, 0.5]) assert.ok(Math.abs(F.recaler(t, p) - p) < 0.03, `presque l’identité (${p} → ${F.recaler(t, p)})`);
  assert.equal(F.recaler(null, 0.37), 0.37);
  // Une déformation forte est corrigée : P annoncé = 2 × la vraie.
  const deforme = pts.map(([p, y]) => [Math.min(0.99, 2 * p), y]);
  const td = F.apprendreLesDixiemes(deforme);
  const avant = F.calibrationDe(deforme);
  const apres = F.calibrationDe(deforme.map(([p, y]) => [F.recaler(td, p), y]));
  assert.equal(avant.calibre, false);
  assert.ok(apres.ecartMoyen < avant.ecartMoyen / 5, `${apres.ecartMoyen} < ${avant.ecartMoyen} / 5`);
  // Le critère : écart moyen ≤ 1 point et chaque décile ≤ max(2,5 points ; 2,58 erreurs types).
  const c = F.calibrationDe(pts);
  assert.equal(c.calibre, true, JSON.stringify(c.deciles.map((d) => [d.annonce, d.realise])));
  assert.equal(R.CALIBRE.moyen, 0.01);
  assert.equal(R.CALIBRE.pire, 0.025);
  assert.equal(R.CALIBRE.z, 2.58);
  assert.deepEqual([...R.CALIBRE.exige], ['marque', 'cadres']);
});
