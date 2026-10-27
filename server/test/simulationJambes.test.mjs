/**
 * Étape 28 du plan — LES ENTRÉES DE LA SIMULATION ET LES COMBINÉS DU MÊME MATCH (conception §1.1, §1.5 et §6 : T1 pour
 * les entrées, T5).
 *   node --test test/simulationJambes.test.mjs        (depuis server/)
 *
 * Modules PURS (data/simulation/entreesSimulation.js, jambes.js), appelés directement, sans base.
 *   Entrées : avec la clé `modeleDeButs` → grille « modele-buts-441 » refaite depuis λ, μ, ρ à 3 décimales (les 81 cases
 *   refaites = distributions.scoreExact à 2e-3) ; sans la clé → grille « ancien-81 », ρ = defaultCorrelation ;
 *   l'alignement sur le 1N2 affiché (écran, combiné) rend exactement ce 1N2 sans toucher la grille reçue.
 *   T5 : P(1 & plus de 2,5) + P(1 & moins de 2,5) = P(1) ; contradictoires → 0, « impossible » ; redondantes → le prix
 *   de la plus forte, dit ; déroulé × score = Σ des poids des cases, jamais un produit ; corners → produit avec la
 *   mention ; prix juste sous 1,20 → « non conseillé » ; une jambe de déroulé ne se parie jamais (« J'ai parié »).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/data/simulation/entreesSimulation.js';
import * as J from '../src/data/simulation/jambes.js';
import * as SM from '../src/data/simulation/simulationMatch.js';
import * as R from '../src/data/simulation/reglages.js';
import { grilleDesButs, marchesDeLaGrille, casesRendues, modeleDeButs, reglagesDuModeleDeButs } from '../src/core/engine/goalModel.js';
import { REGLAGES_MODELE_DE_BUTS } from './aides/modeleDeButsCommun.mjs';

const T = 21;
const trois = (x) => Number(x.toFixed(3));
const six = (x) => Number(x.toFixed(6));
const somme = (g, f) => {
  let s = 0;
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (f(i, j)) s += g[i * T + j];
  return s;
};
const jambe = (marketId, params, pick) => ({ marketId, params, pick });
const UN = jambe('result', { outcome: 'home' }, 'Arsenal gagne');
const DEUX = jambe('result', { outcome: 'away' }, 'Burnley gagne');
const PLUS25 = jambe('totalGoals', { line: 2.5, side: 'over' }, 'Plus de 2.5 buts');
const MOINS25 = jambe('totalGoals', { line: 2.5, side: 'under' }, 'Moins de 2.5 buts');
const MOINS15 = jambe('totalGoals', { line: 1.5, side: 'under' }, 'Moins de 1.5 buts');
const PLUS05 = jambe('totalGoals', { line: 0.5, side: 'over' }, 'Plus de 0.5 buts');
const BTTS = jambe('bothTeamsScore', { outcome: 'yes' }, 'Oui');
const MT_NUL = jambe('halfTimeResult', { outcome: 'draw' }, 'Nul à la mi-temps');
const CORNERS = jambe('totalCorners', { line: 9.5, side: 'over' }, 'Plus de 9.5 corners');

// Une grille et sa table jointe (la nuit), pour les jambes de déroulé.
const G = grilleDesButs(1.62, 1.04, -0.05);
const FAIR = { home: 0.5, draw: 0.26, away: 0.24 };
const CH = SM.simulerMatch({ lambda: 1.62, mu: 1.04, grille: G, params: R.PARAMS, n: R.N, seed: SM.graineDuMatch({ cle: 'jambes', role: 'candidate', lambda: 1.62, mu: 1.04, rho: -0.05 }) });
const TABLE = SM.lireTableJointe(SM.tableJointe(CH), G);

// ------------------------------------------------------------ entrées

/** Un résultat d'analyse comme analyzeMatch le rend avec la clé : le vrai modèle de buts, résumé à 3 décimales, cases à 6. */
function resultatAvecLaCle({ fair, plusMoins }) {
  const reglages = reglagesDuModeleDeButs({ modeleDeButs: REGLAGES_MODELE_DE_BUTS });
  const etat = (sa, wa, sd, wd) => ({ sa, wa, sd, wd, sga: sa, wga: wa, sgd: sd, wgd: wd, n: 14, nx: 14, ligue: 'EPL' });
  const b = modeleDeButs({ fair, entrees: { forces: { home: etat(18.2, 14, 11.5, 14), away: etat(12.1, 14, 16.9, 14) }, ligue: { buts: { home: 1.52, away: 1.21 }, xg: { home: 1.48, away: 1.19 }, matchs: 120, matchsXg: 118, source: 'saison' }, plusMoins }, reglages });
  return {
    resultat: { engineVersion: 5, expectedGoals: { home: trois(b.lambda), away: trois(b.mu) }, modeleDeButs: { version: 1, expectedGoals: { home: trois(b.lambda), away: trois(b.mu) }, rho: b.rho }, distributions: { result: { home: six(fair[0]), draw: six(fair[1]), away: six(fair[2]) }, scoreExact: { cases: b.cases.map((c) => six(c.p)), horsGrille: six(b.horsGrille) } } },
    exact: b
  };
}

