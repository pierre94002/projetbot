/**
 * Le SUIVI DES PARIS, les GARDE-FOUS et les COMPTES BOOKMAKERS (étape 11 du plan).
 *   node --test test/suiviParis.test.mjs        (depuis server/)
 *
 *  1. La ZONE NORMALE des séries de pertes (core/risk/seriesDePertes.js) : un cas connu calculé à la main et par
 *     énumération de toutes les suites possibles ; des probabilités différentes (énumération, puis simulation) ; les
 *     séries d'un carnet (ordre de règlement, paris annulés et en attente écartés).
 *  2. Le SUIVI (data/suiviParis.js) : la somme des gains réels retombe sur le carnet (règle de betsStore), dans
 *     chaque tableau et au bout de la courbe — sur un carnet fabriqué et, dans le bac, sur la COPIE du carnet de
 *     Pierre (lue, jamais écrite) ; le gain attendu seulement pour les paris qui ont leur probabilité ; le total
 *     sans somme de pourcentages, la moyenne par pari ; les tableaux complets même vides.
 *  3. Les GARDE-FOUS (core/risk/gardeFous.js) : le conseil de mise ne dépasse jamais un plafond (500 matchs tirés au
 *     sort, la décision du moteur inchangée), la perte maximale de la semaine (jours de Paris) enclenche le
 *     coupe-circuit existant, rien n'est réglé par défaut.
 *  4. Le VRAI serveur dans une copie isolée (aides/script-suivi.mjs : base d'essai, relevé The Odds API et carnet
 *     FABRIQUÉS, heure figée, réseau coupé) : le moteur plafonné puis coupé, l'interrupteur manuel indépendant,
 *     « J'ai parié » enregistré au-delà de tout (avec ses alertes), la semaine qui tourne, un réglage illisible
 *     (prudence), la fiche d'un compte SANS SECRET (refus, champ ajouté à la main jamais rendu).
 *  5. L'écran dit la même chose que le serveur (alertes du ticket, tableaux vides, phrases) ; lecture du code.
 * Les valeurs attendues sont écrites à la main ou recalculées ici par une autre voie, jamais recopiées du code testé.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as bac from '../src/config/bacASable.js';
import { probabiliteSerieAuPlus, probabiliteSerieAuMoins, zoneNormaleDesSeries, seriesDuCarnet, SEUIL_ZONE_NORMALE } from '../src/core/risk/seriesDePertes.js';
import * as GF from '../src/core/risk/gardeFous.js';
import { rapportDeSuivi, TRANCHES_DE_COTE, NIVEAUX_DE_CONFIANCE } from '../src/data/suiviParis.js';
import { gainAttenduDuPari } from '../src/data/repositories/betsRepository.js';
import { stakingDuMatch, referenceDuMatch } from '../src/core/engine/verdictPari.js';
import { findValueBet } from '../src/core/engine/valueFinder.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';

const UI_SRC = path.resolve(SERVEUR, '..', 'ui', 'src');
const pret = ['gardeFous.js', 'suiviParis.js', 'ticket.js'].every((f) => fs.existsSync(path.join(UI_SRC, 'utils', f)));
const options = { skip: pret ? false : 'ui/src/utils (gardeFous, suiviParis, ticket) manque' };
const UG = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'gardeFous.js')).href) : {};
const US = pret ? await import(pathToFileURL(path.join(UI_SRC, 'utils', 'suiviParis.js')).href) : {};
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-suivi.mjs');
const CONFIG = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
const VOS = ['williamhill', 'sport888', 'betsson', 'nordicbet', 'unibet_nl', 'unibet_se', 'leovegas_se', 'tipico_de', 'coolbet', 'codere_it'];

let graine = 11;
const hasard = () => ((graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} : ${a} ≠ ${b} (± ${tol})`);

/** Le profit net du carnet, la règle de l'écran d'avant (ui/src/stores/betsStore.js), écrite ici une seconde fois. */
function profitDuCarnet(paris) {
  const regles = paris.filter((b) => b.status === 'won' || b.status === 'lost');
  const retours = regles.reduce((s, b) => s + (b.status === 'won' ? b.stake * b.odds : 0), 0);
  const mises = regles.reduce((s, b) => s + b.stake, 0);
  return retours - mises;
}

// ------------------------------------------------------------- un carnet fabriqué

const jambe = (extra = {}) => ({ matchId: 'm', homeName: 'Arsenal', awayName: 'Chelsea', league: 'EPL', market: 'Résultat', pick: 'Arsenal gagne', odds: 2, marketId: 'result', params: { outcome: 'home' }, ...extra });
function pari(id, { status, stake, odds, cree, regle = null, legs = null, p = null, livre = null, ...reste }) {
  const l = legs ?? [jambe({ odds, status, ...(p !== null ? { probabiliteMoteur: p } : {}), ...(livre ? { bookmaker: livre } : {}) })];
  return { id, createdAt: cree, settledAt: regle, status, stake, odds, legs: l, ...(livre ? { bookmaker: livre, bookmakerTitle: livre === 'williamhill' ? 'William Hill' : 'Unibet (NL)' } : {}), ...reste };
}
/** Toutes les formes du carnet : d'avant l'étape 10 (ni bookmaker ni probabilité), « J'ai parié », combinés, annulé, en attente. */
const CARNET = [
  pari('a', { status: 'won', stake: 10, odds: 1.8, cree: '2026-09-20T10:00:00Z', regle: '2026-09-21T20:00:00Z' }),
  pari('b', { status: 'lost', stake: 20, odds: 2.5, cree: '2026-09-22T10:00:00Z', regle: '2026-09-23T20:00:00Z', legs: [jambe({ league: 'La Liga - Spain', market: 'Total buts', pick: 'Plus de 2.5 buts', marketId: 'totalGoals', params: { line: 2.5, side: 'over' }, odds: 2.5, status: 'lost' })] }),
  pari('c', { status: 'void', stake: 5, odds: 1.5, cree: '2026-09-24T10:00:00Z', regle: '2026-09-24T20:00:00Z' }),
  pari('d', { status: 'pending', stake: 7, odds: 3.2, cree: '2026-10-04T10:00:00Z' }),
  pari('e', {
    status: 'won',
    stake: 4,
    odds: 3.06,
    cree: '2026-09-25T10:00:00Z',
    regle: '2026-09-27T21:00:00Z',
    legs: [jambe({ odds: 1.7, status: 'won', probabiliteMoteur: 0.6 }), jambe({ matchId: 'm2', homeName: 'Lyon', awayName: 'Nice', league: 'Ligue 1', odds: 1.8, status: 'won', probabiliteMoteur: 0.58 })]
  }),
  pari('f', { status: 'lost', stake: 3, odds: 4.6, cree: '2026-09-28T10:00:00Z', regle: '2026-09-28T21:00:00Z', nature: 'combine-meme-match', cotePrise: 4.6, legs: [jambe({ odds: 2.3, status: 'won' }), jambe({ market: 'Total corners', pick: 'Plus de 9.5 corners', marketId: 'totalCorners', params: { line: 9.5, side: 'over' }, odds: 2.25, status: 'lost' })] }),
  // « J'ai parié » (étape 10) : bookmaker et probabilité du moteur au moment du pari. Réglés DANS UN AUTRE ORDRE que créés.
  pari('g', { status: 'won', stake: 10, odds: 2.1, cree: '2026-10-01T10:00:00Z', regle: '2026-10-03T20:00:00Z', p: 0.55, livre: 'williamhill' }),
  pari('h', { status: 'lost', stake: 15, odds: 2.3, cree: '2026-10-02T10:00:00Z', regle: '2026-10-02T21:00:00Z', p: 0.48, livre: 'unibet_nl' }),
  pari('i', { status: 'pending', stake: 8, odds: 1.9, cree: '2026-10-05T09:00:00Z', p: 0.6, livre: 'williamhill' }),
  pari('j', { status: 'won', stake: 50, odds: 5.5, cree: '2026-10-03T08:00:00Z', regle: '2026-10-04T15:00:00Z', p: 0.2, livre: 'williamhill' }),
  pari('k', { status: 'lost', stake: 12, odds: 1.3, cree: '2026-09-26T10:00:00Z', regle: '2026-09-26T18:00:00Z' })
];
const MAINTENANT = Date.parse('2026-10-05T12:00:00Z');

// ------------------------------------------------------------------ 1. la zone normale

