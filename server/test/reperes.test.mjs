/**
 * Les repères de chaque championnat (étape 15 du plan, 07/10/2026).
 *   node --test test/reperes.test.mjs        (depuis server/)
 *
 * Les règles pures tournent ici, sans base ni réseau ; tout ce qui ouvre une
 * base tourne dans des copies isolées de la base d'essai (isolement.mjs :
 * réseau coupé, heure figée au 05/10/2026 12 h UTC), avec des saisons
 * football-data PLANTÉES aux valeurs connues (test/aides/script-reperes.mjs).
 *
 *  1. Le comptage à la main : une saison football-data de dix matchs, des
 *     rencontres FotMob fabriquées (minutes, penalties, carte des tirs, zéros).
 *  2. Les exclusions : attribués, annulés, hors classement, prolongations,
 *     zéros « non relevé » ; les coupes tenues à part.
 *  3. Les saisons civiles et la source de chaque saison (une seule).
 *  4. La dispersion conditionnelle face à la dispersion brute (simulation),
 *     le facteur de terrain, les fenêtres = celles du moteur.
 *  5. Les petits championnats ramenés vers la moyenne générale ; les attendus
 *     de l'étape 14.
 *  6. La passe de nuit (seulement ce qui a changé, la main rendue), l'étape de
 *     l'actualisation, la route, la lecture du code.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const imp = (rel) => import(pathToFileURL(path.join(SERVEUR, 'src', rel)).href);
const L = await imp('data/db/leagueBenchmarks.js');
const { STAT_KINDS, statExpectations } = await imp('sports/football/statMarkets.js');
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-reperes.mjs');

/** Une phase du script d'essai dans une copie isolée (avec scripts/, dont l'actualisation importe un module). */
function phase(nom) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [nom], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(0, 3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

let calcul;
let incremental;
before(() => {
  calcul = phase('calcul');
  incremental = phase('incremental');
});

const proche = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const valeur = (acc, cle) => L.moyenneEtEcart(acc.reperes[cle]).valeur;
const n = (acc, cle) => acc.reperes[cle].n;

// ================================================== 1. le comptage à la main

/** Premier League 2021-22 plantée (la même que dans le script d'essai), comptée à la main ci-dessous. */
const E0_2122 = [
  // jour, bd, be, mtd, mte, corners_d, corners_e, tirs_d, tirs_e, cadres_d, cadres_e, jaunes_d, jaunes_e, rouges_d, rouges_e
  ['2021-08-14', 2, 1, 1, 0, 5, 3, 12, 8, 5, 3, 1, 2, 0, 0],
  ['2021-08-21', 0, 0, 0, 0, 0, 0, 7, 6, 2, 1, 0, 0, 0, 0],
  ['2021-09-11', 1, 1, 0, 1, 6, 4, 14, 9, 4, 4, 2, 1, 0, 1],
  ['2021-09-18', 3, 2, 2, 1, null, null, 15, 13, 7, 6, 3, 3, 0, 0],
  ['2021-10-02', 0, 1, 0, 0, 4, 7, 9, 16, 2, 5, 1, 2, 0, 0],
  ['2021-10-16', 2, 0, null, null, 8, 2, 18, 5, 8, 1, 0, 1, 1, 0],
  ['2021-11-06', 1, 0, 1, 0, 3, 3, 10, 10, 3, 3, 2, 2, 0, 0],
  ['2021-12-04', 4, 0, 2, 0, 9, 1, 21, 4, 10, 1, 1, 0, 0, 0],
  ['2022-01-15', 2, 2, 1, 1, 5, 5, 11, 12, 5, 5, 2, 3, 0, 0],
  ['2022-03-05', 0, 3, 0, 2, 2, 6, 6, 15, 1, 7, 0, 0, 0, 0]
];
const COLS_FD = ['date', 'bd', 'be', 'mtd', 'mte', 'corners_d', 'corners_e', 'tirs_d', 'tirs_e', 'cadres_d', 'cadres_e', 'jaunes_d', 'jaunes_e', 'rouges_d', 'rouges_e'];
const ligneFd = (l) => Object.fromEntries(COLS_FD.map((c, i) => [c, l[i]]));

test('comptage à la main : dix matchs de football-data — buts, résultats, lignes, mi-temps, corners (un 0-0 compte, une case vide non), tirs, cartons, scores', () => {
  const acc = L.nouvelAccumulateur();
  for (const l of E0_2122) L.ajouter(acc, L.valeursDUneLigneFd(ligneFd(l)), l[0]);
  assert.equal(acc.matchs, 10);
  // Scores 2-1, 0-0, 1-1, 3-2, 0-1, 2-0, 1-0, 4-0, 2-2, 0-3 : 25 buts, 15 à domicile, 10 à l'extérieur.
  assert.ok(proche(valeur(acc, 'buts'), 2.5));
  assert.ok(proche(valeur(acc, 'buts_dom'), 1.5));
  assert.ok(proche(valeur(acc, 'buts_ext'), 1));
  assert.ok(proche(valeur(acc, 'avantage_terrain'), 0.5));
  // 5 victoires à domicile, 3 nuls, 2 à l'extérieur ; 7 matchs à 2 buts ou plus, 5 à 3 ou plus, 3 à 4 ou plus ; 4 où les deux marquent.
  assert.deepEqual(['victoires_dom', 'nuls', 'victoires_ext', 'plus_1_5', 'plus_2_5', 'plus_3_5', 'deux_marquent'].map((c) => valeur(acc, c)), [0.5, 0.3, 0.2, 0.7, 0.5, 0.3, 0.4]);
  // Mi-temps : 9 matchs avec le score à la mi-temps (1+0+1+3+0+1+2+2+2 = 12 buts avant la pause, 23 − 12 = 11 après).
  assert.equal(n(acc, 'buts_1re_mt'), 9);
  assert.ok(proche(valeur(acc, 'buts_1re_mt'), 12 / 9));
  assert.ok(proche(valeur(acc, 'buts_2e_mt'), 11 / 9));
  // Corners : la case vide ne compte pas (9 matchs), le 0-0 de football-data est un vrai zéro : 73 / 9.
  assert.equal(n(acc, 'corners'), 9);
  assert.ok(proche(valeur(acc, 'corners'), 73 / 9));
  assert.ok(proche(valeur(acc, 'corners_dom'), 42 / 9));
  assert.ok(proche(valeur(acc, 'tirs'), 22.1));
  assert.ok(proche(valeur(acc, 'tirs_cadres'), 8.3));
  // Cartons : deux matchs sans carton chez football-data, ce sont de vrais zéros (10 matchs) — 26 jaunes, 2 rouges.
  assert.equal(n(acc, 'cartons_jaunes'), 10);
  assert.ok(proche(valeur(acc, 'cartons_jaunes'), 2.6));
  assert.ok(proche(valeur(acc, 'cartons_rouges'), 0.2));
  // Ni minute ni penalty chez football-data : rien, jamais 0.
  assert.equal(n(acc, 'penalties'), 0);
  assert.equal(n(acc, 'penalties_tires'), 0);
  // Scores : tous une fois ; à égalité, le moins de buts d'abord.
  assert.deepEqual(L.scoresTries(acc.scores).slice(0, 4), [['0-0', 1], ['0-1', 1], ['1-0', 1], ['1-1', 1]]);
  // Mois par mois : août (2 matchs, 3 buts), septembre (2, 7 buts).
  assert.deepEqual(acc.reperes.buts.mois['08'].slice(0, 2), [2, 3]);
  assert.deepEqual(acc.reperes.buts.mois['09'].slice(0, 2), [2, 7]);
  // Moyenne et écart-type d'un match se refont depuis une ligne gardée (valeur, matchs, écart) sans rien relire.
  const m = L.moyenneEtEcart(acc.reperes.buts);
  assert.ok(proche(m.ecart, Math.sqrt((9 + 0 + 4 + 25 + 1 + 4 + 1 + 16 + 16 + 9 - 62.5) / 9)));
  const s = L.sommesDe(m);
  assert.ok(proche(s.s, 25) && proche(s.s2, acc.reperes.buts.s2, 1e-6));
});

/** Une rencontre FotMob fabriquée. */
const rencontre = (hg, ag, { buts = [], tirs = null, stats = null, meta = {}, date = '2025-09-13', k = `essai-${hg}-${ag}` } = {}) => ({
  k,
  date,
  homeGoals: hg,
  awayGoals: ag,
  meta,
  events: buts === null ? null : buts.map(([minute, side, detail = null, ownGoal = false, addedTime = null]) => ({ type: 'goal', minute, side, ...(detail ? { detail } : {}), ...(ownGoal ? { ownGoal } : {}), ...(addedTime ? { addedTime } : {}) })),
  shotmap: tirs,
  stats
});
const stats = (h, a) => ({
  home: { corner_kicks: h[0], total_shots: h[1], shots_on_goal: h[2], yellow_cards: h[3], red_cards: h[4] },
  away: { corner_kicks: a[0], total_shots: a[1], shots_on_goal: a[2], yellow_cards: a[3], red_cards: a[4] }
});

test('comptage à la main : rencontres FotMob — 45+2 en 1re mi-temps, penalty (jamais un contre son camp), carte des tirs sans la séance de tirs au but, déroulé incomplet, 0 des deux côtés « non relevé »', () => {
  const r = [
    // 2-1 : buts à 12', 45+2' (penalty) et 78' ; carte des tirs : un penalty manqué à 30', deux tirs au but de séance (exclus).
    rencontre(2, 1, {
      buts: [[12, 'home'], [45, 'home', 'Penalty', false, 2], [78, 'away']],
      tirs: [{ situation: 'penalty', minute: 30, result: 'miss' }, { situation: 'penalty', minute: 45, result: 'goal' }, { situation: 'regularplay', minute: 50 }, { situation: 'penalty', minute: 121 }, { situation: 'penalty', minute: 122 }],
      stats: stats([6, 15, 5, 2, 0], [3, 9, 2, 1, 0])
    }),
    // 1-1 : un contre son camp noté « Penalty » ne compte pas comme penalty ; corners 0-0 = non relevé ; cartons relevés.
    rencontre(1, 1, { buts: [[60, 'home', 'Penalty', true], [88, 'away']], stats: stats([0, 12, 4, 3, 0], [0, 10, 3, 2, 1]) }),
    // 0-0 : déroulé complet (aucun but) ; jaunes à 0 des deux côtés avec un rouge (le cas argentin) : cartons non relevés.
    rencontre(0, 0, { buts: [], stats: stats([4, 8, 2, 0, 1], [5, 7, 1, 0, 0]) }),
    // 3-0 : déroulé incomplet (deux buts pour trois) : ni mi-temps ni penalties ; statistiques absentes.
    rencontre(3, 0, { buts: [[10, 'home'], [20, 'home']], stats: null }),
    // 1-0 : sans déroulé du tout ; tirs 0-0 = non relevé.
    rencontre(1, 0, { buts: null, stats: stats([7, 0, 0, 1, 0], [2, 0, 0, 2, 0]) })
  ];
  const { acc, exclus } = L.calculerSaisonFotmob(r);
  assert.deepEqual(exclus, { attribues: 0, nonJoues: 0, horsClassement: 0, prolongations: 0 });
  assert.equal(acc.matchs, 5);
  assert.ok(proche(valeur(acc, 'buts'), (3 + 2 + 0 + 3 + 1) / 5));
  // Mi-temps : trois matchs au déroulé complet (2-1, 1-1, 0-0) — 2 buts avant la pause (12', 45+2'), 3 après.
  assert.equal(n(acc, 'buts_1re_mt'), 3);
  assert.ok(proche(valeur(acc, 'buts_1re_mt'), 2 / 3));
  assert.ok(proche(valeur(acc, 'buts_2e_mt'), 3 / 3));
  // Penalties marqués : un seul (le 45+2'), sur les trois matchs au déroulé complet ; le csc « Penalty » ne compte pas.
  assert.equal(n(acc, 'penalties'), 3);
  assert.ok(proche(valeur(acc, 'penalties'), 1 / 3));
  // Penalties tirés : la seule carte des tirs, deux penalties dans le temps de jeu (la séance au-delà de 120 exclue).
  assert.equal(n(acc, 'penalties_tires'), 1);
  assert.equal(valeur(acc, 'penalties_tires'), 2);
  // Corners : le 0-0 du 1-1 et le match sans statistiques ne comptent pas — (9 + 9 + 9) / 3.
  assert.equal(n(acc, 'corners'), 3);
  assert.ok(proche(valeur(acc, 'corners'), 9));
  // Tirs : le 0-0 du 1-0 ne compte pas — (24 + 22 + 15) / 3.
  assert.equal(n(acc, 'tirs'), 3);
  assert.ok(proche(valeur(acc, 'tirs'), 61 / 3));
  // Cartons : jaunes relevés pour le 2-1, le 1-1 et le 1-0 (le 0-0 a ses jaunes à 0 : rien, même pas son rouge).
  assert.equal(n(acc, 'cartons_jaunes'), 3);
  assert.ok(proche(valeur(acc, 'cartons_jaunes'), (3 + 5 + 3) / 3));
  assert.equal(n(acc, 'cartons_rouges'), 3);
  assert.ok(proche(valeur(acc, 'cartons_rouges'), 1 / 3));
  // Les règles une par une : FotMob (0 des deux côtés = non relevé) et football-data (un 0 est un zéro).
  assert.equal(L.paireRelevee(0, 0), null);
  assert.deepEqual(L.paireRelevee(0, 2), [0, 2]);
  assert.equal(L.paireRelevee(null, 3), null);
  assert.deepEqual(L.paireFd(0, 0), [0, 0]);
  assert.equal(L.paireFd(null, 0), null);
  assert.equal(L.cartonsReleves(0, 0, 1, 0), null, 'jaunes à 0 des deux côtés : rien, même pas le rouge');
  assert.deepEqual(L.cartonsReleves(2, 1, null, null), { jaunes: 3, rouges: null });
  assert.deepEqual(L.cartonsFd(0, 0, 0, 0), { jaunes: 0, rouges: 0 });
});

// ===================================================== 2. les exclusions

test('exclusions : résultat attribué (deux façons), annulé ou reporté, hors classement (barrage, playoff, tour « 1/4 »), prolongation — comptés par raison, jamais dans les repères', () => {
  const r = [
    rencontre(1, 0, { k: 'a', meta: { round: '3' } }),
    rencontre(3, 0, { k: 'b', meta: { round: '4', awarded: 1 } }),
    rencontre(3, 0, { k: 'c', meta: { round: '5', reason: 'awarded_win' } }),
    rencontre(0, 3, { k: 'd', meta: { round: '6', reason: 'id_reused' } }),
    rencontre(2, 2, { k: 'e', meta: { round: '7', reason: 'postponed' } }),
    rencontre(1, 1, { k: 'f', meta: { round: '7', reason: 'cancelled' } }),
    rencontre(2, 1, { k: 'g', meta: { leagueKey: 'ENG|Championship Playoff', round: '1/2' } }),
    rencontre(1, 2, { k: 'h', meta: { leagueKey: 'NED|Eredivisie Qualification', round: 'final' } }),
    rencontre(1, 1, { k: 'i', meta: { leagueKey: 'MEX|Liga MX Apertura Playoff', round: '1/4' } }),
    rencontre(1, 1, { k: 'j', meta: { round: '12', reason: 'afterextra' } }),
    rencontre(0, 0, { k: 'k', meta: { round: '13', reason: 'afterpenalties' } }),
    // Un playoff à journées numérotées (Danemark) compte, comme la table officielle.
    rencontre(4, 0, { k: 'l', meta: { leagueKey: 'DEN|Superliga Playoff', round: '3' } })
  ];
  const { acc, exclus, exclusCles } = L.calculerSaisonFotmob(r);
  assert.deepEqual(exclus, { attribues: 3, nonJoues: 2, horsClassement: 3, prolongations: 2 });
  assert.deepEqual(exclusCles, ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
  assert.equal(acc.matchs, 2);
  assert.ok(proche(valeur(acc, 'buts'), (1 + 4) / 2), 'seuls le 1-0 et le 4-0 du playoff numéroté comptent');
  assert.equal(L.exclusionDUneRencontre({ homeGoals: null, awayGoals: null, meta: {} }), 'nonJoues');
});

test('les coupes sont tenues à part : jamais de repère pour elles (route et attendus le disent) ; dans la copie, aucune ligne de coupe', () => {
  assert.equal(calcul.coupe.etat, 'coupe');
  assert.match(calcul.coupe.raison, /coupes sont tenues à part \(terrain neutre, prolongations, tirs au but\)/);
  assert.deepEqual(calcul.coupe.saisons, []);
  assert.equal(calcul.attendusCoupe.etat, 'coupe');
  const coupes = ['EFL Cup', 'DFB Pokal - Germany', 'Copa Chile', 'Coupe de Chine', 'UEFA Champions League', 'Leagues Cup', 'Copa Libertadores'];
  for (const c of coupes) assert.equal(calcul.comptes[c], undefined, `${c} : aucune ligne`);
  assert.equal(calcul.bilan.championnats, 16, 'les 16 championnats de la base d’essai, sans ses 16 coupes');
  assert.equal(calcul.inconnu.etat, 'inconnu');
});

// ========================================= 3. saisons civiles et sources

test('saisons civiles (seasonWindows.js) : MLS 31/12 → « 2025 », 01/01 → « 2026 » ; Premier League 30/06 → « 2024-25 », 01/07 → « 2025-26 » ; Liga MX en juillet-juin ; une saison se lit mois par mois', () => {
  const lignes = (dates) => dates.map((date, i) => ({ k: `k${i}`, date, u: 'x' }));
  assert.deepEqual(L.saisonsFotmob('MLS', lignes(['2025-12-31', '2026-01-01', '2026-10-04'])).map((s) => [s.saison, s.rencontres]), [['2025', 1], ['2026', 2]]);
  assert.deepEqual(L.saisonsFotmob('EPL', lignes(['2025-06-30', '2025-07-01'])).map((s) => s.saison), ['2024-25', '2025-26']);
  assert.deepEqual(L.saisonsFotmob('Liga MX', lignes(['2024-01-20'])).map((s) => s.saison), ['2023-24']);
  assert.deepEqual(L.saisonsFotmob('Allsvenskan - Sweden', lignes(['2023-04-01'])).map((s) => [s.saison, s.entiere]), [['2023', true]]);
  assert.deepEqual(L.saisonsFotmob('EPL', lignes(['2023-03-04'])).map((s) => [s.saison, s.entiere]), [['2022-23', false]], 'commencée avant le magasin');
  const mls = L.moisDeLaSaison('MLS', 2026);
  assert.equal(mls.length, 12);
  assert.deepEqual([mls[0], mls.at(-1)], [['2026-01-01', '2026-02-01'], ['2026-12-01', '2027-01-01']]);
  const epl = L.moisDeLaSaison('EPL', 2025);
  assert.deepEqual([epl[0], epl.at(-1)], [['2025-07-01', '2025-08-01'], ['2026-06-01', '2026-07-01']]);
  // L'empreinte d'une saison change avec une rencontre mise à jour.
  const a = L.saisonsFotmob('EPL', [{ k: 'x', date: '2025-08-10', u: '1' }])[0].empreinte;
  const b = L.saisonsFotmob('EPL', [{ k: 'x', date: '2025-08-10', u: '2' }])[0].empreinte;
  assert.notEqual(a, b);
});

test('une saison, une seule source : FotMob quand elle est entière au magasin ; football-data avant ; FotMob partiel sans football-data ; deux saisons football-data de même année (Argentine 2016 et 2016-17) gardées', () => {
  const { retenues, ecartees } = L.choisirLesSources({
    fotmob: [
      { saison: '2025-26', debut: 2025, entiere: true },
      { saison: '2023-24', debut: 2023, entiere: true },
      { saison: '2022-23', debut: 2022, entiere: false },
      { saison: '2021-22', debut: 2021, entiere: false }
    ],
    fd: [
      { saison: '2023-24', debut: 2023 },
      { saison: '2022-23', debut: 2022 },
      { saison: '2016', debut: 2016 },
      { saison: '2016-17', debut: 2016 }
    ]
  });
  assert.deepEqual(retenues.map((s) => [s.saison, s.source, s.partielle]), [
    ['2025-26', 'fotmob', false],
    ['2023-24', 'fotmob', false],
    ['2022-23', 'football-data', false],
    ['2021-22', 'fotmob', true],
    ['2016-17', 'football-data', false],
    ['2016', 'football-data', false]
  ]);
  assert.deepEqual(ecartees.map((s) => [s.saison, s.source]), [['2023-24', 'football-data'], ['2022-23', 'fotmob']]);
  assert.match(ecartees[0].raison, /entière au magasin FotMob, qui fait foi/);
  assert.match(ecartees[1].raison, /commencée avant le magasin FotMob/);
  assert.equal(L.codeFootballData('EPL'), 'E0');
  assert.equal(L.codeFootballData('MLS'), 'USA');
  assert.equal(L.codeFootballData('Virsliga - Latvia'), null);
  assert.equal(L.fichierFootballData('E0', '2019-20'), 'mmz4281/1920/E0');
  assert.equal(L.fichierFootballData('USA', '2022'), 'new/USA');
});

test('dans une copie : la source sur chaque ligne, le fichier football-data, les chiffres plantés retrouvés, « non relevé » dit, les saisons écartées et le recoupement des deux sources', () => {
  const epl = calcul.epl;
  assert.equal(epl.etat, 'pret');
  assert.deepEqual(epl.saisons.map((s) => [s.saison, s.source, s.fichier]), [
    ['2026-27', 'fotmob', null],
    ['2025-26', 'fotmob', null],
    ['2022-23', 'football-data', 'mmz4281/2223/E0'],
    ['2021-22', 'football-data', 'mmz4281/2122/E0'],
    ['2019-20', 'football-data', 'mmz4281/1920/E0']
  ]);
  const s2122 = epl.saisons.find((s) => s.saison === '2021-22');
  assert.equal(s2122.matchs, 10);
  assert.ok(proche(s2122.reperes.buts.valeur, 2.5));
  assert.ok(proche(s2122.reperes.corners.valeur, 73 / 9) && s2122.reperes.corners.matchs === 9);
  assert.equal(s2122.reperes.penalties.valeur, null);
  assert.equal(s2122.reperes.penalties.nonReleve, 'non relevé par football-data.co.uk');
  assert.deepEqual(s2122.scores.slice(0, 3), [['0-0', 1], ['0-1', 1], ['1-0', 1]]);
  assert.ok(proche(epl.saisons.find((s) => s.saison === '2022-23').reperes.buts.valeur, 22 / 8));
  // La saison 2025-26 FotMob : le résultat attribué planté est écarté et compté.
  const s2526 = epl.saisons.find((s) => s.saison === '2025-26');
  assert.equal(s2526.exclus.attribues, 1);
  assert.equal(s2526.matchs, calcul.plante.recopiees2526 - 1);
  assert.match(s2526.reperes.buts_1re_mt.nonReleve, /aucune feuille FotMob/, 'pas de déroulé dans la base d’essai pour ces matchs');
  assert.equal(epl.saisons[0].enCours, true);
  // La MLS : sa saison 2022 vient du fichier par pays (score final seulement).
  assert.deepEqual(calcul.mls.saisons.map((s) => [s.saison, s.source, s.fichier]), [['2026', 'fotmob', null], ['2022', 'football-data', 'new/USA']]);
  const usa = calcul.mls.saisons[1];
  assert.ok(proche(usa.reperes.buts.valeur, 15 / 6));
  assert.match(usa.reperes.corners.nonReleve, /pas dans le fichier par pays de football-data\.co\.uk/);
  // Toutes les saisons : les sources comptées ; la saison football-data 2025-26 écartée parce que FotMob l'a entière.
  assert.deepEqual(epl.toutes.sources, { fotmob: 2, 'football-data': 3 });
  assert.deepEqual(epl.toutes.ecartees.map((e) => [e.saison, e.source]), [['2025-26', 'football-data']]);
  // Le recoupement : même saison chez les deux ; FotMob a écarté le résultat attribué que football-data compte.
  const c = epl.toutes.recoupement;
  assert.deepEqual(c.saisons, ['2025-26']);
  assert.equal(c.reperes.buts.matchsFotmob + 1, c.reperes.buts.matchsFootballData);
  assert.ok(proche(c.reperes.buts.ecart, c.reperes.buts.footballData - c.reperes.buts.fotmob));
  assert.equal(c.reperes.penalties, undefined, 'pas de penalties chez football-data : rien à recouper');
  // La dispersion ne mesure pas le résultat attribué (une rencontre qui aurait sa fenêtre) : décompte témoin.
  assert.equal(calcul.ciblesEpl.avecAttribue, calcul.ciblesEpl.temoin + 1, 'le match attribué aurait été mesuré');
  assert.equal(calcul.ciblesEpl.module, calcul.ciblesEpl.temoin);
  // Chaque ligne de la table porte sa date de calcul (l'heure figée de l'essai).
  assert.equal(epl.calculeLe, '2026-10-05T12:00:00.000Z');
});

// ================================ 4. dispersion, facteur de terrain, fenêtres

/** Générateur pseudo-aléatoire à graine (mulberry32) : le même tirage à chaque essai. */
function graine(s) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Un championnat SIMULÉ : 20 clubs aux forces très différentes (2 à 9 corners
 * produits ou concédés), quatre saisons aller-retour, le club qui reçoit tiré
 * au sort à chaque match ; chaque compte suit une binomiale négative de 1/k
 * connu autour de facteur × (attaque + défense adverse) / 2.
 */
function simuler({ invK, dom, ext, g = 7 }) {
  const u = graine(g);
  const normale = () => {
    let x = 0;
    for (let i = 0; i < 12; i++) x += u();
    return x - 6;
  };
  const gamma = (forme) => {
    const d = forme - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x;
      let v;
      do {
        x = normale();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const w = u();
      if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const poisson = (l) => {
    const seuil = Math.exp(-l);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= u();
    } while (p > seuil);
    return k - 1;
  };
  const nb = (m) => poisson(gamma(1 / invK) * m * invK);
  const attaque = Array.from({ length: 20 }, () => 2 + 7 * u());
  const defense = Array.from({ length: 20 }, () => 2 + 7 * u());
  const rencontres = [];
  let jour = Date.parse('2022-08-01T00:00:00Z');
  for (let s = 0; s < 4; s++) {
    for (let tour = 0; tour < 38; tour++) {
      const date = new Date(jour).toISOString().slice(0, 10);
      jour += 7 * 86_400_000;
      const ordre = [0, ...Array.from({ length: 19 }, (_, i) => ((i + (tour % 19)) % 19) + 1)];
      for (let i = 0; i < 10; i++) {
        let h = ordre[i];
        let a = ordre[19 - i];
        if (u() < 0.5) [h, a] = [a, h];
        rencontres.push({ k: `${date}-${h}-${a}`, date, h: `club-${h}`, a: `club-${a}`, stats: { home: { c: nb((dom * (attaque[h] + defense[a])) / 2) }, away: { c: nb((ext * (attaque[a] + defense[h])) / 2) } } });
      }
    }
  }
  return rencontres;
}

function mesurer(rencontres) {
  const historiques = L.preparerHistoriques(rencontres);
  const z = L.reunirMesures([]);
  const facteur = L.facteurTerrainDuMoteur();
  const paires = [];
  for (const m of rencontres) {
    const h = L.fenetreAvant(historiques.get(m.h), m.date, 'c');
    const a = L.fenetreAvant(historiques.get(m.a), m.date, 'c');
    if (!h || !a) continue;
    const e = { xh: m.stats.home.c, xa: m.stats.away.c, eh: (h.pour + a.contre) / 2, ea: (a.pour + h.contre) / 2 };
    paires.push(e);
    L.ajouterALaMesure(z, e, facteur);
  }
  return { n: z.n, dom: L.facteurMesure(z.dom, z.n), ext: L.facteurMesure(z.ext, z.n), equipe: L.dispersionMesuree(z.equipe, z.n), total: L.dispersionMesuree(z.total, z.n), brute: L.dispersionBrute(z), paires };
}

/**
 * L'ORACLE, écrit ici sans les fonctions du module : facteur = Σ relevé / Σ attendu neutre ; 1/k = Σ [(x − μ)² − μ] / Σ μ²
 * autour de μ = 1,10 × attendu (0,90 à l'extérieur), le match pour unité (erreur type de l'estimateur de ratio) ; brute =
 * la même chose autour de la seule moyenne du championnat, domicile et extérieur à part.
 */
function oracle(paires) {
  const n = paires.length;
  const somme = (f) => paires.reduce((t, p) => t + f(p), 0);
  const fDom = somme((p) => p.xh) / somme((p) => p.eh);
  const fExt = somme((p) => p.xa) / somme((p) => p.ea);
  const a = (p) => (p.xh - 1.1 * p.eh) ** 2 - 1.1 * p.eh + (p.xa - 0.9 * p.ea) ** 2 - 0.9 * p.ea;
  const b = (p) => (1.1 * p.eh) ** 2 + (0.9 * p.ea) ** 2;
  const k = somme(a) / somme(b);
  const se = (Math.sqrt(somme((p) => (a(p) - k * b(p)) ** 2)) / somme(b)) * Math.sqrt(n / (n - 1));
  const mh = somme((p) => p.xh) / n;
  const ma = somme((p) => p.xa) / n;
  const brute = (somme((p) => (p.xh - mh) ** 2 - mh) + somme((p) => (p.xa - ma) ** 2 - ma)) / (n * mh * mh + n * ma * ma);
  const at = (p) => (p.xh + p.xa - 1.1 * p.eh - 0.9 * p.ea) ** 2 - (1.1 * p.eh + 0.9 * p.ea);
  const total = somme(at) / somme((p) => (1.1 * p.eh + 0.9 * p.ea) ** 2);
  return { fDom, fExt, k, se, brute, total };
}

test('dispersion CONDITIONNELLE face à la dispersion BRUTE (championnat simulé, 1/k connu) : autour de l’attendu de chaque équipe, la mesure suit le vrai 1/k ; sur les comptes bruts, elle mêle l’écart entre équipes et sort plus forte', () => {
  const a = mesurer(simuler({ invK: 0.06, dom: 1.1, ext: 0.9 }));
  assert.ok(a.n > 1000, `${a.n} matchs mesurés`);
  // Les formules du module = l'oracle écrit dans ce test.
  const o = oracle(a.paires);
  assert.ok(proche(a.dom.valeur, o.fDom, 1e-12) && proche(a.ext.valeur, o.fExt, 1e-12), 'facteurs');
  assert.ok(proche(a.equipe.valeur, o.k, 1e-12) && proche(a.equipe.se, o.se, 1e-12), '1/k par équipe et son erreur type');
  assert.ok(proche(a.total.valeur, o.total, 1e-12), '1/k du total');
  assert.ok(proche(a.brute.equipe, o.brute, 1e-12), 'dispersion brute');
  // Autour de l'attendu : le vrai 1/k plus le bruit de la fenêtre de 10 matchs (ce que le moteur subit), jamais en dessous.
  assert.ok(a.equipe.valeur > 0.06 - 2 * a.equipe.se && a.equipe.valeur < 0.06 + 0.06, `1/k mesuré ${a.equipe.valeur}`);
  // Sur les comptes bruts : l'écart entre clubs s'ajoute — nettement plus fort.
  assert.ok(a.brute.equipe > a.equipe.valeur + 0.02, `brute ${a.brute.equipe} contre ${a.equipe.valeur}`);
  assert.ok(a.brute.total > a.total.valeur, 'idem pour le total du match');
  // La mesure suit la vérité : 1/k de 0,15 donne une mesure bien plus forte, toujours sous la brute.
  const b = mesurer(simuler({ invK: 0.15, dom: 1.1, ext: 0.9 }));
  assert.ok(b.equipe.valeur > a.equipe.valeur + 0.07, `${b.equipe.valeur} contre ${a.equipe.valeur}`);
  assert.ok(b.brute.equipe > b.equipe.valeur);
  // L'erreur type a l'ordre de grandeur d'un vrai écart (ni nulle, ni énorme).
  assert.ok(a.equipe.se > 0.002 && a.equipe.se < 0.03, `erreur type ${a.equipe.se}`);
});

test('la fenêtre d’un club : du plus récent au plus ancien, domicile et extérieur mêlés, jamais le jour même, un 0 des deux côtés sauté, au moins 6, au plus 10', () => {
  const m = (date, cote, pour, contre) => ({ date, h: cote === 'home' ? 'X' : 'Y', a: cote === 'home' ? 'Y' : 'X', stats: { home: { c: cote === 'home' ? pour : contre }, away: { c: cote === 'home' ? contre : pour } } });
  const liste = [
    m('2025-08-01', 'home', 5, 2),
    m('2025-08-08', 'away', 4, 3),
    m('2025-08-15', 'home', 0, 0), // non relevé : sauté
    m('2025-08-22', 'away', 6, 1),
    m('2025-08-29', 'home', 3, 3),
    m('2025-09-05', 'away', 2, 5),
    m('2025-09-12', 'home', 7, 0),
    m('2025-09-19', 'away', 1, 4),
    m('2025-09-26', 'home', 9, 9) // le jour de la rencontre : jamais dans sa propre fenêtre
  ];
  const hist = L.preparerHistoriques(liste).get('X');
  const f = L.fenetreAvant(hist, '2025-09-26', 'c');
  assert.deepEqual(f, { pour: (5 + 4 + 6 + 3 + 2 + 7 + 1) / 7, contre: (2 + 3 + 1 + 3 + 5 + 0 + 4) / 7, n: 7 });
  assert.equal(L.fenetreAvant(hist, '2025-09-12', 'c'), null, 'cinq relevés seulement avant le 12/09 : pas de fenêtre');
  // Plus de dix relevés : les dix plus récents.
  const longue = Array.from({ length: 14 }, (_, i) => m(`2025-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${i % 2 ? '20' : '05'}`, i % 2 ? 'away' : 'home', i, 0));
  const g = L.fenetreAvant(L.preparerHistoriques(longue).get('X'), '2026-01-01', 'c');
  assert.equal(g.n, 10);
  assert.ok(proche(g.pour, (4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13) / 10));
});

test('facteur de terrain mesuré hors échantillon : le vrai facteur retrouvé (1,20 / 0,82 simulés), le 1,10 / 0,90 du moteur hors de l’intervalle à 95 % ; dans un championnat au facteur du moteur, il y reste', () => {
  const vrai = mesurer(simuler({ invK: 0.08, dom: 1.2, ext: 0.82 }));
  assert.ok(Math.abs(vrai.dom.valeur - 1.2) < 3 * vrai.dom.se, `domicile ${vrai.dom.valeur} ± ${vrai.dom.se}`);
  assert.ok(Math.abs(vrai.ext.valeur - 0.82) < 3 * vrai.ext.se, `extérieur ${vrai.ext.valeur} ± ${vrai.ext.se}`);
  assert.ok(1.1 < vrai.dom.valeur - 1.96 * vrai.dom.se, 'le 1,10 du moteur sous l’intervalle');
  const moteur = mesurer(simuler({ invK: 0.08, dom: 1.1, ext: 0.9 }));
  assert.ok(Math.abs(moteur.dom.valeur - 1.1) < 1.96 * moteur.dom.se, `domicile ${moteur.dom.valeur} ± ${moteur.dom.se}`);
  assert.ok(Math.abs(moteur.ext.valeur - 0.9) < 1.96 * moteur.ext.se, `extérieur ${moteur.ext.valeur} ± ${moteur.ext.se}`);
});

test('les fenêtres du calcul sont celles du moteur : 10 derniers matchs relevés, toutes compétitions, au moins 6 (statInputsRead), comparées à statInputsFromStore sur la base d’essai ; le facteur et l’attendu de statMarkets.js', async () => {
  const f = phase('fenetres');
  assert.deepEqual(f.constantes, { STAT_SAMPLE: L.FENETRE_STATS, STAT_MIN_SAMPLE: L.MINIMUM_FENETRE });
  assert.ok(f.comparaisons.length >= 300, `${f.comparaisons.length} comparaisons`);
  let pleines = 0;
  for (const c of f.comparaisons) {
    for (const i of [0, 1]) {
      const nous = c.nous[i];
      const moteur = c.moteur[i];
      if (!moteur) {
        assert.equal(nous, null, `${c.k} ${c.stat} : le moteur n'a pas de fenêtre, nous non plus`);
        continue;
      }
      pleines++;
      assert.ok(nous && proche(nous.for, moteur.for) && proche(nous.against, moteur.against) && nous.sample === moteur.sample, `${c.k} ${c.stat} : ${JSON.stringify(nous)} contre ${JSON.stringify(moteur)}`);
    }
  }
  assert.ok(pleines >= 300, `${pleines} fenêtres comparées`);
  // Le facteur est lu dans le moteur ; l'attendu (facteur × moyenne) est celui de statExpectations, au centième.
  assert.deepEqual(L.facteurTerrainDuMoteur(), { dom: 1.1, ext: 0.9 });
  const u = graine(3);
  for (let i = 0; i < 200; i++) {
    const h = { for: 2 + 8 * u(), against: 2 + 8 * u() };
    const a = { for: 2 + 8 * u(), against: 2 + 8 * u() };
    const e = statExpectations({ statInputs: { home: { corners: h }, away: { corners: a } } }).corners;
    assert.ok(Math.abs(1.1 * ((h.for + a.against) / 2) - e.home) <= 0.005 && Math.abs(0.9 * ((a.for + h.against) / 2) - e.away) <= 0.005);
  }
});

// ===================================== 5. petits championnats et attendus

test('petits championnats ramenés vers la moyenne générale : un grand championnat bouge à peine, un petit aux chiffres extrêmes est tiré vers la moyenne ; poids = n / (n + k)', () => {
  const championnat = (moyenne, matchs, ecart = 1.65) => ({ n: matchs, s: moyenne * matchs, s2: (ecart ** 2) * (matchs - 1) + moyenne * moyenne * matchs });
  const ligues = [championnat(2.6, 3800), championnat(2.7, 3800), championnat(2.8, 3800), championnat(2.9, 3800), championnat(2.5, 3800), championnat(3.0, 3800), championnat(3.9, 40)];
  const g = L.entreChampionnats(ligues);
  assert.equal(g.ligues, 7);
  // À la main : variance d'un match réunie, variance observée entre les moyennes, moins ce que le hasard y met.
  const moyennes = ligues.map((l) => l.s / l.n);
  const mu = moyennes.reduce((a, b) => a + b, 0) / 7;
  const variance = ligues.reduce((t, l) => t + (l.s2 - (l.s * l.s) / l.n), 0) / ligues.reduce((t, l) => t + l.n - 1, 0);
  const observee = moyennes.reduce((t, m) => t + (m - mu) ** 2, 0) / 6;
  const bruit = ligues.reduce((t, l) => t + variance / l.n, 0) / 7;
  assert.ok(proche(g.variance, variance, 1e-9) && proche(g.tau2, observee - bruit, 1e-12), `τ² ${g.tau2} contre ${observee - bruit}`);
  assert.ok(proche(g.moyenne, (2.6 + 2.7 + 2.8 + 2.9 + 2.5 + 3.0 + 3.9) / 7), 'chacun compte pour un');
  assert.ok(g.tau2 > 0 && proche(g.k, g.variance / g.tau2));
  const grand = L.retenir(3.0, 3800, g);
  const petit = L.retenir(3.9, 40, g);
  assert.ok(Math.abs(grand - 3.0) < 0.02, `grand championnat : ${grand}`);
  assert.ok(petit < 3.9 - 0.2 && petit > g.moyenne, `petit championnat : ${petit}`);
  assert.ok(proche(petit, (40 * 3.9 + g.k * g.moyenne) / (40 + g.k)));
  // Des championnats qui ne diffèrent pas plus que le hasard : la moyenne générale l'emporte.
  const pareils = L.entreChampionnats([championnat(2.7, 400), championnat(2.7, 400), championnat(2.7, 400)]);
  assert.equal(pareils.tau2, 0);
  assert.ok(Math.abs(L.retenir(3.5, 50, pareils) - pareils.moyenne) < 1e-6);
  // Mesures de dispersion : la petite (grande erreur type) est plus ramenée que la grande.
  const { mesures } = L.retenirLesMesures(
    { a: { valeur: 0.1, se: 0.005, matchs: 2000 }, b: { valeur: 0.09, se: 0.006, matchs: 1500 }, c: { valeur: 0.11, se: 0.006, matchs: 1500 }, d: { valeur: 0.2, se: 0.05, matchs: 120 } },
    0.1
  );
  assert.ok(Math.abs(mesures.a.retenue - 0.1) < 0.002);
  assert.ok(mesures.d.retenue < 0.15 && mesures.d.poids < mesures.a.poids, `petite mesure : ${mesures.d.retenue}`);
  // Dans la copie : la valeur retenue, son poids et k sont rendus avec les matchs de chaque championnat.
  const b = calcul.epl.toutes.reperes.buts;
  assert.ok(b.matchs > 0 && b.k > 0 && proche(b.poids, b.matchs / (b.matchs + b.k)));
  const gm = calcul.epl.general.reperes.buts.valeur;
  assert.ok((b.retenue - b.valeur) * (gm - b.valeur) >= 0 && Math.abs(b.retenue - b.valeur) <= Math.abs(gm - b.valeur), 'entre la valeur et la moyenne générale');
});

test('pour l’étape 14 : la valeur attendue d’une saison (les cinq saisons les plus proches, jamais elle-même), son écart normal, une saison aberrante repérée', () => {
  const v = calcul.attendus2223;
  assert.equal(v.etat, 'pret');
  assert.equal(v.source, 'football-data');
  const buts = v.reperes.buts;
  assert.ok(!buts.base.saisons.includes('2022-23'), 'jamais elle-même');
  // Les plus proches d'abord : 2021-22 (un an), puis 2019-20 et 2025-26 (trois ans), puis 2026-27.
  assert.deepEqual(buts.base.saisons, ['2021-22', '2019-20', '2025-26', '2026-27']);
  assert.ok(buts.ecartMatch > 0.5 && buts.ecartMatch < 3);
  assert.ok(buts.ecartSaison > 0 && buts.ecartSaison < buts.ecartMatch);
  assert.ok(proche(buts.ecarts, (buts.valeur - buts.attendu) / buts.ecartSaison));
  // La saison aberrante plantée (2019-20 : 25 corners par match) sort de plus de trois écarts normaux ; ses buts, non.
  const ab = calcul.attendusAberrant;
  assert.ok(ab.reperes.corners.ecarts > 3, `corners : ${ab.reperes.corners.ecarts}`);
  assert.ok(Math.abs(ab.reperes.buts.ecarts) < 2, `buts : ${ab.reperes.buts.ecarts}`);
  // La variance d'une saison à l'autre : ce que le hasard met dans les moyennes est retiré.
  const saison = (m, n) => ({ n, s: m * n, s2: 1.6 ** 2 * (n - 1) + m * m * n });
  assert.equal(L.entreSaisons([[saison(2.7, 380), saison(2.7, 380), saison(2.7, 380)]]), 0);
  // À la main : (0,09 + 0 + 0,09 − 3 × variance / 380) / 2, la variance d'un match réunie sur les trois saisons.
  const trois = [saison(2.4, 380), saison(2.7, 380), saison(3.0, 380)];
  const s = trois.reduce((t, x) => t + x.s, 0);
  const s2 = trois.reduce((t, x) => t + x.s2, 0);
  const varMatch = (s2 - (s * s) / 1140) / 1139;
  assert.ok(proche(L.entreSaisons([trois]), (0.18 - (3 * varMatch) / 380) / 2, 1e-12));
  // L'écart normal d'une saison = √(variance vraie entre saisons + variance d'un match / matchs), exactement.
  const c = calcul.attendusAberrant.reperes.corners;
  assert.ok(calcul.general.corners.tau2Saisons > 0);
  assert.ok(proche(c.ecartSaison, Math.sqrt(calcul.general.corners.tau2Saisons + c.ecartMatch ** 2 / c.matchs), 1e-12));
});

// ================================================ 6. la passe de nuit

test('la passe de nuit ne recalcule que ce qui a changé : rien la seconde fois ; une rencontre modifiée, sa saison seule ; un fichier football-data relu, sa saison seule ; une saison disparue, retirée ; « tout » refait tout', () => {
  const i = incremental;
  const total = i.premier.recalculees.fotmob + i.premier.recalculees.footballData;
  assert.equal(i.premier.inchangees, 0);
  assert.deepEqual(i.second.recalculees, { fotmob: 0, footballData: 0 });
  assert.equal(i.second.inchangees, total);
  assert.deepEqual(i.troisieme.recalculees, { fotmob: 1, footballData: 0 });
  assert.equal(i.troisieme.inchangees, total - 1);
  assert.equal(i.buts2526.apres.matchs, i.buts2526.avant.matchs);
  assert.ok(proche(i.buts2526.apres.valeur - i.buts2526.avant.valeur, 1 / i.buts2526.avant.matchs), 'un but de plus dans la saison');
  for (const s of Object.keys(i.calculeLe.avant)) {
    if (s !== '2025-26') assert.equal(i.calculeLe.apres[s], i.calculeLe.avant[s], `${s} : pas recalculée`);
  }
  assert.deepEqual(i.quatrieme.recalculees, { fotmob: 0, footballData: 1 });
  assert.equal(i.cinquieme.retirees, 1);
  assert.ok(i.retireesAvant.includes('2026-27') && !i.retireesApres.includes('2026-27'));
  assert.equal(i.tout.recalculees.fotmob + i.tout.recalculees.footballData, total - 1);
});

test('le serveur n’est jamais figé : le calcul rend la main (setImmediate) entre deux saisons et dans les boucles longues, lit une saison mois par mois, ne tient jamais une lecture ouverte entre deux pauses', () => {
  assert.ok(calcul.pauses >= calcul.bilan.championnats, `${calcul.pauses} pauses pour ${calcul.bilan.championnats} championnats`);
  assert.ok(incremental.second.pausesComptees >= incremental.second.championnats);
  const code = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'db', 'leagueBenchmarks.js'), 'utf8');
  assert.match(code, /const rendreLaMainParDefaut = \(\) => new Promise\(\(fin\) => setImmediate\(fin\)\);/);
  assert.match(code, /if \(Date\.now\(\) - dernierePause > 25\) await pause\(ou\);/);
  assert.match(code, /for \(const \[debut, fin\] of moisDeLaSaison\(league, season\)\)/);
  assert.doesNotMatch(code, /\.iterate\(/, 'jamais un curseur ouvert pendant que le serveur reprend la main');
  assert.equal(typeof calcul.bilan.blocMaxMs, 'number');
  assert.ok('etapesMs' in calcul.bilan && 'blocMaxOu' in calcul.bilan);
});

test('l’étape « reperes » de l’actualisation : une fois par jour de Paris ou au clic, après l’historique football-data, avant les cotes gratuites ; son bilan', () => {
  const e = phase('etape');
  assert.deepEqual(e.due, { jamais: true, hier: true, aujourdhui: false, clic: true });
  const i = e.etapes.indexOf('reperes');
  assert.equal(e.etapes[i - 1], 'historiqueFd');
  // L'étape 17 (table du jour J, 12/10/2026) s'intercale entre les repères et les cotes gratuites.
  assert.equal(e.etapes[i + 1], 'tableJourJ');
  assert.equal(e.etapes[i + 2], 'cotesGratuites');
  assert.equal(e.etapes.filter((x) => x === 'reperes').length, 1);
  assert.equal(e.passe.status, 'ok');
  assert.match(e.passe.summary, /^16 championnats, \d+ saisons \(\d+ FotMob, 3 football-data\) : \d+ recalculées, 0 inchangée, en .+ ; dispersion mesurée sur [\d  ]+ matchs : corners 1\/k 0,\d{3} \(moteur 0,105\), facteur de terrain \d,\d{3} \/ \d,\d{3} \(moteur 1,10 \/ 0,90\), tirs 1\/k 0,\d{3} \(moteur 0,060\)\. Mesuré seulement : rien n’entre dans le moteur\.$/);
  assert.equal(e.passe.changed, false);
  assert.match(e.passeSans.summary, / 0 recalculée, \d+ inchangées/);
});

test('la route GET /api/match-stats/benchmarks : jamais calculé, prêt, coupe, inconnu, sans championnat (400) ; lecture seule (base et data\\runtime intactes) ; déclarée avant /:matchId', () => {
  const r = phase('route');
  assert.equal(r.jamais.code, 200);
  assert.equal(r.jamais.corps.etat, 'jamais');
  assert.deepEqual(r.jamais.corps.saisons, []);
  assert.ok(r.jamais.corps.definitions.length === L.REPERES.length && r.jamais.corps.statistiques.length === 3, 'la forme reste, vide');
  assert.equal(r.pret.corps.etat, 'pret');
  assert.deepEqual(r.pret.corps.saisons.map((s) => s.source), ['fotmob', 'fotmob', 'football-data', 'football-data']);
  assert.equal(r.pret.corps.dispersion.statistiques.length, 3);
  assert.ok(r.pret.corps.base.endsWith('match-stats.db'));
  assert.equal(r.coupe.corps.etat, 'coupe');
  assert.equal(r.inconnu.corps.etat, 'inconnu');
  assert.equal(r.sansLigue.code, 400);
  assert.equal(r.baseInchangeeJamais, true);
  assert.equal(r.baseInchangee, true);
  assert.equal(r.runtimeInchange, true);
  assert.equal(r.match.code, 404, 'un autre chemin reste celui d’un match');
  const routes = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'routes', 'matchStats.routes.js'), 'utf8');
  assert.ok(routes.indexOf("router.get('/benchmarks'") < routes.indexOf("router.get('/:matchId'"));
});

