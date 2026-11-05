/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-combinaison-nuit.mjs <serveur de la copie> <options JSON>
 *
 * LA NUIT ET LA LECTURE DE LA COMBINAISON À BLANC (étape 38, lot 1b, 04/11/2026), sur une base NEUVE de la copie et des
 * pronostics gelés FABRIQUÉS (aucun résultat réel) : 240 matchs passés réglés (la case F), six rencontres à venir — payante
 * au palier 3 avec un Pinnacle relevé APRÈS ses cotes (T-F2), gratuite avec un club « à vérifier » (révision d'hier :
 * contrôle inconnu ; révision de l'analyse : constat rouge), sans cote avec ses buts et ses corners, sans identifiants,
 * gelée après le coup d'envoi, payante Pinnacle relevée avant la compo (r5) —, une révision de la candidate en essai écrite
 * par le dépôt, un contrôle quotidien de la veille. Les nuits et leurs cas : le jeton pris (reportée), le délai dépassé, la
 * fuite plantée (rien rangé), la vraie nuit à part (tranches de 5), la nuit suivante (jamais réécrite, une révision neuve),
 * la reprise après une nuit interrompue, l'oracle sur six instants (copie coupée / base entière), le rejeu P5-a, les autres
 * tables identiques avec et sans l'étape, la lecture de la page du match. (La passe elle-même — module qui ne se charge pas,
 * contrôle de la veille reçu — est essayée par le test, hors de la copie.) Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { importeur } from './versionsMoteurCommun.mjs';

