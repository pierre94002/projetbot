/**
 * LA COMBINAISON — AUCUNE FUITE (étape 38, lot 1a, 03-04/11/2026), sur des bases FABRIQUÉES EN MÉMOIRE (node:sqlite
 * « :memory: » : jamais la base du bac ni la vraie) et des mondes tirés au hasard.
 *   node --test test/combinaisonFuite.test.mjs        (depuis server/)
 *
 * T-F2  un relevé planté APRÈS `odds_at` ne change rien (le palier reconstruit, l'ancre de la ligne gelée) ;
 * T-F3  une révision du coup d'envoi gelée APRÈS le coup d'envoi n'est jamais lue ; les analyses d'avance non plus ;
 * T-F4  la case F : jamais calibration_monthly (aucun fichier de data/combinaison/ ne la lit) ;
 * T-F5  rien n'apprend sur P2 : une ligne de P2 dans l'apprentissage est refusée ;
 * T-F6  chaque ligne de P2 est jugée avec ce qui a été appris sur P1 : changer les issues de P2 ne change aucun β ;
 * T-F7  aucune colonne de clôture dans une décision ni dans G : des clôtures différentes laissent prix, décisions, marché,
 *       G et partie statistique identiques à l'octet ; la requête des comptes n'en lit aucune ;
 * T-F8  les statistiques sans le jour J (un score planté le jour J ne change pas les lignes du jour J, il change celles du
 *       lendemain) ; `horloge-j2` sans J−1 ;
 * T-F9  la classe E n'est lue que dans la table de la nuit (lot 1b) : aucun fichier de data/combinaison/ ne lit un fichier
 *       d'exécution ; ingredientsDe la reçoit de l'appelant ;
 * T-F10 le palier reconstruit = le `basis` de referenceDuMatch rejoué sur les mêmes relevés (20 lignes fabriquées) ;
 * T-F11 une case « trop-haut » de la version 5 n'étiquette jamais une ligne de la version 6.
 * Lot 1b (04/11/2026), sur la nuit fabriquée (aides/combinaisonNuitFabriquee.mjs, une copie isolée, base neuve) :
 * T-F1  l'oracle de la nuit : six instants, les mêmes lignes sur une copie coupée à l'instant du gel (rien gelé ni relevé
 *       après, aucun match d'après) et sur la base entière rangée plus tard — aucune exemption (seules l'heure de la nuit
 *       et « rangée une nuit plus tard » diffèrent, par définition) ;
 * T-F2  (la nuit) un Pinnacle relevé après les cotes du pronostic mais avant la nuit ne change rien ;
 * T-F10 (élargi) le rejeu P5-a (lecteurP5) = la nuit au même instant ; le second chemin du contrôle (filtre de la base +
 *       referenceDuMatch) = le palier reconstruit sur 20 couples, une fuite plantée se voit ;
 * T-X10 l'actualisation, gelée : sans ses deux blocs « ajout pur » de la 38, identique à l'octet ; la nuit n'écrit que ses
 *       deux tables, les autres tables identiques avec et sans l'étape ;
 * T-X11 le serveur, la passe et la route de l'analyse se chargent quand data/combinaison/ lève.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { SERVEUR, preparerCopie, executer } from './aides/isolement.mjs';
import { nuitFabriquee } from './aides/combinaisonNuitFabriquee.mjs';
import { COLONNES } from '../src/data/combinaison/nuitDeLaCombinaison.js';
import { palierParLaBase, controlerLesPaliers } from '../src/data/combinaison/controleDeLaCombinaison.js';
import { mondeFd, generateur, plusJours } from './aides/combinaisonMondes.mjs';
import { passeFd, SQL_FD_COMPTES } from '../src/data/combinaison/bancFd.js';
import { lignesGelees } from '../src/data/combinaison/lecteurP5.js';
import { palierDesReleves, ingredientsDe, caseFDe } from '../src/data/combinaison/ingredientsDUneLigne.js';
import { degreDeF } from '../src/data/combinaison/reglesDeConfiance.js';
import * as B from '../src/data/combinaison/bancDeLaCombinaison.js';
import { referenceDuMatch } from '../src/core/engine/verdictPari.js';
import { COLONNES_CLOTURE } from '../src/bench/periodes.js';

const SRC = path.join(SERVEUR, 'src');
const COMB = path.join(SRC, 'data', 'combinaison');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const FICHIERS = fs.readdirSync(COMB).filter((f) => f.endsWith('.js'));

const COLS_FD = ['id', 'code', 'saison', 'date', 'date_fichier', 'dom', 'ext', 'lien', 'bd', 'be', 'moy_1', 'moy_n', 'moy_2', 'max_1', 'max_n', 'max_2', 'pin_1', 'pin_n', 'pin_2', 'b365_1', 'b365_n', 'b365_2', 'wh_1', 'wh_n', 'wh_2', 'moy_p25', 'moy_m25', 'max_p25', 'max_m25', 'pin_p25', 'pin_m25', 'b365_p25', 'b365_m25', ...COLONNES_CLOTURE];

/** Un football-data fabriqué en mémoire : `jours` jours à partir de `debut`, 6 matchs par jour entre 12 clubs. */
function baseFd({ debut = '2019-06-01', jours = 60, graine = 5, cloture = 'normale', plante = null } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE fd_history (${COLS_FD.map((c) => `${c} ${['code', 'saison', 'date', 'date_fichier'].includes(c) ? 'TEXT' : 'INTEGER'}`).join(', ')})`);
  const ins = db.prepare(`INSERT INTO fd_history (${COLS_FD.join(', ')}) VALUES (${COLS_FD.map(() => '?').join(', ')})`);
  const u = generateur(graine);
  const v = generateur(graine + 1000);
  let id = 1;
  for (let j = 0; j < jours; j++) {
    const jour = plusJours(debut, j);
    for (let k = 0; k < 6; k++) {
      const dom = 1 + ((j + k) % 12);
      const ext = 1 + ((j + k + 5) % 12);
      const p = [0.45 + 0.1 * (u() - 0.5), 0.27];
      p.push(1 - p[0] - p[1]);
      const c = (m) => p.map((x) => Math.round(100 / (x * m)));
      let [bd, be] = [Math.floor(-Math.log(u() + 1e-9) * 1.4), Math.floor(-Math.log(u() + 1e-9) * 1.1)];
      if (plante && jour === plante.jour) [bd, be] = [plante.bd, plante.be];
      const r = cloture === 'normale' ? 1.02 : 1.02 + 0.3 * v();
      const clo = c(r);
      ins.run(id++, 'E0', '2019', jour, jour, dom, ext, 0, bd, be, ...c(1.05), ...c(1.04), ...c(1.025), ...c(1.05), ...c(1.06), 190, 195, 185, 190, 192, 192, 190, 195, ...clo, ...clo, 190 + Math.round(10 * v()), 190, 191, 191);
    }
  }
  return db;
}
const periodesEssai = { miseEnRoute: { de: '2019-01-01', a: '2019-06-30' }, P1: { de: '2019-01-01', a: '2019-06-30' }, P1pinnacle: { de: '2019-01-01', a: '2019-06-30' }, E2: { de: '2019-01-01', a: '2019-06-30' }, P2: { de: '2019-07-01', a: '2023-06-30' }, huisClos: { de: '2020-03-14', a: '2021-05-31' }, P5a: { de: '2026-10-06', a: '2026-10-18' }, dernierJourFd: '2023-06-30' };

test('T-F2 un relevé planté après odds_at ne change rien ; T-F10 le palier reconstruit = referenceDuMatch sur les mêmes relevés (20 lignes)', () => {
  const u = generateur(77);
  for (let i = 0; i < 20; i++) {
    const oddsAt = '2026-10-10T08:00:00.000Z';
    const releves = [];
    const livres = i % 3 === 0 ? ['pinnacle', 'williamhill'] : i % 3 === 1 ? ['marathonbet', 'tipico_de'] : ['tipico_de', 'williamhill', 'coolbet'];
    for (const b of livres) for (const [s, base] of [['home', 2.1], ['draw', 3.4], ['away', 3.6]]) releves.push({ bookmaker: b, selection: s, releve_at: '2026-10-10T07:30:00.000Z', price: base * (1 + 0.05 * (u() - 0.5)) });
    const p = palierDesReleves(releves, oddsAt);
    const by = livres.map((b) => {
      const r = Object.fromEntries(releves.filter((x) => x.bookmaker === b).map((x) => [x.selection, x.price]));
      return { key: b, title: b, odds1: r.home, oddsDraw: r.draw, odds2: r.away };
    });
    const ref = referenceDuMatch({ marketOdds: { odds1: 2, oddsDraw: 3.4, odds2: 3.6, byBookmaker: by } }, {});
    assert.equal(p.basis, ref.reference?.basis ?? null, `ligne ${i}`);
    // T-F2 : Pinnacle relevé APRÈS odds_at : ignoré.
    const apres = [...releves, ...['home', 'draw', 'away'].map((s, k) => ({ bookmaker: 'pinnacle', selection: s, releve_at: '2026-10-10T09:00:00.000Z', price: [2, 3.5, 3.8][k] }))];
    if (!livres.includes('pinnacle')) assert.equal(palierDesReleves(apres, oddsAt).ancre, p.ancre, `ligne ${i} : un relevé d’après odds_at changerait l’ancre`);
  }
});

/** Une base P5 en mémoire : quelques pronostics 1N2 gelés, leurs relevés payants et leurs clôtures gratuites. */
function baseP5() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE engine_picks (fixture_key TEXT, market_key TEXT, version INTEGER, recorded_at TEXT, origin TEXT, league TEXT, date TEXT, kickoff TEXT, home_id TEXT, away_id TEXT, market_id TEXT, odds_source TEXT, odds_at TEXT, lineup_state TEXT, lineup_at TEXT, engine_version INTEGER, distribution TEXT, probability REAL);
    CREATE TABLE odds_events (id INTEGER PRIMARY KEY, source TEXT, home_id TEXT, away_id TEXT, date TEXT);
    CREATE TABLE odds_quotes (event_id INTEGER, bookmaker TEXT, market TEXT, selection TEXT, kind TEXT, releve_at TEXT, price REAL);
    CREATE TABLE day_matches (rencontre INTEGER, home INTEGER, away INTEGER, date TEXT);
    CREATE TABLE team_day (rencontre INTEGER, camp INTEGER, attribue INTEGER, prolongation INTEGER, bp INTEGER, bc INTEGER, bp90 INTEGER, bc90 INTEGER);`);
  const pick = db.prepare('INSERT INTO engine_picks VALUES (?, \'result\', ?, ?, ?, \'L\', ?, ?, ?, ?, \'result\', ?, ?, ?, NULL, 3, ?, 0.5)');
  const dist = JSON.stringify({ issues: { home: 0.5, draw: 0.27, away: 0.23 } });
  const date = '2026-10-10';
  const ko = `${date}T19:00:00.000Z`;
  pick.run('f1', 1, '2026-10-09T01:00:00.000Z', 'nuit', date, ko, 'fotmob-1', 'fotmob-2', 'The Odds API (relevé manuel)', '2026-10-09T00:30:00.000Z', 'inconnue (non relue)', dist);
  pick.run('f1', 2, '2026-10-10T08:00:00.000Z', 'analyse-avance', date, ko, 'fotmob-1', 'fotmob-2', 'The Odds API (relevé manuel)', '2026-10-09T00:30:00.000Z', 'inconnue (non relue)', dist);
  pick.run('f1', 3, '2026-10-10T18:00:00.000Z', 'analyse-coup-d-envoi', date, ko, 'fotmob-1', 'fotmob-2', 'The Odds API (relevé manuel)', '2026-10-10T17:55:00.000Z', 'publiée (FotMob)', dist);
  pick.run('f1', 4, '2026-10-10T19:30:00.000Z', 'analyse-coup-d-envoi', date, ko, 'fotmob-1', 'fotmob-2', 'The Odds API (relevé manuel)', '2026-10-10T19:20:00.000Z', 'publiée (FotMob)', dist);
  db.prepare("INSERT INTO odds_events VALUES (1, 'odds-api', 'fotmob-1', 'fotmob-2', ?)").run(date);
  db.prepare("INSERT INTO odds_events VALUES (2, 'espn', 'fotmob-1', 'fotmob-2', ?)").run(date);
  const q = db.prepare('INSERT INTO odds_quotes VALUES (?, ?, \'1x2\', ?, ?, ?, ?)');
  for (const [s, p] of [['home', 2.1], ['draw', 3.4], ['away', 3.7]]) {
    q.run(1, 'tipico_de', s, 'snapshot', '2026-10-09T00:20:00.000Z', p);
    q.run(1, 'coolbet', s, 'snapshot', '2026-10-09T00:20:00.000Z', p * 1.01);
    q.run(2, 'draftkings', s, 'close', '2026-10-10T18:59:00.000Z', p * 0.98);
  }
  db.prepare('INSERT INTO day_matches VALUES (1, 1, 2, ?)').run(date);
  db.prepare('INSERT INTO team_day VALUES (1, 1, 0, 0, 2, 1, 2, 1)').run();
  return { db, q };
}

