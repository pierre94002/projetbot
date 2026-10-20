/**
 * Règlement des pronostics et des paris (étape 3 du plan).
 *   node --test test/reglement.test.mjs        (depuis server/)
 *
 *  1. Les règles (core/settlement/settlementRules.js), fonctions pures :
 *     résultat, plus/moins, les deux marquent, buts par équipe, combiné,
 *     paramètres structurés, corners et tirs d'après les statistiques.
 *  2. La passe automatique (data/providers/settlementService.js), dans une
 *     copie ISOLÉE (cf. test/aides/isolement.mjs) : faux journaux de
 *     pronostics, de paris et de résultats, contre la base d'essai —
 *     jamais les vrais fichiers de Pierre. Un match de coupe décidé après
 *     prolongation ou aux tirs au but n'est PAS réglé sur son score final
 *     (les marchés se jouent sur les 90 minutes) : il reste en attente, à
 *     régler à la main ; un score saisi à la main sous l'identifiant du match
 *     (celui des 90 minutes), lui, le règle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { deriveActualOutcome, deriveBetLegOutcome, extractGoalLine } from '../src/core/settlement/settlementRules.js';
import { executerIsole, SERVEUR } from './aides/isolement.mjs';

// ------------------------------------------------------------ 1. règles

const entree = (market, extra = {}) => ({ market, homeName: 'Arsenal', awayName: 'Real Madrid', ...extra });

test('pronostic : résultat, plus/moins, les deux marquent', () => {
  assert.equal(deriveActualOutcome(entree('Résultat'), 2, 1), 'home');
  assert.equal(deriveActualOutcome(entree('Résultat'), 1, 1), 'draw');
  assert.equal(deriveActualOutcome(entree('Résultat'), 0, 2), 'away');
  assert.equal(deriveActualOutcome(entree('Total buts', { predictedLabel: 'Plus de 2.5 buts' }), 2, 1), 'over');
  assert.equal(deriveActualOutcome(entree('Total buts', { predictedLabel: 'Moins de 2.5 buts' }), 1, 1), 'under');
  assert.equal(deriveActualOutcome(entree('Total buts', { predictedLabel: 'Plus de 0,5 but' }), 0, 0), 'under', 'virgule décimale');
  assert.equal(deriveActualOutcome(entree('Total buts', { predictedLabel: 'sans ligne' }), 3, 0), null);
  assert.equal(deriveActualOutcome(entree('Les 2 équipes marquent'), 1, 1), 'yes');
  assert.equal(deriveActualOutcome(entree('Les 2 équipes marquent'), 2, 0), 'no');
  assert.equal(deriveActualOutcome(entree('Les 2 équipes marquent'), 0, 0), 'no');
  assert.equal(extractGoalLine('Arsenal & Moins de 3.5 buts'), '3.5');
});

test('pronostic : buts par équipe, combiné, paramètres structurés', () => {
  assert.equal(deriveActualOutcome(entree('Buts — Arsenal', { predictedLabel: 'Arsenal — Plus de 1.5 buts' }), 2, 0), 'over');
  assert.equal(deriveActualOutcome(entree('Buts — Real Madrid', { predictedLabel: 'Real Madrid — Plus de 0.5 buts' }), 2, 0), 'under');
  assert.equal(deriveActualOutcome(entree('Résultat + Total buts', { predictedLabel: 'Arsenal & Plus de 2.5 buts' }), 3, 1), 'homeOver');
  assert.equal(deriveActualOutcome(entree('Résultat + Total buts', { predictedLabel: 'Nul & Moins de 2.5 buts' }), 1, 1), 'drawUnder');
  assert.equal(deriveActualOutcome(entree('Résultat + Total buts', { predictedLabel: 'Real Madrid & Plus de 1.5 buts' }), 0, 1), 'awayUnder');
  // Le libellé ne suffit pas (autre écriture du club) : les paramètres décident.
  assert.equal(deriveActualOutcome(entree('Buts — Real Madrid CF', { marketId: 'teamGoals', params: { team: 'away', line: 0.5 } }), 2, 1), 'over');
  assert.equal(deriveActualOutcome(entree('Buts — Real Madrid CF', { marketId: 'teamGoals', params: { team: 'away', line: 1.5 } }), 2, 1), 'under');
  assert.equal(deriveActualOutcome(entree('Total des buts', { marketId: 'totalGoals', params: { line: 3.5 } }), 2, 2), 'over');
  assert.equal(deriveActualOutcome(entree('Marché inconnu'), 2, 2), null);
});

test('pronostic : corners, tirs et tirs cadrés d\'après les statistiques du match, jamais devinés sans elles', () => {
  const stats = { home: { corners: 6, shots: 14, shotsOnTarget: 5 }, away: { corners: 4, shots: 9, shotsOnTarget: 3 } };
  const e = (marketId, params) => entree('…', { marketId, params });
  assert.equal(deriveActualOutcome(e('totalCorners', { line: 9.5 }), 1, 0, stats), 'over');
  assert.equal(deriveActualOutcome(e('totalCorners', { line: 10.5 }), 1, 0, stats), 'under');
  assert.equal(deriveActualOutcome(e('teamCorners', { team: 'home', line: 5.5 }), 1, 0, stats), 'over');
  assert.equal(deriveActualOutcome(e('totalShots', { line: 22.5 }), 1, 0, stats), 'over');
  assert.equal(deriveActualOutcome(e('teamShots', { team: 'away', line: 9.5 }), 1, 0, stats), 'under');
  assert.equal(deriveActualOutcome(e('teamShotsOnTarget', { team: 'away', line: 2.5 }), 1, 0, stats), 'over');
  assert.equal(deriveActualOutcome(e('totalShotsOnTarget', { line: 8.5 }), 1, 0, stats), 'under');
  assert.equal(deriveActualOutcome(e('totalCorners', { line: 9.5 }), 1, 0, null), null, 'sans statistiques');
  assert.equal(deriveActualOutcome(e('totalCorners', { line: 9.5 }), 1, 0, { home: { corners: 6 }, away: { corners: null } }), null, 'une équipe non relevée');
  assert.equal(deriveActualOutcome(e('teamCorners', { team: 'home', line: 5.5 }), 1, 0, { home: { corners: 6 }, away: { corners: null } }), 'over', 'par équipe : seule la sienne compte');
});

const selection = (market, pick, extra = {}) => ({ market, pick, homeName: 'Arsenal', awayName: 'Real Madrid', ...extra });

test('pari : résultat, plus/moins, les deux marquent, buts par équipe, combiné', () => {
  assert.equal(deriveBetLegOutcome(selection('Résultat', 'Arsenal'), 2, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('1N2', 'Real Madrid'), 2, 1), 'lost');
  assert.equal(deriveBetLegOutcome(selection('Résultat', 'Match nul'), 1, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('Résultat', '?', { params: { outcome: 'away' } }), 0, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('Total buts', 'Plus de 2.5 buts'), 2, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('Total buts', 'Moins de 2.5 buts'), 2, 1), 'lost');
  assert.equal(deriveBetLegOutcome(selection('Les 2 équipes marquent', 'Oui'), 2, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('Les 2 équipes marquent', 'Non'), 2, 1), 'lost');
  assert.equal(deriveBetLegOutcome(selection('Buts par équipe', 'Arsenal — Plus de 1.5 buts'), 2, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('Buts — Real Madrid', 'Plus de 1.5 buts'), 2, 1), 'lost', "l'équipe est dans le marché");
  assert.equal(deriveBetLegOutcome(selection('Buts par équipe', 'Plus de 0.5 buts', { params: { team: 'away' } }), 2, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('Résultat + Total buts', 'Arsenal & Plus de 2.5 buts'), 2, 1), 'won');
  assert.equal(deriveBetLegOutcome(selection('Résultat + Total buts', 'Arsenal & Plus de 2.5 buts'), 2, 0), 'lost');
  assert.equal(deriveBetLegOutcome(selection('Résultat + Total buts', 'Nul & Moins de 2.5 buts'), 1, 1), 'won');
});

test('pari : corners et tirs seulement avec les statistiques', () => {
  const stats = { home: { corners: 6, shots: 14, shotsOnTarget: 5 }, away: { corners: 4, shots: 9, shotsOnTarget: 3 } };
  assert.equal(deriveBetLegOutcome(selection('Total corners', 'Plus de 9.5'), 1, 0, stats), 'won');
  assert.equal(deriveBetLegOutcome(selection('Total corners', 'Plus de 10.5'), 1, 0, stats), 'lost');
  assert.equal(deriveBetLegOutcome(selection('Total tirs cadrés', 'Moins de 8.5'), 1, 0, stats), 'won');
  assert.equal(deriveBetLegOutcome(selection('Qui fait le plus de corners', 'Arsenal'), 1, 0, stats), 'won');
  assert.equal(deriveBetLegOutcome(selection('Qui fait le plus de tirs', 'Égalité'), 1, 0, stats), 'lost');
  assert.equal(deriveBetLegOutcome(selection('Tirs par équipe', 'Real Madrid Plus de 9.5'), 1, 0, stats), 'lost');
  assert.equal(deriveBetLegOutcome(selection('Tirs cadrés par équipe', 'Arsenal Plus de 4.5'), 1, 0, stats), 'won');
  assert.equal(deriveBetLegOutcome(selection('Total corners', 'Plus de 9.5'), 1, 0, null), null);
  assert.equal(deriveBetLegOutcome(selection('Marché inconnu', 'x'), 1, 0, stats), null);
});

// -------------------------------------------- 2. passe automatique isolée

const res = (date, slug, homeName, awayName, league, homeGoals, awayGoals) => ({
  id: `r-${slug}`, matchId: `web-${date}-${slug}`, homeName, awayName, league, homeGoals, awayGoals, source: 'fotmob', settledAt: `${date}T23:00:00.000Z`
});
// Résultats importés (la forme de merge-daily-results / fotMobRefresh), plus un score saisi à la main.
const RESULTATS = [
  res('2026-09-14', 'leeds-newcastle', 'Leeds', 'Newcastle', 'EPL', 4, 1),
  res('2026-08-21', 'waldhof-mannheim-kaiserslautern', 'Waldhof Mannheim', 'Kaiserslautern', 'DFB Pokal - Germany', 0, 1),
  res('2026-09-15', 'peterborough-united-barnsley', 'Peterborough United', 'Barnsley', 'EFL Cup', 3, 3),
  res('2026-08-22', 'nott-m-forest-leeds', "Nott'm Forest", 'Leeds', 'EPL', 0, 1),
  res('2026-08-25', 'nottingham-forest-leeds-united', 'Nottingham Forest', 'Leeds United', 'EFL Cup', 0, 2),
  res('2026-08-27', 'colo-colo-union-espanola', 'Colo Colo', 'Unión Española', 'Copa Chile', 3, 0),
  // Saisie à la main dans « Score final » : le score des 90 minutes (0-0, le seul
  // possible pour un 0-1 après prolongation), sous l'identifiant du pronostic.
  { id: 'r-main', matchId: 'manuel-waldhof', homeName: 'Waldhof Mannheim', awayName: 'Kaiserslautern', league: 'DFB Pokal - Germany', homeGoals: 0, awayGoals: 0, settledAt: '2026-08-22T08:00:00.000Z' }
];

const prono = (id, matchId, homeName, awayName, league, market, predictedOutcome, extra = {}) => ({
  id, matchId, homeName, awayName, league, market, predictedOutcome, predictedLabel: extra.predictedLabel ?? market, status: 'pending', settledAt: null,
  day: extra.day ?? '2026-08-01', commenceTime: extra.commenceTime ?? null, firstSeenAt: '2026-08-01T10:00:00.000Z', lastSeenAt: '2026-08-01T10:00:00.000Z',
  marketId: extra.marketId ?? null, params: extra.params ?? null, ...(extra.status ? { status: extra.status, settledBy: extra.settledBy, settledAt: '2026-09-15T08:00:00.000Z' } : {})
});
const LEEDS = ['odds-leeds-newcastle', 'Leeds', 'Newcastle', 'EPL'];
const COUP_LEEDS = { commenceTime: '2026-09-14T19:00:00Z' };
const PRONOSTICS = [
  prono('p-resultat', ...LEEDS, 'Résultat', 'home', COUP_LEEDS),
  prono('p-plus', ...LEEDS, 'Total buts', 'over', { ...COUP_LEEDS, predictedLabel: 'Plus de 2.5 buts' }),
  prono('p-btts', ...LEEDS, 'Les 2 équipes marquent', 'no', COUP_LEEDS),
  prono('p-buts-equipe', ...LEEDS, 'Buts — Leeds', 'under', { ...COUP_LEEDS, predictedLabel: 'Leeds — Moins de 1.5 buts' }),
  prono('p-corners', ...LEEDS, 'Total corners', 'over', { ...COUP_LEEDS, marketId: 'totalCorners', params: { line: 9.5, side: 'over' } }),
  prono('p-tirs', ...LEEDS, 'Tirs — Newcastle', 'under', { ...COUP_LEEDS, marketId: 'teamShots', params: { team: 'away', line: 7.5, side: 'under' } }),
  prono('p-manuel-contredit', ...LEEDS, 'Résultat', 'away', { ...COUP_LEEDS, status: 'correct', settledBy: 'manual' }),
  // Coupe : prolongation (DFB Pokal 0-1 a.p.) et tirs au but (EFL Cup 3-3).
  prono('p-prolongation', 'odds-waldhof', 'Waldhof Mannheim', 'Kaiserslautern', 'DFB Pokal - Germany', 'Résultat', 'away', { commenceTime: '2026-08-21T18:00:00Z' }),
  prono('p-tab', 'odds-peterborough', 'Peterborough United', 'Barnsley', 'EFL Cup', 'Total buts', 'over', { commenceTime: '2026-09-15T18:45:00Z', predictedLabel: 'Plus de 2.5 buts' }),
  prono('p-saisie-main', 'manuel-waldhof', 'Waldhof Mannheim', 'Kaiserslautern', 'DFB Pokal - Germany', 'Résultat', 'draw', { commenceTime: '2026-08-21T18:00:00Z' }),
  // Même affiche en championnat (22/08) puis en coupe (25/08) : chacun son match, sans heure connue.
  prono('p-forest-epl', 'odds-forest-epl', "Nott'm Forest", 'Leeds', 'EPL', 'Résultat', 'away', { day: '2026-08-21' }),
  prono('p-forest-coupe', 'odds-forest-coupe', 'Nottingham Forest', 'Leeds United', 'EFL Cup', 'Total buts', 'over', { day: '2026-08-21', predictedLabel: 'Plus de 1.5 buts' }),
  // Coupe du Chili : score connu, aucune statistique d'équipe en magasin.
  prono('p-sans-stats-resultat', 'odds-colo', 'Colo Colo', 'Unión Española', 'Copa Chile', 'Résultat', 'home', { commenceTime: '2026-08-27T23:00:00Z' }),
  prono('p-sans-stats-corners', 'odds-colo', 'Colo Colo', 'Unión Española', 'Copa Chile', 'Total corners', 'over', { commenceTime: '2026-08-27T23:00:00Z', marketId: 'totalCorners', params: { line: 8.5, side: 'over' } })
];
const leg = (matchId, homeName, awayName, league, commenceTime, market, pick, extra = {}) => ({ matchId, homeName, awayName, league, commenceTime, market, pick, odds: 1.9, status: 'pending', ...extra });
const PARIS = [
  {
    id: 'b-leeds', createdAt: '2026-09-13T10:00:00.000Z', settledAt: null, status: 'pending', stake: 10, odds: 3.61,
    legs: [
      leg('odds-leeds-newcastle', 'Leeds', 'Newcastle', 'EPL', '2026-09-14T19:00:00Z', 'Résultat', 'Leeds'),
      leg('odds-leeds-newcastle', 'Leeds', 'Newcastle', 'EPL', '2026-09-14T19:00:00Z', 'Total corners', 'Plus de 10.5')
    ]
  },
  {
    id: 'b-prolongation', createdAt: '2026-08-20T10:00:00.000Z', settledAt: null, status: 'pending', stake: 10, odds: 2.1,
    legs: [leg('odds-waldhof', 'Waldhof Mannheim', 'Kaiserslautern', 'DFB Pokal - Germany', '2026-08-21T18:00:00Z', 'Résultat', 'Kaiserslautern')]
  }
];

test('passe automatique (copie isolée) : bon match, bonnes statistiques, prolongations en attente, saisie à la main', () => {
  const r = executerIsole(path.join(SERVEUR, 'test', 'aides', 'script-reglement.mjs'), {
    runtime: { 'predictions.json': PRONOSTICS, 'bets.json': PARIS, 'match-results.json': RESULTATS, 'season-calendar.json': [] }
  });
  assert.equal(r.code, 0, r.erreurs + r.sortie);
  assert.equal(r.reseau, false, 'aucun appel réseau');
  const { rapport, second, predictions, bets } = r.json;
  const p = Object.fromEntries(predictions.map((x) => [x.id, x]));
  const statut = (id) => p[id].status;

  // Leeds 4-1 Newcastle : corners 5 + 5, tirs de Newcastle 7 (statistiques de la base d'essai).
  assert.equal(statut('p-resultat'), 'correct');
  assert.equal(statut('p-plus'), 'correct');
  assert.equal(statut('p-btts'), 'incorrect');
  assert.equal(statut('p-buts-equipe'), 'incorrect');
  assert.equal(statut('p-corners'), 'correct', '10 corners > 9,5');
  assert.equal(statut('p-tirs'), 'correct', '7 tirs < 7,5');
  for (const id of ['p-resultat', 'p-corners']) {
    assert.equal(p[id].settledBy, 'auto');
    assert.equal(p[id].settledScore, '4-1');
    assert.equal(p[id].settledResultId, 'web-2026-09-14-leeds-newcastle');
  }

  // Coupe décidée après prolongation / aux tirs au but : jamais réglée sur le score final.
  assert.equal(statut('p-prolongation'), 'pending', 'DFB Pokal 0-1 après prolongation : le « Kaiserslautern gagne » des 90 minutes n\'est pas acquis');
  assert.equal(statut('p-tab'), 'pending', 'EFL Cup 3-3, tirs au but');
  assert.equal(rapport.predictions.extraTime, 2);
  assert.equal(rapport.extraTime.filter((x) => x.kind === 'pronostic').length, 2);
  // … mais le score des 90 minutes saisi à la main règle le même match.
  assert.equal(statut('p-saisie-main'), 'correct');
  assert.equal(p['p-saisie-main'].settledScore, '0-0');

  // Même affiche à trois jours d'écart, deux compétitions : chacun son résultat.
  assert.equal(statut('p-forest-epl'), 'correct');
  assert.equal(p['p-forest-epl'].settledScore, '0-1');
  assert.equal(statut('p-forest-coupe'), 'correct');
  assert.equal(p['p-forest-coupe'].settledScore, '0-2', 'le 0-1 du championnat aurait donné « Moins de 1.5 »');

  // Sans statistiques d'équipe en magasin : le résultat se règle, les corners attendent.
  assert.equal(statut('p-sans-stats-resultat'), 'correct');
  assert.equal(statut('p-sans-stats-corners'), 'pending');
  assert.equal(rapport.predictions.noRule, 1);

  // Un statut posé à la main n'est jamais touché, mais sa contradiction est signalée.
  assert.equal(statut('p-manuel-contredit'), 'correct');
  assert.equal(p['p-manuel-contredit'].settledBy, 'manual');
  assert.equal(rapport.contradictions.count, 1);
  assert.equal(rapport.contradictions.samples[0].key, 'pronostic:p-manuel-contredit');

  // Paris : sélections réglées une à une, le ticket suit (un combiné perdu dès une sélection perdue).
  const b = Object.fromEntries(bets.map((x) => [x.id, x]));
  assert.deepEqual(b['b-leeds'].legs.map((l) => l.status), ['won', 'lost'], 'Leeds gagne ; 10 corners, pas plus de 10,5');
  assert.equal(b['b-leeds'].status, 'lost');
  assert.equal(b['b-prolongation'].legs[0].status, 'pending');
  assert.equal(b['b-prolongation'].status, 'pending');
  assert.equal(rapport.bets.extraTime, 1);

  // Bilan, puis une seconde passe qui ne règle plus rien.
  assert.equal(rapport.predictions.pending, PRONOSTICS.filter((x) => x.status === 'pending').length);
  assert.equal(rapport.predictions.settled, 10);
  assert.equal(rapport.bets.settled, 2);
  assert.equal(second.predictions.settled, 0);
  assert.equal(second.bets.settled, 0);
  assert.equal(second.predictions.extraTime, 2, 'toujours en attente, toujours signalé');
});
