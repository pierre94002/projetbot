/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-reperes.mjs <serveur de la copie> <phase>
 *
 * Étape 15 — les repères de chaque championnat. Base = la copie de la base
 * d'essai, réseau coupé, heure figée au 05/10/2026 12 h UTC (saisons en
 * cours : 2026-27, et 2026 pour une saison d'année civile). Rien n'est lu
 * ailleurs. Des saisons football-data sont PLANTÉES dans la copie (table
 * fd_history) avec des valeurs connues, pour le comptage à la main et la
 * provenance. Sortie : une ligne JSON.
 *
 * Phases :
 *   calcul       saisons plantées (football-data 2021-22 et 2022-23 de la Premier League, 2025-26 aussi chez FotMob,
 *                fichier par pays de la MLS 2022, une saison 2019-20 aberrante), un résultat attribué planté chez
 *                FotMob ; le calcul de nuit ;
 *                ce que lit la route (EPL, MLS, une coupe, un inconnu) ; les attendus de l'étape 14
 *   incremental  second calcul (rien), une rencontre modifiée (sa saison seule), un fichier football-data relu
 *                (sa saison seule), une saison disparue (retirée), « tout » ; les pauses rendues au serveur
 *   etape        l'étape « reperes » telle que la passe la lance (bilan, quand elle est due, sa place)
 *   fenetres     les fenêtres du calcul face à celles du moteur (statInputsRead.statInputsFromStore)
 *   route        GET /api/match-stats/benchmarks (application Express, sans réseau), lecture seule
 *   ecran        les réponses de la route pour le rendu du bloc (jamais, prêt, coupe)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
const RUNTIME = path.join(serveur, 'data', 'runtime');

