/**
 * Calculs du moteur (étape 3 du plan) — fonctions pures, SANS base ni réseau.
 *   node --test test/calculs.test.mjs        (depuis server/)
 *
 *  - retrait de marge, méthode puissance (core/market/marginRemoval.js) ;
 *  - cote juste par paliers, cote jouable, value et mise (core/engine/valueFinder.js) ;
 *  - corners/tirs : attendus et binomiale négative (sports/football/statMarkets.js) ;
 *  - matrice des scores, tempérage et pronostic du résultat : tout fait 100 % ;
 *  - cote minimale 1,20 des pronostics de marché (sports/football/markets.js).
 * Les valeurs attendues sont recalculées ici à la main ou par une formule
 * indépendante, jamais recopiées de la sortie du code testé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeMargin } from '../src/core/market/marginRemoval.js';
import { fairFromBookmakers, fairFromAllValid, estJouable, coteJouable, findValueBet } from '../src/core/engine/valueFinder.js';
import { statExpectations, lineCandidates, STAT_KINDS } from '../src/sports/football/statMarkets.js';
import { computeScoreMatrix } from '../src/sports/football/scoreMatrix.js';
import { temperer, predictResult, FREQUENCES_1N2 } from '../src/core/engine/resultPrediction.js';
import { deriveMarketPredictions, COTE_MINIMALE } from '../src/sports/football/markets.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const proche = (a, b, tol, quoi = '') => assert.ok(Math.abs(a - b) <= tol, `${quoi} ${a} ≠ ${b} (tolérance ${tol})`);
const somme = (l) => l.reduce((s, x) => s + x, 0);
const CONFIG = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;

// ------------------------------------------------------- retrait de marge

const JEUX = [
  [2.1, 3.4, 3.6],
  [1.25, 6.0, 11.0],
  [3.0, 3.2, 2.5],
  [1.9, 1.9],
  [1.5, 4.5, 7.0, 12.0]
];

test('marge retirée : les probabilités font 100 %, marge annoncée exacte', () => {
  for (const cotes of JEUX) {
    const r = removeMargin(cotes);
    assert.equal(r.anomaly, false, cotes.join(' / '));
    proche(somme(r.probabilities), 1, 1e-9, `somme ${cotes}`);
    for (const p of r.probabilities) assert.ok(p > 0 && p < 1);
    const marge = (somme(cotes.map((c) => 1 / c)) - 1) * 100;
    assert.equal(r.overroundPercent, Number(marge.toFixed(2)));
  }
});

test('méthode PUISSANCE : chaque probabilité est (1/cote)^k avec le même k > 1', () => {
  for (const cotes of JEUX) {
    const r = removeMargin(cotes);
    const k = cotes.map((c, i) => Math.log(r.probabilities[i]) / Math.log(1 / c));
    for (const ki of k) proche(ki, k[0], 1e-6, `exposant ${cotes}`);
    assert.ok(k[0] > 1, 'une marge positive donne k > 1');
  }
});

test("méthode puissance et non proportionnelle : la marge pèse surtout sur l'outsider", () => {
  const cotes = [1.25, 6.0, 11.0];
  const r = removeMargin(cotes);
  const brutes = cotes.map((c) => 1 / c);
  const proportionnelles = brutes.map((p) => p / somme(brutes));
  assert.ok(r.probabilities[0] > proportionnelles[0] + 0.003, 'le favori garde plus que sa part proportionnelle');
  assert.ok(r.probabilities[2] < proportionnelles[2] - 0.003, "l'outsider en garde moins");
  // Cotes égales : rien à répartir autrement.
  assert.deepEqual(removeMargin([1.9, 1.9]).probabilities, [0.5, 0.5]);
});

test('jeu de cotes impossible signalé (marge nulle, négative ou > 35 %), mais toujours 100 %', () => {
  for (const cotes of [[2, 4, 4], [2.2, 4.2, 4.2], [1.5, 2.5, 3.0]]) {
    const r = removeMargin(cotes);
    assert.equal(r.anomaly, true, cotes.join(' / '));
    proche(somme(r.probabilities), 1, 1e-12);
    // Lecture proportionnelle dans ce cas.
    const brutes = cotes.map((c) => 1 / c);
    r.probabilities.forEach((p, i) => proche(p, brutes[i] / somme(brutes), 1e-12));
  }
  // Une cote sous 1,01 est ramenée à 1,01.
  proche(somme(removeMargin([1.0, 20, 30]).probabilities), 1, 1e-9);
  assert.equal(removeMargin([1.0, 20, 30]).overroundPercent, Number(((1 / 1.01 + 1 / 20 + 1 / 30 - 1) * 100).toFixed(2)));
});

// ------------------------------------------------------ cote juste, value

const L = (key, odds1, oddsDraw, odds2, extra = {}) => ({ key, title: key, odds1, oddsDraw, odds2, ...extra });
const moyenneNormalisee = (listes) => {
  const s = [0, 1, 2].map((k) => somme(listes.map((p) => p[k])) / listes.length);
  return s.map((p) => p / somme(s));
};

test('cote juste : Pinnacle seul quand il cote le match', () => {
  const pin = L('pinnacle', 2.05, 3.5, 3.9);
  const r = fairFromBookmakers([L('marathonbet', 2.1, 3.4, 3.6), pin, L('williamhill', 2.0, 3.3, 3.8)]);
  assert.equal(r.basis, 'Pinnacle');
  assert.deepEqual(r.keys, ['pinnacle']);
  r.probabilities.forEach((p, i) => proche(p, removeMargin([2.05, 3.5, 3.9]).probabilities[i], 1e-12));
  proche(somme(r.probabilities), 1, 1e-12);
});

test('cote juste : palier 2 (un avis suffit), moyenne des avis normalisée', () => {
  const a = L('marathonbet', 2.1, 3.4, 3.6);
  const b = L('onexbet', 2.15, 3.3, 3.55);
  const r = fairFromBookmakers([a, b, L('tipico_de', 2.0, 3.3, 3.7)]);
  assert.equal(r.basis, 'palier 2');
  assert.deepEqual(r.keys.sort(), ['marathonbet', 'onexbet']);
  const attendu = moyenneNormalisee([removeMargin([2.1, 3.4, 3.6]).probabilities, removeMargin([2.15, 3.3, 3.55]).probabilities]);
  r.probabilities.forEach((p, i) => proche(p, attendu[i], 1e-12));
});

test('cote juste : palier 3 exige deux avis, et les bookmakers jumeaux ne comptent que pour un', () => {
  assert.equal(fairFromBookmakers([L('tipico_de', 2.0, 3.3, 3.7)]), null, 'un seul avis du palier 3');
  assert.equal(fairFromBookmakers([L('williamhill', 2.0, 3.3, 3.7), L('sport888', 2.02, 3.3, 3.6)]), null, 'William Hill + 888 = un seul avis');
  const r = fairFromBookmakers([L('williamhill', 2.0, 3.3, 3.7), L('sport888', 2.02, 3.3, 3.6), L('coolbet', 2.05, 3.25, 3.6)]);
  assert.equal(r.basis, 'palier 3');
  // Le premier avis est la moyenne des jumeaux, le second Coolbet.
  const jumeaux = moyenneNormalisee([removeMargin([2.0, 3.3, 3.7]).probabilities, removeMargin([2.02, 3.3, 3.6]).probabilities]);
  const attendu = moyenneNormalisee([jumeaux, removeMargin([2.05, 3.25, 3.6]).probabilities]);
  r.probabilities.forEach((p, i) => proche(p, attendu[i], 1e-12));
});

test('cote juste : lignes incohérentes et bourse à carnet vide écartées', () => {
  // Pinnacle à marge négative : ignoré, on descend au palier 2.
  const r = fairFromBookmakers([L('pinnacle', 2.3, 3.8, 4.2), L('marathonbet', 2.1, 3.4, 3.6)]);
  assert.equal(r.basis, 'palier 2');
  // Bourse Betfair à 8 % de marge : écartée ; à 3 % : comptée comme avis du palier 3.
  assert.equal(fairFromBookmakers([L('tipico_de', 2.0, 3.3, 3.7), L('betfair_ex_eu', 2.0, 3.3, 3.6)]), null);
  assert.equal(fairFromBookmakers([L('tipico_de', 2.0, 3.3, 3.7), L('betfair_ex_eu', 2.08, 3.45, 3.95)]).basis, 'palier 3');
  // Aucun palier : null ; le repli du pronostic moyenne les seules lignes saines.
  assert.equal(fairFromBookmakers([L('betclic', 1.95, 3.2, 3.5)]), null);
  const repli = fairFromAllValid([L('betclic', 1.95, 3.2, 3.5), L('pmu', 2.3, 3.8, 4.2), L('unibet_fr', 2.0, 3.1, 3.4, { odds2: Number.NaN })]);
  assert.deepEqual(repli.keys, ['betclic']);
});

test('cote jouable : jamais une ligne de référence, les bookmakers cochés, pas de bourse par défaut', () => {
  const wh = L('williamhill', 2.0, 3.3, 3.7);
  assert.equal(estJouable(wh, CONFIG), true);
  assert.equal(estJouable({ ...wh, referenceOnly: true }, CONFIG), false, 'cote gratuite de référence');
  assert.equal(estJouable(L('betclic', 1.95, 3.2, 3.5), CONFIG), false, 'pas coché dans Réglages');
  assert.equal(estJouable(L('betclic', 1.95, 3.2, 3.5), {}), true, 'aucun coché = tous…');
  assert.equal(estJouable(L('betfair_ex_eu', 2.08, 3.45, 3.95), {}), false, '… sauf les bourses');
  assert.equal(estJouable(L('betfair_ex_eu', 2.08, 3.45, 3.95), { valueBookmakers: ['betfair_ex_eu'] }), true, 'bourse cochée, marge plausible');
  assert.equal(estJouable(L('betfair_ex_eu', 2.0, 3.3, 3.6), { valueBookmakers: ['betfair_ex_eu'] }), false, 'bourse à 8 % de marge');
  assert.equal(estJouable(L('williamhill', 2.3, 3.8, 4.2), CONFIG), false, 'ligne incohérente (marge négative)');
  assert.equal(estJouable(L('williamhill', 2.0, null, 3.7), CONFIG), false, 'ligne incomplète');
  // Commission de 5 % déduite des gains d'une bourse.
  proche(coteJouable(L('betfair_ex_eu', 3.0, 3.4, 2.5), 'odds1'), 1 + 2 * 0.95, 1e-12);
  assert.equal(coteJouable(wh, 'odds1'), 2.0);
});

test('value : recommandée seulement au-dessus de la cote juste + 2 %, mise au huitième de Kelly plafonnée à 2 %', () => {
  const fair = [0.5, 0.28, 0.22];
  const base = { fair, referenceKeys: ['pinnacle'], config: CONFIG, bankroll: 10000 };
  const r = findValueBet({ ...base, byBookmaker: [L('williamhill', 2.15, 3.3, 4.2)] });
  assert.equal(r.action, 'RECOMMENDED');
  assert.equal(r.outcome, 'home');
  assert.equal(r.bookmaker, 'williamhill');
  assert.equal(r.fairOdds, 2.0);
  proche(r.ev, 0.5 * 2.15 - 1, 1e-4);
  proche(r.stake, Math.min(10000 * ((0.125 * 0.075) / 1.15), 200), 0.01);
  // Avantage de 1,5 % : sous le seuil.
  assert.equal(findValueBet({ ...base, byBookmaker: [L('williamhill', 2.03, 3.3, 4.2)] }).reason, 'pas_de_value');
  // Avantage de 25 % pile, cote 2,50 : la mise est plafonnée à 2 % du capital.
  const fort = findValueBet({ ...base, byBookmaker: [L('williamhill', 2.5, 3.0, 3.6)] });
  assert.equal(fort.action, 'RECOMMENDED');
  assert.equal(fort.stake, 200);
  // Au-delà de la cote 5 ou de 25 % d'avantage : écartée, et dite « hors limites ».
  const loin = findValueBet({ ...base, byBookmaker: [L('williamhill', 1.6, 3.3, 6.0)] });
  assert.equal(loin.action, 'PASS');
  assert.equal(loin.reason, 'value_hors_limites');
  assert.equal(loin.candidates.find((c) => c.outcome === 'away').exclusion, 'cote_trop_haute');
});

test("value : jamais chez un bookmaker qui a fixé la cote juste, ni sur une cote de référence, ni coupe-circuit actif", () => {
  const fair = [0.5, 0.28, 0.22];
  const wh = L('williamhill', 2.15, 3.3, 4.2);
  assert.equal(findValueBet({ fair, referenceKeys: ['williamhill'], config: CONFIG, bankroll: 10000, byBookmaker: [wh] }).reason, 'bookmakers_juges');
  assert.equal(findValueBet({ fair, referenceKeys: [], config: CONFIG, bankroll: 10000, byBookmaker: [{ ...wh, referenceOnly: true }] }).reason, 'aucun_bookmaker_autorise');
  assert.equal(findValueBet({ fair, referenceKeys: [], config: CONFIG, bankroll: 10000, byBookmaker: [wh], tiltState: { circuitBreakerActive: true } }).action, 'CIRCUIT_BREAKER_ACTIVE');
  assert.equal(findValueBet({ fair: null, config: CONFIG, byBookmaker: [wh] }).reason, 'no_market_odds');
  // Une cote aberrante ailleurs ne masque pas la vraie value.
  const r = findValueBet({ fair, referenceKeys: [], config: CONFIG, bankroll: 10000, byBookmaker: [wh, L('unibet_nl', 6.0, 4.5, 1.6)] });
  assert.equal(r.action, 'RECOMMENDED');
  assert.equal(r.bookmaker, 'williamhill');
});

// ------------------------------------------- corners, tirs : binomiale négative

/** Fonction de répartition de référence, calculée ici par récurrence (indépendante du code testé). */
function cdfReference(k, mu, invK) {
  if (invK <= 1e-9) {
    let p = Math.exp(-mu);
    let s = p;
    for (let i = 1; i <= k; i++) {
      p *= mu / i;
      s += p;
    }
    return s;
  }
  const r = 1 / invK;
  let p = (r / (r + mu)) ** r;
  let s = p;
  for (let i = 0; i < k; i++) {
    p *= ((i + r) / (i + 1)) * (mu / (r + mu));
    s += p;
  }
  return s;
}

