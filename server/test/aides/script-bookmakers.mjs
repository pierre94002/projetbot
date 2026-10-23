/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-bookmakers.mjs <serveur de la copie> <phase>
 *
 * Étape 31 — la page « Bookmakers » : ce que l'étape 22 a mesuré du marché, lu par GET /api/market-knowledge. Base =
 * la copie de la base d'essai (elle n'a ni cotes archivées, ni football-data, ni table du jour J) ; heure figée au
 * 05/10/2026 12 h UTC. PLANTÉS ici par SQL, comme dans script-connaitre-marche.mjs (même recette, mêmes tirages à
 * graine) : 400 rencontres du magasin (« Ligue Essai », 2024-2025 et 2026), leurs cotes archivées (ESPN DraftKings,
 * la bourse Betfair et la moyenne de football-data, Kalshi, un relevé payant) et 300 lignes football-data « E0 ».
 * Phases (une ligne JSON) :
 *   route   la route AVANT tout calcul (rien : la même forme), après le calcul (tous les championnats, un
 *           championnat, un inconnu, les refus), sans aucune écriture ni réseau ;
 *   ecran   les réponses du vrai serveur pour le rendu de la page : jamais calculé, prêt (tous, un championnat),
 *           championnat inconnu, calcul d'une autre version.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
const RUNTIME = path.join(serveur, 'data', 'runtime');

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const K = await imp('data/marketKnowledge.js');
const { generateur } = await imp('bench/guard.js');
const { createApp } = await imp('app.js');
const db = openDb();
const sortie = { phase };