const { openDb, closeDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const L = await imp('data/db/leagueBenchmarks.js');

const empreinte = () => crypto.createHash('sha1').update(fs.readFileSync(BASE)).digest('hex');
const sortie = { phase };

// ------------------------------------------------------------ les saisons football-data plantées

/**
 * Premier League 2021-22 : dix matchs aux valeurs connues (comptées à la main dans le test) —
 * un 0-0 de corners (un vrai zéro chez football-data), des corners non publiés (NULL), une
 * mi-temps non publiée, des matchs sans carton.
 */
const E0_2122 = [
  // [jour, bd, be, mtd, mte, corners_d, corners_e, tirs_d, tirs_e, cadres_d, cadres_e, jaunes_d, jaunes_e, rouges_d, rouges_e]
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
/** 2022-23 : huit matchs, des buts seulement comptés (le reste relevé normalement). */
const E0_2223 = [
  ['2022-08-06', 1, 0, 0, 0, 6, 4, 11, 9, 4, 3, 1, 1, 0, 0],
  ['2022-08-13', 2, 2, 1, 1, 5, 5, 13, 12, 6, 5, 2, 2, 0, 0],
  ['2022-09-03', 3, 1, 2, 0, 7, 3, 16, 7, 8, 2, 1, 3, 0, 0],
  ['2022-10-08', 0, 0, 0, 0, 4, 4, 8, 9, 2, 2, 2, 2, 0, 0],
  ['2022-11-12', 1, 2, 1, 1, 3, 6, 10, 14, 3, 6, 3, 1, 0, 0],
  ['2023-01-14', 2, 1, 0, 1, 6, 2, 12, 10, 5, 4, 1, 2, 0, 0],
  ['2023-03-04', 1, 1, 1, 0, 5, 5, 9, 11, 4, 4, 2, 0, 0, 1],
  ['2023-05-20', 4, 1, 2, 1, 8, 3, 20, 8, 9, 3, 0, 1, 0, 0]
];
/** MLS 2022, fichier par pays (score final seulement). */
const USA_2022 = [
  ['2022-02-26', 2, 1],
  ['2022-03-05', 0, 0],
  ['2022-04-09', 3, 3],
  ['2022-06-18', 1, 0],
  ['2022-08-20', 2, 0],
  ['2022-10-09', 1, 2]
];

function equipe(db, pays, nom) {
  db.prepare('INSERT OR IGNORE INTO fd_teams (pays, nom) VALUES (?, ?)').run(pays, nom);
  return db.prepare('SELECT id FROM fd_teams WHERE pays = ? AND nom = ?').get(pays, nom).id;
}

function planterFd(db) {
  const dom = equipe(db, 'ENG', 'Club essai A');
  const ext = equipe(db, 'ENG', 'Club essai B');
  const ins = db.prepare(
    `INSERT INTO fd_history (code, saison, date, date_fichier, dom, ext, bd, be, mtd, mte, corners_d, corners_e, tirs_d, tirs_e, cadres_d, cadres_e, jaunes_d, jaunes_e, rouges_d, rouges_e)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec('BEGIN IMMEDIATE');
  for (const [saison, lignes] of [['2021-22', E0_2122], ['2022-23', E0_2223]]) {
    for (const l of lignes) ins.run('E0', saison, l[0], l[0], dom, ext, ...l.slice(1));
  }
  // 2025-26 : les rencontres de la base d'essai, recopiées (mêmes scores et mêmes statistiques) — la saison est
  // entière au magasin FotMob, qui fait foi ; elle sert au recoupement.
  const memes = db
    .prepare(
      `SELECT m.date, m.home_goals hg, m.away_goals ag, th.corner_kicks hc, ta.corner_kicks ac, th.total_shots hs, ta.total_shots aas,
              th.shots_on_goal hst, ta.shots_on_goal ast, th.yellow_cards hy, ta.yellow_cards ay, th.red_cards hr, ta.red_cards ar
       FROM matches m LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home' LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
       WHERE m.league = 'EPL' AND m.date >= '2025-07-01' AND m.date < '2026-07-01'`
    )
    .all();
  for (const m of memes) ins.run('E0', '2025-26', m.date, m.date, dom, ext, m.hg, m.ag, null, null, m.hc, m.ac, m.hs, m.aas, m.hst, m.ast, m.hy, m.ay, m.hr, m.ar);
  const usaD = equipe(db, 'USA', 'Club essai C');
  const usaE = equipe(db, 'USA', 'Club essai D');
  for (const l of USA_2022) ins.run('USA', '2022', l[0], l[0], usaD, usaE, l[1], l[2], null, null, null, null, null, null, null, null, null, null, null, null);
  db.exec('COMMIT');
  return { recopiees2526: memes.length };
}

/** Une saison ABERRANTE (2019-20) : des scores ordinaires, 25 corners à chaque match — ce que l'étape 14 doit repérer. */
function planterAberrant(db) {
  const dom = equipe(db, 'ENG', 'Club essai A');
  const ext = equipe(db, 'ENG', 'Club essai B');
  const ins = db.prepare(
    `INSERT INTO fd_history (code, saison, date, date_fichier, dom, ext, bd, be, mtd, mte, corners_d, corners_e, tirs_d, tirs_e, cadres_d, cadres_e, jaunes_d, jaunes_e, rouges_d, rouges_e)
     VALUES ('E0', '2019-20', ?, ?, ?, ?, ?, ?, NULL, NULL, 13, 12, 12, 11, 4, 4, 2, 2, 0, 0)`
  );
  const scores = [[1, 0], [2, 1], [1, 1], [0, 2], [3, 1], [1, 1]];
  scores.forEach(([d, e], i) => {
    const jour = `2019-${String(9 + i).padStart(2, '0')}-14`;
    ins.run(jour, jour, dom, ext, d, e);
  });
}

/**
 * Un résultat attribué sur tapis vert, planté dans la dernière rencontre FotMob de la Premier League
 * 2025-26 que la dispersion MESURERAIT (corners relevés, les deux clubs avec leur fenêtre) : écartée,
 * elle ne doit compter ni dans les repères ni dans la dispersion.
 */
async function planterAttribue(db) {
  const { historiques } = await L.historiquesDuMagasin(db);
  const candidates = db
    .prepare(
      `SELECT m.match_key, m.meta, m.date, m.home_id, m.away_id, th.corner_kicks hc, ta.corner_kicks ac FROM matches m
       JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home' JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
       WHERE m.league = 'EPL' AND m.date >= '2025-07-01' AND m.date < '2026-07-01' ORDER BY m.date DESC, m.match_key DESC`
    )
    .all();
  const r = candidates.find(
    (c) => c.hc !== null && c.ac !== null && !(c.hc === 0 && c.ac === 0) && L.fenetreAvant(historiques.get(c.home_id), c.date, 'c') && L.fenetreAvant(historiques.get(c.away_id), c.date, 'c')
  );
  const meta = { ...JSON.parse(r.meta ?? '{}'), awarded: 1, reason: 'awarded_win' };
  db.prepare('UPDATE matches SET meta = ?, home_goals = 3, away_goals = 0 WHERE match_key = ?').run(JSON.stringify(meta), r.match_key);
  return r.match_key;
}

const comptesTable = (db) => Object.fromEntries(db.prepare('SELECT league, COUNT(*) n FROM league_benchmarks GROUP BY league').all().map((r) => [r.league, r.n]));
let pauses = 0;
const compter = () => {
  pauses++;
  return new Promise((fin) => setImmediate(fin));
};

async function requeteExpress(app, methode, url) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new Socket());
    req.method = methode;
    req.url = url;
    req.headers = { host: 'essai' };
    const res = new http.ServerResponse(req);
    const morceaux = [];
    res.write = (c) => {
      morceaux.push(Buffer.from(c));
      return true;
    };
    res.end = (c) => {
      if (c) morceaux.push(Buffer.from(c));
      let corps = null;
      try {
        corps = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps });
      return res;
    };
    app.handle(req, res, reject);
  });
}
const etatRuntime = () => (fs.existsSync(RUNTIME) ? Object.fromEntries(fs.readdirSync(RUNTIME).sort().map((f) => [f, fs.statSync(path.join(RUNTIME, f)).mtimeMs])) : {});

// ====================================================================== phases

if (phase === 'calcul') {
  const db = openDb();
  sortie.plante = planterFd(db);
  planterAberrant(db);
  sortie.attribue = await planterAttribue(db);
  sortie.bilan = await L.calculerReperes({ database: db, rendreLaMain: compter });
  sortie.pauses = pauses;
  sortie.comptes = comptesTable(db);
  sortie.epl = L.lireReperes('EPL', { database: db });
  sortie.mls = L.lireReperes('MLS', { database: db });
  sortie.coupe = L.lireReperes('EFL Cup', { database: db });
  sortie.inconnu = L.lireReperes('Championnat de nulle part', { database: db });
  sortie.attendus2223 = L.valeursAttendues('EPL', '2022-23', { database: db });
  sortie.attendus2526 = L.valeursAttendues('EPL', '2025-26', { database: db });
  sortie.attendusAberrant = L.valeursAttendues('EPL', '2019-20', { database: db });
  // Le décompte témoin des rencontres mesurées pour les corners de la Premier League : ses matchs de championnat (sans
  // le résultat attribué), corners relevés, les deux clubs avec leur fenêtre — compté ici, sans le calcul de nuit.
  const { rencontres, historiques } = await L.historiquesDuMagasin(db);
  let temoin = 0;
  let avecAttribue = 0;
  for (const m of rencontres.values()) {
    if (m.league !== 'EPL' || !m.stats || !m.h || !m.a) continue;
    const c = [m.stats.home.c, m.stats.away.c];
    if (c.some((x) => x === null || x === undefined) || (c[0] === 0 && c[1] === 0)) continue;
    if (!L.fenetreAvant(historiques.get(m.h), m.date, 'c') || !L.fenetreAvant(historiques.get(m.a), m.date, 'c')) continue;
    avecAttribue++;
    if (m.k !== sortie.attribue) temoin++;
  }
  sortie.ciblesEpl = { temoin, avecAttribue, module: sortie.epl.dispersion.statistiques[0].ligue.equipe.matchs };
  sortie.general = Object.fromEntries(db.prepare("SELECT repere, valeur, detail FROM league_benchmarks WHERE league = '*' AND saison = 'toutes'").all().map((r) => [r.repere, { valeur: r.valeur, ...JSON.parse(r.detail ?? '{}') }]));
  sortie.attendusCoupe = L.valeursAttendues('EFL Cup', '2026-27', { database: db });
  sortie.lignesFd2122 = db.prepare("SELECT COUNT(*) n FROM fd_history WHERE code = 'E0' AND saison = '2021-22'").get().n;
  closeDb();
} else if (phase === 'incremental') {
  const db = openDb();
  planterFd(db);
  const premier = await L.calculerReperes({ database: db, rendreLaMain: compter });
  sortie.premier = { recalculees: premier.recalculees, inchangees: premier.inchangees, pauses };
  const avant = L.lireReperes('EPL', { database: db });
  pauses = 0;
  sortie.second = await L.calculerReperes({ database: db, rendreLaMain: compter });
  sortie.second.pausesComptees = pauses;
  // Une rencontre modifiée (un but de plus, mise à jour datée) : sa saison seule est recalculée.
  const cle = db.prepare("SELECT match_key FROM matches WHERE league = 'EPL' AND date >= '2025-07-01' AND date < '2026-07-01' ORDER BY match_key LIMIT 1 OFFSET 3").get().match_key;
  db.prepare("UPDATE matches SET home_goals = home_goals + 1, updated_at = '2026-10-05T11:00:00.000Z' WHERE match_key = ?").run(cle);
  sortie.modifiee = cle;
  sortie.troisieme = await L.calculerReperes({ database: db });
  const apres = L.lireReperes('EPL', { database: db });
  const s = (r, saison) => r.saisons.find((x) => x.saison === saison);
  sortie.buts2526 = { avant: s(avant, '2025-26').reperes.buts, apres: s(apres, '2025-26').reperes.buts };
  sortie.calculeLe = { avant: Object.fromEntries(avant.saisons.map((x) => [x.saison, x.calculeLe])), apres: Object.fromEntries(apres.saisons.map((x) => [x.saison, x.calculeLe])) };
  // Un fichier football-data relu (lignes remplacées) : sa saison seule.
  const lignes = db.prepare("SELECT * FROM fd_history WHERE code = 'E0' AND saison = '2021-22' ORDER BY id").all();
  db.exec('BEGIN IMMEDIATE');
  db.prepare("DELETE FROM fd_history WHERE code = 'E0' AND saison = '2021-22'").run();
  const cols = Object.keys(lignes[0]).filter((c) => c !== 'id');
  const ins = db.prepare(`INSERT INTO fd_history (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  for (const l of lignes) ins.run(...cols.map((c) => l[c]));
  db.exec('COMMIT');
  sortie.quatrieme = await L.calculerReperes({ database: db });
  // Une saison qui disparaît du magasin (toutes ses rencontres retirées) : ses lignes sont retirées.
  sortie.retireesAvant = L.lireReperes('EPL', { database: db }).saisons.map((x) => x.saison);
  db.prepare("DELETE FROM matches WHERE league = 'EPL' AND date >= '2026-07-01'").run();
  sortie.cinquieme = await L.calculerReperes({ database: db });
  sortie.retireesApres = L.lireReperes('EPL', { database: db }).saisons.map((x) => x.saison);
  sortie.tout = await L.calculerReperes({ database: db, tout: true });
  closeDb();
} else if (phase === 'etape') {
  const { withRefreshLock } = await imp('data/providers/refreshLock.js');
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  const T = job.__testing;
  const hier = '2026-10-04T10:00:00.000Z';
  const aujourdhui = '2026-10-05T01:30:00.000Z';
  sortie.due = {
    jamais: T.dueReperes({ manuel: false, derniere: () => null }),
    hier: T.dueReperes({ manuel: false, derniere: () => hier }),
    aujourdhui: T.dueReperes({ manuel: false, derniere: () => aujourdhui }),
    clic: T.dueReperes({ manuel: true, derniere: () => aujourdhui })
  };
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  const db = openDb();
  planterFd(db);
  sortie.passe = await withRefreshLock(() => T.passeReperes({ manuel: false, derniere: () => null }), { stamp: false });
  sortie.passeSans = await T.passeReperes({ manuel: true, derniere: () => null }, { database: db });
  closeDb();
} else if (phase === 'fenetres') {
  const { statInputsFromStore, STAT_SAMPLE, STAT_MIN_SAMPLE } = await imp('data/db/statInputsRead.js');
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  const db = openDb();
  const { rencontres, historiques } = await L.historiquesDuMagasin(db);
  const cibles = db
    .prepare("SELECT match_key k, league, date, home_name, away_name, home_id, away_id FROM matches WHERE home_id IS NOT NULL AND away_id IS NOT NULL AND league IN ('EPL', 'Championship', 'MLS', 'Serie A - Italy', 'League 2') ORDER BY date DESC, match_key LIMIT 120")
    .all();
  const comparaisons = [];
  for (const c of cibles) {
    if (clubDuMagasin(c.home_name, c.league, db) !== c.home_id || clubDuMagasin(c.away_name, c.league, db) !== c.away_id) continue;
    const moteur = statInputsFromStore({ homeName: c.home_name, awayName: c.away_name, league: c.league, beforeDate: c.date, database: db });
    for (const st of L.STATISTIQUES) {
      const h = L.fenetreAvant(historiques.get(c.home_id), c.date, st.colonne);
      const a = L.fenetreAvant(historiques.get(c.away_id), c.date, st.colonne);
      const m = moteur?.home?.[st.moteur] ?? null;
      const n = moteur?.away?.[st.moteur] ?? null;
      comparaisons.push({ k: c.k, stat: st.cle, nous: [h && { for: h.pour, against: h.contre, sample: h.n }, a && { for: a.pour, against: a.contre, sample: a.n }], moteur: [m, n] });
    }
  }
  sortie.comparaisons = comparaisons;
  sortie.rencontres = rencontres.size;
  sortie.constantes = { STAT_SAMPLE, STAT_MIN_SAMPLE };
  closeDb();
} else if (phase === 'route' || phase === 'ecran') {
  const { createApp } = await imp('app.js');
  const app = createApp();
  const get = (url) => requeteExpress(app, 'GET', url);
  // La première ouverture crée les tables (c'est l'ouverture qui écrit, pas la route) ; l'empreinte se prend après.
  openDb();
  closeDb();
  const e0 = empreinte();
  const runtimeAvant = etatRuntime();
  sortie.jamais = await get('/api/match-stats/benchmarks?league=EPL');
  closeDb();
  sortie.baseInchangeeJamais = empreinte() === e0;
  const db = openDb();
  planterFd(db);
  await L.calculerReperes({ database: db });
  closeDb();
  const e1 = empreinte();
  sortie.pret = await get('/api/match-stats/benchmarks?league=EPL');
  sortie.mls = await get('/api/match-stats/benchmarks?league=MLS');
  sortie.coupe = await get(`/api/match-stats/benchmarks?league=${encodeURIComponent('EFL Cup')}`);
  sortie.inconnu = await get(`/api/match-stats/benchmarks?league=${encodeURIComponent('Championnat de nulle part')}`);
  sortie.sansLigue = await get('/api/match-stats/benchmarks');
  closeDb();
  sortie.baseInchangee = empreinte() === e1;
  sortie.runtimeInchange = JSON.stringify(etatRuntime()) === JSON.stringify(runtimeAvant);
  sortie.match = await get('/api/match-stats/benchmarks-bidon');
} else {
  throw new Error(`phase inconnue : ${phase}`);
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