test('T-F2 (lecteur) un Pinnacle relevé après odds_at laisse l’ancre au palier 3 ; T-F3 coup d’envoi gelé après le coup d’envoi et analyses d’avance jamais lus', () => {
  const { db, q } = baseP5();
  const a = lignesGelees(db, { de: '2026-10-06', a: '2026-10-18' });
  assert.deepEqual(a.lignes.map((l) => [l.origine, l.ingredients.ancre]).sort(), [['coup-d-envoi', 'palier3'], ['nuit', 'palier3']]);
  assert.equal(a.bilan.ecartees.avance, 1);
  assert.equal(a.bilan.ecartees.apresCoupDEnvoi, 1, 'la révision 4 (19 h 30) est après le coup d’envoi');
  for (const [s, p] of [['home', 2.0], ['draw', 3.5], ['away', 3.9]]) q.run(1, 'pinnacle', s, 'snapshot', '2026-10-10T18:30:00.000Z', p);
  const b = lignesGelees(db, { de: '2026-10-06', a: '2026-10-18' });
  assert.equal(b.lignes.find((l) => l.origine === 'nuit').ingredients.ancre, 'palier3', 'Pinnacle relevé après odds_at de la nuit : ignoré');
  assert.equal(b.lignes.find((l) => l.origine === 'coup-d-envoi').ingredients.ancre, 'palier3', 'Pinnacle relevé après odds_at du coup d’envoi : ignoré');
  // Sans résultats : ni distribution, ni clôture dé-margée, ni issue.
  for (const l of a.lignes) assert.equal(['p', 'q', 'y'].some((k) => k in l), false);
  const c = lignesGelees(db, { de: '2026-10-06', a: '2026-10-18', avecResultats: true });
  assert.ok(c.lignes.every((l) => l.y === 0 && l.q && l.p));
});