const u = generateur(22);
const norm = (p) => {
  const s = p[0] + p[1] + p[2];
  return p.map((x) => x / s);
};
/** Des cotes dont la méthode puissance rend EXACTEMENT p (exposant k > 1). */
const cotesDe = (p, k = 1.12) => p.map((x) => Math.round((1 / x ** (1 / k)) * 1000) / 1000);
const tirer = () => {
  const h = 0.25 + 0.4 * u();
  const d = 0.22 + 0.08 * u();
  return norm([h, d, Math.max(0.08, 1 - h - d)]);
};
const issueDe = (p) => {
  const x = u();
  return x < p[0] ? 0 : x < p[0] + p[1] ? 1 : 2;
};
const SCORES = [[2, 0], [1, 1], [0, 1]];
/** Les bookmakers du relevé payant planté : [clé The Odds API, exposant de sa marge]. Des clés de Réglages, des clés que l'API seule nomme, une bourse. */
const VOS_BOOKMAKERS = [
  ['pinnacle', 1.05],
  ['winamax_fr', 1.13],
  ['pmu_fr', 1.15],
  ['betclic_fr', 1.12],
  ['unibet_fr', 1.14],
  ['winamax_de', 1.13],
  ['betfair_ex_eu', 1.02],
  ['onexbet', 1.11],
  ['mybookieag', 1.09]
];
const jour =(base, n) => new Date(Date.parse(`${base}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function planter() {
  db.exec('BEGIN');
  const dm = db.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const colonnesTd = ['rencontre', 'camp', 'club', 'adversaire', 'date', 'league', 'saison', 'attribue', 'prolongation', 'compte', 'coupe', 'releve', 'bp', 'bc', 'bp90', 'bc90'];
  const td = db.prepare(`INSERT INTO team_day (${colonnesTd.join(', ')}) VALUES (${colonnesTd.map(() => '?').join(', ')})`);
  const ev = db.prepare('INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
  const q = db.prepare("INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price, prob, volume, open_interest) VALUES (?, ?, '1x2', ?, 0, ?, ?, ?, ?, ?, NULL, NULL)");
  const SEL = ['home', 'draw', 'away'];
  const coter = (id, bookmaker, kind, prix, probs = null, seq = '', releve = '2026-10-05T10:00:00.000Z') => SEL.forEach((s, i) => q.run(id, bookmaker, s, kind, seq, releve, prix[i], probs ? probs[i] : null));
  for (let i = 0; i < 400; i++) {
    const saison = i < 200 ? 2024 : 2025;
    const date = i < 200 ? jour('2024-08-10', Math.floor(i / 2)) : jour('2025-08-10', Math.floor((i - 200) / 2));
    const mk = `essai-${i}`;
    const home = 1 + (i % 20);
    const away = 1 + ((i + 7) % 20);
    const p = tirer();
    const issue = issueDe(p);
    const [bp, bc] = SCORES[issue];
    const r = Number(dm.run(mk, null, date, 'Ligue Essai', saison, home, away === home ? (home % 20) + 1 : away, '2026-10-01T00:00:00.000Z').lastInsertRowid);
    td.run(r, 1, home, away, date, 'Ligue Essai', saison, 0, 0, 1, 0, 1, bp, bc, null, null);
    td.run(r, 0, away, home, date, 'Ligue Essai', saison, 0, 0, 1, 0, 1, bc, bp, null, null);
    const kickoff = `${date}T18:00:00.000Z`;
    const ouverture = norm(p.map((x) => x + (u() - 0.5) * 0.06));
    const e1 = ev.get('espn', `espn-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
    coter(e1, 'DraftKings', 'open', cotesDe(ouverture, 1.16));
    coter(e1, 'DraftKings', 'close', cotesDe(p, 1.1));
    const e2 = ev.get('football-data.co.uk', `fd-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
    coter(e2, 'Betfair Exchange', 'preclose', ouverture.map((x) => Math.round((1 / x) * 100) / 100));
    coter(e2, 'Betfair Exchange', 'close', p.map((x) => Math.round((0.99 / x) * 100) / 100));
    coter(e2, 'Maximum du marché', 'close', p.map((x) => Math.round((1.02 / x) * 100) / 100));
    const e3 = ev.get('kalshi', `k-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
    const mid = p.map((x) => Math.round(x * 1.01 * 1000) / 1000);
    coter(e3, 'Kalshi', 'close', mid.map((x) => Math.round((1 / x) * 1000) / 1000), mid);
    if (i % 10 === 0) {
      const e4 = ev.get('odds-api', `oa-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
      // Vos bookmakers (The Odds API) : leurs CLÉS brutes (« winamax_fr ») sont celles de la base ; la page doit dire leurs noms.
      // (Aucun tirage de plus : cotesDe est exact, le flux à graine des autres livres ne bouge pas.)
      for (const [cle, k] of VOS_BOOKMAKERS) coter(e4, cle, 'snapshot', cotesDe(p, k), null, `${date}T08:00:00.000Z`, `${date}T08:00:00.000Z`);
    }
    if (i < 10) coter(e2, 'Pinnacle', 'close', cotesDe(p, 1.03));
  }
  const ft = db.prepare('INSERT INTO fd_teams (id, pays, nom, team_id) VALUES (?, ?, ?, NULL)');
  for (let c = 1; c <= 20; c++) ft.run(c, 'England', `Club ${c}`);
  const colonnes = ['code', 'saison', 'date', 'date_fichier', 'dom', 'ext', 'lien', 'bd', 'be', ...['moy', 'pin', 'b365', 'wh'].flatMap((l) => ['1', 'n', '2', 'c1', 'cn', 'c2'].map((s) => `${l}_${s}`))];
  const fd = db.prepare(`INSERT INTO fd_history (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`);
  for (let i = 0; i < 300; i++) {
    const date = jour('2019-08-10', Math.floor(i / 3));
    const p = tirer();
    const issue = issueDe(p);
    const [bd, be] = SCORES[issue];
    const tot = norm(p.map((x) => x + (u() - 0.5) * 0.08));
    const c100 = (c) => c.map((x) => Math.round(x * 100));
    const livre = (k) => [...c100(cotesDe(tot, k + 0.04)), ...c100(cotesDe(p, k))];
    fd.run('E0', '2019-20', date, date, 1 + (i % 20), 1 + ((i + 3) % 20), 0, bd, be, ...livre(1.12), ...livre(1.04), ...livre(1.1), ...livre(1.14));
  }
  db.exec('COMMIT');
}

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
const ecritures = () => db.prepare('SELECT total_changes() n').get().n;

const app = createApp();
const get = (url) => requeteExpress(app, 'GET', url);
const enc = encodeURIComponent;

if (phase === 'route' || phase === 'ecran') {
  // La première ouverture crée les tables (c'est l'ouverture qui écrit, pas la route).
  const runtimeAvant = etatRuntime();
  sortie.jamais = await get('/api/market-knowledge');
  planter();
  const calcul = await K.connaitreLeMarche({ database: db, force: true });
  sortie.calcul = { mode: calcul.mode, calcul: calcul.calcul, erreur: calcul.erreur ?? null };
  const e0 = ecritures();
  const t0 = performance.now();
  sortie.pret = await get('/api/market-knowledge');
  sortie.pretMs = Math.round(performance.now() - t0);
  sortie.pretTaille = JSON.stringify(sortie.pret.corps).length;
  sortie.ligue = await get(`/api/market-knowledge?championnat=${enc('Ligue Essai')}`);
  sortie.inconnu = await get(`/api/market-knowledge?championnat=${enc('Championnat de nulle part')}`);
  sortie.etoile = await get(`/api/market-knowledge?championnat=${enc('*')}`);
  sortie.refus = {
    tableau: await get('/api/market-knowledge?championnat=a&championnat=b'),
    long: await get(`/api/market-knowledge?championnat=${'x'.repeat(121)}`),
    reproduction: await get('/api/market-knowledge?championnat=23-09'),
    vide: await get('/api/market-knowledge?championnat=')
  };
  sortie.ecritures = ecritures() - e0;
  sortie.runtimeInchange = JSON.stringify(etatRuntime()) === JSON.stringify(runtimeAvant);
  sortie.post = (await requeteExpress(app, 'POST', '/api/market-knowledge')).code;
  sortie.lecture = {
    brute: K.lireConnaissanceDuMarche({ database: db, championnat: 'Ligue Essai' }).justesse.length,
    reponse: sortie.ligue.corps.lignes.justesse.length
  };
  if (phase === 'ecran') {
    // Un calcul d'une AUTRE forme : la page le dit (refait à la prochaine nuit), les chiffres restent lus.
    db.prepare('UPDATE market_knowledge_runs SET version = 99 WHERE id = ?').run(sortie.pret.corps.calcul.id);
    sortie.autreVersion = await get('/api/market-knowledge');
    db.prepare('UPDATE market_knowledge_runs SET version = ? WHERE id = ?').run(K.VERSION_CONNAISSANCE, sortie.pret.corps.calcul.id);
  }
} else {
  throw new Error(`phase inconnue : ${phase}`);
}


process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