test('T1 entrées, avec la clé modeleDeButs : grille « modele-buts-441 » refaite depuis λ, μ, ρ (3 décimales) ; les 81 cases refaites = distributions.scoreExact à 2e-3 ; la même grille à l’octet que grilleDesButs', () => {
  for (const cas of [{ fair: [0.52, 0.25, 0.23], plusMoins: { ligne: 2.5, pOver: 0.56 } }, { fair: [0.2, 0.27, 0.53], plusMoins: null }, { fair: [0.78, 0.15, 0.07], plusMoins: { ligne: 2.5, pOver: 0.62 } }]) {
    const { resultat, exact } = resultatAvecLaCle(cas);
    const e = E.entreesDeLAnalyse(resultat, { defaultCorrelation: -0.075 });
    assert.equal(e.grille, 'modele-buts-441');
    assert.equal(e.lambda, trois(exact.lambda));
    assert.equal(e.mu, trois(exact.mu));
    assert.equal(e.rho, -0.05);
    assert.equal(e.engineVersion, 5);
    assert.deepEqual(e.fair, { home: six(cas.fair[0]), draw: six(cas.fair[1]), away: six(cas.fair[2]) });
    const g = E.grilleDesEntrees(e);
    assert.deepEqual(g, grilleDesButs(e.lambda, e.mu, e.rho), 'la grille des entrées rangées, à l’octet');
    const refaites = casesRendues(g).cases;
    let pire = 0;
    refaites.forEach((c, k) => (pire = Math.max(pire, Math.abs(c.p - resultat.distributions.scoreExact.cases[k]))));
    assert.ok(pire < 2e-3, `81 cases refaites contre scoreExact.cases : écart ${pire}`);
  }
});

test('T1 entrées, sans la clé : grille « ancien-81 » (λ, μ de l’analyse, ρ = defaultCorrelation) ; refus en mots quand les buts attendus manquent', () => {
  const resultat = { engineVersion: 5, expectedGoals: { home: 1.437, away: 1.102 }, distributions: { result: { home: 0.47, draw: 0.27, away: 0.26 } } };
  const e = E.entreesDeLAnalyse(resultat, { defaultCorrelation: -0.075 });
  assert.deepEqual(e, { grille: 'ancien-81', lambda: 1.437, mu: 1.102, rho: -0.075, fair: { home: 0.47, draw: 0.27, away: 0.26 }, engineVersion: 5 });
  assert.deepEqual(E.grilleDesEntrees(e), SM.grilleAncienne81(1.437, 1.102, -0.075));
  assert.throws(() => E.entreesDeLAnalyse({ distributions: {} }, { defaultCorrelation: -0.075 }), /buts attendus/);
  assert.throws(() => E.entreesDeLAnalyse(resultat, {}), /defaultCorrelation/);
  assert.throws(() => E.grilleDesEntrees({ ...e, grille: 'autre' }), /grille inconnue/);
});