const CAS = [
  [10.2, STAT_KINDS.corners.invKTotal],
  [4.9, STAT_KINDS.corners.invKTeam],
  [12.7, STAT_KINDS.shots.invKTeam],
  [28.3, STAT_KINDS.shots.invKTotal],
  [9.19, STAT_KINDS.shotsOnTarget.invKTotal],
  [2.1, STAT_KINDS.shotsOnTarget.invKTeam]
];

test('corners et tirs attendus : facteur de terrain 1,10 / 0,90 sur produit + concédé', () => {
  const inputs = {
    home: { corners: { for: 6, against: 4 }, shots: { for: 14, against: 10 }, shotsOnTarget: null },
    away: { corners: { for: 5, against: 7 }, shots: null, shotsOnTarget: { for: 4, against: 5 } }
  };
  const e = statExpectations({ statInputs: inputs });
  assert.deepEqual(e.corners, { home: Number((1.1 * (6 + 7) / 2).toFixed(2)), away: Number((0.9 * (5 + 4) / 2).toFixed(2)), total: Number((1.1 * 6.5 + 0.9 * 4.5).toFixed(2)) });
  assert.equal(e.shots, undefined, "une équipe sans 6 relevés : pas d'attendu");
  assert.equal(e.shotsOnTarget, undefined);
  assert.equal(statExpectations({ statInputs: { home: inputs.home, away: null } }), null);
  assert.equal(statExpectations({}), null);
});