test('lecture du code : aucune ressemblance de nom, rien vers le moteur (facteur et dispersions inchangés, aucun module du moteur n’importe les repères), aucun JSON écrit, la table dans le schéma', () => {
  const code = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'db', 'leagueBenchmarks.js'), 'utf8');
  const imports = [...code.matchAll(/^import .+ from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.filter((i) => /teamNameMatch|oddsProfileRead|statInputsRead|sourceMatching|nameIdentity|identityRegistry/.test(i)), []);
  assert.doesNotMatch(code, /\b(findBestTeamNameMatch|teamNamesLikelyMatch|clubDuMagasin|sharesNameToken|resolveTeamId|levenshtein)\s*\(/i);
  assert.doesNotMatch(code, /from 'node:fs'|writeJsonAtomic|writeFileSync/, 'tout va dans la base : aucun fichier de data/runtime');
  // Le moteur : constantes inchangées, et aucun de ses modules ne lit les repères (étape 33, après le banc d'essai).
  assert.deepEqual(STAT_KINDS, {
    corners: { unit: 'corners', invKTeam: 0.1048, invKTotal: 0.0205 },
    shots: { unit: 'tirs', invKTeam: 0.0599, invKTotal: 0.0138 },
    shotsOnTarget: { unit: 'tirs cadrés', invKTeam: 0.0495, invKTotal: 0.0169 }
  });
  const statMarkets = fs.readFileSync(path.join(SERVEUR, 'src', 'sports', 'football', 'statMarkets.js'), 'utf8');
  assert.match(statMarkets, /const FACTEUR_TERRAIN = \{ home: 1\.1, away: 0\.9 \};/);
  const lecteurs = [];
  for (const dossier of ['core', 'sports']) {
    for (const f of fs.readdirSync(path.join(SERVEUR, 'src', dossier), { recursive: true })) {
      if (!String(f).endsWith('.js')) continue;
      if (fs.readFileSync(path.join(SERVEUR, 'src', dossier, String(f)), 'utf8').includes('leagueBenchmarks')) lecteurs.push(`${dossier}/${f}`);
    }
  }
  assert.deepEqual(lecteurs, [], 'aucun module du moteur ne lit les repères');
  const ddl = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'db', 'matchStatsDb.js'), 'utf8');
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS league_benchmarks \(\n  league TEXT NOT NULL,\n  saison TEXT NOT NULL,\n  repere TEXT NOT NULL,[\s\S]*?matchs INTEGER NOT NULL DEFAULT 0,[\s\S]*?source TEXT NOT NULL,[\s\S]*?calcule_le TEXT NOT NULL,\n  PRIMARY KEY \(league, saison, repere\)\n\) WITHOUT ROWID;/);
  // La passe : l'étape importe le calcul ; l'écran lit la route seulement.
  const job = fs.readFileSync(path.join(SERVEUR, 'src', 'jobs', 'matchStatsAutoRefresh.js'), 'utf8');
  assert.match(job, /import \{ calculerReperes \} from '\.\.\/data\/db\/leagueBenchmarks\.js';/);
  assert.equal((job.match(/key: 'reperes'/g) ?? []).length, 1);
});