test('T-F4 jamais calibration_monthly ; T-F9 aucun fichier d’exécution lu par data/combinaison/ (la classe E vient de l’appelant)', () => {
  for (const f of FICHIERS) {
    const code = sansCommentaires(path.join(COMB, f));
    assert.doesNotMatch(code, /calibration_monthly|calibrationMensuelle/, f);
    assert.doesNotMatch(code, /controle-quotidien|data\/runtime|readFileSync|atomicJson/, `${f} : aucun fichier d’exécution`);
  }
  const i = ingredientsDe({ ligne: { market_id: 'result', origin: 'nuit', odds_source: 'aucune cote (modèle de buts)', lineup_state: '' }, controle: { etat: 'constat-rouge', du: '2026-10-09' } });
  assert.equal(i.aVerifier.etat, 'constat-rouge');
});

test('T-F5 rien n’apprend sur P2 ; T-F6 changer les issues de P2 ne change aucun β appris', () => {
  const fd = mondeFd({ graine: 8, nP1: 6000, nP2: 4000, signal: 'verite' });
  const triche = fd.map((l) => (l.fenetre === 'P2' ? { ...l, fenetre: 'P1' } : l));
  assert.throws(() => B.contexteDuBanc({ fd: triche }), /T-F5/);
  const a = B.jugerUneVariante('1n2-stats-residuel', B.contexteDuBanc({ fd, tirages: 100 }));
  const brouille = fd.map((l) => (l.fenetre === 'P2' ? { ...l, y: (l.y + 1) % 3 } : l));
  const b = B.jugerUneVariante('1n2-stats-residuel', B.contexteDuBanc({ fd: brouille, tirages: 100 }));
  assert.deepEqual(a.betas, b.betas);
  assert.equal(a.apprisSur, b.apprisSur);
  const e2a = B.jugerUneVariante('1n2-recalage-marche', B.contexteDuBanc({ fd, tirages: 100 }));
  const e2b = B.jugerUneVariante('1n2-recalage-marche', B.contexteDuBanc({ fd: brouille, tirages: 100 }));
  assert.deepEqual(e2a.recalage, e2b.recalage);
});