test('binomiale négative : plus + moins = 100 % à chaque ligne', () => {
  for (const [mu, invK] of CAS) {
    const lignes = lineCandidates(mu, invK);
    assert.ok(lignes.length >= 4, `${mu}`);
    for (let i = 0; i < lignes.length; i += 2) {
      const [moins, plus] = lignes.slice(i, i + 2);
      assert.equal(moins.line, plus.line);
      assert.deepEqual([moins.side, plus.side], ['under', 'over']);
      // Cotes arrondies à 2 décimales : la somme des 1/cote tient à 1 % près.
      proche(1 / moins.odds + 1 / plus.odds, 1, 0.011, `ligne ${moins.line} (μ ${mu})`);
    }
  }
});

test('binomiale négative : lignes demi-entières, de 0,4 à 1,8 fois l\'attendu, monotones', () => {
  for (const [mu, invK] of CAS) {
    const lignes = lineCandidates(mu, invK);
    const moins = lignes.filter((c) => c.side === 'under');
    const plus = lignes.filter((c) => c.side === 'over');
    assert.equal(moins[0].line, Math.max(0.5, Math.floor(mu * 0.4) + 0.5));
    assert.ok(moins.at(-1).line <= Math.ceil(mu * 1.8) + 0.5);
    for (let i = 1; i < moins.length; i++) {
      assert.equal(moins[i].line - moins[i - 1].line, 1);
      assert.ok(moins[i].odds <= moins[i - 1].odds, `« moins de » se rapproche quand la ligne monte (μ ${mu})`);
      assert.ok(plus[i].odds >= plus[i - 1].odds, `« plus de » s'éloigne quand la ligne monte (μ ${mu})`);
    }
  }
  assert.deepEqual(lineCandidates(0, 0.1), []);
  assert.deepEqual(lineCandidates(-2, 0.1), []);
});