test('zone normale des séries de pertes — un cas connu : 10 paris à 50 %, comptés sur les 1 024 suites possibles ; « normale jusqu’à 5 », médiane 3', () => {
  const p = Array(10).fill(0.5);
  // Énumération indépendante : chaque suite de 10 issues, sa plus longue série de pertes.
  const compte = Array(11).fill(0);
  for (let m = 0; m < 1024; m++) {
    let serie = 0;
    let max = 0;
    for (let i = 0; i < 10; i++) {
      if ((m >> i) & 1) {
        serie += 1;
        max = Math.max(max, serie);
      } else serie = 0;
    }
    compte[max] += 1;
  }
  let cumul = 0;
  for (let N = 0; N <= 10; N++) {
    cumul += compte[N];
    assert.equal(probabiliteSerieAuPlus(p, N), cumul / 1024, `P(plus longue ≤ ${N})`);
  }
  // À la main (suites sans k pertes de suite, récurrence de type Fibonacci) : 976 sans série de 6, 912 sans série de 5, 144 sans série de 2.
  assert.equal(probabiliteSerieAuPlus(p, 5), 976 / 1024);
  assert.equal(probabiliteSerieAuPlus(p, 4), 912 / 1024);
  assert.equal(probabiliteSerieAuPlus(p, 1), 144 / 1024);
  assert.equal(probabiliteSerieAuMoins(p, 6), 48 / 1024);
  const z = zoneNormaleDesSeries(p);
  assert.deepEqual([z.n, z.jusqua, z.mediane, z.seuil], [10, 5, 3, 0.95], '976/1024 ≥ 95 % > 912/1024 ; 773/1024 ≥ 50 % > 504/1024');
  assert.equal(SEUIL_ZONE_NORMALE, 0.95);
  // Cas limites : jamais gagnant, toujours gagnant, aucun pari, probabilité impossible.
  assert.equal(zoneNormaleDesSeries(Array(7).fill(0)).jusqua, 7);
  assert.equal(zoneNormaleDesSeries(Array(7).fill(1)).jusqua, 0);
  assert.deepEqual(zoneNormaleDesSeries([]), { n: 0, seuil: 0.95, jusqua: null, mediane: null, repartition: [] });
  assert.throws(() => probabiliteSerieAuPlus([0.5, 1.2], 1), /entre 0 et 1/);
  assert.throws(() => probabiliteSerieAuPlus([0.5], -1), /entier/);
});

test('zone normale — des probabilités toutes différentes : le calcul exact = l’énumération des 4 096 suites ; sur 300 paris, = une simulation de 20 000 carnets', () => {
  graine = 2026; // chaque test tire sa propre suite : son résultat ne dépend pas de l'ordre des tests
  const p12 = Array.from({ length: 12 }, () => 0.15 + 0.7 * hasard());
  const loi = Array(13).fill(0);
  for (let m = 0; m < 4096; m++) {
    let pr = 1;
    let serie = 0;
    let max = 0;
    for (let i = 0; i < 12; i++) {
      const perdu = (m >> i) & 1;
      pr *= perdu ? 1 - p12[i] : p12[i];
      serie = perdu ? serie + 1 : 0;
      max = Math.max(max, serie);
    }
    loi[max] += pr;
  }
  let cumul = 0;
  for (let N = 0; N <= 12; N++) {
    cumul += loi[N];
    proche(probabiliteSerieAuPlus(p12, N), cumul, 1e-12, `N = ${N}`);
  }
  // 300 paris aux cotes de 1,30 à 4,00 : la simulation retrouve la zone.
  const p300 = Array.from({ length: 300 }, () => 1 / (1.3 + 2.7 * hasard()));
  const z = zoneNormaleDesSeries(p300);
  let auPlusZone = 0;
  let auPlusMediane = 0;
  const TIRAGES = 20000;
  for (let t = 0; t < TIRAGES; t++) {
    let serie = 0;
    let max = 0;
    for (const p of p300) {
      serie = hasard() < p ? 0 : serie + 1;
      if (serie > max) max = serie;
    }
    if (max <= z.jusqua) auPlusZone += 1;
    if (max <= z.mediane) auPlusMediane += 1;
  }
  proche(auPlusZone / TIRAGES, probabiliteSerieAuPlus(p300, z.jusqua), 0.012, 'P(plus longue ≤ zone)');
  proche(auPlusMediane / TIRAGES, probabiliteSerieAuPlus(p300, z.mediane), 0.02, 'P(plus longue ≤ médiane)');
  assert.ok(probabiliteSerieAuPlus(p300, z.jusqua) >= 0.95 && probabiliteSerieAuPlus(p300, z.jusqua - 1) < 0.95, 'le plus petit N à 95 %');
  // Des cotes plus hautes (on perd plus souvent) : une zone plus large ; plus de paris : une zone au moins aussi large.
  assert.ok(zoneNormaleDesSeries(p300.map((p) => p / 2)).jusqua > z.jusqua);
  assert.ok(zoneNormaleDesSeries([...p300, ...p300]).jusqua >= z.jusqua);
});

test('les séries d’un carnet : la série en cours et la plus longue (la plus récente à égalité), dans l’ordre de RÈGLEMENT ; un pari annulé ou en attente ne compte pas ; hors zone au-delà de « normale jusqu’à N »', () => {
  assert.deepEqual(seriesDuCarnet(['won', 'lost', 'lost', 'won', 'lost', 'lost']), { enCours: 2, plusLongue: 2, debutPlusLongue: 4, finPlusLongue: 5 });
  assert.deepEqual(seriesDuCarnet(['lost', 'lost', 'lost', 'won']), { enCours: 0, plusLongue: 3, debutPlusLongue: 0, finPlusLongue: 2 });
  assert.deepEqual(seriesDuCarnet([]), { enCours: 0, plusLongue: 0, debutPlusLongue: null, finPlusLongue: null });
  assert.throws(() => seriesDuCarnet(['won', 'void']), /annulé ou en attente/);
  // Le carnet fabriqué, dans l'ordre de règlement : a+ , b−, c (annulé), k−, e+, f−, h−, g+, j+ ; d et i en attente.
  const s = GF.etatDesSeries(CARNET);
  assert.equal(s.n, 8, 'huit paris réglés (gagnés ou perdus)');
  assert.deepEqual([s.enCours, s.plusLongue], [0, 2], 'f puis h perdus d’affilée (réglés le 28/09 puis le 02/10), puis g gagné');
  assert.deepEqual([s.plusLongueDu, s.plusLongueAu], ['2026-09-28T21:00:00Z', '2026-10-02T21:00:00Z']);
  // Probabilité de gagner : celle du moteur pour g, h, j (simples notés) ; 1 / cote pour les autres réglés.
  assert.deepEqual(s.sources, { moteur: 3, cote: 5 });
  assert.deepEqual(GF.probabiliteDeGain(CARNET.find((b) => b.id === 'g')), { p: 0.55, source: 'moteur' });
  assert.deepEqual(GF.probabiliteDeGain(CARNET.find((b) => b.id === 'e')), { p: 1 / 3.06, source: 'cote' }, 'un combiné : 1 / sa cote');
  // Hors zone : 10 paris à la cote 2 (une chance sur deux), « normale jusqu'à 5 » ; 6 pertes à la fin la dépassent, 5 non.
  const serie = (pertes) =>
    Array.from({ length: 10 }, (_, i) => pari(`s${i}`, { status: i >= 10 - pertes ? 'lost' : 'won', stake: 10, odds: 2, cree: `2026-10-01T0${Math.floor(i / 10)}:${String(i).padStart(2, '0')}:00Z`, regle: `2026-10-02T10:${String(i).padStart(2, '0')}:00Z` }));
  const six = GF.etatDesSeries(serie(6));
  assert.deepEqual([six.zone.jusqua, six.enCours, six.horsZone], [5, 6, true]);
  proche(six.probaEnCours, 48 / 1024, 1e-12, 'P(au moins 6 pertes de suite sur 10 paris à 50 %)');
  const cinq = GF.etatDesSeries(serie(5));
  assert.deepEqual([cinq.enCours, cinq.horsZone], [5, false]);
  const etatSix = GF.etatDesGardeFous({ paris: serie(6), maintenant: MAINTENANT });
  assert.ok(etatSix.alertes.some((a) => a.code === 'serie-hors-zone' && /Série de 6 pertes d'affilée : au-delà de la zone normale \(jusqu'à 5 sur vos 10 paris réglés/.test(a.texte)));
  assert.equal(etatSix.bloque, false, 'une série hors zone alerte, elle ne coupe pas le conseil');
  assert.ok(!GF.etatDesGardeFous({ paris: serie(5), maintenant: MAINTENANT }).alertes.length);
});

// ------------------------------------------------------------------ 2. le suivi