test('T-F7 aucune colonne de clôture dans une décision, le marché, G ni la partie statistique ; la requête des comptes n’en lit aucune', () => {
  const avant = (db) => passeFd({ database: db, avecResultats: true, periodes: { ...periodesEssai, P2: { de: '2019-07-01', a: '2019-08-31' } } }).lignes.map(({ q, q25, livreCloture, ...reste }) => reste);
  const a = avant(baseFd({ cloture: 'normale' }));
  const b = avant(baseFd({ cloture: 'brouillee' }));
  assert.ok(a.length > 100);
  assert.deepEqual(a, b);
  for (const c of COLONNES_CLOTURE) assert.doesNotMatch(SQL_FD_COMPTES.replace(/CASE WHEN[^]*?END AS a_cloture25?/g, ''), new RegExp(`\\b${c}\\b`));
});

test('T-F8 les statistiques sans le jour J ; horloge-j2 sans la veille', () => {
  const jour = '2019-07-20';
  const lire = (plante) => passeFd({ database: baseFd({ plante }), avecResultats: true, periodes: { ...periodesEssai, P2: { de: '2019-07-01', a: '2019-08-31' } } }).lignes;
  const a = lire(null);
  const b = lire({ jour, bd: 9, be: 0 });
  const par = (L, d) => L.filter((l) => l.date === d).map((l) => [l.pS, l.pSj2]);
  assert.deepEqual(par(a, jour), par(b, jour), 'le jour J : inchangé');
  const lendemain = plusJours(jour, 1);
  assert.notDeepEqual(par(a, lendemain).map((x) => x[0]), par(b, lendemain).map((x) => x[0]), 'le lendemain : les statistiques changent');
  assert.deepEqual(par(a, lendemain).map((x) => x[1]), par(b, lendemain).map((x) => x[1]), 'horloge-j2 du lendemain : sans la veille');
  assert.notDeepEqual(par(a, plusJours(jour, 2)).map((x) => x[1]), par(b, plusJours(jour, 2)).map((x) => x[1]), 'horloge-j2 du surlendemain : changé');
});

