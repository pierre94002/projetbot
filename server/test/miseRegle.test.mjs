/**
 * LA RÈGLE DE MISE (étape 39 « La mise juste », lot 1a, 04/11/2026) — la règle pure, sans fichier, sans base, sans horloge.
 *   node --test test/miseRegle.test.mjs        (depuis server/)
 *
 * T-M1 sans contexte, la part × la base redonne la mise du moteur À L'OCTET : Number((partDeMise × base).toFixed(2)) =
 *      findValueBet(…).stake sur 10 000 conseils (bases 1 000, 10 000 et tirées) ; la copie de compactContext.js
 *      (partDuCapitalPourIA, copie temporaire du lot 1a) et celle de l'écran (ui/src/utils/miseAffichee.js) aussi ;
 * T-M2 jamais la formule de core/risk/staking.js:21 (k × avantage, sans diviser par cote − 1) ;
 * T-M3 « le plus petit gagne » : la raison nommée est celle du plafond qui mord, quel que soit le plafond tiré ;
 * T-M4 les paris liés (E7, « la place qui reste ») : Σ conseils ≤ place, un pari placé jamais réduit, placé ≥ cap → 0,
 *      sans capital l'attente est ignorée ET dite ; la formule proportionnelle sur le pari placé est refusée ;
 * T-M5 200 grilles exactes (Poisson) à corrélation positive : la règle prudente ne met jamais plus que le Kelly joint ;
 * T-M6 combiné, cote saisie, marché sans value → 0 ; « sûr » n'augmente jamais f ; un livre français selon la règle ;
 * T-M7 capital absent → euros = null ;  T-M8 coupe-circuit → 0 ;  T-M9 jamais un centime au-dessus d'un plafond ;
 * T-Z1 12 paris liés sur un match : la zone normale des séries tirée par match dépasse celle tirée pari par pari (l'alerte
 *      de l'étape 11 sonne trop souvent chez Pierre : le texte de l'écran le dit) ;
 * T-M10 (lot 2) une classe non mesurée ne mise jamais plus qu'une classe mesurée — « à faire ».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVEUR } from './aides/isolement.mjs';
import * as R from '../src/data/mise/regleDeMise.js';
import { findValueBet } from '../src/core/engine/valueFinder.js';
import { partDuCapitalPourIA } from '../src/core/ai/compactContext.js';
import { zoneNormaleDesSeries } from '../src/core/risk/seriesDePertes.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const U = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'miseAffichee.js')).href);
const REGLAGE = Object.freeze({ kellyFraction: 0.125, maxStakePercent: 0.02 });
const CONFIG = Object.freeze({ ...REGLAGE, edgeThresholdMin: 0.02, edgeThresholdMax: 0.25, maxValueOdds: 5, valueBookmakers: [] });

/** Un générateur semé (mulberry32) : les tests tirent, jamais la règle. */
export function semer(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Des conseils RECOMMENDED du vrai findValueBet (gelé), sur des marchés tirés : n conseils, chacun avec sa base. */
function conseilsDuMoteur(n, graine = 39) {
  const tirer = semer(graine);
  const sortie = [];
  for (let essai = 0; sortie.length < n && essai < n * 40; essai++) {
    const base = essai % 3 === 0 ? 1000 : essai % 3 === 1 ? 10000 : Math.round((10 + tirer() * 250000) * 100) / 100;
    const p1 = 0.15 + tirer() * 0.7;
    const p2 = (1 - p1) * (0.15 + tirer() * 0.7);
    const fair = [p1, p2, 1 - p1 - p2];
    // Une issue payée au-dessus (ou un peu au-dessous) de la cote juste, les deux autres raccourcies pour une marge
    // vraisemblable (somme des 1/cote entre 1,01 et 1,25 : une ligne saine, sinon findValueBet la dit incohérente).
    const i = Math.floor(tirer() * 3);
    const b = 0.97 + tirer() * 0.28;
    const marge = 1.01 + tirer() * 0.24;
    const resteImplicite = Math.max(0.02, marge - fair[i] / b);
    const offre = fair.map((p, j) => Number((j === i ? b / p : (1 - fair[i]) / (p * resteImplicite)).toFixed(2)));
    const byBookmaker = [{ key: 'williamhill', title: 'William Hill', odds1: offre[0], oddsDraw: offre[1], odds2: offre[2] }];
    const r = findValueBet({ byBookmaker, fair, referenceKeys: [], config: CONFIG, tiltState: {}, bankroll: base, labels: {} });
    if (r.action === 'RECOMMENDED') sortie.push({ base, r });
  }
  return sortie;
}
const CONSEILS = conseilsDuMoteur(10000);

test('T-M1 sans contexte, Number((partDeMise × base).toFixed(2)) = findValueBet(…).stake À L’OCTET sur 10 000 conseils (bases 1 000, 10 000 et tirées) ; la copie de compactContext.js et celle de l’écran aussi', () => {
  assert.equal(CONSEILS.length, 10000, 'dix mille conseils du moteur');
  const bases = new Set(CONSEILS.map((c) => c.base));
  assert.ok(bases.has(1000) && bases.has(10000) && bases.size > 1000, 'bases 1 000, 10 000 et tirées');
  let plafonnes = 0;
  for (const { base, r } of CONSEILS) {
    const f = R.partDeMise({ ev: r.ev, cote: r.odds, reglageMoteur: REGLAGE });
    assert.equal(Number((f * base).toFixed(2)), r.stake, `base ${base}, ev ${r.ev}, cote ${r.odds}`);
    if (f === REGLAGE.maxStakePercent) plafonnes++;
    // La copie temporaire de compactContext.js (décision 7 c) : identique à l'octet.
    assert.equal(partDuCapitalPourIA({ ev: r.ev, cote: r.odds, reglage: REGLAGE }), f, `copie de compactContext.js : ev ${r.ev}, cote ${r.odds}`);
    // La copie de l'écran (ui/src/utils/miseAffichee.js) : identique à l'octet.
    assert.equal(U.partDuCapital({ ev: r.ev, cote: r.odds, reglage: REGLAGE }), f, `copie de l’écran : ev ${r.ev}, cote ${r.odds}`);
    // fractionDeMise sans contexte : la même part, aucune raison.
    const x = R.fractionDeMise({ decision: 'RECOMMENDED', ev: r.ev, cote: r.odds, reglageMoteur: REGLAGE, capital: { indique: true, montant: base } });
    assert.equal(x.f, f);
    assert.equal(x.euros, r.stake);
  }
  assert.ok(plafonnes > 50, `le plafond de 2 % mord sur une partie des conseils (${plafonnes})`);
});

test('T-M2 jamais la formule de core/risk/staking.js:21 (k × avantage) : la part est k × avantage / (cote − 1)', () => {
  for (const [ev, cote] of [[0.05, 1.3], [0.0466, 2.5], [0.06, 3.5], [0.04, 5]]) {
    const f = R.partDeMise({ ev, cote, reglageMoteur: { ...REGLAGE, maxStakePercent: 1 } });
    assert.equal(f, (0.125 * ev) / (cote - 1));
    assert.notEqual(f, 0.125 * ev, `cote ${cote} : la formule fausse de staking.js donnerait ${0.125 * ev}`);
  }
  // L'exemple de la conception : 4,66 % à 2,5 → 0,39 % du capital.
  assert.equal(R.partDite(R.partDeMise({ ev: 0.0466, cote: 2.5, reglageMoteur: REGLAGE })).replace(/\s/g, ' '), '0,39 %');
  const texte = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'mise', 'regleDeMise.js'), 'utf8');
  assert.doesNotMatch(texte, /staking\.js'|evaluateStakingDecision/, 'la règle n’emploie jamais le code mort de staking.js');
});