test('la somme des gains réels = le carnet : au total, dans CHAQUE tableau (chaque pari dans une seule ligne), au bout de la courbe — sur toutes les formes du carnet', () => {
  const r = rapportDeSuivi({ paris: CARNET, vosBookmakers: VOS, maintenant: MAINTENANT });
  const carnet = profitDuCarnet(CARNET);
  // À la main : a +8, b −20, k −12, e +8,24, f −3, h −15, g +11, j +225 = 202,24.
  proche(carnet, 202.24, 1e-9, 'profit du carnet calculé à la main');
  proche(r.carnet.gainReel, carnet, 1e-9, 'gain réel du rapport');
  assert.deepEqual([r.carnet.paris, r.carnet.regles, r.carnet.gagnes, r.carnet.perdus, r.carnet.annules, r.carnet.enAttente], [11, 8, 4, 4, 1, 2]);
  for (const t of r.tableaux) {
    proche(t.lignes.reduce((s, l) => s + l.gainReel, 0), carnet, 1e-9, `Σ des lignes « ${t.titre} »`);
    proche(t.total.gainReel, carnet, 1e-9, `total « ${t.titre} »`);
    assert.equal(t.lignes.reduce((s, l) => s + l.paris, 0), CARNET.length, `chaque pari dans une ligne de « ${t.titre} »`);
    proche(t.total.mise, 10 + 20 + 12 + 4 + 3 + 15 + 10 + 50, 1e-9, `misé « ${t.titre} » (paris réglés)`);
  }
  proche(r.courbe.points.at(-1).carnet, carnet, 1e-9, 'la courbe finit sur le carnet');
  assert.equal(r.courbe.points.length, 8);
  assert.deepEqual(r.courbe.points.map((p) => p.id), ['a', 'b', 'k', 'e', 'f', 'h', 'g', 'j'], 'dans l’ordre de règlement');
  // Le carnet pari par pari : tous, du plus récent au plus ancien, chacun son gain réel.
  assert.deepEqual(r.paris.map((p) => p.id), ['i', 'd', 'j', 'h', 'g', 'f', 'k', 'e', 'c', 'b', 'a']);
  proche(r.paris.reduce((s, p) => s + (p.gainReel ?? 0), 0), carnet, 1e-9);
  assert.deepEqual([r.paris.find((p) => p.id === 'c').gainReel, r.paris.find((p) => p.id === 'd').gainReel], [null, null], 'annulé, en attente : pas de gain réel');
  // Une date illisible (carnet modifié à la main) ne casse rien : le gain compte, le point de la courbe garde sa place, sans heure.
  const abime = [...CARNET, pari('abime', { status: 'won', stake: 10, odds: 2, cree: 'pas une date' })];
  const ra = rapportDeSuivi({ paris: abime, vosBookmakers: VOS, maintenant: MAINTENANT });
  proche(ra.carnet.gainReel, carnet + 10, 1e-9);
  assert.deepEqual(ra.courbe.points.filter((p) => p.id === 'abime').map((p) => p.t), [null]);
  for (const t of ra.tableaux) proche(t.total.gainReel, carnet + 10, 1e-9, t.titre);
});

test('le gain attendu : SEULEMENT pour les paris simples qui ont leur probabilité du moment (combiné : étape 28 ; pari d’avant : non noté) — réglés à part des paris en attente ; son écart-type à la main', () => {
  const r = rapportDeSuivi({ paris: CARNET, vosBookmakers: VOS, maintenant: MAINTENANT });
  const a = r.attendu;
  assert.equal(a.parisAvecProbabilite, 4, 'g, h, i, j');
  assert.equal(a.regles, 3, 'g, h, j réglés ; i en attente');
  // À la main : g 10 × (0,55 × 2,1 − 1) = 1,55 ; h 15 × (0,48 × 2,3 − 1) = 1,56 ; j 50 × (0,2 × 5,5 − 1) = 5.
  proche(a.gainAttendu, 1.55 + 1.56 + 5, 1e-9);
  assert.equal(a.gainAttendu, ['g', 'h', 'j'].reduce((s, id) => s + gainAttenduDuPari(CARNET.find((b) => b.id === id)).montant, 0), 'la règle du serveur (gainAttenduDuPari)');
  proche(a.gainReel, 11 - 15 + 225, 1e-9, 'le gain réel des MÊMES paris');
  proche(a.ecart, 221 - 8.11, 1e-9);
  // Écart-type du gain réel autour de l'attendu : √Σ mise² × cote² × p (1 − p).
  const sigma = Math.sqrt(10 ** 2 * 2.1 ** 2 * 0.55 * 0.45 + 15 ** 2 * 2.3 ** 2 * 0.48 * 0.52 + 50 ** 2 * 5.5 ** 2 * 0.2 * 0.8);
  proche(a.ecartType, sigma, 1e-9);
  proche(a.zone95[0], 8.11 - 1.96 * sigma, 1e-9);
  assert.deepEqual([a.enAttente.paris, a.enAttente.gainAttendu], [1, 1.12], 'i : 8 × (0,6 × 1,9 − 1)');
  assert.deepEqual(a.sansProbabilite, { nonNote: 5, combines: 2 }, 'a, b, c, d, k sans probabilité ; e et f combinés (probabilités notées ou non)');
  // Dans les tableaux : un gain attendu seulement là où un pari réglé l'a.
  const parLivre = Object.fromEntries(r.tableaux.find((t) => t.cle === 'bookmaker').lignes.map((l) => [l.cle, l]));
  assert.deepEqual([parLivre.williamhill.avecProbabilite, parLivre.unibet_nl.avecProbabilite, parLivre['non-note'].avecProbabilite], [2, 1, 0]);
  proche(parLivre.williamhill.gainAttendu, 6.55, 1e-9);
  assert.equal(parLivre['non-note'].gainAttendu, null, 'non noté, jamais 0');
  assert.equal(parLivre.sport888.gainAttendu, null);
  // Les courbes « gagné » et « attendu » des mêmes paris.
  proche(r.courbe.points.at(-1).attendu, 8.11, 1e-9);
  proche(r.courbe.points.at(-1).gagne, 221, 1e-9);
  assert.equal(r.courbe.avecProbabilite, 3);
});

test('les tableaux : complets même vides (vos bookmakers, les 5 tranches, les 3 niveaux de confiance), TOTAL sans aucun pourcentage, MOYENNE par pari (jamais la moyenne des taux des lignes)', () => {
  const r = rapportDeSuivi({ paris: CARNET, vosBookmakers: VOS, maintenant: MAINTENANT });
  const t = Object.fromEntries(r.tableaux.map((x) => [x.cle, x]));
  assert.deepEqual(Object.keys(t), ['marche', 'championnat', 'bookmaker', 'tranche', 'confiance']);
  assert.deepEqual(t.bookmaker.lignes.map((l) => l.cle), [...VOS, 'non-note'], 'vos dix bookmakers, même à zéro, puis « non noté »');
  // k (1,30) ; a, c, i (1,80 1,50 1,90) ; b, g, h (2,50 2,10 2,30) ; d, e, f (3,20 3,06 4,60) ; j (5,50).
  assert.deepEqual(t.tranche.lignes.map((l) => [l.libelle, l.paris]), [['Moins de 1,50', 1], ['1,50 à 1,99', 3], ['2,00 à 2,99', 3], ['3,00 à 4,99', 3], ['5,00 et plus', 1]]);
  assert.deepEqual(t.confiance.lignes.map((l) => [l.libelle, l.paris]), [['Sûr', 0], ['Fragile', 0], ['Pas encore mesurée (étape 38)', 11]]);
  assert.deepEqual(t.marche.lignes.find((l) => l.cle === 'combine').paris, 1);
  assert.deepEqual(t.marche.lignes.find((l) => l.cle === 'combine-meme-match').paris, 1);
  assert.equal(t.championnat.lignes.find((l) => l.cle === 'plusieurs').paris, 1, 'le combiné EPL + Ligue 1');
  for (const x of r.tableaux) {
    // Jamais une somme de pourcentages ni de cotes au total.
    assert.deepEqual([x.total.roi, x.total.tauxReussite, x.total.coteMoyenne, x.total.cloture], [null, null, null, null], x.titre);
    // La moyenne par pari : pondérée par les paris (= le carnet), pas la moyenne des taux des lignes.
    proche(x.moyenne.roi, r.carnet.roi, 1e-9, `ROI moyen « ${x.titre} »`);
    proche(x.moyenne.tauxReussite, 50, 1e-9, `réussite « ${x.titre} » : 4 gagnés sur 8`);
    proche(x.moyenne.mise, 124 / 8, 1e-9);
    proche(x.moyenne.gainAttendu, 8.11 / 3, 1e-9);
  }
  const lignesAvecRoi = t.tranche.lignes.filter((l) => l.roi !== null);
  const moyenneDesTaux = lignesAvecRoi.reduce((s, l) => s + l.roi, 0) / lignesAvecRoi.length;
  assert.ok(Math.abs(moyenneDesTaux - t.tranche.moyenne.roi) > 1, 'la moyenne des ROI des lignes n’est pas celle du carnet : elle n’est jamais affichée');
  // Un carnet VIDE : les mêmes tableaux, leurs lignes fixes, un total à zéro, une moyenne inconnue.
  const vide = rapportDeSuivi({ paris: [], vosBookmakers: VOS, maintenant: MAINTENANT });
  assert.deepEqual(vide.tableaux.map((x) => [x.cle, x.lignes.length]), [['marche', 0], ['championnat', 0], ['bookmaker', 10], ['tranche', 5], ['confiance', 3]]);
  assert.deepEqual([vide.tableaux[3].total.paris, vide.tableaux[3].total.gainReel, vide.tableaux[3].moyenne.roi], [0, 0, null]);
  assert.deepEqual([vide.series.n, vide.series.zone.jusqua, vide.courbe.points.length, vide.attendu.parisAvecProbabilite], [0, null, 0, 0]);
});

