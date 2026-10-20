/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-carnet-sante.mjs <serveur de la copie> <phase>
 *
 * Étape 12 — les contrôles des données et le carnet de santé. Le script du
 * contrôle (scripts/data-health.mjs) est recopié dans la copie par le test ;
 * il est lancé ici comme la ligne de commande ou la passe le lancent, avec la
 * même garde (réseau coupé, heure figée, base de la copie). Les anomalies sont
 * PLANTÉES dans la copie de la base d'essai (SQL direct ou upsertMatches),
 * jamais ailleurs. Sortie : une ligne JSON.
 *
 * Phases :
 *   types        une anomalie plantée de chaque sorte (et les vraies de la base d'essai), contrôle complet
 *   nuit         contrôle complet, puis nouvelles rencontres, une ancienne modifiée en douce, une retirée :
 *                la passe de nuit ne relit que les nouvelles ; puis un contrôle complet
 *   verrou       jamais pendant un import ni en parallèle ; l'étape de la passe sous son verrou
 *   route        GET /api/match-stats/health (application Express, sans réseau) : jamais, prêt, filtres, illisible
 *   recoupement  le carnet face au tableau de couverture actuel (getCoverage) et aux faits de coverageFacts
 *   ecran        l'état de la route après le contrôle des anomalies plantées, pour le rendu de la carte
 *   reprises     ce qu'un contrôle reprend sans le relire (absentes des pages de compétition), un
 *                homonyme refait sous un autre nom, le seuil au-delà duquel la nuit relit tout
 *   main         (retouche du 07/10 au soir) le contrôle complet et la passe de nuit RENDENT LA MAIN : les mêmes
 *                anomalies plantées, un contrôle complet puis une passe de nuit, chacun de trois façons — comme
 *                d'habitude (une pause au plus toutes les 25 ms), sans jamais rendre la main, en la rendant à CHAQUE
 *                point d'arrêt avec un concurrent qui compte ses tours de boucle — et ce que les trois ont rendu
 *   reference    la même chose, sans rien demander de nouveau au code (il n'y a pas de pauses) : sert à produire
 *                test/fixtures/carnet-sante-avant-pauses.json avec le code d'AVANT la retouche (tools hors suite)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { Socket } from 'node:net';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const GARDE = new URL('./garde.mjs', import.meta.url).href;
const CLI = path.join(serveur, 'scripts', 'data-health.mjs');
const RUNTIME = path.join(serveur, 'data', 'runtime');
const CARNET = path.join(RUNTIME, 'carnet-sante.json');
const VERROU = path.join(RUNTIME, 'espn-refresh.lock');
const BASE = process.env.MATCH_STATS_DB;

const { openDb, closeDb, upsertMatches, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');

const empreinte = () => crypto.createHash('sha1').update(fs.readFileSync(BASE)).digest('hex');
const lireCarnet = () => (fs.existsSync(CARNET) ? JSON.parse(fs.readFileSync(CARNET, 'utf8')) : null);
/** Le contrôle, lancé comme en ligne de commande (même garde). */
function cli(args = [], { env = {} } = {}) {
  const r = spawnSync(process.execPath, ['--import', GARDE, CLI, ...args], { cwd: serveur, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120_000 });
  let json = null;
  try {
    json = JSON.parse((r.stdout ?? '').trim().split(/\r?\n/).pop());
  } catch {
    // laissé à null
  }
  return { code: r.status, json, erreurs: (r.stderr ?? '').slice(-3000), reseau: /Appel réseau interdit/.test(r.stderr ?? '') };
}
/** Écrire dans la copie, puis fermer : le contrôle lit un fichier sans journal en cours. */
function ecrire(f) {
  const db = openDb();
  try {
    return f(db);
  } finally {
    closeDb();
  }
}
const resumeAnomalie = (a) => ({ id: a.id, type: a.type, sorte: a.sorte, gravite: a.gravite, matchKey: a.matchKey, matchs: a.matchs ?? [], league: a.league, season: a.season, saison: a.saison, date: a.date, label: a.label, score: a.score, detail: a.detail, trouveeLe: a.trouveeLe, controleLe: a.controleLe });
const parSorte = (etat) => {
  const compte = {};
  for (const a of etat?.anomalies ?? []) compte[`${a.type}/${a.sorte}`] = (compte[`${a.type}/${a.sorte}`] ?? 0) + 1;
  return compte;
};

/** Ce qui change d'une exécution à l'autre sans changer le résultat : les durées et la mesure des pauses. */
const CHAMPS_DE_MESURE = ['dureeMs', 'temps', 'blocMaxMs', 'blocMaxOu', 'pauses'];
function sansMesure(etat) {
  const copie = JSON.parse(JSON.stringify(etat));
  for (const c of CHAMPS_DE_MESURE) delete copie.controle[c];
  if (copie.complet) delete copie.complet.dureeMs;
  for (const h of copie.historique ?? []) delete h.dureeMs;
  return copie;
}
const empreinteDe = (valeur) => crypto.createHash('sha1').update(JSON.stringify(valeur)).digest('hex');

/** Une rencontre neuve, au format de l'import (updated_at = maintenant, heure figée de l'essai). */
const rencontre = ({ date, league, home, away, buts = [1, 0], fotmobId, statsDomicile = {}, statsExterieur = {}, meta = {} }) => ({
  date,
  league,
  homeName: home[0],
  homeId: home[1],
  awayName: away[0],
  awayId: away[1],
  fotmobId,
  homeGoals: buts[0],
  awayGoals: buts[1],
  meta: { leagueKey: meta.leagueKey ?? null, parentLeagueId: meta.parentLeagueId ?? null, coverage: meta.coverage ?? 'xG', ...meta },
  teamStats: {
    home: { 'Total Shots': 10, 'Shots on Goal': 4, 'Corner Kicks': 5, 'Yellow Cards': 1, 'Red Cards': 0, 'Ball Possession': 50, 'Total passes': 400, 'Passes accurate': 330, ...statsDomicile },
    away: { 'Total Shots': 8, 'Shots on Goal': 3, 'Corner Kicks': 3, 'Yellow Cards': 2, 'Red Cards': 0, 'Ball Possession': 50, 'Total passes': 380, 'Passes accurate': 300, ...statsExterieur }
  },
  sources: ['essai://carnet-sante']
});

/** Le rapport de l'étape « omissions » (findFixtureGaps), FABRIQUÉ. */
const OMISSIONS = {
  leagues: 67,
  seasons: 67,
  played: 4,
  failed: [],
  imports: { EPL: { merged: 0, failed: 1, notFinished: 0, idReused: 0 } },
  missing: [
    // Jouée selon la page de la compétition, absente du magasin : signalée.
    { league: 'EPL', season: '2026/2027', matchId: '88800001', date: '2026-09-21', round: '5', homeId: 'fotmob-9825', awayId: 'fotmob-8455', homeName: 'Arsenal', awayName: 'Chelsea', homeGoals: 1, awayGoals: 1, played: true },
    // Déjà au magasin sous cet identifiant (importée depuis) : écartée.
    { league: 'EPL', season: '2026/2027', matchId: '5795435', date: '2026-09-06', homeId: 'fotmob-9825', awayId: 'fotmob-8455', homeName: 'Arsenal', awayName: 'Chelsea', homeGoals: 2, awayGoals: 1, played: true },
    // Au magasin sous un AUTRE identifiant (mêmes clubs, même jour) : écartée.
    { league: 'EPL', season: '2026/2027', matchId: '88800002', date: '2026-09-05', homeId: 'fotmob-8456', awayId: 'fotmob-8669', homeName: 'Man City', awayName: 'Coventry', homeGoals: 1, awayGoals: 0, played: true },
    // Avant le début du magasin : écartée.
    { league: 'EPL', season: '2021/2022', matchId: '88800003', date: '2022-05-01', homeId: 'fotmob-9825', awayId: 'fotmob-8455', homeName: 'Arsenal', awayName: 'Chelsea', homeGoals: 0, awayGoals: 0, played: true }
  ]
};

/** Une anomalie de chaque sorte, plantée dans la copie de la base d'essai. */
function planterLesTypes(db) {
  const copier = db.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, meta, sources)
     SELECT ?, ?, date, league, ?, ?, ?, ?, ?, home_goals, away_goals, updated_at, meta, sources FROM matches WHERE match_key = ?`
  );
  // DOUBLON, sens inverse : Fulham – Liverpool le même jour que Liverpool – Fulham.
  copier.run('essai-2026-09-12-fulham-liverpool', 'essai-1', 'Fulham', 'Liverpool', 'fotmob-9879', 'fotmob-8650', '77700010', '2026-09-12-liverpool-fulham');
  // DOUBLON, même sens : Arsenal – Coventry enregistré une seconde fois sous une autre clé.
  copier.run('essai-2026-08-21-arsenal-coventry-bis', 'essai-2', 'Arsenal', 'Coventry', 'fotmob-9825', 'fotmob-8669', '77700011', '2026-08-21-arsenal-coventry');
  // DOUBLON, même identifiant FotMob (5795372 = Fulham – Chelsea) sous une autre rencontre.
  copier.run('essai-2026-08-24-meme-identifiant', 'essai-3', 'Wolves', 'Burnley', 'fotmob-8602', 'fotmob-8191', '5795372', '2026-08-24-fulham-chelsea');
  // IDENTITÉ, club deux fois le même jour : Everton joue aussi contre Wolves le 19/09.
  copier.run('essai-2026-09-19-everton-wolves', 'essai-4', 'Everton', 'Wolves', 'fotmob-8668', 'fotmob-8602', '77700012', '2026-09-19-everton-ipswich');
  // COMPÉTITION : une rencontre d'EPL que FotMob publie en Championship.
  db.prepare(`UPDATE matches SET meta = json_set(COALESCE(meta, '{}'), '$.leagueKey', 'ENG|Championship', '$.parentLeagueId', 48) WHERE match_key = '2026-09-13-coventry-brighton'`).run();
  // IMPOSSIBLE (équipe) : plus de tirs cadrés que de tirs ; possession à 105 %.
  db.prepare(`UPDATE team_stats SET shots_on_goal = total_shots + 2 WHERE match_key = '2026-09-14-leeds-newcastle' AND side = 'home'`).run();
  db.prepare(`UPDATE team_stats SET ball_possession = CASE side WHEN 'home' THEN 60 ELSE 45 END WHERE match_key = '2026-09-18-brentford-chelsea'`).run();
  // IMPOSSIBLE (joueur) : trois cartons jaunes.
  db.prepare(`UPDATE players SET yellow_cards = 3 WHERE match_key = '2026-09-19-brighton-arsenal' AND player_key = (SELECT player_key FROM players WHERE match_key = '2026-09-19-brighton-arsenal' AND side = 'away' ORDER BY ord LIMIT 1) AND side = 'away'`).run();
  // IMPOSSIBLE (audit des scores) : un but de trop crédité aux joueurs de Man City (5-3).
  db.prepare(`UPDATE players SET goals = COALESCE(goals, 0) + 1 WHERE match_key = '2026-09-20-man-city-sunderland' AND side = 'home' AND player_key = (SELECT player_key FROM players WHERE match_key = '2026-09-20-man-city-sunderland' AND side = 'home' ORDER BY ord LIMIT 1)`).run();
  // ZÉRO : aucune passe (ni réussie) pour Ipswich — impossible dans un match joué : non relevé.
  db.prepare(`UPDATE team_stats SET total_passes = 0, passes_accurate = 0 WHERE match_key = '2026-09-19-everton-ipswich' AND side = 'away'`).run();
  // Un zéro PLAUSIBLE seul (aucun centre) : pas signalé.
  db.prepare(`UPDATE team_stats SET crosses = 0 WHERE match_key = '2026-09-20-leeds-crystal-palace' AND side = 'home'`).run();
  // IDENTITÉ, homonymes (joueurs) : le premier joueur d'Arsenal du 12/09, sous un second identifiant le 19/09.
  const p = db.prepare(`SELECT name, player_id FROM players WHERE match_key = '2026-09-12-sunderland-arsenal' AND side = 'away' AND player_id IS NOT NULL ORDER BY ord LIMIT 1`).get();
  db.prepare(`INSERT INTO players (match_key, side, player_key, ord, player_id, name, minutes) VALUES ('2026-09-19-brighton-arsenal', 'away', 'fotmob-99999001', 99, 'fotmob-99999001', ?, 12)`).run(p.name);
  // IDENTITÉ, homonymes (clubs) : Coventry écrit « Arsenal » sur une feuille de la même saison.
  db.prepare(`UPDATE matches SET away_name = 'Arsenal' WHERE match_key = '2026-09-19-nott-m-forest-coventry'`).run();
  // IDENTITÉ, joueur sans identifiant : l'identifiant 0 de FotMob.
  db.prepare(`UPDATE players SET player_id = NULL WHERE match_key = '2026-09-12-chelsea-hull-city' AND side = 'home' AND player_key = (SELECT player_key FROM players WHERE match_key = '2026-09-12-chelsea-hull-city' AND side = 'home' ORDER BY ord LIMIT 1)`).run();
  return { homonyme: p };
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

/** Les fichiers de data/runtime et leur date : ce qu'une lecture ne doit pas toucher. */
const etatRuntime = () => Object.fromEntries(fs.readdirSync(RUNTIME).sort().map((f) => [f, fs.statSync(path.join(RUNTIME, f)).mtimeMs]));

const sortie = { phase };

if (phase === 'types') {
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  sortie.plante = ecrire((db) => {
    const p = planterLesTypes(db);
    rebuildRegistries({ database: db });
    return p;
  });
  const fichierOmissions = path.join(RUNTIME, '..', 'omissions-essai.json');
  fs.writeFileSync(fichierOmissions, JSON.stringify(OMISSIONS));
  const avant = empreinte();
  sortie.cli = cli(['--complet', '--omissions', fichierOmissions]);
  sortie.baseInchangee = empreinte() === avant;
  const etat = lireCarnet();
  sortie.parSorte = parSorte(etat);
  sortie.parType = etat?.parType;
  sortie.anomalies = (etat?.anomalies ?? []).map(resumeAnomalie);
  sortie.controle = etat?.controle;
  // Les pages de compétition lues avant la première saison du magasin : comptées hors du périmètre, pas signalées.
  const { manquantsFotmob } = await imp('data/db/dataHealth.js');
  const rapport = {
    missing: [
      { league: 'EPL', season: '2025/2026', matchId: '88800010', date: '2026-03-01', homeId: 'fotmob-9825', awayId: 'fotmob-8455', homeName: 'Arsenal', awayName: 'Chelsea', homeGoals: 1, awayGoals: 0 },
      { league: 'EPL', season: '2026/2027', matchId: '88800011', date: '2026-09-22', homeId: 'fotmob-9825', awayId: 'fotmob-8455', homeName: 'Arsenal', awayName: 'Chelsea', homeGoals: 2, awayGoals: 2 },
      { league: 'Virsliga - Latvia', season: '2025', matchId: '88800012', date: '2025-08-01', homeId: 'fotmob-2106', awayId: 'fotmob-248871', homeName: 'Auda', awayName: 'RFS', homeGoals: 0, awayGoals: 1 }
    ]
  };
  sortie.horsPerimetre = ecrire((db) => {
    const m = manquantsFotmob(db, rapport, { premiereDate: '2023-07-22', saisonMin: 2026 });
    return { ids: m.anomalies.map((a) => a.id), ecartees: m.ecartees, horsPerimetre: m.horsPerimetre };
  });
} else if (phase === 'nuit') {
  // 0. Avant le contrôle complet : une anomalie sur une rencontre qui sera retirée.
  ecrire((db) => db.prepare(`UPDATE team_stats SET shots_on_goal = total_shots + 3 WHERE match_key = '2026-09-15-ipswich-town-arsenal' AND side = 'away'`).run());
  const e0 = empreinte();
  sortie.complet1 = cli(['--complet']);
  sortie.baseApresComplet = empreinte() === e0;
  const a = lireCarnet();
  // 1. Après lui : trois rencontres nouvelles, une ancienne modifiée SANS toucher
  // à sa date de mise à jour, une ancienne retirée.
  ecrire((db) => {
    upsertMatches(
      [
        rencontre({ date: '2026-09-27', league: 'EPL', home: ['Arsenal', 'fotmob-9825'], away: ['Leeds', 'fotmob-8463'], buts: [2, 1], fotmobId: '77700001', statsDomicile: { 'Total Shots': 5, 'Shots on Goal': 7 }, meta: { leagueKey: 'ENG|Premier League', parentLeagueId: 47 } }),
        rencontre({ date: '2026-09-12', league: 'EPL', home: ['Fulham', 'fotmob-9879'], away: ['Liverpool', 'fotmob-8650'], buts: [1, 1], fotmobId: '77700002', meta: { leagueKey: 'ENG|Premier League', parentLeagueId: 47 } }),
        rencontre({ date: '2026-09-27', league: 'Virsliga - Latvia', home: ['Auda', 'fotmob-2106'], away: ['RFS', 'fotmob-248871'], buts: [0, 0], fotmobId: '77700003', statsDomicile: { clearances: 0, interceptions: 0, long_balls: 0 }, meta: { leagueKey: 'LVA|Virsliga', parentLeagueId: 226, coverage: 'lower' } })
      ],
      { database: db }
    );
    db.prepare(`UPDATE team_stats SET shots_on_goal = total_shots + 5 WHERE match_key = '2026-09-14-leeds-newcastle' AND side = 'home'`).run();
    db.prepare(`DELETE FROM matches WHERE match_key = '2026-09-15-ipswich-town-arsenal'`).run();
  });
  const e1 = empreinte();
  // La passe de nuit tourne le LENDEMAIN (3 h) : les dates de contrôle se distinguent.
  sortie.nuit = cli([], { env: { CM_TEST_MAINTENANT: '2026-10-06T03:00:00.000Z' } });
  sortie.baseApresNuit = empreinte() === e1;
  const b = lireCarnet();
  sortie.complet2 = cli(['--complet'], { env: { CM_TEST_MAINTENANT: '2026-10-06T04:00:00.000Z' } });
  const c = lireCarnet();
  const ligne = (etat, league, season) => etat.carnet.find((l) => l.league === league && l.season === season) ?? null;
  const ids = (etat) => new Set(etat.anomalies.map((x) => x.id));
  sortie.a = { controle: a.controle, ids: [...ids(a)], carnet: a.carnet, anomalies: a.anomalies.map(resumeAnomalie) };
  sortie.b = { controle: b.controle, ids: [...ids(b)], carnet: b.carnet, anomalies: b.anomalies.map(resumeAnomalie), historique: b.historique, complet: b.complet };
  sortie.c = { controle: c.controle, ids: [...ids(c)] };
  sortie.lignes = {
    eplA: ligne(a, 'EPL', 2026),
    eplB: ligne(b, 'EPL', 2026),
    lettonieA: ligne(a, 'Virsliga - Latvia', 2026),
    lettonieB: ligne(b, 'Virsliga - Latvia', 2026),
    coupeA: ligne(a, 'EFL Cup', 2026),
    coupeB: ligne(b, 'EFL Cup', 2026)
  };
} else if (phase === 'verrou') {
  const e0 = empreinte();
  // 1. Un import tient le verrou (un autre processus vivant : le lanceur des tests).
  fs.writeFileSync(VERROU, JSON.stringify({ pid: process.ppid, token: 'import-en-cours', startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }));
  sortie.pendantImport = cli([]);
  sortie.carnetPendantImport = fs.existsSync(CARNET);
  // 2. --dans-la-passe, mais le verrou n'est pas celui du parent : refus.
  sortie.dansLaPasseAutre = cli(['--dans-la-passe']);
  sortie.carnetApresRefus = fs.existsSync(CARNET);
  // 3. --dans-la-passe sans verrou : refus.
  fs.rmSync(VERROU, { force: true });
  sortie.dansLaPasseSansVerrou = cli(['--dans-la-passe']);
  sortie.carnetSansVerrou = fs.existsSync(CARNET);
  // 4. Le verrou est celui de ce processus, parent du contrôle : il tourne.
  fs.writeFileSync(VERROU, JSON.stringify({ pid: process.pid, token: 'passe-essai', startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }));
  sortie.dansLaPasseParent = cli(['--dans-la-passe']);
  sortie.carnetParent = fs.existsSync(CARNET);
  fs.rmSync(VERROU, { force: true });
  sortie.verrouLibreApres = !fs.existsSync(VERROU);
  // 5. Seul, sans verrou : le contrôle prend le verrou, puis le rend.
  sortie.seul = cli([]);
  sortie.verrouRendu = !fs.existsSync(VERROU);
  sortie.baseInchangee = empreinte() === e0;
  // 6. L'étape de la passe, sous le verrou de la passe (ce processus), avec le rapport des omissions par l'entrée standard.
  process.env.NODE_OPTIONS = `--import ${GARDE}`;
  const { withRefreshLock, isRefreshRunning } = await imp('data/providers/refreshLock.js');
  const { __testing } = await imp('jobs/matchStatsAutoRefresh.js');
  fs.rmSync(CARNET, { force: true });
  const etape = await withRefreshLock(async () => ({ verrouTenu: isRefreshRunning(), r: await __testing.passeCarnetSante({ omissions: OMISSIONS, manuel: false }) }), { stamp: false });
  sortie.etape = { verrouTenu: etape.verrouTenu, status: etape.r.status, summary: etape.r.summary, details: etape.r.details };
  const etat = lireCarnet();
  sortie.etapeAnomalies = (etat?.anomalies ?? []).filter((x) => x.type === 'manquant' && x.sorte === 'calendrier-fotmob').map(resumeAnomalie);
  sortie.etapeOmissions = etat?.controle?.omissions ?? null;
  // 7. La même étape quand un import tient le verrou (pas la passe) : rien fait.
  fs.writeFileSync(VERROU, JSON.stringify({ pid: process.ppid, token: 'import-en-cours', startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() }));
  const avant = fs.statSync(CARNET).mtimeMs;
  const refus = await __testing.passeCarnetSante({ omissions: null, manuel: false });
  sortie.etapePendantImport = { status: refus.status, summary: refus.summary, carnetIntact: fs.statSync(CARNET).mtimeMs === avant };
  fs.rmSync(VERROU, { force: true });
  sortie.baseInchangeeFin = empreinte() === e0;
} else if (phase === 'route' || phase === 'ecran') {
  if (phase === 'ecran') {
    const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
    ecrire((db) => {
      planterLesTypes(db);
      rebuildRegistries({ database: db });
    });
  }
  const { createApp } = await imp('app.js');
  const app = createApp();
  const get = (url) => requeteExpress(app, 'GET', url);
  const e0 = empreinte();
  sortie.jamais = await get('/api/match-stats/health');
  sortie.cli = cli(['--complet']);
  const runtimeAvant = etatRuntime();
  sortie.pret = await get('/api/match-stats/health');
  sortie.zero = await get('/api/match-stats/health?type=zero');
  sortie.info = await get('/api/match-stats/health?gravite=info');
  sortie.lettonie = await get(`/api/match-stats/health?ligue=${encodeURIComponent('Virsliga - Latvia')}&saison=2026`);
  sortie.limite = await get('/api/match-stats/health?limite=2');
  sortie.typeInconnu = await get('/api/match-stats/health?type=bidon');
  sortie.graviteInconnue = await get('/api/match-stats/health?gravite=grave');
  sortie.limiteZero = await get('/api/match-stats/health?limite=0');
  sortie.runtimeInchange = JSON.stringify(etatRuntime()) === JSON.stringify(runtimeAvant);
  sortie.baseInchangee = empreinte() === e0;
  sortie.etatFichier = lireCarnet();
  if (phase === 'route') {
    fs.writeFileSync(CARNET, '{ pas du json');
    sortie.illisible = await get('/api/match-stats/health');
    fs.writeFileSync(CARNET, JSON.stringify({ version: 1 }));
    sortie.formeInattendue = await get('/api/match-stats/health');
  }
} else if (phase === 'recoupement') {
  // Le calendrier de saison, FABRIQUÉ à partir des rencontres de la base d'essai :
  // les mêmes noms que le magasin, sauf trois écritures d'un autre alias du même
  // club (trouvées par les identifiants seulement), et deux matchs absents.
  const db = openDb();
  const rencontres = db.prepare('SELECT date, league, home_name, away_name, home_goals, away_goals, home_id, away_id FROM matches ORDER BY date, match_key').all();
  const autreAlias = new Map(
    db.prepare(`SELECT a.team_id, a.alias FROM team_aliases a JOIN teams t ON t.team_id = a.team_id WHERE a.slug <> t.slug`).all().map((r) => [r.team_id, r.alias])
  );
  const calendrier = [];
  const variantes = [];
  for (const r of rencontres) {
    let homeName = r.home_name;
    let awayName = r.away_name;
    if (variantes.length < 3 && autreAlias.has(r.home_id) && autreAlias.get(r.home_id) !== r.home_name) {
      homeName = autreAlias.get(r.home_id);
      variantes.push(`${r.date} ${r.home_name} → ${homeName}`);
    }
    calendrier.push({ matchId: `cal-${r.date}`, date: r.date, league: r.league, homeName, awayName, status: 'finished', homeGoals: r.home_goals, awayGoals: r.away_goals, round: null, source: 'fotmob' });
  }
  calendrier.push({ matchId: 'cal-absent-1', date: '2026-09-21', league: 'EPL', homeName: 'Arsenal', awayName: 'Chelsea', status: 'finished', homeGoals: 1, awayGoals: 1, round: null, source: 'fotmob' });
  calendrier.push({ matchId: 'cal-absent-2', date: '2026-09-21', league: 'MLS', homeName: 'Club Inconnu', awayName: 'Autre Inconnu', status: 'finished', homeGoals: 0, awayGoals: 2, round: null, source: 'fotmob' });
  calendrier.push({ matchId: 'cal-a-venir', date: '2026-10-21', league: 'EPL', homeName: 'Arsenal', awayName: 'Chelsea', status: 'scheduled', homeGoals: null, awayGoals: null, round: null, source: 'fotmob' });
  fs.writeFileSync(path.join(RUNTIME, 'season-calendar.json'), JSON.stringify(calendrier));
  sortie.variantes = variantes;
  // Le tableau de couverture ACTUEL, tel que la route le rend.
  const { getCoverage } = await imp('data/providers/espnMatchStatsRefresh.js');
  const { coverageFacts } = await imp('data/db/matchStatsRead.js');
  const { seasonOf } = await imp('data/providers/seasonWindows.js');
  const couverture = getCoverage();
  sortie.couverture = { totals: couverture.totals, leagues: couverture.leagues.map((l) => ({ league: l.league, finished: l.finished, withStats: l.withStats, withPlayers: l.withPlayers, fields: l.fields })) };
  // Les faits par rencontre derrière ce tableau (coverageFacts), regroupés par saison réelle.
  const faits = coverageFacts({ database: db });
  const parSaison = {};
  for (const f of faits.values()) {
    const cle = `${f.league}|${seasonOf(f.league, f.date)}`;
    const s = (parSaison[cle] ??= { rencontres: 0, joueursDeuxCamps: 0 });
    s.rencontres++;
    if (f.joueursDomicile > 0 && f.joueurs - f.joueursDomicile > 0) s.joueursDeuxCamps++;
  }
  sortie.faits = parSaison;
  closeDb();
  sortie.cli = cli(['--complet']);
  const etat = lireCarnet();
  sortie.recoupement = etat?.recoupement;
  sortie.carnet = etat?.carnet;
} else if (phase === 'reprises') {
  // 1. Les absentes vues par une lecture des pages de compétition (rapport
  // FABRIQUÉ, sans réseau), quand un contrôle suivant ne les relit pas — en
  // processus, base de la copie en lecture seule, dates choisies.
  const { DatabaseSync } = await import('node:sqlite');
  const dh = await imp('data/db/dataHealth.js');
  const lecture = new DatabaseSync(BASE, { readOnly: true });
  const T = (h) => `2026-10-0${h}T03:00:00.000Z`;
  const pages = {
    leagues: 2,
    seasons: 6,
    played: 2,
    failed: [],
    missing: [
      // Saison passée : seule une lecture des pages la revoit.
      { league: 'EPL', season: '2025/2026', matchId: '88800020', date: '2026-03-01', homeId: 'fotmob-9825', awayId: 'fotmob-8455', homeName: 'Arsenal', awayName: 'Chelsea', homeGoals: 1, awayGoals: 0 },
      // Saison en cours : l'étape « omissions » la relit chaque nuit.
      { league: 'EPL', season: '2026/2027', matchId: '88800021', date: '2026-09-22', homeId: 'fotmob-9825', awayId: 'fotmob-8455', homeName: 'Arsenal', awayName: 'Chelsea', homeGoals: 2, awayGoals: 2 }
    ]
  };
  const absentes = (etat) => etat.anomalies.filter((a) => a.sorte === 'calendrier-fotmob').map((a) => ({ id: a.id, trouveeLe: a.trouveeLe, controleLe: a.controleLe }));
  const omissionsVides = { leagues: 1, seasons: 1, played: 0, failed: [], missing: [] };
  const e1 = await dh.controleComplet({ database: lecture, lireCalendriersFotmob: async () => pages, saisonMinFotmob: 2023, maintenant: T(1) });
  const e2 = await dh.controleComplet({ database: lecture, precedent: e1, maintenant: T(2) });
  const e3 = await dh.controleComplet({ database: lecture, precedent: e2, omissions: omissionsVides, maintenant: T(3) });
  const e3echec = await dh.controleComplet({ database: lecture, precedent: e2, omissions: { ...omissionsVides, failed: ['EPL : délai dépassé'] }, maintenant: T(3) });
  const n3 = await dh.controleDeNuit({ database: lecture, precedent: e2, omissions: omissionsVides, maintenant: T(3) });
  sortie.pagesFotmob = {
    e1: { absentes: absentes(e1), fotmob: e1.controle.fotmob, raison: e1.controle.raison, nouvellesErreurs: e1.controle.nouvellesErreurs },
    e2: { absentes: absentes(e2), fotmob: e2.controle.fotmob, nouvellesErreurs: e2.controle.nouvellesErreurs },
    e3: { absentes: absentes(e3) },
    e3echec: { absentes: absentes(e3echec) },
    n3: { absentes: absentes(n3) }
  };
  // Le seuil de la passe de nuit, et pourquoi elle ne sert pas.
  sortie.seuil = {
    SEUIL_NUIT: dh.SEUIL_NUIT,
    sansCarnet: dh.pourquoiPasDeNuit(lecture, null),
    autreVersion: dh.pourquoiPasDeNuit(lecture, { ...e1, version: 99 }),
    rienDeNeuf: dh.pourquoiPasDeNuit(lecture, e1, { seuil: 0 }),
    tout: dh.pourquoiPasDeNuit(lecture, { ...e1, controle: { ...e1.controle, repere: '2000-01-01T00:00:00.000Z' } }, { seuil: 10 }),
    nuitRefusee: (await dh.controleDeNuit({ database: lecture, precedent: { ...e1, controle: { ...e1.controle, repere: '2000-01-01T00:00:00.000Z' } }, seuil: 10, maintenant: T(3) })) === null
  };
  lecture.close();

  // 2. Des homonymes plantés chez Arsenal, saison 2026, puis contrôle complet :
  //    H  le premier joueur d'Arsenal du 12/09 (David Raya) et un second identifiant à son nom, comme la phase « types » ;
  //    G2 « Ben White » (une seule apparition d'Arsenal, le 12/09) et un second « Ben White »… qui n'a joué que pour Chelsea : pas encore de groupe ;
  //    G3 « Theo Julienne » (une seule apparition d'Arsenal, le 15/09) et DEUX seconds identifiants à son nom chez Arsenal : un groupe de trois.
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const joueurEnPlus = (db, matchKey, side, id, nom) =>
    db.prepare(`INSERT INTO players (match_key, side, player_key, ord, player_id, name, minutes) VALUES (?, ?, ?, 99, ?, ?, 12)`).run(matchKey, side, id, id, nom);
  const homonyme = ecrire((db) => {
    const p = db.prepare(`SELECT name, player_id FROM players WHERE match_key = '2026-09-12-sunderland-arsenal' AND side = 'away' AND player_id IS NOT NULL ORDER BY ord LIMIT 1`).get();
    joueurEnPlus(db, '2026-09-19-brighton-arsenal', 'away', 'fotmob-99999001', p.name);
    joueurEnPlus(db, '2026-09-12-chelsea-hull-city', 'home', 'fotmob-99999002', 'Ben White');
    joueurEnPlus(db, '2026-08-31-aston-villa-arsenal', 'away', 'fotmob-99999003', 'Theo Julienne');
    joueurEnPlus(db, '2026-08-21-arsenal-coventry', 'home', 'fotmob-99999004', 'Theo Julienne');
    rebuildRegistries({ database: db });
    return p;
  });
  sortie.homonyme = homonyme;
  sortie.complet1 = cli(['--complet']);
  const a = lireCarnet();
  // Cette nuit, trois rencontres refaites (où aucun des joueurs d'origine ne joue) :
  //  H  le second identifiant reparaît sous un AUTRE nom (Brentford – Chelsea) : le cas
  //     « Tomás » / « Tiago Palacios » trouvé sur la base du bac le 06/10/2026 ;
  //  G2 le second « Ben White » joue pour Arsenal sous un autre nom (Arsenal – Chelsea) : groupe NOUVEAU,
  //     que seuls ses autres noms à l'annuaire font voir ;
  //  G3 FotMob corrige le nom d'un des trois « Theo Julienne » (Aston Villa – Arsenal) : l'annuaire ne le lie
  //     plus à ce nom ; le groupe des deux autres ne se refait que par le nom de l'ancien groupe.
  const apres = new Date(Date.parse(a.controle.repere) + 60_000).toISOString();
  ecrire((db) => {
    joueurEnPlus(db, '2026-09-18-brentford-chelsea', 'away', 'fotmob-99999001', 'Nom Tout Autre');
    joueurEnPlus(db, '2026-09-06-arsenal-chelsea', 'home', 'fotmob-99999002', 'Autre Nom Encore');
    db.prepare(`UPDATE players SET name = 'Nom Corrigé' WHERE match_key = '2026-08-31-aston-villa-arsenal' AND player_id = 'fotmob-99999003'`).run();
    const maj = db.prepare('UPDATE matches SET updated_at = ? WHERE match_key = ?');
    for (const k of ['2026-09-18-brentford-chelsea', '2026-09-06-arsenal-chelsea', '2026-08-31-aston-villa-arsenal']) maj.run(apres, k);
    rebuildRegistries({ database: db });
  });
  const e0 = empreinte();
  sortie.nuit = cli([], { env: { CM_TEST_MAINTENANT: '2026-10-06T03:00:00.000Z' } });
  sortie.baseInchangeeNuit = empreinte() === e0;
  const b = lireCarnet();
  // Le contrôle complet de la même base, juste après : ce qu'aurait dû voir la passe de nuit.
  sortie.complet2 = cli(['--complet'], { env: { CM_TEST_MAINTENANT: '2026-10-06T03:30:00.000Z' } });
  const b2 = lireCarnet();
  // 3. Une réécriture de masse (toutes les rencontres « modifiées ») : la passe de nuit cède la place au contrôle complet.
  ecrire((db) => db.prepare('UPDATE matches SET updated_at = ?').run(new Date(Date.parse(apres) + 60_000).toISOString()));
  const eMasse = empreinte();
  sortie.masse = cli([], { env: { CM_TEST_MAINTENANT: '2026-10-06T04:00:00.000Z' } });
  sortie.baseInchangeeMasse = empreinte() === eMasse;
  const c = lireCarnet();
  const groupe = (etat) => etat.anomalies.filter((x) => x.sorte === 'homonymes-joueurs').map((x) => ({ id: x.id, trouveeLe: x.trouveeLe, controleLe: x.controleLe, slug: x.portee?.slug ?? null }));
  sortie.a = { le: a.controle.le, ids: a.anomalies.map((x) => x.id), groupes: groupe(a) };
  sortie.b = { controle: b.controle, ids: b.anomalies.map((x) => x.id), groupes: groupe(b) };
  sortie.b2 = { ids: b2.anomalies.map((x) => x.id) };
  sortie.c = { controle: c.controle, ids: c.anomalies.map((x) => x.id), historique: c.historique.map((h) => h.mode) };
} else if (phase === 'reference' || phase === 'main') {
  // Les anomalies de la phase « types », celle d'une rencontre qui sera retirée avant la nuit (phase « nuit »), puis un
  // contrôle complet ; ensuite trois rencontres nouvelles, une ancienne modifiée en douce, une retirée, et la passe de nuit.
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const dh = await imp('data/db/dataHealth.js');
  const { DatabaseSync } = await import('node:sqlite');
  ecrire((db) => {
    planterLesTypes(db);
    db.prepare(`UPDATE team_stats SET shots_on_goal = total_shots + 3 WHERE match_key = '2026-09-15-ipswich-town-arsenal' AND side = 'away'`).run();
    // Des feuilles aux minutes impossibles (200), réparties sur toute la base dans l'ordre des clés : de quoi essayer chaque plage de lecture.
    const clesDesFeuilles = db.prepare("SELECT DISTINCT match_key FROM players WHERE side = 'home' ORDER BY match_key").all().map((r) => r.match_key);
    const impossible = db.prepare("UPDATE players SET minutes = 200 WHERE match_key = ? AND side = 'home' AND player_key = (SELECT MIN(player_key) FROM players WHERE match_key = ? AND side = 'home')");
    for (let i = 0; i < 12; i++) {
      const cle = clesDesFeuilles[Math.floor((i * clesDesFeuilles.length) / 12)];
      if (cle) impossible.run(cle, cle);
    }
    rebuildRegistries({ database: db });
  });
  const lecture = () => new DatabaseSync(BASE, { readOnly: true });
  const T_COMPLET = '2026-10-05T12:00:00.000Z';
  const T_NUIT = '2026-10-06T03:00:00.000Z';

  // Les manières de rendre la main. « ordinaire » : ce que fait le serveur (une pause au plus toutes les 25 ms, `setImmediate`).
  // « sansPause » : jamais, sauf à la fin de chaque étape, où elle est sans effet. « chaquePoint » : à CHAQUE point d'arrêt,
  // pour de vrai, en notant où ; un concurrent compte pendant ce temps ses tours de la boucle d'événements.
  const manieres = {
    ordinaire: () => ({ options: {}, suivi: null }),
    ...(phase === 'main'
      ? {
          sansPause: () => ({ options: { pasMs: Infinity, rendreLaMain: async () => {} }, suivi: null }),
          chaquePoint: () => {
            const suivi = { appels: 0, etiquettes: {}, ticks: 0 };
            const rendreLaMain = (ou) => {
              suivi.appels++;
              suivi.etiquettes[ou] = (suivi.etiquettes[ou] ?? 0) + 1;
              return new Promise((fin) => setImmediate(fin));
            };
            return { options: { pasMs: 0, rendreLaMain }, suivi };
          }
        }
      : {})
  };
  const jouer = async (maniere, controle) => {
    const { options, suivi } = maniere();
    let actif = Boolean(suivi);
    const concurrent = () => {
      if (!actif) return;
      suivi.ticks++;
      setImmediate(concurrent);
    };
    if (suivi) setImmediate(concurrent);
    try {
      const etat = await controle(options);
      return { etat, suivi: suivi && { appels: suivi.appels, etiquettes: suivi.etiquettes, ticks: suivi.ticks } };
    } finally {
      actif = false;
    }
  };

  const complets = {};
  const suivisComplet = {};
  const db1 = lecture();
  for (const [nom, maniere] of Object.entries(manieres)) {
    const r = await jouer(maniere, (options) => dh.controleComplet({ database: db1, omissions: OMISSIONS, maintenant: T_COMPLET, ...options }));
    complets[nom] = r.etat;
    suivisComplet[nom] = r.suivi;
  }
  db1.close();
  if (phase === 'main') {
    // Les plages de lecture des chiffres impossibles : les mêmes lignes, dans le même ordre, quelle que soit leur taille — jusqu'à
    // la limite d'une plage d'UNE rencontre — et que les rencontres soient lues d'un coup ou par lots de clés.
    const lectureP = lecture();
    const toutesLesCles = [...dh.lireRencontres(lectureP).keys()];
    const parCles = dh.lireJoueursImpossibles(lectureP, toutesLesCles);
    const parPlages = {};
    for (const plage of [1, 7, 1000]) parPlages[plage] = empreinteDe([...dh.lireJoueursImpossibles(lectureP, null, { plage }).entries()]);
    sortie.plages = { parCles: empreinteDe([...parCles.entries()]), parPlages, rencontres: parCles.size, lignes: [...parCles.values()].reduce((n, l) => n + l.length, 0) };
    lectureP.close();
  }

  ecrire((db) => {
    upsertMatches(
      [
        rencontre({ date: '2026-09-27', league: 'EPL', home: ['Arsenal', 'fotmob-9825'], away: ['Leeds', 'fotmob-8463'], buts: [2, 1], fotmobId: '77700001', statsDomicile: { 'Total Shots': 5, 'Shots on Goal': 7 }, meta: { leagueKey: 'ENG|Premier League', parentLeagueId: 47 } }),
        rencontre({ date: '2026-09-12', league: 'EPL', home: ['Fulham', 'fotmob-9879'], away: ['Liverpool', 'fotmob-8650'], buts: [1, 1], fotmobId: '77700002', meta: { leagueKey: 'ENG|Premier League', parentLeagueId: 47 } }),
        rencontre({ date: '2026-09-27', league: 'Virsliga - Latvia', home: ['Auda', 'fotmob-2106'], away: ['RFS', 'fotmob-248871'], buts: [0, 0], fotmobId: '77700003', statsDomicile: { clearances: 0, interceptions: 0, long_balls: 0 }, meta: { leagueKey: 'LVA|Virsliga', parentLeagueId: 226, coverage: 'lower' } })
      ],
      { database: db }
    );
    db.prepare(`UPDATE team_stats SET shots_on_goal = total_shots + 5 WHERE match_key = '2026-09-14-leeds-newcastle' AND side = 'home'`).run();
    db.prepare(`DELETE FROM matches WHERE match_key = '2026-09-15-ipswich-town-arsenal'`).run();
  });

  const nuits = {};
  const suivisNuit = {};
  const db2 = lecture();
  for (const [nom, maniere] of Object.entries(manieres)) {
    // Le carnet de la veille tel que le relit la passe : sorti d'un fichier JSON.
    const precedent = JSON.parse(JSON.stringify(complets.ordinaire));
    const r = await jouer(maniere, (options) => dh.controleDeNuit({ database: db2, precedent, omissions: OMISSIONS, maintenant: T_NUIT, ...options }));
    nuits[nom] = r.etat;
    suivisNuit[nom] = r.suivi;
  }
  db2.close();

  sortie.reference = { complet: sansMesure(complets.ordinaire), nuit: sansMesure(nuits.ordinaire) };
  if (phase === 'main') {
    const empreintes = (etats) => Object.fromEntries(Object.entries(etats).map(([nom, etat]) => [nom, empreinteDe(sansMesure(etat))]));
    const mesures = (etats) => Object.fromEntries(Object.entries(etats).map(([nom, etat]) => [nom, { blocMaxMs: etat.controle.blocMaxMs, blocMaxOu: etat.controle.blocMaxOu, pauses: etat.controle.pauses }]));
    sortie.empreintes = { complet: empreintes(complets), nuit: empreintes(nuits) };
    sortie.mesures = { complet: mesures(complets), nuit: mesures(nuits) };
    sortie.chaquePoint = { complet: suivisComplet.chaquePoint, nuit: suivisNuit.chaquePoint };
    sortie.rencontres = { complet: complets.ordinaire.controle.rencontresAuMagasin, nuit: nuits.ordinaire.controle.rencontresControlees };
  }
} else {
  throw new Error(`Phase inconnue : ${phase}`);
}

console.log(JSON.stringify(sortie));