test('T-M3 « le plus petit gagne », chaque plafond nommé : sur des plafonds tirés, la raison nommée est celle qui mord, au centime en dessous', () => {
  const tirer = semer(3);
  const codes = new Set();
  for (let i = 0; i < 2000; i++) {
    const C = 500 + Math.round(tirer() * 5000);
    const plafonds = {
      'mise-max': tirer() < 0.8 ? Math.round((1 + tirer() * 60) * 100) / 100 : null,
      'perte-semaine': tirer() < 0.8 ? Math.round((1 + tirer() * 60) * 100) / 100 : null,
      'mise-acceptee': tirer() < 0.8 ? Math.round((1 + tirer() * 60) * 100) / 100 : null,
      'solde-declare': tirer() < 0.8 ? Math.round((1 + tirer() * 60) * 100) / 100 : null
    };
    const r = R.fractionDeMise({
      decision: 'RECOMMENDED',
      ev: 0.15,
      cote: 1.6,
      reglageMoteur: REGLAGE,
      gardeFous: { miseMaxParPari: plafonds['mise-max'], resteSemaine: plafonds['perte-semaine'] },
      compte: { miseMaxAcceptee: plafonds['mise-acceptee'], soldeDeclare: plafonds['solde-declare'] },
      capital: { indique: true, montant: C }
    });
    const sansPlafond = Number((0.02 * C).toFixed(2));
    const donnes = Object.entries(plafonds).filter(([, v]) => v !== null);
    const plusPetit = donnes.reduce((m, x) => (!m || x[1] < m[1] ? x : m), null);
    if (!plusPetit || plusPetit[1] >= sansPlafond) {
      assert.equal(r.euros, sansPlafond);
      assert.ok(!r.raisons.some((x) => Object.keys(plafonds).includes(x.code)));
      continue;
    }
    codes.add(plusPetit[0]);
    assert.equal(r.euros, plusPetit[1], `le plus petit (${plusPetit[0]} ${plusPetit[1]}) gagne`);
    const nommee = r.raisons.filter((x) => Object.keys(plafonds).includes(x.code));
    assert.equal(nommee.length, 1, 'une seule raison en euros, celle qui mord');
    assert.equal(nommee[0].code, plusPetit[0], `la raison nommée est ${plusPetit[0]}`);
    assert.ok(Math.abs(nommee[0].apres * C - plusPetit[1]) < 1e-9);
  }
  assert.deepEqual([...codes].sort(), ['mise-acceptee', 'mise-max', 'perte-semaine', 'solde-declare'], 'chaque plafond a mordu au moins une fois');
  // L'ordre fixe : le plafond du moteur, puis le livre, puis les liés, puis les euros ; chaque raison dans l'ordre où elle a mordu.
  const r = R.fractionDeMise({
    decision: 'RECOMMENDED',
    ev: 0.3,
    cote: 1.5,
    livre: { cle: 'winamax_fr', titre: 'Winamax', francais: true },
    enAttenteDuMatch: [4],
    reglageMoteur: REGLAGE,
    gardeFous: { miseMaxParPari: 10 },
    capital: { indique: true, montant: 1000 }
  });
  assert.deepEqual(r.raisons.map((x) => x.code), ['plafond-du-moteur', 'livre-francais', 'lie-au-match', 'mise-max']);
});