const BAC = bac.dossierDuBac();
const CARNET_DU_BAC = BAC ? path.join(SERVEUR, 'data', 'runtime', 'bets.json') : null;
const avecCarnetDuBac = { skip: CARNET_DU_BAC && bac.estDans(CARNET_DU_BAC, BAC) && fs.existsSync(CARNET_DU_BAC) ? false : 'seulement dans le bac à sable : la COPIE du carnet de Pierre (jamais le carnet du dépôt)' };

test('sur la copie du carnet de Pierre (bac à sable seulement, lue jamais écrite) : la somme des gains réels retombe sur le carnet, dans chaque tableau', avecCarnetDuBac, () => {
  const avant = fs.readFileSync(CARNET_DU_BAC);
  const paris = JSON.parse(avant.toString('utf8'));
  const r = rapportDeSuivi({ paris, vosBookmakers: VOS, maintenant: MAINTENANT });
  const carnet = profitDuCarnet(paris);
  proche(r.carnet.gainReel, carnet, 1e-6, 'gain réel du carnet');
  for (const t of r.tableaux) {
    proche(t.lignes.reduce((s, l) => s + l.gainReel, 0), carnet, 1e-6, t.titre);
    assert.equal(t.lignes.reduce((s, l) => s + l.paris, 0), paris.length, t.titre);
  }
  proche(r.courbe.points.at(-1)?.carnet ?? 0, carnet, 1e-6);
  assert.equal(r.attendu.parisAvecProbabilite, paris.filter((b) => b.legs.length === 1 && typeof b.legs[0].probabiliteMoteur === 'number').length);
  assert.ok(fs.readFileSync(CARNET_DU_BAC).equals(avant), 'le carnet n’a pas bougé');
});

// ------------------------------------------------------------------ 3. les garde-fous

test('rien n’est réglé par défaut : aucun plafond, aucun coupe-circuit, le conseil de mise du moteur tel quel', () => {
  assert.deepEqual(GF.REGLAGE_GARDE_FOUS_DEFAUT, { miseMaxParPari: null, perteMaxParSemaine: null });
  const e = GF.etatDesGardeFous({ paris: [...CARNET, pari('gros', { status: 'lost', stake: 5000, odds: 2, cree: '2026-10-05T08:00:00Z', regle: '2026-10-05T10:00:00Z' })], maintenant: MAINTENANT });
  assert.deepEqual([e.bloque, e.motif, e.plafondDeMise, e.resteSemaine], [false, null, null, null], 'une grosse perte sans plafond réglé : rien de bloqué');
  assert.ok(e.perteSemaine >= 5000);
  const decision = { action: 'RECOMMENDED', stake: 120, outcome: 'home' };
  assert.equal(GF.plafonnerLeConseil(decision, {}), decision, 'tiltState vide : la décision même');
  assert.equal(GF.plafonnerLeConseil(decision, { circuitBreakerActive: false, plafondDeMise: null }), decision);
});

test('les plafonds BLOQUENT LE CONSEIL au-delà : sur 500 matchs tirés au sort, la mise conseillée = min(Kelly, plafond), la décision du moteur (issue, bookmaker, avantage) inchangée', () => {
  graine = 4242;
  let plafonnes = 0;
  let conseilles = 0;
  for (let n = 0; n < 500; n++) {
    const p = [0.25 + 0.3 * hasard(), 0.2 + 0.1 * hasard()];
    p.push(1 - p[0] - p[1]);
    const marge = 1.02 + 0.03 * hasard();
    const pin = p.map((x) => Number((1 / (x * marge)).toFixed(2)));
    // William Hill garde sa marge, mais paie plus une issue tirée au sort (parfois une value, parfois non).
    const boostee = Math.floor(3 * hasard());
    const wh = pin.map((o, i) => Number((o * (i === boostee ? 0.99 + 0.14 * hasard() : 0.96)).toFixed(2)));
    const match = { home: 'A', away: 'B', bankroll: 1000 + Math.floor(19000 * hasard()), marketOdds: { odds1: pin[0], oddsDraw: pin[1], odds2: pin[2], byBookmaker: [{ key: 'pinnacle', title: 'Pinnacle', odds1: pin[0], oddsDraw: pin[1], odds2: pin[2] }, { key: 'williamhill', title: 'William Hill', odds1: wh[0], oddsDraw: wh[1], odds2: wh[2] }] } };
    const ref = referenceDuMatch(match, CONFIG);
    const libre = stakingDuMatch(match, ref, CONFIG, {});
    // Sans garde-fou : exactement findValueBet (la décision d'avant l'étape 11).
    assert.deepEqual(libre, findValueBet({ byBookmaker: match.marketOdds.byBookmaker, fair: ref.reference.probabilities, referenceKeys: ref.reference.keys, config: CONFIG, tiltState: {}, bankroll: match.bankroll, labels: { home: 'A gagne', draw: 'Match nul', away: 'B gagne' } }));
    const plafond = Math.round((1 + 40 * hasard()) * 100) / 100;
    const par = hasard() < 0.5 ? 'mise-max' : 'perte-semaine';
    const garde = stakingDuMatch(match, ref, CONFIG, { plafondDeMise: { montant: plafond, par } });
    assert.equal(garde.action, libre.action);
    if (libre.action !== 'RECOMMENDED') {
      assert.deepEqual(garde, libre, 'un « pas de pari » n’est jamais touché');
      continue;
    }
    conseilles += 1;
    assert.deepEqual([garde.outcome, garde.bookmaker, garde.odds, garde.ev], [libre.outcome, libre.bookmaker, libre.odds, libre.ev]);
    assert.ok(garde.stake <= plafond + 1e-9, `mise ${garde.stake} > plafond ${plafond}`);
    assert.equal(garde.stake, Math.min(libre.stake, plafond));
    if (libre.stake > plafond) {
      plafonnes += 1;
      assert.deepEqual([garde.misePlafonnee.mise, garde.misePlafonnee.plafond, garde.misePlafonnee.par], [libre.stake, plafond, par]);
      assert.match(garde.misePlafonnee.texte, par === 'mise-max' ? /votre mise maximale par pari/ : /perte maximale de la semaine/);
    } else assert.equal(garde.misePlafonnee, undefined);
  }
  assert.ok(plafonnes >= 60 && conseilles - plafonnes >= 20, `${plafonnes} conseils ramenés au plafond, ${conseilles - plafonnes} sous le plafond`);
  // Le coupe-circuit dit pourquoi ; l'interrupteur manuel seul ne change rien à la décision d'avant.
  const coupe = GF.plafonnerLeConseil({ action: 'CIRCUIT_BREAKER_ACTIVE', stake: null, candidates: [] }, { circuitBreakerActive: true, coupeCircuit: { motif: 'perte-semaine-atteinte', texte: 'perte maximale…' } });
  assert.deepEqual(coupe.coupeCircuit, { motif: 'perte-semaine-atteinte', texte: 'perte maximale…' });
  assert.deepEqual(GF.plafonnerLeConseil({ action: 'CIRCUIT_BREAKER_ACTIVE', stake: null, candidates: [] }, { circuitBreakerActive: true }), { action: 'CIRCUIT_BREAKER_ACTIVE', stake: null, candidates: [] });
});