test('binomiale négative : conforme à la loi (paramètre 1/k), Poisson quand 1/k = 0', () => {
  for (const [mu, invK] of [...CAS, [3.3, 0], [11, 0]]) {
    for (const c of lineCandidates(mu, invK).filter((x) => x.side === 'under')) {
      // 1/cote arrondie à 2 décimales : à 0,6 point près.
      proche(1 / c.odds, cdfReference(Math.floor(c.line), mu, invK), 0.006, `P(X ≤ ${Math.floor(c.line)}) μ ${mu}, 1/k ${invK}`);
    }
  }
});

test('binomiale négative plus dispersée que Poisson : queues plus épaisses des deux côtés', () => {
  const mu = 10;
  const nb = lineCandidates(mu, STAT_KINDS.corners.invKTeam);
  const poisson = lineCandidates(mu, 0);
  const proba = (liste, line, side) => 1 / liste.find((c) => c.line === line && c.side === side).odds;
  assert.ok(proba(nb, 4.5, 'under') > proba(poisson, 4.5, 'under') + 0.02);
  assert.ok(proba(nb, 15.5, 'over') > proba(poisson, 15.5, 'over') + 0.02);
});

// ------------------------------------------------ 100 % partout ailleurs

test('matrice des scores : 1N2, plus/moins, buts par équipe et combinés font 100 %', () => {
  for (const [lambda, mu, rho] of [[1.4, 1.1, -0.075], [2.6, 0.5, -0.075], [0.6, 0.7, -0.04], [1.5, 1.5, 0]]) {
    const m = computeScoreMatrix(lambda, mu, rho);
    proche(m.home + m.draw + m.away, 1, 1e-12, '1N2');
    assert.ok(m.over05 > m.over15 && m.over15 > m.over25 && m.over25 > m.over35, 'plus de X décroît avec X');
    for (const equipe of [m.homeTeamGoals, m.awayTeamGoals]) {
      for (const l of ['05', '15', '25', '35']) proche(equipe[`over${l}`] + equipe[`under${l}`], 1, 1e-12);
    }
    for (const ligne of Object.values(m.resultAndTotal)) proche(somme(Object.values(ligne)), 1, 1e-12, 'combiné');
    proche(m.resultAndTotal[2.5].homeOver + m.resultAndTotal[2.5].homeUnder, m.home, 1e-12);
    assert.ok(m.bothTeamsScore > 0 && m.bothTeamsScore < 1);
  }
  // Équipes égales sans corrélation : symétrie domicile / extérieur.
  const sym = computeScoreMatrix(1.3, 1.3, 0);
  proche(sym.home, sym.away, 1e-12);
});