test('T-M4 les paris liés (E7, « la place qui reste ») : placé jamais réduit, Σ ≤ place, placé ≥ cap → 0 ; sans capital l’attente est ignorée ET dite', () => {
  const capital = { indique: true, montant: 1000 };
  const avis = (enAttenteDuMatch, ev = 0.0466, cote = 2.5) => R.fractionDeMise({ decision: 'RECOMMENDED', ev, cote, enAttenteDuMatch, reglageMoteur: REGLAGE, capital });
  const f0 = R.partDeMise({ ev: 0.0466, cote: 2.5, reglageMoteur: REGLAGE });
  // Sans pari placé : le conseil entier.
  assert.equal(avis([]).f, f0);
  // Placé 50 € (5 %) : cap = 2 %, place = 0 → 0 € « la place est prise ».
  const cinquante = avis([50]);
  assert.equal(cinquante.f, 0);
  assert.equal(cinquante.euros, 0);
  assert.match(cinquante.raisons.at(-1).texte, /la place est prise/);
  // Placé 10 € (1 %) : cap = min(2 %, max(0,39 %, 1 %)) = 1 %, place = 0 → 0 € (la formule E7 ; l'exemple « 3,90 € intact » du §1.5 est faux).
  assert.equal(avis([10]).f, 0);
  // Placé 2 € (0,2 %) : le conseil prend ce qui reste sous la mise du meilleur (0,39 % − 0,2 %).
  const deux = avis([2]);
  assert.ok(Math.abs(deux.f - (f0 - 0.002)) < 1e-15, `${deux.f}`);
  assert.equal(deux.raisons.at(-1).code, 'lie-au-match');
  // Propriétés sur des cas tirés : placé jamais réduit (il n'est pas une sortie), Σ (placés + conseil) ≤ max(meilleur, placés) et ≤ s_max quand le placé est sous s_max.
  const tirer = semer(32);
  for (let i = 0; i < 3000; i++) {
    const n = Math.floor(tirer() * 3);
    const places = Array.from({ length: n }, () => Math.round(tirer() * 30 * 100) / 100);
    const ev = 0.02 + tirer() * 0.2;
    const cote = 1.3 + tirer() * 3;
    const r = avis(places, ev, cote);
    const f = Math.min(R.partDeMise({ ev, cote, reglageMoteur: REGLAGE }), 0.02);
    const parts = places.filter((m) => m > 0).map((m) => m / 1000);
    const somme = parts.reduce((s, x) => s + x, 0);
    const cap = parts.length ? Math.min(0.02, Math.max(f, ...parts)) : f;
    const place = Math.max(0, cap - somme);
    assert.ok(r.f <= f + 1e-15, 'jamais plus que seul');
    assert.ok(r.f <= place + 1e-15, `Σ ≤ place (${r.f} ≤ ${place})`);
    if (parts.length && somme >= cap) assert.equal(r.f, 0, 'placé ≥ cap → 0');
    // La formule proportionnelle de « règle » §4.3 (f × min(1, meilleur / Σ)) appliquée au pari placé est REFUSÉE :
    if (parts.length && somme >= cap) {
      const proportionnelle = f * Math.min(1, Math.max(f, ...parts) / (somme + f));
      assert.ok(proportionnelle > 0 && r.f === 0, 'la proportionnelle laisserait une mise là où la place est prise');
    }
  }
  // Sans capital : l'attente n'est pas comptée, et c'est dit.
  const sans = R.fractionDeMise({ decision: 'RECOMMENDED', ev: 0.0466, cote: 2.5, enAttenteDuMatch: [50], reglageMoteur: REGLAGE, capital: { indique: false } });
  assert.equal(sans.f, f0);
  assert.equal(sans.euros, null);
  assert.deepEqual(sans.raisons.map((x) => x.code), ['attente-non-comptee']);
  assert.match(sans.raisons[0].texte, /ne sont pas comptés tant que votre capital n’est pas réglé/);
});