test('la perte maximale de la SEMAINE (lundi → dimanche, jours de Paris, heure d’été et d’hiver) : atteinte, engagée par les mises en attente, ce qui reste ; elle enclenche le coupe-circuit et repart chaque lundi', () => {
  // Lundi 05/10/2026 à 14 h (Paris, heure d'été) : la semaine commence le 04/10 à 22 h UTC.
  assert.deepEqual(GF.semaineDeParis(MAINTENANT), { lundi: '2026-10-05', dimanche: '2026-10-11', debut: Date.parse('2026-10-04T22:00:00Z'), fin: Date.parse('2026-10-11T22:00:00Z') });
  // Heure d'hiver (le 25/10 : changement d'heure) : la semaine du lundi 02/11 commence le 01/11 à 23 h UTC.
  assert.deepEqual(GF.semaineDeParis(Date.parse('2026-11-04T12:00:00Z')), { lundi: '2026-11-02', dimanche: '2026-11-08', debut: Date.parse('2026-11-01T23:00:00Z'), fin: Date.parse('2026-11-08T23:00:00Z') });
  // Dimanche 25/10 (jour du changement d'heure) : la semaine du lundi 19/10, jusqu'au lundi 26/10 à 0 h (heure d'hiver, 23 h UTC).
  assert.deepEqual(GF.semaineDeParis(Date.parse('2026-10-25T20:00:00Z')).fin, Date.parse('2026-10-25T23:00:00Z'));
  const perdu = (id, regle, stake = 30) => pari(id, { status: 'lost', stake, odds: 2, cree: '2026-10-03T10:00:00Z', regle });
  // Dimanche 23 h 30 à Paris (21 h 30 UTC) : la semaine d'avant ; lundi 0 h 30 à Paris (22 h 30 UTC) : celle-ci.
  const paris = [perdu('dimanche', '2026-10-04T21:30:00Z'), perdu('lundi', '2026-10-04T22:30:00Z'), perdu('midi', '2026-10-05T10:00:00Z'), pari('gagne', { status: 'won', stake: 10, odds: 2, cree: '2026-10-05T07:00:00Z', regle: '2026-10-05T11:00:00Z' })];
  const e = (reglage, extra = []) => GF.etatDesGardeFous({ paris: [...paris, ...extra], reglage, maintenant: MAINTENANT });
  const sans = e({ miseMaxParPari: null, perteMaxParSemaine: null });
  assert.deepEqual([sans.perteSemaine, sans.gainSemaine, sans.parisReglesSemaine], [50, -50, 3], '−30 −30 +10 cette semaine ; le dimanche soir n’en est pas');
  const atteinte = e({ miseMaxParPari: 20, perteMaxParSemaine: 50 });
  assert.deepEqual([atteinte.bloque, atteinte.motif, atteinte.plafondDeMise, atteinte.resteSemaine], [true, 'perte-semaine-atteinte', null, 0]);
  assert.deepEqual(atteinte.alertes.map((a) => [a.code, a.niveau]), [['perte-semaine-atteinte', 'danger']]);
  assert.match(atteinte.alertes[0].texte, /^Perte maximale de la semaine atteinte : 50 € perdus depuis lundi, pour un plafond de 50 €\. Le moteur ne conseille plus de mise jusqu'à lundi prochain ; vos paris s'enregistrent toujours\.$/);
  const reste = e({ miseMaxParPari: 20, perteMaxParSemaine: 80 }, [pari('attente', { status: 'pending', stake: 18, odds: 2, cree: '2026-10-05T11:30:00Z' })]);
  assert.deepEqual([reste.bloque, reste.misesEnAttente, reste.resteSemaine, reste.plafondDeMise], [false, 18, 12, { montant: 12, par: 'perte-semaine' }], '80 − 50 − 18 = 12 < 20');
  const miseMax = e({ miseMaxParPari: 20, perteMaxParSemaine: 200 });
  assert.deepEqual(miseMax.plafondDeMise, { montant: 20, par: 'mise-max' });
  const engagee = e({ miseMaxParPari: null, perteMaxParSemaine: 60 }, [pari('attente', { status: 'pending', stake: 15, odds: 2, cree: '2026-10-05T11:30:00Z' })]);
  assert.deepEqual([engagee.bloque, engagee.motif, engagee.resteSemaine], [true, 'perte-semaine-engagee', -5], '50 perdus + 15 en attente ≥ 60');
  assert.equal(engagee.alertes[0].niveau, 'warning');
  // Lundi suivant : la perte de la semaine repart de zéro.
  const lundiSuivant = GF.etatDesGardeFous({ paris, reglage: { miseMaxParPari: null, perteMaxParSemaine: 50 }, maintenant: Date.parse('2026-10-12T06:00:00Z') });
  assert.deepEqual([lundiSuivant.perteSemaine, lundiSuivant.bloque, lundiSuivant.semaine.du], [0, false, '2026-10-12']);
  // Un pari PRIS cette semaine au-delà de la mise maximale : signalé (jamais refusé).
  const gros = e({ miseMaxParPari: 20, perteMaxParSemaine: null }, [pari('gros', { status: 'pending', stake: 35, odds: 2, cree: '2026-10-05T11:00:00Z' })]);
  assert.deepEqual(gros.parisAuDelaDeLaMiseMax, ['gros']);
  assert.ok(gros.alertes.some((a) => a.code === 'mise-max-depassee'));
});

test('les réglages : null = pas de plafond ; un montant au centime, dans ses bornes ; refus de ce qui n’est pas un montant ou pas un garde-fou', () => {
  assert.deepEqual(GF.validerReglageGardeFous({ miseMaxParPari: 20.004 }), { miseMaxParPari: 20 });
  assert.deepEqual(GF.validerReglageGardeFous({ miseMaxParPari: null, perteMaxParSemaine: 150 }), { miseMaxParPari: null, perteMaxParSemaine: 150 });
  for (const mauvais of [{ miseMaxParPari: '20' }, { miseMaxParPari: 0 }, { miseMaxParPari: -1 }, { perteMaxParSemaine: Number.NaN }, { perteMaxParSemaine: 2e6 }, { perteMaxParSemaine: true }, { capital: 10 }, {}, null, [], 'x']) {
    assert.throws(() => GF.validerReglageGardeFous(mauvais), (e) => e instanceof GF.ErreurGardeFous && e.statut === 400, JSON.stringify(mauvais));
  }
  assert.throws(() => GF.reglageLu({ miseMaxParPari: 'vingt' }), (e) => e.statut === 503, 'un fichier mal formé est illisible, jamais « pas de plafond »');
  assert.deepEqual(GF.reglageLu({}), { miseMaxParPari: null, perteMaxParSemaine: null });
});

// ------------------------------------------------------------------ 4. le vrai serveur, dans une copie

/** Le carnet de la copie : une victoire la semaine d'avant, 60 € perdus ce lundi, 5 € en attente. */
const CARNET_COPIE = [
  pari('semaine-passee', { status: 'won', stake: 10, odds: 2, cree: '2026-10-01T10:00:00Z', regle: '2026-10-02T20:00:00Z' }),
  pari('perdu-1', { status: 'lost', stake: 30, odds: 1.9, cree: '2026-10-04T10:00:00Z', regle: '2026-10-05T08:00:00Z', legs: [jambe({ league: 'Ligue 1', homeName: 'Lyon', awayName: 'Nice', odds: 1.9, status: 'lost' })] }),
  pari('perdu-2', { status: 'lost', stake: 30, odds: 2.1, cree: '2026-10-04T11:00:00Z', regle: '2026-10-05T09:00:00Z', legs: [jambe({ league: 'Ligue 1', homeName: 'Lens', awayName: 'Lille', odds: 2.1, status: 'lost' })] }),
  pari('attente', { status: 'pending', stake: 5, odds: 1.7, cree: '2026-10-05T10:00:00Z', legs: [jambe({ homeName: 'Fulham', awayName: 'Brentford', commenceTime: '2026-10-06T14:00:00Z', odds: 1.7, status: 'pending' })] })
];