test('alignement sur le 1N2 affiché (écran et combiné, jamais le banc) : le 1N2 de la grille alignée = fair à 1e-12, la répartition à résultat donné est gardée, la grille reçue n’est pas touchée', () => {
  const copie = Float64Array.from(G);
  const a = E.alignerSurLe1N2(G, FAIR);
  assert.deepEqual(G, copie, 'grille reçue intacte');
  const m = marchesDeLaGrille(a);
  assert.ok(Math.abs(m.home - FAIR.home) < 1e-12 && Math.abs(m.draw - FAIR.draw) < 1e-12 && Math.abs(m.away - FAIR.away) < 1e-12);
  assert.ok(Math.abs(a[2 * T + 1] / a[1 * T + 0] - G[2 * T + 1] / G[1 * T + 0]) < 1e-12, 'même camp : rapport des cases gardé');
  assert.ok(Math.abs(a.reduce((s, x) => s + x, 0) - 1) < 1e-12);
  // Si le 1N2 affiché vient de la grille, l'alignement est l'identité.
  const g = marchesDeLaGrille(G);
  const id = E.alignerSurLe1N2(G, [g.home, g.draw, g.away]);
  for (let c = 0; c < T * T; c++) assert.ok(Math.abs(id[c] - G[c]) < 1e-15);
});

// ------------------------------------------------------------ T5

test('T5 P(1 & plus de 2,5) + P(1 & moins de 2,5) = P(1), exactement (somme des cases, grille brute et grille alignée) ; « si indépendants » = produit des jambes', () => {
  for (const g of [G, E.alignerSurLe1N2(G, FAIR)]) {
    const a = J.probabiliteDuCombine({ jambes: [UN, PLUS25], grille: g });
    const b = J.probabiliteDuCombine({ jambes: [UN, MOINS25], grille: g });
    const p1 = somme(g, (i, j) => i > j);
    assert.ok(Math.abs(a.probabilite + b.probabilite - p1) < 1e-12);
    assert.ok(Math.abs(a.probabilite - somme(g, (i, j) => i > j && i + j > 2.5)) < 1e-15);
    assert.ok(Math.abs(a.siIndependants - p1 * somme(g, (i, j) => i + j > 2.5)) < 1e-15, 'si indépendants : P(1) × P(plus de 2,5)');
    assert.ok(Math.abs(a.prixJuste - 1 / a.probabilite) < 1e-12 && a.coteMinimale === a.prixJuste);
    assert.equal(a.impossible, false);
    assert.equal(a.pariable, true);
  }
});

test('T5 contradictoires → P = 0, « impossible », pas de prix (1 & 2 ; plus de 2,5 & moins de 1,5) ; un combiné possible mais jamais tiré → « trop rare », pas de prix, jamais « impossible »', () => {
  for (const jambes of [[UN, DEUX], [PLUS25, MOINS15], [jambe('scoreExact', { home: 2, away: 1 }, '2-1'), MOINS25]]) {
    const r = J.probabiliteDuCombine({ jambes, grille: G });
    assert.equal(r.probabilite, 0);
    assert.equal(r.impossible, true);
    assert.equal(r.prixJuste, null);
    assert.ok(r.mentions.some((m) => /impossible/.test(m)));
  }
  // Mi-temps 0-0 et premier but avant la 30e : contradictoires (un but avant la 30e est un but de 1re mi-temps).
  const c = J.probabiliteDuCombine({ jambes: [jambe('halfTimeGoals', { line: 0.5, side: 'under' }, 'Mi-temps 0-0'), jambe('firstGoalBefore30', { outcome: 'yes' }, 'But avant la 30e')], grille: G, table: TABLE });
  assert.equal(c.impossible, true);
  // Possible mais rare (score de 6-5 à la mi-temps … ici 2/1 avec 7 buts) : pas dans 10 000 chemins → pas de prix, pas « impossible ».
  const rare = J.probabiliteDuCombine({ jambes: [jambe('halfTimeFullTime', { ht: 'away', ft: 'home' }, '2/1'), jambe('scoreExact', { home: 9, away: 8 }, '9-8')], grille: G, table: TABLE });
  assert.equal(rare.impossible, false);
  assert.equal(rare.probabilite, 0);
  assert.equal(rare.prixJuste, null);
  assert.ok(rare.raisons.some((x) => /trop rare/.test(x)));
  // Au-delà de 10 buts d'une équipe (l'espace des déroulés s'arrête à 10 : vérification du 27/10, constat 4) : 11-0 et
  // « domicile mène à la mi-temps », « domicile plus de 10,5 » et la mi-temps nulle → possibles, « trop rare », jamais
  // « impossible » ; 11-0 et « l'extérieur mène à la mi-temps » reste impossible (l'extérieur n'a marqué aucun but).
  for (const jambes of [
    [jambe('scoreExact', { home: 11, away: 0 }, '11-0'), jambe('halfTimeResult', { outcome: 'home' }, 'Mi-temps : domicile')],
    [jambe('teamGoals', { team: 'home', line: 10.5, side: 'over' }, 'Domicile plus de 10,5'), MT_NUL]
  ]) {
    const r = J.probabiliteDuCombine({ jambes, grille: G, table: TABLE });
    assert.equal(r.impossible, false, jambes.map((x) => x.pick).join(' & '));
    assert.equal(r.probabilite, 0);
    assert.ok(r.raisons.some((x) => /trop rare/.test(x)));
    assert.ok(!r.mentions.some((m) => /impossible|déjà comprise/.test(m)), r.mentions.join(' | '));
  }
  const vraiment = J.probabiliteDuCombine({ jambes: [jambe('scoreExact', { home: 11, away: 0 }, '11-0'), jambe('halfTimeResult', { outcome: 'away' }, 'Mi-temps : extérieur')], grille: G, table: TABLE });
  assert.equal(vraiment.impossible, true);
  assert.ok(vraiment.mentions.some((m) => /impossible/.test(m)));
});