/** Une grille de Poisson indépendante (λ, μ), normalisée. */
function grilleDePoisson(l, m, T = 16) {
  const p = (x, k) => {
    let v = Math.exp(-x);
    for (let i = 1; i <= k; i++) v *= x / i;
    return v;
  };
  const g = [];
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) g.push({ i, j, w: p(l, i) * p(m, j) });
  const s = g.reduce((a, c) => a + c.w, 0);
  for (const c of g) c.w /= s;
  return g;
}
const MARCHES_DU_SCORE = [(c) => c.i > c.j, (c) => c.i + c.j > 2, (c) => c.i > 0 && c.j > 0, (c) => c.i > 1, (c) => c.i + c.j < 3, (c) => c.i === c.j, (c) => c.j > c.i, (c) => c.i + c.j > 1, (c) => c.j > 0];

test('T-M5 200 grilles exactes à corrélation positive (chaque paire φ > 0) : la règle prudente (E7) ne met jamais plus que le Kelly JOINT (E8, côté sûr)', () => {
  const tirer = semer(5);
  let grilles = 0;
  for (let essai = 0; grilles < 200 && essai < 5000; essai++) {
    const g = grilleDePoisson(0.6 + tirer() * 1.8, 0.5 + tirer() * 1.5);
    const n = 2 + Math.floor(tirer() * 2);
    const idx = [];
    while (idx.length < n) {
      const x = Math.floor(tirer() * MARCHES_DU_SCORE.length);
      if (!idx.includes(x)) idx.push(x);
    }
    const jambes = idx.map((x) => {
      const gagne = MARCHES_DU_SCORE[x];
      const p = g.reduce((a, c) => a + (gagne(c) ? c.w : 0), 0);
      return { gagne, p, cote: (1.02 + tirer() * 0.06) / p };
    });
    let positive = true;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const pab = g.reduce((s, c) => s + (jambes[a].gagne(c) && jambes[b].gagne(c) ? c.w : 0), 0);
        const phi = (pab - jambes[a].p * jambes[b].p) / Math.sqrt(jambes[a].p * (1 - jambes[a].p) * jambes[b].p * (1 - jambes[b].p));
        if (!(phi > 0)) positive = false;
      }
    }
    if (!positive) continue;
    grilles++;
    const k = 0.125;
    const joint = R.kellyJointSurGrille(g, jambes, k);
    // La règle prudente sans pari placé : Σ conseils = min(Σ f, cap) = la plus grande mise simple (s_max ôté ici : seul l'ordre compte).
    const simples = joint.simples.map((x) => k * x);
    const prudente = Math.min(simples.reduce((s, x) => s + x, 0), Math.max(...simples));
    const sommeJointe = joint.f.reduce((s, x) => s + x, 0);
    assert.ok(prudente <= sommeJointe * (1 + 1e-6) + 1e-12, `grille ${grilles} : prudente ${prudente} > joint ${sommeJointe}`);
    joint.f.forEach((x, i) => assert.ok(x <= simples[i] + 1e-15, 'jamais plus que seul'));
  }
  assert.equal(grilles, 200, '200 grilles à corrélation positive');
});