let P;
before(() => {
  const lancer = (copie, phase, maintenant) => {
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000, ...(maintenant ? { maintenant } : {}) });
    assert.equal(r.code, 0, `phase ${phase} :\n${r.erreurs.slice(-3000)}`);
    assert.ok(r.json?.ok, `phase ${phase} : sortie illisible\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, `phase ${phase} : un appel réseau`);
    return r.json;
  };
  const copie = preparerCopie({ runtime: { 'bets.json': CARNET_COPIE } });
  P = {};
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    P.principale = lancer(copie, 'principale');
    P.lundi = lancer(copie, 'lundi', '2026-10-12T08:00:00.000Z');
  } finally {
    copie.nettoyer();
  }
  const illisible = preparerCopie({ runtime: { 'bets.json': CARNET_COPIE, 'garde-fous.json': '{ "miseMaxParPari": 2' } });
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(illisible.serveur, 'scripts'), { recursive: true });
    P.illisible = lancer(illisible, 'illisible');
  } finally {
    illisible.nettoyer();
  }
});

test('dans une copie : sans garde-fou, le conseil d’avant ; la mise maximale le ramène à 25 € (moteur, verdict, comparateur) ; ce qui reste avant la perte maximale aussi ; un réglage identique n’écrit rien', () => {
  const p = P.principale;
  assert.deepEqual([p.sans.tilt.circuitBreakerActive, p.sans.tilt.coupeCircuitManuel, p.sans.tilt.plafondDeMise], [false, false, null]);
  assert.deepEqual([p.sans.gardeFous.source, p.sans.gardeFous.reglage], ['defaut', { miseMaxParPari: null, perteMaxParSemaine: null }]);
  assert.equal(p.fichierAvant, null, 'aucun fichier de réglage tant que Pierre n’a rien fixé');
  const libre = p.sans.analyse.staking;
  assert.deepEqual([libre.action, libre.outcome, libre.bookmaker], ['RECOMMENDED', 'home', 'williamhill']);
  assert.ok(libre.stake > 100 && libre.misePlafonnee === undefined, `Kelly sur 10 000 € : ${libre.stake}`);
  // Mise maximale de 25 € : partout le même conseil, ramené et dit.
  assert.equal(p.mise.put.code, 200);
  assert.deepEqual(JSON.parse(p.mise.fichier), { miseMaxParPari: 25, perteMaxParSemaine: null, majLe: '2026-10-05T12:00:00.000Z' });
  const m = p.mise.analyse;
  assert.deepEqual([m.staking.action, m.staking.outcome, m.staking.bookmaker, m.staking.stake], ['RECOMMENDED', 'home', 'williamhill', 25]);
  assert.deepEqual([m.staking.misePlafonnee.mise, m.staking.misePlafonnee.plafond, m.staking.misePlafonnee.par], [libre.stake, 25, 'mise-max']);
  assert.equal(m.staking.misePlafonnee.texte, `Mise conseillée ramenée à 25 € : votre mise maximale par pari, fixée dans Réglages. Le moteur conseillait ${GF.euros(libre.stake)}.`);
  assert.deepEqual([m.verdicts.home.etat, m.verdicts.home.mise, m.conseil.mise], ['value', 25, 25], 'la page du match et le comparateur disent la même mise');
  assert.equal(m.cellules.find((c) => c.cle === 'williamhill').etats.home.mise, 25);
  assert.deepEqual([p.idempotent.put.corps.ecrit, p.idempotent.avant === p.idempotent.apres], [false, true]);
  // Perte maximale de 100 € : 60 € perdus, 5 € en attente, reste 35 € ; avec la mise maximale (25 €), c'est elle ; sans, 35 €.
  assert.deepEqual([p.reste.put.corps.etat.resteSemaine, p.reste.put.corps.etat.plafondDeMise], [35, { montant: 25, par: 'mise-max' }]);
  assert.equal(p.reste.analyse.staking.stake, 25);
  assert.deepEqual([p.resteSeul.analyse.staking.stake, p.resteSeul.analyse.staking.misePlafonnee.par], [35, 'perte-semaine']);
});

test('dans une copie : la perte maximale ATTEINTE enclenche le coupe-circuit existant — plus de conseil nulle part, la raison dite ; couper l’interrupteur manuel ne le relâche pas ; l’alerte monte jusqu’au haut de l’appli', () => {
  const a = P.principale.atteinte;
  assert.deepEqual([a.tilt.circuitBreakerActive, a.tilt.coupeCircuitManuel, a.tilt.automatique.motif], [true, false, 'perte-semaine-atteinte']);
  assert.equal(a.tilt.automatique.texte, 'perte maximale de la semaine atteinte : 60 € perdus depuis lundi, pour un plafond de 50 €');
  assert.deepEqual([a.analyse.staking.action, a.analyse.staking.stake, a.analyse.conseil], ['CIRCUIT_BREAKER_ACTIVE', null, null]);
  assert.deepEqual(a.analyse.staking.coupeCircuit, a.tilt.automatique);
  for (const issue of ['home', 'draw', 'away']) {
    assert.equal(a.analyse.verdicts[issue].etat, 'coupe-circuit');
    assert.equal(a.analyse.verdicts[issue].raison, "Le coupe-circuit de Réglages est enclenché (perte maximale de la semaine atteinte : 60 € perdus depuis lundi, pour un plafond de 50 €) : aucun pari n'est conseillé tant qu'il l'est.");
    assert.equal(a.analyse.cellules.find((c) => c.cle === 'williamhill').etats[issue].etat, 'coupe-circuit');
  }
  assert.deepEqual(a.refresh.alertes.map((x) => [x.code, x.niveau]), [['perte-semaine-atteinte', 'danger']], 'GET /api/refresh : la puce du haut');
  assert.deepEqual([P.principale.manuelCoupe.circuitBreakerActive, P.principale.manuelCoupe.coupeCircuitManuel], [true, false], 'l’interrupteur manuel est indépendant');
  // La semaine suivante : la perte repart de zéro ; restent 107 € en attente (≥ 50 €) : « engagée » ; plafond relevé : relâché.
  const l = P.lundi;
  assert.deepEqual([l.gardeFous.etat.perteSemaine, l.gardeFous.etat.misesEnAttente, l.tilt.automatique.motif], [0, 107, 'perte-semaine-engagee']);
  assert.deepEqual([l.tiltApres.circuitBreakerActive, l.tiltApres.automatique], [false, null]);
});

test('dans une copie : « J’ai parié » à 100 € au-delà de TOUT (mise maximale, mise acceptée, solde, compte fermé, perte de la semaine) — enregistré quand même, ses alertes dans la réponse, le carnet d’avant intact', () => {
  const p = P.principale;
  assert.equal(p.jaiParie.code, 201, JSON.stringify(p.jaiParie.corps));
  assert.deepEqual(p.jaiParie.corps.alertes.map((a) => a.code), ['mise-max-depassee', 'compte-ferme', 'mise-acceptee-depassee', 'solde-depasse', 'perte-semaine-atteinte']);
  assert.equal(p.jaiParie.corps.alertes.find((a) => a.code === 'mise-acceptee-depassee').texte, 'Mise de 100 € au-delà de la mise acceptée connue chez William Hill : 30 € (fiche du 05/10/2026).');
  // Écrit : le carnet d'avant + ce pari, à l'identique pour les anciens ; les alertes ne sont PAS écrites dans le carnet.
  assert.equal(p.carnetApres.length, p.carnetAvant.length + 1);
  assert.deepEqual(p.carnetApres.slice(0, p.carnetAvant.length), p.carnetAvant);
  const ecrit = p.carnetApres.at(-1);
  assert.deepEqual([ecrit.stake, ecrit.bookmaker, ecrit.status, 'alertes' in ecrit], [100, 'williamhill', 'pending', false]);
  assert.equal(p.liste.bets.some((b) => 'alertes' in b), false, 'GET /api/bets inchangé');
  // Fiche illisible : le pari s'enregistre encore, l'alerte dit ce qui n'a pas été vérifié.
  assert.equal(p.fichesIllisibles.pari.code, 201);
  assert.ok(p.fichesIllisibles.pari.corps.alertes.some((a) => a.code === 'lecture-impossible'));
  // Réglage des garde-fous illisible dès le démarrage : prudence (pas de conseil), et le pari s'enregistre.
  const i = P.illisible;
  assert.deepEqual([i.tilt.circuitBreakerActive, i.tilt.automatique.motif], [true, 'reglage-illisible']);
  assert.deepEqual([i.gardeFous.code, i.put.code, i.fichier], [503, 503, '{ "miseMaxParPari": 2'], 'jamais écrasé');
  assert.deepEqual([i.pari.code, i.carnet.length], [201, CARNET_COPIE.length + 1]);
});

test('dans une copie : le suivi (GET /api/bets/suivi) sur ce carnet — le carnet retombe juste, le pari « J’ai parié » a son gain attendu en attente, les signaux du carnet, la valeur de clôture dite', () => {
  const r = P.principale.suivi;
  assert.equal(r.code, 200);
  const s = r.corps;
  const carnet = profitDuCarnet(P.principale.carnetApres);
  proche(s.carnet.gainReel, carnet, 1e-9);
  proche(carnet, -50, 1e-9, '+10 −30 −30');
  for (const t of s.tableaux) proche(t.lignes.reduce((x, l) => x + l.gainReel, 0), carnet, 1e-9, t.titre);
  assert.deepEqual([s.attendu.parisAvecProbabilite, s.attendu.regles, s.attendu.enAttente.paris, s.attendu.enAttente.gainAttendu], [1, 0, 1, 12.47], '100 × (0,489 × 2,3 − 1)');
  const jai = s.paris.find((x) => x.bookmaker === 'williamhill');
  assert.deepEqual(jai.signaux.map((x) => x.code), ['mise-max-depassee', 'mise-acceptee-depassee', 'compte-ferme']);
  assert.deepEqual([s.series.n, s.series.enCours, s.series.zone.jusqua], [3, 2, 3]);
  assert.deepEqual(s.gardeFous.alertes.map((a) => a.code), ['perte-semaine-atteinte', 'mise-max-depassee']);
  assert.equal(s.cloture.disponible, true);
  assert.ok(s.cloture.manques.length > 0, 'ce qui n’est pas mesuré est dit');
  // La route de la valeur de clôture garde sa réponse d'avant : ses 400 mesures les plus récentes, jamais la liste complète.
  const route = P.principale.clotureRoute;
  assert.equal(route.code, 200);
  assert.ok(Array.isArray(route.corps.entries));
  assert.equal('toutesLesMesures' in route.corps, false);
  assert.equal(s.cloture.selections, route.corps.totalEntries, 'le suivi lit le même rapport');
});

test('dans une copie : la fiche d’un compte SANS SECRET — identifiant, mot de passe, note libre refusés (400, rien d’écrit) ; seuls trois champs et la date dans le fichier ; un champ ajouté à la main jamais rendu, effacé à l’écriture suivante', () => {
  const p = P.principale;
  assert.equal(p.fiche.code, 200);
  assert.deepEqual(JSON.parse(p.ficheFichier), { comptes: { williamhill: { soldeDeclare: 40, miseMaxAcceptee: 30, limitation: 'ferme', majLe: '2026-10-05T12:00:00.000Z' } } });
  assert.deepEqual([p.ficheIdempotente.put.corps.enregistre.ecrit, p.ficheIdempotente.avant === p.ficheIdempotente.apres], [false, true]);
  for (const nom of ['motDePasse', 'identifiant', 'password']) {
    assert.equal(p.refus[nom].code, 400, nom);
    assert.match(p.refus[nom].corps.error, /JAMAIS d'identifiant, de mot de passe ni de courriel/);
  }
  for (const nom of ['noteLibre', 'limitationInconnue', 'soldeNegatif', 'gfTexte', 'gfNegatif', 'gfZero', 'gfInconnu', 'gfVide']) assert.equal(p.refus[nom].code, 400, nom);
  assert.equal(p.refus.bookmakerInconnu.code, 404);
  assert.deepEqual([p.apresRefus.fiche, p.apresRefus.gf], [p.apresRefus.avant.fiche, p.apresRefus.avant.gf], 'rien d’écrit par un refus');
  for (const secret of ['secret-123', 'pierre.c', 'hunter2', '1234']) assert.ok(!p.apresRefus.fiche.includes(secret), secret);
  // Un « password » ajouté à la main : jamais rendu par la route, compté, effacé à l'écriture suivante.
  assert.equal(JSON.stringify(p.mainLue.corps).includes('hunter2'), false);
  assert.equal(p.mainLue.corps.champsIgnores, 1);
  assert.deepEqual([p.mainReecrite.code, p.mainReecrite.corps.enregistre.ecrit, p.mainFichier.includes('hunter2')], [200, true, false]);
  // Une fiche vidée est retirée du fichier.
  assert.deepEqual([p.ficheVide.put.code, p.ficheVide.retrait.code, Object.keys(JSON.parse(p.ficheVide.fichier).comptes)], [200, 200, ['williamhill']]);
  // Fiches illisibles : 503, jamais écrasées.
  assert.deepEqual([p.fichesIllisibles.get.code, p.fichesIllisibles.put.code, p.fichesIllisibles.fichier], [503, 503, '{ "comptes": { "williamhill": ']);
  // Chaque fiche lue n'a que ses trois champs et sa date.
  for (const b of p.mainLue.corps.bookmakers.filter((x) => x.fiche)) assert.deepEqual(Object.keys(b.fiche).sort(), ['limitation', 'majLe', 'miseMaxAcceptee', 'soldeDeclare']);
});

// ------------------------------------------------------------------ 5. l'écran = le serveur

test('écran = serveur : les alertes du ticket sont celles de « J’ai parié », mot pour mot, sur 2 000 cas tirés au sort ; jamais dans « ce qui manque »', options, async () => {
  graine = 77;
  const UT = await import(pathToFileURL(path.join(UI_SRC, 'utils', 'ticket.js')).href);
  const choisir = (liste) => liste[Math.floor(hasard() * liste.length)];
  for (let n = 0; n < 2000; n++) {
    const reglage = { miseMaxParPari: choisir([null, 5, 20, 47.5]), perteMaxParSemaine: choisir([null, 50, 300]) };
    const compte = choisir([null, { soldeDeclare: choisir([null, 0, 12.5, 400]), miseMaxAcceptee: choisir([null, 3, 30]), limitation: choisir(['aucune', 'limite', 'ferme']), majLe: choisir([null, '2026-10-01T09:00:00Z', '2026-12-31T23:30:00Z']) }]);
    const etat = choisir([null, { bloque: false, motif: null }, { bloque: true, motif: 'perte-semaine-atteinte' }, { bloque: true, motif: 'perte-semaine-engagee' }]);
    const p = { mise: choisir([1, 4.99, 5, 20.01, 100, 1234.5]), bookmaker: choisir([null, 'williamhill', 'unibet_nl']), bookmakerTitle: choisir([null, 'William Hill']), reglage, compte, etat };
    assert.deepEqual(UG.alertesDuPari(p), GF.alertesDuPari(p), JSON.stringify(p));
  }
  for (const x of [0, 1, 12.5, 1234.567, 1e6]) assert.equal(UG.euros(x), GF.euros(x));
  for (const d of ['2026-10-05T23:30:00Z', '2026-03-29T00:30:00Z', null]) assert.equal(UG.jourDit(d), GF.jourDit(d));
  assert.deepEqual(UG.LIMITATIONS, GF.LIMITATIONS);
  // Le ticket : mêmes alertes que le serveur ; « ce qui manque » ignore tout garde-fou (le bouton ne se bloque jamais).
  const sel = { matchId: 'm1', homeName: 'A', awayName: 'B', market: 'Résultat', pick: 'A gagne', cote: 2.3, bookmaker: 'williamhill' };
  const edition = { bookmaker: 'williamhill', cotes: {}, coteCombinee: null };
  const alertes = UG.alertesDuTicket({ mise: 500, bookmaker: 'williamhill', bookmakers: [{ cle: 'williamhill', titre: 'William Hill' }], gardeFous: { reglage: { miseMaxParPari: 10, perteMaxParSemaine: 50 }, etat: { bloque: true, motif: 'perte-semaine-atteinte' } }, comptes: { williamhill: { soldeDeclare: 5, miseMaxAcceptee: 20, limitation: 'ferme', majLe: '2026-10-01T09:00:00Z' } } });
  assert.deepEqual(alertes.map((a) => a.code), ['mise-max-depassee', 'compte-ferme', 'mise-acceptee-depassee', 'solde-depasse', 'perte-semaine-atteinte']);
  assert.deepEqual(UT.controleDuTicket({ selections: [sel], edition, mise: 500, bookmakers: [{ cle: 'williamhill', titre: 'William Hill' }] }), [], 'ticket complet : rien ne manque, quelles que soient les alertes');
  assert.deepEqual(UG.alertesDuTicket({ mise: 500, bookmaker: 'williamhill' }), [], 'rien de lu (serveur d’avant l’étape 11) : aucune alerte inventée');
  assert.deepEqual(UG.montantSaisi(''), null);
  assert.deepEqual([UG.montantSaisi('12,5'), UG.montantSaisi(7), UG.montantSaisi('abc')], [12.5, 7, null]);
});

test('écran : les tableaux vides ont les lignes fixes du serveur ; le total n’écrit jamais un pourcentage ; la moyenne si ; les courbes partent de 0 et suivent le serveur ; la bande de la zone normale', options, () => {
  const vides = US.tableauxVides();
  assert.deepEqual(vides.find((t) => t.cle === 'tranche').lignes.map((l) => l.libelle), TRANCHES_DE_COTE.map((t) => t.libelle));
  assert.deepEqual(vides.find((t) => t.cle === 'confiance').lignes.map((l) => l.libelle), NIVEAUX_DE_CONFIANCE.map((t) => t.libelle));
  const r = rapportDeSuivi({ paris: CARNET, vosBookmakers: VOS, maintenant: MAINTENANT });
  for (const t of [...r.tableaux, ...vides]) {
    const total = US.cellulesDuTotal(t.total);
    for (const c of US.COLONNES_SUIVI.filter((x) => x.pourcent || x.moyenne)) assert.equal(total[c.cle].includes('%') || /\d,\d\d$/.test(total[c.cle]), false, `${t.titre} : total « ${c.libelle} » = ${total[c.cle]}`);
    for (const l of t.lignes) assert.equal(Object.keys(US.cellulesDeLigne(l)).length, US.COLONNES_SUIVI.length);
  }
  const moyenne = US.cellulesDeLaMoyenne(r.tableaux[0].moyenne);
  assert.match(moyenne.roi, /%$/);
  assert.equal(moyenne.paris, '—');
  assert.match(moyenne.mise, /€ \/ pari$/);
  // Les courbes : un pas par pari réglé, départ à 0 ; plus haut = plus gagné ; « gagné » et « attendu » seulement avec des probabilités.
  const g = US.geometrieDesCourbes(r.courbe, { largeur: 640, hauteur: 220 });
  assert.deepEqual([g.vide, g.n, g.avecProbabilite, Object.keys(g.chemins)], [false, 8, true, ['carnet', 'gagne', 'attendu']]);
  const pts = g.chemins.carnet.split(' ').map((s) => s.slice(1).split(',').map(Number));
  assert.equal(pts.length, 9, 'le départ à 0 puis 8 paris');
  proche(pts[0][1], g.zero, 0.06, 'départ à 0 (au dixième de pixel près)');
  assert.ok(pts.at(-1)[1] < g.zero, 'un carnet gagnant finit au-dessus de 0');
  assert.deepEqual(g.fin, { carnet: r.courbe.points.at(-1).carnet, gagne: r.courbe.points.at(-1).gagne, attendu: r.courbe.points.at(-1).attendu });
  const sansP = US.geometrieDesCourbes({ points: r.courbe.points.map((p) => ({ ...p, avecProbabilite: false })) });
  assert.deepEqual(Object.keys(sansP.chemins), ['carnet']);
  assert.deepEqual(US.geometrieDesCourbes({ points: [] }).vide, true);
  // (230 + 12) / 4 = 60,5 : le pas rond au-dessus est 100.
  assert.deepEqual(US.reperesRonds(-12, 230), [-100, 0, 100, 200, 300]);
  assert.deepEqual(US.reperesRonds(-3, 18), [-10, 0, 10, 20], '21 / 4 = 5,25 : le pas rond au-dessus est 10');
  // La bande : la zone, les repères, l'état.
  const b = US.bandeDesSeries(GF.etatDesSeries(Array.from({ length: 10 }, (_, i) => pari(`s${i}`, { status: i >= 4 ? 'lost' : 'won', stake: 1, odds: 2, cree: '2026-10-01T00:00:00Z', regle: `2026-10-02T10:0${i}:00Z` }))));
  assert.deepEqual([b.etat, b.jusqua, b.echelle], ['hors-zone', 5, 7]);
  proche(b.zonePct, (5 / 7) * 100, 1e-9);
  assert.deepEqual(b.marqueurs.map((m) => [m.cle, m.valeur]), [['mediane', 3], ['plus-longue', 6], ['en-cours', 6]]);
  assert.equal(US.bandeDesSeries(null).etat, 'vide');
  // Les phrases (jamais « 100 % » ni « 0 % » pour une fréquence du hasard).
  assert.equal(US.frequenceDite(0.9991), 'le hasard en donne une au moins aussi longue presque à coup sûr');
  assert.equal(US.frequenceDite(0.36), 'le hasard en donne une au moins aussi longue 36 % du temps');
  assert.equal(US.frequenceDite(0.001), 'le hasard en donne une au moins aussi longue moins d’une fois sur 200');
  assert.match(US.phraseAttendu({ parisAvecProbabilite: 0, reglesDuCarnet: 0 }), /^Aucun pari réglé pour l'instant : le gain attendu se calcule pour chaque pari pris avec « J'ai parié » \(étape 10\)/);
  assert.match(US.phrasesDesSeries(r.series).zone,/^Série de pertes normale jusqu'à \d+ : avec les cotes de vos 8 paris réglés, le hasard seul ne fait pas pire 95 fois sur 100/);
  assert.match(US.phraseAttendu({ parisAvecProbabilite: 0, reglesDuCarnet: 90 }), /Aucun de vos 90 paris réglés n'a sa probabilité du moment : elle est notée depuis « J'ai parié » \(étape 10\)/);
  assert.match(US.phraseAttendu(r.attendu), /^3 paris réglés sur 8 ont leur probabilité du moment : gagné \+221 €, attendu \+8,11 € — un écart de \+212,89 €/);
});

// ------------------------------------------------------------------ 6. lecture du code

test('lecture du code : les modules de l’étape n’appellent ni réseau, ni API payante, ni Claude ; leurs routes : GET du suivi, GET/PUT des réglages ; « J’ai parié » écrit AVANT de regarder les garde-fous', () => {
  const SRC = path.join(SERVEUR, 'src');
  const lire = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
  const ETAPE11 = [
    'core/risk/seriesDePertes.js',
    'core/risk/gardeFous.js',
    'data/suiviParis.js',
    'data/repositories/gardeFousRepository.js',
    'data/repositories/comptesBookmakersRepository.js',
    'api/controllers/bookmakerAccounts.controller.js',
    'api/routes/bookmakerAccounts.routes.js',
    'core/engine/tiltState.js'
  ];
  for (const rel of ETAPE11) {
    const source = lire(rel);
    for (const [, i] of source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      assert.doesNotMatch(i, /oddsApiClient|liveDataSync|apiFootballClient|sportMonksClient|flashscoreClient|claudeCodeClient|anthropicClient|matchAiAnalysisService|fotMobProvider|node:(http|https|net|tls|dns|child_process)/, `${rel} importe ${i}`);
    }
    assert.doesNotMatch(source, /\bfetch\s*\(|setInterval\s*\(|setTimeout\s*\(/, `${rel} : réseau ou minuterie`);
  }
  // Les deux modules de calcul sont purs : ni disque ni base.
  for (const rel of ['core/risk/seriesDePertes.js', 'core/risk/gardeFous.js']) assert.doesNotMatch(lire(rel), /from 'node:fs'|atomicJson|matchStatsDb/, rel);
  const routes = (rel) => [...lire(rel).matchAll(/router\.(\w+)\('([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(routes('api/routes/bookmakerAccounts.routes.js'), [['get', '/'], ['put', '/:cle']]);
  assert.ok(routes('api/routes/bets.routes.js').some(([m, r]) => m === 'get' && r === '/suivi'));
  assert.deepEqual(routes('api/routes/config.routes.js').filter(([, r]) => r === '/garde-fous'), [['get', '/garde-fous'], ['put', '/garde-fous']]);
  assert.match(lire('api/routes/index.js'), /router\.use\('\/bookmaker-accounts', bookmakerAccountsRoutes\);/);
  // « J'ai parié » : le pari est écrit (createBet) avant toute lecture des garde-fous ; aucun refus n'en dépend.
  const post = lire('api/controllers/bets.controller.js');
  const corps = post.slice(post.indexOf('export function postBet('), post.indexOf('function alertesApresLePari('));
  assert.ok(corps.indexOf('createBet(') > 0 && corps.indexOf('createBet(') < corps.indexOf('alertesApresLePari(bet)'));
  assert.doesNotMatch(corps.slice(0, corps.indexOf('createBet(')), /gardeFous|GardeFous|lireComptes|alertesDuPari/);
  // Le conseil passe aux garde-fous à UN endroit : la décision de pari unique (verdictPari.stakingDuMatch).
  const appelants = fs.readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js') && /plafonnerLeConseil\(/.test(fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).map((f) => f.split(path.sep).join('/')).sort();
  assert.deepEqual(appelants, ['core/engine/verdictPari.js', 'core/risk/gardeFous.js']);
});
