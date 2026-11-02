/**
 * LES CARTONS (étape 33, lot 1a, 02/11/2026) — la loi des comptes.
 *   node --test test/cartonsLoi.test.mjs        (depuis server/)
 *
 * T-L1 loiDesComptes (importée de statMarkets.js, jamais recopiée) : Σ pmf + queue = 1 ; moyenne μ et variance
 *      μ + μ²/k (à 1e-9, N grand) ;
 * T-L2 1/k → 0 donne Poisson ; un 1/k NÉGATIF donne la BINOMIALE (décision 2 de l'orchestrateur ; critique, constat 7) de
 *      n = max(15, arrondi(−1/(1/k))) essais : variance μ + μ²·(−1/n), jamais Poisson ; la règle du moteur (corners,
 *      tirs) garde Poisson pour un 1/k négatif ;
 * T-L3 le total suit SA dispersion : sa loi n'est pas la convolution des deux lois d'équipe (écart mesurable) ;
 * T-L4 P(plus de ℓ) décroît avec ℓ et croît avec μ ; les lignes du total sont celles de lineCandidates ;
 * T-L5 perteDesComptes = perteLogDesComptes(loiDuCompte(μ, 1/k), x) de runner.js à l'octet sur 500 cas, queue et
 *      plancher compris ; le plancher = PROBA_MIN de bench/metrics.js.
 * (T-L6, les dispersions par les moments du banc, est dans cartonsBanc.test.mjs : partie B.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loiDesComptes, lineCandidates } from '../src/sports/football/statMarkets.js';
import { loiDuCompte } from '../src/bench/entrees.js';
import { perteLogDesComptes } from '../src/bench/runner.js';
import { PROBA_MIN } from '../src/bench/metrics.js';
import { loiDesCartons, loiDUnCompte, perteDesComptes, probabilitePlusDe, lignesDuTotal, CONSTANTES_DES_CARTONS } from '../src/data/cartons/formulesDesCartons.js';

const moments = ({ pmf }) => {
  let m = 0;
  let m2 = 0;
  pmf.forEach((p, i) => {
    m += p * i;
    m2 += p * i * i;
  });
  return { moyenne: m, variance: m2 - m * m };
};

test('T-L1 loiDesComptes (importée) : Σ pmf + queue = 1 ; moyenne μ et variance μ + μ²/k', () => {
  for (const [mu, invK] of [[2.1, 0.05], [4.3, 0.02], [0.8, 0.3], [10, 0.1]]) {
    const loi = loiDesComptes(mu, invK, 400);
    const s = loi.pmf.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s + loi.queue - 1) < 1e-9, `Σ = ${s}`);
    const { moyenne, variance } = moments(loi);
    assert.ok(Math.abs(moyenne - mu) < 1e-9, `${mu} : ${moyenne}`);
    assert.ok(Math.abs(variance - (mu + mu * mu * invK)) < 1e-8, `${mu}, ${invK} : ${variance}`);
  }
  // loiDesCartons est loiDesComptes pour un 1/k positif : les mêmes termes.
  assert.deepEqual(loiDesCartons(3.2, 0.04, 60), loiDesComptes(3.2, 0.04, 60));
});

test('T-L2 1/k → 0 donne Poisson ; un 1/k négatif donne la binomiale (jamais Poisson) ; la règle du moteur garde Poisson', () => {
  const p = loiDesCartons(2.3, 0, 80);
  const pz = loiDesComptes(2.3, 0, 80);
  assert.deepEqual(p, pz, 'Poisson');
  assert.ok(Math.abs(moments(p).variance - 2.3) < 1e-9);
  for (const [mu, invK, n] of [[2.3, -0.05, 20], [1.8, -0.05, 20], [2.0, -0.02, 50], [2.2, -0.2, 15], [2.2, -0.04, 25]]) {
    const b = loiDesCartons(mu, invK, 80);
    assert.equal(b.binomiale, n, `n = max(15, arrondi(−1/(1/k))) pour 1/k = ${invK}`);
    assert.ok(Math.abs(b.pmf.reduce((a, x) => a + x, 0) + b.queue - 1) < 1e-12);
    const { moyenne, variance } = moments(b);
    assert.ok(Math.abs(moyenne - mu) < 1e-9, `moyenne ${moyenne}`);
    assert.ok(Math.abs(variance - (mu + (mu * mu * -1) / n)) < 1e-9, `variance ${variance}`);
    assert.ok(variance < mu, 'moins dispersée que Poisson');
  }
  assert.equal(CONSTANTES_DES_CARTONS.minBinomiale, 15);
  // La critique (constat 7) : μ = 2,3, 1/k = −0,05 → P(plus de 4,5) 7,14 % (binomiale) et non 8,38 % (Poisson).
  assert.equal(Math.round(probabilitePlusDe(2.3, -0.05, 4.5) * 10000) / 100, 7.14);
  assert.equal(Math.round(probabilitePlusDe(2.3, 0, 4.5) * 10000) / 100, 8.38);
  // La règle du moteur (corners, tirs : statMarkets.js) : un 1/k négatif y est Poisson.
  assert.deepEqual(loiDesCartons(2.3, -0.05, 80, { loi: 'moteur' }), pz);
});

test('T-L3 le total suit sa propre dispersion : sa loi n’est pas la convolution des deux lois d’équipe', () => {
  const [mh, ma, kEq, kTot] = [2.2, 2.5, -0.05, 0.016];
  const h = loiDesCartons(mh, kEq, 60).pmf;
  const a = loiDesCartons(ma, kEq, 60).pmf;
  const conv = new Array(60).fill(0);
  for (let i = 0; i < 60; i++) for (let j = 0; i + j < 60; j++) conv[i + j] += h[i] * a[j];
  const tot = loiDesCartons(mh + ma, kTot, 60).pmf;
  const ecart = tot.reduce((s, p, k) => s + Math.abs(p - conv[k]), 0);
  assert.ok(ecart > 0.02, `écart mesurable entre la loi du total et la convolution (${ecart})`);
  assert.ok(moments({ pmf: tot }).variance > moments({ pmf: conv }).variance, 'le total, sur-dispersé, est plus large que la somme de deux équipes sous-dispersées');
  // La perte du total se calcule avec la loi du total : un compte de 9 n'a pas la même perte.
  assert.notEqual(perteDesComptes(9, mh + ma, kTot), -Math.log(conv[9]));
});

test('T-L4 P(plus de ℓ) décroît avec ℓ et croît avec μ ; les lignes du total sont celles de lineCandidates', () => {
  for (const invK of [-0.05, 0, 0.016, 0.1]) {
    let avant = 1;
    for (let l = 0.5; l < 12; l += 1) {
      const p = probabilitePlusDe(4.2, invK, l);
      assert.ok(p <= avant, `${invK} : ${l}`);
      avant = p;
      assert.ok(probabilitePlusDe(4.6, invK, l) >= p, `croît avec μ (${invK}, ${l})`);
    }
  }
  for (const [mu, invK] of [[4.2, 0.016], [3.1, 0], [5.6, 0.05], [1.2, 0.02]]) {
    const nos = lignesDuTotal(mu, invK).map((x) => x.ligne);
    const moteur = [...new Set(lineCandidates(mu, invK).map((c) => c.line))];
    assert.deepEqual(nos, moteur, `${mu}`);
  }
});

/** Générateur à graine (mulberry32). */
function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('T-L5 perteDesComptes = perteLogDesComptes(loiDuCompte(μ, 1/k), x) de runner.js à l’octet sur 500 cas, queue et plancher compris', () => {
  assert.equal(CONSTANTES_DES_CARTONS.plancher, PROBA_MIN);
  const u = generateur(33);
  let queues = 0;
  let planchers = 0;
  for (let i = 0; i < 500; i++) {
    const mu = 0.2 + u() * 14;
    const invK = u() < 0.2 ? 0 : u() * 0.3;
    const x = u() < 0.08 ? 41 + Math.floor(u() * 80) : Math.floor(u() * 3 * mu);
    const attendu = perteLogDesComptes(loiDuCompte(mu, invK), x).valeur;
    assert.equal(perteDesComptes(x, mu, invK), attendu, `${mu}, ${invK}, ${x}`);
    assert.equal(perteDesComptes(x, mu, invK, { loi: 'moteur' }), attendu);
    const loi = loiDUnCompte(mu, invK);
    if (x >= loi.pmf.length) queues++;
    if (attendu === -Math.log(PROBA_MIN)) planchers++;
  }
  assert.ok(queues >= 5, `des comptes au-delà de la grille (${queues})`);
  assert.ok(planchers >= 3, `des probabilités planchées (${planchers})`);
});