test('T-M6 combiné, cote saisie, marché sans value → 0 ; « sûr » n’augmente jamais f (ce n’est même pas une entrée) ; un livre français selon la règle', () => {
  const base = { decision: 'RECOMMENDED', ev: 0.06, cote: 2.1, reglageMoteur: REGLAGE, capital: { indique: true, montant: 2000 } };
  for (const [entree, code] of [
    [{ nature: 'combine' }, 'combine'],
    [{ nature: 'combine-meme-match' }, 'combine'],
    [{ nature: 'saisie' }, 'cote-saisie'],
    [{ marcheAvecValue: false }, 'sans-value'],
    [{ decision: 'PASS' }, 'pas-de-conseil']
  ]) {
    const r = R.fractionDeMise({ ...base, ...entree });
    assert.equal(r.f, 0, code);
    assert.equal(r.euros, 0, code);
    assert.equal(r.raisons[0].code, code);
  }
  const ref = R.fractionDeMise(base);
  assert.ok(ref.f > 0);
  for (const sur of [{ confiance: 'sur' }, { confiance: 'sûr' }, { etiquette: 'sûr' }, { sur: true }]) {
    const r = R.fractionDeMise({ ...base, ...sur });
    assert.equal(r.f, ref.f, `« sûr » (${JSON.stringify(sur)}) ne change rien`);
  }
  const livre = { cle: 'winamax_fr', titre: 'Winamax', francais: true };
  const mention = R.fractionDeMise({ ...base, livre });
  assert.equal(mention.f, ref.f, 'défaut (Q-H) : la mise reste, avec la mention');
  assert.equal(mention.raisons.at(-1).texte, `chez Winamax : ${R.MENTION_FRANCAIS}`);
  assert.equal(R.fractionDeMise({ ...base, livre, regle: { ...R.REGLE_DE_MISE_V1, francais: 'zero' } }).f, 0);
  assert.equal(R.fractionDeMise({ ...base, livre, regle: { ...R.REGLE_DE_MISE_V1, francais: 'demi' } }).f, ref.f / 2);
  assert.equal(R.fractionDeMise({ ...base, livre: { cle: 'williamhill', titre: 'William Hill', francais: false } }).raisons.length, 0);
});

test('T-M7 capital absent → euros = null partout (aucun euro sans capital) ; T-M8 coupe-circuit → 0', () => {
  for (const capital of [null, { indique: false }, { indique: false, montant: 2000 }, { indique: true, montant: null }]) {
    const r = R.fractionDeMise({ decision: 'RECOMMENDED', ev: 0.05, cote: 2, reglageMoteur: REGLAGE, capital, gardeFous: { miseMaxParPari: 5 } });
    assert.equal(r.euros, null, JSON.stringify(capital));
    assert.ok(r.f > 0);
    assert.ok(r.raisons.some((x) => x.code === 'plafonds-sans-capital'), 'les plafonds en euros sans capital : dits, jamais appliqués');
  }
  for (const decision of ['PASS', 'CIRCUIT_BREAKER_ACTIVE']) assert.equal(R.fractionDeMise({ decision, ev: 0.05, cote: 2, reglageMoteur: REGLAGE, capital: null }).euros, null);
  const cc = R.fractionDeMise({ decision: 'RECOMMENDED', ev: 0.05, cote: 2, reglageMoteur: REGLAGE, capital: { indique: true, montant: 1000 }, coupeCircuit: true });
  assert.equal(cc.f, 0);
  assert.equal(cc.euros, 0);
  assert.equal(cc.raisons.at(-1).code, 'coupe-circuit');
  assert.equal(R.fractionDeMise({ decision: 'CIRCUIT_BREAKER_ACTIVE', reglageMoteur: REGLAGE }).raisons[0].code, 'coupe-circuit');
});