test('T5 redondantes → le prix de la plus forte, dit (1 & plus de 0,5 ; mi-temps 1 & plus de 0,5) ; deux fois la même jambe → une seule compte', () => {
  const r = J.probabiliteDuCombine({ jambes: [UN, PLUS05], grille: G });
  assert.ok(Math.abs(r.probabilite - somme(G, (i, j) => i > j)) < 1e-15, 'P = P(1)');
  assert.deepEqual(r.redondantes, [{ jambe: 1, compriseDans: 0 }]);
  assert.ok(r.mentions.some((m) => m.includes('« Plus de 0.5 buts » est déjà comprise dans « Arsenal gagne »')));
  const d = J.probabiliteDuCombine({ jambes: [PLUS05, jambe('halfTimeResult', { outcome: 'home' }, 'Arsenal mène à la mi-temps')], grille: G, table: TABLE });
  assert.deepEqual(d.redondantes, [{ jambe: 0, compriseDans: 1 }]);
  let attendu = 0;
  for (const c of TABLE.cases) if (c.hh > c.ha) attendu += c.w;
  assert.ok(Math.abs(d.probabilite - attendu) < 1e-12);
  const deuxFois = J.probabiliteDuCombine({ jambes: [UN, UN], grille: G });
  assert.equal(deuxFois.redondantes.length, 1);
  assert.ok(Math.abs(deuxFois.probabilite - somme(G, (i, j) => i > j)) < 1e-15);
});