test('résultat sans cote : tempéré vers les fréquences moyennes, 100 %, pronostic et double chance', () => {
  const t = temperer({ home: 0.7, draw: 0.2, away: 0.1 });
  proche(t.home + t.draw + t.away, 1, 1e-12);
  assert.ok(t.home < 0.7 && t.home > FREQUENCES_1N2.home);
  const p = predictResult({ probabilities: { home: 0.42, draw: 0.3, away: 0.28 }, source: 'cotes', homeName: 'A', awayName: 'B' });
  assert.equal(p.outcome, 'home');
  assert.equal(p.doubleChance.label, 'A ou nul');
  proche(p.doubleChance.probability, 0.72, 1e-9);
  assert.equal(predictResult({ probabilities: { home: 0.6, draw: 0.25, away: 0.15 }, source: 'cotes' }).doubleChance, null);
  assert.deepEqual(predictResult({ probabilities: { home: 0.62, draw: 0.2, away: 0.18 }, source: 'cotes' }).reliability.range, [60, 70]);
});

// ------------------------------------------------- cote minimale 1,20

test('pronostics de marché : jamais sous la cote minimale 1,20, le plus probable au-dessus', () => {
  assert.equal(COTE_MINIMALE, 1.2);
  const trueOdds = {
    home: 1.12, draw: 9.5, away: 21,
    over05: 1.03, over15: 1.15, over25: 1.45, over35: 2.2,
    under05: 34, under15: 7.7, under25: 3.2, under35: 1.84,
    homeTeamGoals: { over05: 1.05, over15: 1.3, over25: 2.1, over35: 4.0, under05: 21, under15: 4.3, under25: 1.9, under35: 1.33 },
    awayTeamGoals: { over05: 3.1, over15: 11, over25: 40, over35: 120, under05: 1.48, under15: 1.1, under25: 1.03, under35: 1.01 },
    bothTeamsScore: 3.3, bothTeamsScoreNo: 1.43,
    resultAndTotal: { 1.5: { homeOver: 1.35, homeUnder: 8.0 }, 2.5: { homeOver: 1.7, homeUnder: 3.2 }, 3.5: { homeOver: 2.7, homeUnder: 1.9 } }
  };
  const p = deriveMarketPredictions({ home: 'A', away: 'B' }, { trueOdds, market: { odds1: 1.15, oddsDraw: 9, odds2: 19 } });
  const par = (id, team) => p.find((x) => x.marketId === id && (!team || x.params.team === team));
  assert.equal(par('result'), undefined, 'favori à 1,12 : pas de pronostic de résultat (jamais l\'outsider à sa place)');
  assert.deepEqual([par('totalGoals').params.line, par('totalGoals').params.side, par('totalGoals').predictedOdds], [2.5, 'over', 1.45]);
  assert.equal(par('bothTeamsScore').predictedOutcome, 'no');
  assert.deepEqual([par('teamGoals', 'home').params.line, par('teamGoals', 'home').params.side], [1.5, 'over']);
  assert.deepEqual([par('teamGoals', 'away').params.line, par('teamGoals', 'away').params.side], [0.5, 'under']);
  assert.equal(par('resultAndTotal').predictedOutcome, 'homeOver');
  for (const x of p) {
    assert.ok(x.predictedOdds >= COTE_MINIMALE, `${x.market} ${x.predictedOdds}`);
    assert.equal(x.minOdds, COTE_MINIMALE);
  }
  // Le favori à 1,30 en cote juste mais à 1,15 chez les bookmakers : pas de pronostic non plus.
  const q = deriveMarketPredictions({ home: 'A', away: 'B' }, { trueOdds: { ...trueOdds, home: 1.3 }, market: { odds1: 1.15 } });
  assert.equal(q.find((x) => x.marketId === 'result'), undefined);
  const r = deriveMarketPredictions({ home: 'A', away: 'B' }, { trueOdds: { ...trueOdds, home: 1.3 }, market: { odds1: 1.32 } });
  assert.equal(r.find((x) => x.marketId === 'result').predictedOutcome, 'home');
});