test('T-F11 une case « trop-haut » de la version 5 n’étiquette jamais une ligne de la version 6', () => {
  const cases = { '5|result|6': 'trop-haut' };
  assert.equal(caseFDe(cases, { engineVersion: 5, marketId: 'result', dixieme: 6 }), 'trop-haut');
  assert.equal(caseFDe(cases, { engineVersion: 6, marketId: 'result', dixieme: 6 }), null);
  assert.equal(caseFDe(cases, { engineVersion: null, marketId: 'result', dixieme: 6 }), null);
  assert.equal(degreDeF(caseFDe(cases, { engineVersion: 6, marketId: 'result', dixieme: 6 })), 0);
});

// ======================================================================= lot 1b : la nuit (04/11/2026)

test('T-F1 l’oracle de la nuit : six instants, les mêmes lignes sur une copie coupée à l’instant du gel et sur la base entière rangée plus tard — aucune exemption', () => {
  const s = nuitFabriquee();
  assert.equal(s.oracle.length, 6);
  for (const o of s.oracle) {
    assert.ok(o.lignes >= 1, `${o.t} : aucune révision gelée à cet instant`);
    assert.deepEqual(o.ecarts, [], `${o.t} : ${JSON.stringify(o.ecarts.slice(0, 3))}`);
  }
  assert.equal(s.oracle.reduce((t, o) => t + o.lignes, 0), 30);
  // Seules les deux colonnes de la NUIT (son heure, « rangée une nuit plus tard ») échappent à la comparaison : par définition.
  const comparees = COLONNES.filter((c) => !['calcule_le', 'calcule_apres'].includes(c));
  assert.equal(comparees.length, COLONNES.length - 2);
  for (const c of ['regime', 'palier', 'degres', 'etiquette', 'manques', 'classe_seuil', 'tranche_verdict', 'a_verifier', 'p_marche']) assert.ok(comparees.includes(c), c);
});