test('T5 déroulé × score = Σ des poids des cases de la table jointe, jamais le produit ; une jambe de déroulé se lit et se chiffre mais ne se parie jamais', () => {
  const r = J.probabiliteDuCombine({ jambes: [MT_NUL, PLUS25], grille: G, table: TABLE });
  let attendu = 0;
  let pMt = 0;
  for (const c of TABLE.cases) {
    if (c.hh === c.ha && c.fh + c.fa > 2.5) attendu += c.w;
    if (c.hh === c.ha) pMt += c.w;
  }
  assert.ok(Math.abs(r.probabilite - attendu) < 1e-12, 'Σ des poids des cases');
  const produit = pMt * somme(G, (i, j) => i + j > 2.5);
  assert.ok(Math.abs(r.probabilite - produit) > 0.01, `jamais le produit (${r.probabilite} contre ${produit})`);
  assert.ok(Math.abs(r.siIndependants - produit) < 1e-12, 'si indépendants : P(mi-temps nul) de la table × P(plus de 2,5) de la grille');
  assert.equal(r.pariable, false, 'jambe de déroulé : jamais « J’ai parié »');
  assert.ok(r.mentions.some((m) => /ne se parie pas/.test(m)));
  // Sans table jointe : pas de prix, la raison en mots.
  const sans = J.probabiliteDuCombine({ jambes: [MT_NUL, PLUS25], grille: G });
  assert.equal(sans.probabilite, null);
  assert.ok(sans.raisons[0].includes('déroulé simulé absent'));
  // Toutes les jambes de déroulé se chiffrent.
  for (const [id, params] of [['halfTimeGoals', { line: 1.5, side: 'over' }], ['halfTimeFullTime', { ht: 'draw', ft: 'home' }], ['goalInBothHalves', { outcome: 'yes' }], ['secondHalfMoreGoals', { outcome: 'yes' }], ['teamScoresBothHalves', { team: 'home', outcome: 'yes' }], ['firstGoal', { team: 'away' }], ['firstGoal', { team: 'none' }], ['firstGoalBefore30', { outcome: 'no' }], ['comeback', { outcome: 'yes' }], ['redCard', { outcome: 'yes' }]]) {
    const x = J.probabiliteDuCombine({ jambes: [jambe(id, params, id)], grille: G, table: TABLE });
    assert.ok(x.probabilite > 0 && x.probabilite < 1 && x.pariable === false, `${id} ${JSON.stringify(params)} : ${x.probabilite}`);
  }
  // Le score exact se chiffre, ne se parie pas encore ; les marchés réglés se parient.
  assert.equal(J.probabiliteDuCombine({ jambes: [jambe('scoreExact', { home: 1, away: 0 }, '1-0')], grille: G }).pariable, false);
  assert.equal(J.probabiliteDuCombine({ jambes: [UN, BTTS], grille: G }).pariable, true);
});

test('T5 corners → produit avec la mention « supposés indépendants des buts : non mesuré » ; probabilité de corners absente → pas de prix', () => {
  const p = 0.4512;
  const r = J.probabiliteDuCombine({ jambes: [UN, CORNERS], grille: G, statLines: { [J.cleDeLaJambe(CORNERS)]: p } });
  assert.ok(Math.abs(r.probabilite - somme(G, (i, j) => i > j) * p) < 1e-15);
  assert.ok(r.mentions.some((m) => /supposés indépendants des buts : non mesuré/.test(m)));
  const f = J.probabiliteDuCombine({ jambes: [UN, CORNERS], grille: G, statLines: () => p });
  assert.equal(f.probabilite, r.probabilite);
  assert.equal(J.probabiliteDuCombine({ jambes: [UN, CORNERS], grille: G }).probabilite, null);
});

test('T5 prix juste sous 1,20 → « non conseillé » (plus de 0,5 buts seul, ~93 %) ; au-dessus, conseillé ; l’écart à une cote tapée est neutre (cote × P − 1)', () => {
  const r = J.probabiliteDuCombine({ jambes: [PLUS05], grille: G });
  assert.ok(r.prixJuste < 1.2 && r.nonConseille === true);
  assert.ok(r.mentions.some((m) => /non conseillé/.test(m) && /1,20/.test(m)));
  const c = J.probabiliteDuCombine({ jambes: [UN, PLUS25], grille: G });
  assert.equal(c.nonConseille, false);
  assert.ok(Math.abs(J.ecartALaCote(3.6, 0.244) - (3.6 * 0.244 - 1)) < 1e-15);
  assert.equal(J.ecartALaCote(0.9, 0.5), null);
});

test('jambes invalides ou inconnues : raison en mots, aucun prix ; matchs différents : produit, « supposés indépendants (non mesuré) »', () => {
  for (const j of [jambe('result', { outcome: 'x' }), jambe('totalGoals', { line: 2, side: 'over' }), jambe('teamGoals', { team: 'nobody', line: 1.5, side: 'over' }), jambe('marcheInconnu', {}), jambe('halfTimeResult', {})]) {
    const r = J.probabiliteDuCombine({ jambes: [j], grille: G, table: TABLE });
    assert.equal(r.probabilite, null);
    assert.ok(r.raisons.length === 1 && typeof r.raisons[0] === 'string');
  }
  const m = J.combinerLesMatchs([0.5, 0.4]);
  assert.ok(Math.abs(m.probabilite - 0.2) < 1e-15);
  assert.deepEqual(m.mentions, ['matchs différents : supposés indépendants (non mesuré)']);
  assert.deepEqual(J.combinerLesMatchs([0.5]).mentions, []);
});