test('T-M9 jamais un centime au-dessus d’un plafond (plafonds à décimales tirées, capitals tirés)', () => {
  const tirer = semer(9);
  for (let i = 0; i < 5000; i++) {
    const C = Math.round((100 + tirer() * 20000) * 100) / 100;
    const plafond = 0.01 + tirer() * 40 + tirer() * 0.009;
    const r = R.fractionDeMise({ decision: 'RECOMMENDED', ev: 0.1 + tirer() * 0.1, cote: 1.2 + tirer() * 2, reglageMoteur: REGLAGE, gardeFous: { miseMaxParPari: plafond }, capital: { indique: true, montant: C } });
    assert.ok(r.euros <= plafond + 1e-12, `${r.euros} > ${plafond}`);
    assert.equal(Math.round(r.euros * 100), Math.round(r.euros * 1e6) / 1e4, 'au centime');
  }
  assert.equal(R.centimesEnDessous(5.1), 5.1);
  assert.equal(R.centimesEnDessous(3.339), 3.33);
});

test('T-Z1 12 paris liés sur un match : la zone normale des séries tirée PAR MATCH dépasse celle tirée pari par pari ; l’alerte des séries le dit à l’écran', () => {
  // Le carnet : 12 sélections sur un même match, puis 30 paris simples sur d'autres matchs (cotes 1,8 à 2,2).
  const lie = Array.from({ length: 12 }, (_, i) => 0.45 + (i % 4) * 0.03);
  const seuls = Array.from({ length: 30 }, (_, i) => [0.48 + (i % 5) * 0.02]);
  const matchs = [lie, ...seuls];
  const jointe = R.zoneDesSeriesParMatch({ matchs, tirages: 2000, tirer: semer(31), joint: true });
  const independante = R.zoneDesSeriesParMatch({ matchs, tirages: 2000, tirer: semer(31), joint: false });
  assert.ok(jointe.jusqua > independante.jusqua, `zone jointe ${jointe.jusqua} > zone pari par pari ${independante.jusqua}`);
  assert.ok(jointe.jusqua >= 12, 'les 12 perdent ensemble : une série de 12 est « normale »');
  // Pari par pari, la règle retrouve la zone de seriesDePertes.js (étape 11) à un pari près.
  const etape11 = zoneNormaleDesSeries(matchs.flat(), { seuil: 0.95 });
  assert.ok(Math.abs(etape11.jusqua - independante.jusqua) <= 1, `zone de l'étape 11 ${etape11.jusqua}, tirée ici ${independante.jusqua}`);
  assert.throws(() => R.zoneDesSeriesParMatch({ matchs }), /générateur semé/);
  // Le texte de l'alerte : à l'écran, sous l'alerte des séries (GardeFousPanel.vue), le même mot pour mot.
  assert.match(R.MOTS_DE_LA_MISE.seriesLiees, /paris d’un même match comme indépendants/);
  assert.equal(U.MOTS_DE_LA_MISE.seriesLiees, R.MOTS_DE_LA_MISE.seriesLiees);
  const panneau = fs.readFileSync(path.join(UI, 'src', 'components', 'settings', 'GardeFousPanel.vue'), 'utf8');
  assert.match(panneau, /MOTS_DE_LA_MISE\.seriesLiees/, 'la phrase est sous l’alerte des séries');
});

test('T-M10 (lot 2) une classe d’ancre non mesurée ne mise jamais plus qu’une classe mesurée', { todo: 'lot 2 de l’étape 39 (après le verdict de la 27) : la règle ne lit encore aucune classe' }, () => {});