test('T-F2 (la nuit) un Pinnacle relevé APRÈS les cotes du pronostic mais AVANT la nuit ne change rien : palier 3, régime r2', () => {
  const s = nuitFabriquee();
  const m1 = s.lignes1.find((l) => l.fixture_key === 'fotmob:fotmob-1|fotmob-2|2026-11-11' && l.market_key === 'result' && l.revision === 1);
  assert.deepEqual([m1.palier, m1.regime, JSON.parse(m1.degres).A], ['palier 3', 'r2', 1]);
  assert.match(JSON.parse(m1.manques)[0].phrase, /^la cote juste ne vient ni de Pinnacle ni du palier 2 : le palier 3 \(moyenne de 3 lignes, relevé le 09\/11 à 21 h 00\)$/);
  // La révision suivante, aux cotes relevées APRÈS ce Pinnacle, l'a bien (le même relevé, avant ses cotes à elle).
  const r2 = s.lignes2.find((l) => l.fixture_key === m1.fixture_key && l.market_key === 'result' && l.revision === 2);
  assert.deepEqual([r2.palier, r2.regime], ['Pinnacle', 'r1']);
});

test('T-F10 (élargi) le rejeu P5-a = la nuit au même instant ; le second chemin (filtre de la base + referenceDuMatch) = le palier reconstruit, 20 couples ; une fuite plantée se voit', () => {
  const s = nuitFabriquee();
  const nuit = (cle) => s.lignes1.find((l) => l.fixture_key === cle && l.market_key === 'result' && l.revision === 1);
  assert.equal(s.rejeuP5.length, 4);
  for (const r of s.rejeuP5) {
    const n = nuit(r.cle);
    assert.equal(r.basis, n.palier, r.cle);
    assert.equal(JSON.parse(n.classe_seuil).ancre, r.ancre, r.cle);
  }
  // 20 couples tirés parmi 24 fabriqués en mémoire : la nuit (filtre JavaScript) et le second chemin (filtre SQL + referenceDuMatch).
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE odds_events (id INTEGER PRIMARY KEY, source TEXT, home_id TEXT, away_id TEXT, date TEXT);
    CREATE TABLE odds_quotes (event_id INTEGER, bookmaker TEXT, market TEXT, selection TEXT, kind TEXT, releve_at TEXT, price REAL);`);
  const u = generateur(1010);
  const pool = [];
  const releves = new Map();
  for (let i = 0; i < 24; i++) {
    const c = { cle: `f${i}`, homeId: `fotmob-${i}`, awayId: `fotmob-${100 + i}`, date: '2026-10-12', oddsAt: '2026-10-11T20:00:00.000Z' };
    db.prepare("INSERT INTO odds_events VALUES (?, 'odds-api', ?, ?, ?)").run(i + 1, c.homeId, c.awayId, c.date);
    const livres = i % 4 === 0 ? ['pinnacle', 'williamhill'] : i % 4 === 1 ? ['marathonbet', 'tipico_de'] : i % 4 === 2 ? ['tipico_de', 'williamhill', 'coolbet'] : ['coolbet'];
    const lignes = [];
    for (const b of livres) for (const [sel, base] of [['home', 2.1], ['draw', 3.4], ['away', 3.6]]) lignes.push({ bookmaker: b, selection: sel, releve_at: '2026-10-11T19:00:00.000Z', price: base * (1 + 0.05 * (u() - 0.5)) });
    // Un Pinnacle relevé APRÈS le pronostic : le second chemin l'ignore toujours.
    for (const [sel, p] of [['home', 1.9], ['draw', 3.7], ['away', 4.2]]) lignes.push({ bookmaker: 'pinnacle', selection: sel, releve_at: '2026-10-11T23:00:00.000Z', price: p });
    for (const l of lignes) db.prepare("INSERT INTO odds_quotes VALUES (?, ?, '1x2', ?, 'snapshot', ?, ?)").run(i + 1, l.bookmaker, l.selection, l.releve_at, l.price);
    releves.set(c.cle, lignes);
    pool.push(c);
  }
  const principal = (coupure) => (c) => {
    const p = palierDesReleves(releves.get(c.cle), coupure ?? c.oddsAt);
    return { ancre: p.ancre, basis: p.basis, probabilites: p.probabilites };
  };
  const juste = controlerLesPaliers(db, { pool, principal: principal(null), graine: 20261104, couples: 20 });
  assert.deepEqual([juste.lignes, juste.couples, juste.ecarts.length], [24, 20, 0]);
  for (const c of pool.slice(0, 4)) {
    const second = palierParLaBase(db, c);
    assert.equal(second.basis, principal(null)(c).basis, c.cle);
    if (second.probabilites) assert.deepEqual(second.probabilites.map((x) => x.toFixed(12)), principal(null)(c).probabilites.map((x) => x.toFixed(12)));
  }
  const fuite = controlerLesPaliers(db, { pool, principal: principal('9999-12-31T00:00:00.000Z'), graine: 20261104, couples: 20 });
  assert.ok(fuite.ecarts.length >= 10, `${fuite.ecarts.length} écarts`);
  for (const e of fuite.ecarts) assert.match(e.texte, /^fotmob-\d+ – fotmob-\d+ du 2026-10-12 \(cotes du pronostic : 2026-10-11T20:00:00\.000Z\) : /);
  // Le même jour, les mêmes couples (graine = le jour).
  assert.deepEqual(controlerLesPaliers(db, { pool, principal: principal('9999-12-31T00:00:00.000Z'), graine: 20261104, couples: 20 }).ecarts, fuite.ecarts);
  assert.deepEqual(s.nuit1.controle.ecarts, []);
});

/** Le sha1 (octets bruts) du fichier GELÉ retouché par le lot 1b de la 38, relevé en partie 0 du lot 1b (04/11/2026, 18 h 10, = dépôt). */
const GELE_RETOUCHE = Object.freeze(['jobs/matchStatsAutoRefresh.js', 'd854bfd2c1cf5117fdb573c50724fd6f5b0b4c69']);
function blocs38(texte) {
  const garde = [];
  const ajoutes = [];
  let dans = null;
  for (const l of texte.split('\n')) {
    if (/\[étape 38, lot 1b : ajout pur, début\]/.test(l)) {
      dans = [];
      continue;
    }
    if (/\[étape 38, lot 1b : ajout pur, fin\]/.test(l)) {
      ajoutes.push(dans.join('\n'));
      dans = null;
      continue;
    }
    (dans ?? garde).push(l);
  }
  return { garde: garde.join('\n'), ajoutes };
}

test('T-X10 l’actualisation (gelée pendant l’essai 27) : sans ses deux blocs « ajout pur » de la 38, identique À L’OCTET ; les blocs n’écrivent rien et n’atteignent data/combinaison/ que par import() ; les autres tables identiques avec et sans l’étape', () => {
  const [f, attendu] = GELE_RETOUCHE;
  const texte = fs.readFileSync(path.join(SRC, f), 'utf8');
  const { garde, ajoutes } = blocs38(texte);
  assert.equal(ajoutes.length, 2, 'deux blocs ajoutés');
  assert.equal(crypto.createHash('sha1').update(Buffer.from(garde, 'utf8')).digest('hex'), attendu, 'hors des blocs marqués, rien ne change');
  for (const b of ajoutes) {
    const code = b.replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
    assert.doesNotMatch(code, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|upsert|writeJson|writeFile|\.exec\(/, 'un bloc ajouté écrit');
    assert.doesNotMatch(code, /^import .* from/m, 'aucun import statique ajouté');
    for (const m of code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) assert.match(m[1], /^\.\.\/data\/combinaison\/combinaisonNuit\.js$|^\.\.\/data\/repositories\/controleQuotidienRepository\.js$/, m[1]);
  }
  // Les blocs des étapes 33 et 34 sont restés tels quels (deux chacun).
  for (const e of ['33', '34']) assert.equal((texte.match(new RegExp(`\\[étape ${e}, lot 1b : ajout pur, début\\]`, 'g')) ?? []).length, 2, `étape ${e}`);
  // La nuit n'écrit que ses deux tables ; les autres tables de la base, identiques avant et après la vraie nuit.
  const nuit = sansCommentaires(path.join(COMB, 'combinaisonNuit.js'));
  const ecrites = new Set([...nuit.matchAll(/(?:INSERT(?: OR IGNORE)? INTO|DELETE FROM|UPDATE)\s+([a-z_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...ecrites].sort(), ['combinaison_avant_match', 'combinaison_etat']);
  assert.doesNotMatch(nuit, /OR REPLACE/, 'jamais réécrite (T-N3)');
  assert.equal(nuitFabriquee().autresIdentiques, true);
});

test('T-X11 le serveur, la passe et la route de l’analyse se chargent quand data/combinaison/ lève : la route répond (« illisible »), l’étape est en échec sans lever', () => {
  const copie = preparerCopie({});
  let r;
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-combinaison-route.mjs'), { args: ['casse', '{}'], timeout: 300_000 });
  } finally {
    copie.nettoyer();
  }
  assert.equal(r.code, 0, r.erreurs.slice(-3000));
  assert.equal(r.reseau, false);
  const s = r.json;
  assert.equal(s.code, 200, 'la route de l’analyse répond');
  assert.deepEqual(s.combinaison, { version: 1, etat: 'illisible', raison: 'lecture-ratee' });
  assert.ok(s.cles.includes('prediction') && s.cles.includes('staking') && s.cles.includes('mise'), 'l’analyse est entière');
  assert.equal(s.etape.status, 'error');
  assert.match(s.etape.summary, /le module de la combinaison ne se charge pas \(dossier de la combinaison cassé \(essai\)\)/);
  assert.deepEqual(s.etapesChargees, ['joueursABlanc', 'combinaisonABlanc', 'controleQuotidien']);
  // Rien de statique : ni l'actualisation, ni le contrôleur, ni le serveur n'importent data/combinaison/ autrement que par import().
  for (const f of ['jobs/matchStatsAutoRefresh.js', 'api/controllers/analysis.controller.js', 'server.js', 'app.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /^import [^;]*combinaison/m, f);
  }
});