const [serveur, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const N = await imp('data/combinaison/combinaisonNuit.js');
const C = await imp('data/combinaison/nuitDeLaCombinaison.js');
const R = await imp('data/combinaison/combinaisonRead.js');
const P5 = await imp('data/combinaison/lecteurP5.js');
const D = await imp('data/enregistreurs/depot.js');
const { commencerCalculLourd } = await imp('utils/calculLourd.js');
const s = { ok: true, pid: process.pid };
const sha1 = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

const cheminBase = process.env.MATCH_STATS_DB;
const database = M.openDb();
const LIGUE = 'Ligue Test';
const T = Date.parse('2026-11-10T00:40:00.000Z'); // la nuit du 10/11 (01 h 40 à Paris)
const HIER_NUIT = '2026-11-09T00:30:00.000Z';
const CETTE_NUIT = '2026-11-10T00:30:00.000Z';

// ------------------------------------------------------------ fabrication
let u = 7;
const hasard = () => {
  u = (u * 16807) % 2147483647;
  return u / 2147483647;
};
const insMatch = database.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const COLS_EP = ['fixture_key', 'market_key', 'version', 'recorded_at', 'origin', 'match_id', 'league', 'date', 'kickoff', 'home_name', 'away_name', 'home_id', 'away_id', 'market_id', 'market', 'params', 'choice', 'label', 'probability', 'predicted_odds', 'market_odds', 'min_odds', 'odds_source', 'odds_at', 'lineup_state', 'lineup_at', 'engine_hash', 'engine_version', 'distribution'];
const insPick = database.prepare(`INSERT INTO engine_picks (${COLS_EP.join(', ')}) VALUES (${COLS_EP.map(() => '?').join(', ')})`);
const pick = (p) => insPick.run(...COLS_EP.map((c) => p[c] ?? null));
const fk = (h, a, d) => `fotmob:fotmob-${h}|fotmob-${a}|${d}`;
const resultat = (f, { choice = 'home', probability, recorded_at, origin = 'nuit', version = 1, odds_source = 'cotes gratuites : espn', odds_at = null, lineup_state = 'inconnue (non relue)', lineup_at = null, engine_version = 5 }) =>
  pick({ fixture_key: f.key, market_key: 'result', version, recorded_at, origin, league: LIGUE, date: f.date, kickoff: f.kickoff, home_name: f.hn, away_name: f.an, home_id: f.h, away_id: f.a, market_id: 'result', market: 'Résultat', params: JSON.stringify({ outcome: choice }), choice, label: choice === 'home' ? `${f.hn} gagne` : choice === 'away' ? `${f.an} gagne` : 'Match nul', probability, odds_source, odds_at: odds_at ?? recorded_at, lineup_state, lineup_at, engine_hash: 'abc123', engine_version, distribution: JSON.stringify({ issues: { home: probability, draw: 0.25, away: 0.75 - probability } }) });
const fixture = (h, a, date, kickoff) => ({ h: `fotmob-${h}`, a: `fotmob-${a}`, hn: `Club ${h}`, an: `Club ${a}`, date, kickoff, key: fk(h, a, date) });

// 1. Les matchs passés (15/10 → 07/11), 10 par jour : réglés au magasin ; leurs pronostics du résultat (révision 1, gelés la veille).
let passes = 0;
for (let j = 0; j < 24; j++) {
  const date = plusJours('2026-10-15', j);
  for (let k = 0; k < 10; k++) {
    const h = 100 + ((j * 10 + k) % 40);
    const a = 200 + ((j * 7 + k * 3) % 40);
    const f = fixture(h, a, date, `${date}T18:00:00.000Z`);
    // Le moteur annonce 55 % pour le domicile ; il ne gagne qu'une fois sur trois : la case « 5|result|5 » est trop haute.
    const gagne = hasard() < 0.33;
    insMatch.run(`${date}-club-${h}-club-${a}`, `m${h}-${a}-${date}`, date, LIGUE, f.hn, f.an, f.h, f.a, gagne ? 2 : 0, gagne ? 0 : 1, `${date}T22:00:00.000Z`);
    resultat(f, { probability: 0.55, recorded_at: `${plusJours(date, -1)}T00:30:00.000Z` });
    passes++;
  }
}
s.passes = passes;

// 2. Les relevés payants (odds_events / odds_quotes).
const insEvent = database.prepare(`INSERT INTO odds_events (id, source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insQuote = database.prepare(`INSERT INTO odds_quotes (event_id, bookmaker, market, selection, kind, seq, releve_at, price) VALUES (?, ?, '1x2', ?, 'snapshot', ?, ?, ?)`);
let idEvent = 1;
const releve = (f, livres, releveAt, prix = [2.1, 3.4, 3.6]) => {
  const id = idEvent++;
  insEvent.run(id, 'odds-api', `ev-${id}`, LIGUE, f.date, f.kickoff, f.hn, f.an, f.h, f.a, releveAt);
  for (const b of livres) ['home', 'draw', 'away'].forEach((sel, i) => insQuote.run(id, b, sel, releveAt, releveAt, prix[i] * (b === 'pinnacle' ? 0.97 : 1 + 0.01 * livres.indexOf(b))));
  return id;
};

// 3. Les rencontres à venir.
const M1 = fixture(1, 2, '2026-11-11', '2026-11-11T19:00:00.000Z'); // payante, palier 3 ; un Pinnacle relevé APRÈS ses cotes
const M2 = fixture(3, 4, '2026-11-11', '2026-11-11T17:00:00.000Z'); // gratuite ; le club 3 « à vérifier »
const M3 = fixture(5, 6, '2026-11-12', '2026-11-12T20:00:00.000Z'); // sans cote ; buts et corners
const M5 = fixture(7, 8, '2026-11-09', '2026-11-09T18:00:00.000Z'); // gelée après le coup d'envoi
const M6 = fixture(9, 10, '2026-11-12', '2026-11-12T19:45:00.000Z'); // payante Pinnacle, relevée avant la compo (r5)
releve(M1, ['tipico_de', 'coolbet', 'williamhill'], '2026-11-09T20:00:00.000Z');
const planteM1 = releve(M1, ['pinnacle'], '2026-11-10T00:35:00.000Z', [1.8, 3.6, 4.6]);
releve(M6, ['pinnacle', 'williamhill'], '2026-11-09T21:00:00.000Z');
resultat(M1, { probability: 0.55, recorded_at: CETTE_NUIT, odds_source: 'The Odds API (relevé manuel)', odds_at: '2026-11-09T20:05:00.000Z' });
resultat(M2, { probability: 0.42, recorded_at: HIER_NUIT, odds_source: 'cotes gratuites : espn, 365scores' });
resultat(M2, { probability: 0.44, recorded_at: '2026-11-09T14:00:00.000Z', origin: 'analyse-avance', version: 2, odds_source: 'cotes gratuites : espn, 365scores' });
resultat(M3, { probability: 0.38, recorded_at: CETTE_NUIT, odds_source: 'aucune cote (modèle de buts)' });
pick({ fixture_key: M3.key, market_key: 'totalGoals', version: 1, recorded_at: CETTE_NUIT, origin: 'nuit', league: LIGUE, date: M3.date, kickoff: M3.kickoff, home_id: M3.h, away_id: M3.a, market_id: 'totalGoals', params: JSON.stringify({ line: 2.5, side: 'over' }), choice: 'over', probability: 0.58, odds_source: 'aucune cote (modèle de buts)', odds_at: CETTE_NUIT, lineup_state: 'pas encore publiée', engine_version: 5, distribution: JSON.stringify({ ligne: 2.5, issues: { over: 0.58, under: 0.42 } }) });
pick({ fixture_key: M3.key, market_key: 'totalCorners', version: 1, recorded_at: CETTE_NUIT, origin: 'nuit', league: LIGUE, date: M3.date, kickoff: M3.kickoff, home_id: M3.h, away_id: M3.a, market_id: 'totalCorners', params: JSON.stringify({ line: 9.5, side: 'over' }), choice: 'over', probability: 0.51, odds_source: 'aucune cote (modèle de buts)', odds_at: CETTE_NUIT, lineup_state: 'pas encore publiée', engine_version: 5 });
pick({ fixture_key: 'nom:ligue test|club inconnu|club 7007|2026-11-11', market_key: 'result', version: 1, recorded_at: CETTE_NUIT, origin: 'nuit', league: LIGUE, date: '2026-11-11', home_name: 'Club Inconnu', away_name: 'Club 7007', market_id: 'result', choice: 'home', probability: 0.5, odds_source: 'aucune cote (modèle de buts)', odds_at: CETTE_NUIT, engine_version: 5 });
resultat(M5, { probability: 0.6, recorded_at: '2026-11-09T18:30:00.000Z', origin: 'analyse-coup-d-envoi', odds_source: 'cotes gratuites : espn' });
resultat(M6, { probability: 0.48, recorded_at: CETTE_NUIT, odds_source: 'The Odds API (relevé manuel)', odds_at: '2026-11-09T21:05:00.000Z', lineup_state: 'publiée (FotMob)', lineup_at: '2026-11-09T22:00:00.000Z' });
// 4. La candidate en essai : une révision de ses buts, écrite par le dépôt (le seul qui écrit et lit sa table).
const candidat = (await imp('core/engine/engineVersions.js')).CANDIDATE_EN_ESSAI?.id ?? 'modele-buts-v1';
D.ecrirePronosticsABlanc([{ candidateId: candidat, fixtureKey: M3.key, marketKey: 'totalGoals', recordedAt: CETTE_NUIT, candidateHash: 'f01dd8496f56a415', serviceVersion: 5, league: LIGUE, date: M3.date, kickoff: M3.kickoff, homeId: M3.h, awayId: M3.a, marketId: 'totalGoals', params: JSON.stringify({ line: 2.5, side: 'over' }), choice: 'over', probability: 0.61, distribution: JSON.stringify({ ligne: 2.5, issues: { over: 0.61, under: 0.39 } }), oddsSource: 'aucune cote (modèle de buts)', oddsAt: CETTE_NUIT, lineupState: 'pas encore publiée' }], { database });
s.candidat = candidat;

// 5. Le contrôle quotidien de la veille (reçu de la passe) : un constat rouge sur le club 3.
const controle = {
  le: '2026-11-09T01:00:00.000Z',
  aVerifier: {
    clubs: { 'fotmob-3': [{ id: 'score:2026-11-01-club-3', controle: 'score-football-data', texte: 'Score à vérifier : Club 3 – Club 9 du 01/11/2026', date: '2026-11-01', matchKey: 'm', familles: ['tout'], classe: 'rouge' }] },
    ligues: {},
    global: []
  }
};

// ------------------------------------------------------------ outils
const lignes = (db = database) => db.prepare('SELECT * FROM combinaison_avant_match ORDER BY source, candidate_id, fixture_key, market_key, revision').all().map((r) => ({ ...r }));
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const photoDesAutresTables = (db) => {
  const out = {};
  for (const t of tables(db)) {
    if (t.startsWith('combinaison_')) continue;
    out[t] = sha1(db.prepare(`SELECT * FROM "${t}"`).all().map((r) => JSON.stringify(r)).sort().join('\n'));
  }
  return out;
};
const lecture = (f, extra = {}) => R.combinaisonDuMatch({ match: { home: f.hn, away: f.an, commenceTime: f.kickoff, scoreInputs: { home: { teamId: f.h }, away: { teamId: f.a } }, ...extra }, database, config: { valueBookmakers: ['unibet_fr', 'betclic_fr', 'williamhill'] } });

// Avant toute nuit : la lecture attend.
s.lectureAvant = lecture(M1);

// ------------------------------------------------------------ les nuits
// a. Le jeton pris par un autre calcul lourd → reportée, rien de rangé.
{
  const rendre = commencerCalculLourd('un autre calcul');
  try {
    s.reporte = await N.faireLaCombinaisonDeLaNuit({ maintenant: T, database, chemin: cheminBase, controle });
  } finally {
    rendre();
  }
  s.reporteEtape = N.resultatDeLEtape(s.reporte, { updatedAt: '2026-11-10T00:41:00.000Z' });
  s.apresReporte = lignes().length;
}
// b. Le délai dépassé → l'enfant arrêté, rien de rangé.
s.delai = await N.faireLaCombinaisonDeLaNuit({ maintenant: T, database, chemin: cheminBase, controle, delaiMs: 1 });
s.apresDelai = lignes().length;
// c. La fuite plantée (la nuit oublie la coupure à odds_at) → le contrôle la voit, rien de rangé, l'alerte.
s.fuite = await N.faireLaCombinaisonDeLaNuit({ maintenant: T, database, chemin: cheminBase, controle, fuite: true, aPart: false });
s.fuiteEtape = N.resultatDeLEtape(s.fuite, { updatedAt: '2026-11-10T00:42:00.000Z' });
s.apresFuite = lignes().length;
// d. Les autres tables avant la vraie nuit.
const avantAutres = photoDesAutresTables(database);
// e. La VRAIE nuit, à part, par tranches de 5.
s.nuit1 = await N.faireLaCombinaisonDeLaNuit({ maintenant: T, database, chemin: cheminBase, controle, tranche: 5 });
s.nuit1Etape = N.resultatDeLEtape(s.nuit1, { updatedAt: '2026-11-10T00:45:00.000Z' });
s.lignes1 = lignes();
s.autresIdentiques = JSON.stringify(photoDesAutresTables(database)) === JSON.stringify(avantAutres);
s.etat1 = N.etatDeLaCombinaison({ database });
// f. La nuit suivante : une révision neuve de M1 ; rien de rangé n'est réécrit.
resultat(M1, { probability: 0.52, recorded_at: '2026-11-10T15:00:00.000Z', origin: 'analyse-avance', version: 2, odds_source: 'The Odds API (relevé manuel)', odds_at: '2026-11-10T14:55:00.000Z' });
const avantNuit2 = sha1(lignes());
// Une ligne déjà rangée « modifiée » à la main dans la base : la nuit suivante ne la réécrit pas (INSERT OR IGNORE).
database.prepare("UPDATE combinaison_avant_match SET etiquette = 'marque-du-test' WHERE fixture_key = ? AND market_key = 'result' AND revision = 1").run(M3.key);
s.nuit2 = await N.faireLaCombinaisonDeLaNuit({ maintenant: T + 86_400_000, database, chemin: cheminBase, controle, aPart: false });
s.lignes2 = lignes();
s.marqueGardee = database.prepare("SELECT etiquette FROM combinaison_avant_match WHERE fixture_key = ? AND market_key = 'result' AND revision = 1").get(M3.key)?.etiquette ?? null;
s.avantNuit2 = avantNuit2;
// Une ligne déjà rangée présentée DE NOUVEAU au rangement (une nuit qui la recalculerait) : jamais réécrite (INSERT OR IGNORE).
{
  const deja = s.lignes1.find((l) => l.fixture_key === M3.key && l.market_key === 'result' && l.revision === 1);
  const gen = N.__pourLesTests.rangerLesLignes({ database, lignes: [{ ...deja, etiquette: 'reecrite' }], tranche: 250, mesure: {} });
  let r = gen.next();
  while (!r.done) r = gen.next();
  s.reRangement = r.value;
  s.marqueApresReRangement = database.prepare("SELECT etiquette FROM combinaison_avant_match WHERE fixture_key = ? AND market_key = 'result' AND revision = 1").get(M3.key)?.etiquette ?? null;
}
// g. La reprise d'une nuit interrompue pendant son rangement.
database.prepare("INSERT INTO combinaison_etat (cle, valeur) VALUES ('en_cours', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify({ calculeLe: '2026-11-11T00:40:00.000Z' }));
s.lectureEnCours = lecture(M1);
s.nuit3 = await N.faireLaCombinaisonDeLaNuit({ maintenant: T + 2 * 86_400_000, database, chemin: cheminBase, controle, aPart: false });
s.etat3 = N.etatDeLaCombinaison({ database });

// ------------------------------------------------------------ la lecture de la page du match
s.lectures = {
  M1: lecture(M1, { marketOdds: { odds1: 2.1, oddsDraw: 3.4, odds2: 3.6, byBookmaker: [{ key: 'tipico_de', title: 'Tipico', odds1: 2.1, oddsDraw: 3.4, odds2: 3.6 }, { key: 'coolbet', title: 'Coolbet', odds1: 2.12, oddsDraw: 3.42, odds2: 3.63 }] } }),
  M2: lecture(M2, { marketOdds: { odds1: 2.3, oddsDraw: 3.2, odds2: 3.3, byBookmaker: [{ key: 'espn_draftkings', title: 'DraftKings', referenceOnly: true, odds1: 2.3, oddsDraw: 3.2, odds2: 3.3 }] } }),
  M3: lecture(M3),
  M6: lecture(M6, { marketOdds: { odds1: 2.0, oddsDraw: 3.5, odds2: 3.9, byBookmaker: [{ key: 'pinnacle', title: 'Pinnacle', odds1: 2.0, oddsDraw: 3.5, odds2: 3.9 }, { key: 'unibet_fr', title: 'Unibet', odds1: 1.95, oddsDraw: 3.3, odds2: 3.7 }] } }),
  inconnu: R.combinaisonDuMatch({ match: { home: 'Club Inconnu', away: 'Club 7007', commenceTime: '2026-11-11T12:00:00.000Z', scoreInputs: { home: { teamId: null }, away: { teamId: 'fotmob-7007' } } }, database }),
  illisible: R.combinaisonDuMatch({ match: { home: 'A', away: 'B', commenceTime: '2026-11-11T12:00:00.000Z', scoreInputs: { home: { teamId: 'fotmob-1' }, away: { teamId: 'fotmob-2' } } }, database: { prepare: () => { throw new Error('base fermée'); } } })
};
{
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) lecture(M1);
  s.lectureMs = (performance.now() - t0) / 50;
}

// ------------------------------------------------------------ T-F10 : le rejeu P5-a = la nuit au même instant
{
  const p5 = P5.lignesGelees(database, { de: '2026-11-09', a: '2026-11-12' });
  s.rejeuP5 = p5.lignes.map((l) => ({ cle: l.cle, origine: l.origine, ancre: l.ingredients.ancre, basis: l.ingredients.ancreDetail?.basis ?? null }));
}

// ------------------------------------------------------------ T-F1 : l'oracle, six instants
{
  const instants = ['2026-10-20T00:30:00.000Z', '2026-11-01T00:30:00.000Z', HIER_NUIT, '2026-11-09T14:00:00.000Z', '2026-11-09T18:30:00.000Z', CETTE_NUIT];
  const dossier = process.env.CM_TEST_DOSSIER;
  // La base entière : les lignes rangées par la vraie nuit (avant la marque du test sur une ligne).
  const entiere = s.lignes1;
  const oracle = [];
  for (const [i, t] of instants.entries()) {
    const fichier = path.join(dossier, `oracle-${i}.db`);
    fs.rmSync(fichier, { force: true });
    database.exec(`VACUUM INTO '${fichier.replace(/'/g, "''")}'`);
    const coupee = new DatabaseSync(fichier);
    // La copie coupée à l'instant t : ce que l'appli savait alors — rien gelé après, aucun relevé après, aucun match d'après,
    // aucune ligne de la combinaison.
    coupee.exec('DELETE FROM combinaison_avant_match; DELETE FROM combinaison_etat;');
    coupee.prepare('DELETE FROM engine_picks WHERE recorded_at > ?').run(t);
    coupee.prepare('DELETE FROM odds_quotes WHERE releve_at > ?').run(t);
    coupee.prepare('DELETE FROM matches WHERE date >= ?').run(t.slice(0, 10));
    const vues = [];
    C.calculerLaNuitDeLaCombinaison({ database: coupee, instant: Date.parse(t), graine: 1, controle, candidats: [candidat], envoyer: (l) => vues.push(...l) });
    coupee.close();
    fs.rmSync(fichier, { force: true });
    const memes = vues.filter((v) => v.recorded_at === t);
    const ecarts = [];
    for (const v of memes) {
      const e = entiere.find((x) => x.source === v.source && x.candidate_id === v.candidate_id && x.fixture_key === v.fixture_key && x.market_key === v.market_key && x.revision === v.revision);
      if (!e) {
        ecarts.push({ cle: `${v.fixture_key}|${v.market_key}|${v.revision}`, colonne: 'absente' });
        continue;
      }
      for (const c of C.COLONNES) if (!['calcule_le', 'calcule_apres'].includes(c) && JSON.stringify(e[c] ?? null) !== JSON.stringify(v[c] ?? null)) ecarts.push({ cle: `${v.fixture_key}|${v.market_key}|${v.revision}`, colonne: c, entiere: e[c], coupee: v[c] });
    }
    oracle.push({ t, lignes: memes.length, ecarts });
  }
  s.oracle = oracle;
}

const resume = (r) => r && { mode: r.mode, raison: r.raison ?? null, erreur: r.erreur ?? null, ecrites: r.ecrites ?? null, bilan: r.bilan ?? null, controle: r.controle ?? null, repriseApres: r.repriseApres ?? null, transactions: r.transactions ?? null, plusLongueTrancheMs: r.plusLongueTrancheMs ?? null, blocMaxMs: r.blocMaxMs ?? null };
for (const k of ['reporte', 'delai', 'fuite', 'nuit1', 'nuit2', 'nuit3']) s[k] = resume(s[k]);
console.log(JSON.stringify(s));
process.exit(0);
