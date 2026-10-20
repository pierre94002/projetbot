/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-banc.mjs <serveur de la copie> <phase> [graine]
 *
 * Étape 19 — le banc d'essai. Base = la copie de la base d'essai (2 156
 * rencontres, 15 compétitions, deux coupes avec prolongations ; ni
 * football-data ni cotes archivées), la table du jour J construite ici, puis
 * football-data PLANTÉ par SQL (deux championnats sur deux saisons de P2,
 * scores et cotes fabriqués par un générateur à graine ; des lignes
 * rattachées aux rencontres de Premier League du magasin). Réseau coupé,
 * heure figée (05/10/2026). Sortie : une ligne JSON. Les valeurs attendues
 * sont recalculées par le TEST (SQL sur la copie, removeMargin à la main),
 * jamais recopiées d'une sortie — sauf l'oracle « copie tronquée », calculé
 * ici par le chemin de l'appli (enrichMatchWithRealAverages + analyzeMatch).
 *
 * Phases :
 *   rejeu      P2 planté et P4 : lignes, clés, une rencontre un rejeu, liens 0-4, reproduction, repère courant,
 *              étiquettes « déjà vu », hors grille, mémoire ; puis l'oracle de la copie tronquée
 *   antiFuite  match futur, clôture modifiée, même jour, repère du jour, fuite levée par avantEquipe,
 *              magasin 2023-09 face aux lignes football-data de 2023-03
 *   paris      paris de la règle du moteur et refus, valeur de clôture, variantes, blocs, coupe-circuit de la
 *              copie enclenché ; règlement à 90 minutes (DFB Pokal), attribué, corners 0-0
 *   prix       cotes gratuites et de vos bookmakers à la coupure ; égalité avec freeMarketOddsFor
 *   route      GET /api/bench, POST /api/bench/run (409 sous verrou, 202), passe reportée pendant un rejeu,
 *              une ligne bench_runs (INSERT puis UPDATE, un second refusé)
 *   ecran      les réponses de GET /api/bench pour l’écran : vide, en cours, après le rejeu par défaut, refus
 *   preparer   la table du jour J et les plantations, pour lancer scripts/bench.mjs ensuite (le test)
 *   fumee      un rejeu P2 + P4 complet, pour regarder
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import v8 from 'node:v8';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase, grainePassee] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
const graine = Number(grainePassee ?? 7);

const { openDb, closeDb, resolveDbPath, upsertMatches, deleteMatches, COLONNES_COTES_FD } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const T = await imp('data/db/dayTable.js');
const { TEAM_COLUMNS, PLAYER_COLUMNS } = await imp('data/db/columns.js');
const R = await imp('bench/runner.js');
const P = await imp('bench/periodes.js');

const sortie = { phase };
let db = openDb();

/** mulberry32 : le même tirage à chaque passage. */
function mulberry(g) {
  let s = g >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ la plantation football-data

function club(pays, nom) {
  db.prepare('INSERT OR IGNORE INTO fd_teams (pays, nom) VALUES (?, ?)').run(pays, nom);
  return db.prepare('SELECT id FROM fd_teams WHERE pays = ? AND nom = ?').get(pays, nom).id;
}
const cent = (x) => Math.round(x * 100);
/** Des cotes autour de probabilités, avec une marge (proportionnelle). */
const cotes = (p, marge) => p.map((x) => Math.max(1.02, 1 / (x * (1 + marge))));
const COLS_FD = () => ['code', 'saison', 'date', 'date_fichier', 'heure', 'dom', 'ext', 'match_key', 'lien', 'bd', 'be', 'tirs_d', 'tirs_e', 'cadres_d', 'cadres_e', 'corners_d', 'corners_e', ...COLONNES_COTES_FD];
function insererFd(v) {
  const cols = COLS_FD();
  return Number(db.prepare(`INSERT INTO fd_history (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => v[c] ?? null)).lastInsertRowid);
}
const trio = (v, pref, c, suffixes = ['1', 'n', '2']) => suffixes.forEach((sx, z) => (v[`${pref}_${sx}`] = c ? cent(c[z]) : null));

/**
 * Deux championnats (E0 → « EPL », SP1 → « La Liga - Spain ») sur deux saisons de P2 (2019-20, 2020-21 : le huis clos
 * commence le 14/03/2020), dix clubs, aller-retour, cinq matchs par semaine. Cotes : moyenne d'avant-match (marge
 * 6 %), Pinnacle un match sur deux, William Hill deux sur trois, Bet365 toujours, maximum toujours (deux lignes à
 * somme < 100 %), clôture décalée, plus/moins 2,5 ; statistiques (corners de 0 à 8 : des 0-0 vrais).
 */
function planterFd(g = graine, { codes = ['E0', 'SP1'], saisons = ['2019-20', '2020-21'] } = {}) {
  const u = mulberry(g);
  let n = 0;
  let maxBas = 0;
  for (const [code, pays] of [['E0', 'ENG'], ['SP1', 'ESP']].filter(([c]) => codes.includes(c))) {
    const clubs = Array.from({ length: 10 }, (_, i) => club(pays, `${code} club ${i + 1}`));
    const force = clubs.map(() => 0.6 + u() * 0.9);
    for (const [saison, debut] of [['2019-20', '2019-08-10'], ['2020-21', '2020-09-12']].filter(([sa]) => saisons.includes(sa))) {
      const paires = [];
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (i !== j) paires.push([i, j]);
      for (let k = 0; k < paires.length; k++) {
        const [i, j] = paires[k];
        const t = new Date(`${debut}T00:00:00Z`);
        t.setUTCDate(t.getUTCDate() + 7 * Math.floor(k / 5));
        const date = t.toISOString().slice(0, 10);
        const lh = (1.35 * force[i]) / force[j];
        const la = (1.1 * force[j]) / force[i];
        const poisson = (l) => {
          let x = 0;
          let p = Math.exp(-l);
          let s = p;
          const v = u();
          while (v > s && x < 9) {
            x++;
            p *= l / x;
            s += p;
          }
          return x;
        };
        const bd = poisson(lh);
        const be = poisson(la);
        const ph = Math.min(0.8, Math.max(0.1, ((0.45 * lh) / (lh + la)) * 2 * 0.9));
        const pa = Math.min(0.75, Math.max(0.08, ((0.3 * la) / (lh + la)) * 2 * 0.9));
        const pn = Math.max(0.12, 1 - ph - pa);
        const s = ph + pn + pa;
        const p = [ph / s, pn / s, pa / s];
        const pas = 0.04 * (u() - 0.5);
        const pc = [p[0] + pas, p[1], p[2] - pas].map((x) => Math.max(0.05, x));
        const over = Math.min(0.85, Math.max(0.2, (lh + la) / 5));
        const v = {
          code, saison, date, date_fichier: date, dom: clubs[i], ext: clubs[j], lien: 0, bd, be,
          tirs_d: 8 + Math.floor(u() * 10), tirs_e: 6 + Math.floor(u() * 10), cadres_d: 2 + Math.floor(u() * 5), cadres_e: 1 + Math.floor(u() * 5),
          corners_d: Math.floor(u() * 9), corners_e: Math.floor(u() * 8)
        };
        trio(v, 'moy', cotes(p, 0.06));
        trio(v, 'moy', cotes(pc, 0.05), ['c1', 'cn', 'c2']);
        trio(v, 'pin', k % 2 === 0 ? cotes(p, 0.03) : null);
        trio(v, 'pin', k % 2 === 0 ? cotes(pc, 0.025) : null, ['c1', 'cn', 'c2']);
        // William Hill généreux sur le domicile (≈ +7 % face à Pinnacle) : des paris pour la règle du moteur.
        trio(v, 'wh', k % 3 !== 2 ? cotes(p.map((x, z) => (z === 0 ? x * 0.9 : x)), 0.03) : null);
        trio(v, 'b365', cotes(p, 0.065));
        const maxSousCent = maxBas < 2 && k === 7;
        if (maxSousCent) maxBas++;
        trio(v, 'max', cotes(p, maxSousCent ? -0.02 : 0.01));
        const ou = cotes([over, 1 - over], 0.06);
        const ouC = cotes([over, 1 - over], 0.05);
        v.moy_p25 = cent(ou[0]);
        v.moy_m25 = cent(ou[1]);
        v.moy_cp25 = cent(ouC[0]);
        v.moy_cm25 = cent(ouC[1]);
        insererFd(v);
        n++;
      }
    }
  }
  return n;
}

/**
 * Des lignes RATTACHÉES aux rencontres de Premier League du magasin (P4b) : lien 1 (prix), sauf la 4e (lien 2,
 * score différent) et la 5e (lien 3) ; la 6e a une clôture incohérente (somme > 135 %). Pinnacle une sur deux.
 */
function rattacherAuMagasin(g = graine) {
  const u = mulberry(g + 1);
  const rencontres = db.prepare("SELECT match_key, date, home_goals, away_goals FROM matches WHERE league = 'EPL' AND date >= '2025-07-01' ORDER BY date, match_key").all();
  const cles = [];
  const dernier = rencontres.length - 1;
  rencontres.forEach((r, k0) => {
    // Les lignes particulières à la FIN (dans les petites fenêtres des essais) : lien 2, lien 3, clôture incohérente.
    const k = k0 === dernier - 2 ? 3 : k0 === dernier - 1 ? 4 : k0 === dernier ? 5 : k0 >= 3 && k0 <= 5 ? 6 + k0 : k0;
    const p = [0.3 + u() * 0.3, 0.25, 0];
    p[2] = 1 - p[0] - p[1];
    const v = { code: 'E0', saison: '2025-26', date: r.date, date_fichier: r.date, dom: club('ENG', `magasin dom ${k0}`), ext: club('ENG', `magasin ext ${k0}`), match_key: r.match_key, lien: k === 3 ? 2 : k === 4 ? 3 : 1, bd: r.home_goals, be: r.away_goals };
    trio(v, 'moy', cotes(p, 0.06));
    trio(v, 'moy', k === 5 ? [1.2, 2.0, 2.2] : cotes(p, 0.05), ['c1', 'cn', 'c2']);
    if (k % 2 === 0) {
      trio(v, 'pin', cotes(p, 0.03));
      trio(v, 'pin', cotes(p, 0.025), ['c1', 'cn', 'c2']);
    }
    trio(v, 'wh', cotes(p.map((x, z) => (z === 0 ? x * 0.9 : x)), 0.07));
    trio(v, 'b365', cotes(p, 0.065));
    insererFd(v);
    if (v.lien === 1) cles.push(r.match_key);
  });
  return cles;
}

/** La table du jour J de la copie (sans contrôle à part), puis les plantations. */
async function preparer({ fd = true, rattacher = true, plantation = {} } = {}) {
  const t = performance.now();
  await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
  sortie.tableMs = Math.round(performance.now() - t);
  sortie.lignesFdPlantees = fd ? planterFd(graine, plantation) : 0;
  const cles = rattacher ? rattacherAuMagasin() : [];
  sortie.rattachees = cles.length;
  return cles;
}

/** Un rejeu qui garde ses lignes (surLigne) ; seuils de preuve baissés (petites copies), 200 tirages. */
async function rejeu(options) {
  const lignes = [];
  const r = await R.rejouer({ database: db, tirages: 200, minBlocs: 20, surLigne: (l) => lignes.push(l), ...options });
  return { ...r, lignes };
}
const casesDe = (r) => Object.values(r.resume?.tranches ?? {}).flatMap((t) => t.cases);
const empreinte = (lignes) => JSON.stringify(lignes.map((l) => [l.cle, l.moteur, l.issue, l.mesures.moteur]));
/** Le ramasse-miettes à la demande (sans option de ligne de commande). */
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

/** L'entrée d'upsertMatches d'une rencontre existante, avec des changements (le patron de script-table-jour-j.mjs). */
function entreeDe(matchKey, changements = {}) {
  const m = db.prepare('SELECT * FROM matches WHERE match_key = ?').get(matchKey);
  const parse = (t) => (t ? JSON.parse(t) : null);
  const teamStats = {};
  for (const t of db.prepare('SELECT * FROM team_stats WHERE match_key = ?').all(matchKey)) {
    teamStats[t.side] = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, t[c.column]]).filter(([, v]) => v !== null && v !== undefined));
  }
  const players = { home: [], away: [] };
  for (const p of db.prepare('SELECT * FROM players WHERE match_key = ? ORDER BY side, ord').all(matchKey)) {
    const j = Object.fromEntries(PLAYER_COLUMNS.map((c) => [c.key, p[c.column]]).filter(([, v]) => v !== null && v !== undefined));
    if (j.starter !== undefined) j.starter = j.starter === 1;
    if (j.subbedIn !== undefined) j.subbedIn = j.subbedIn === 1;
    players[p.side]?.push(j);
  }
  return { date: m.date, league: m.league, homeName: m.home_name, awayName: m.away_name, homeId: m.home_id, awayId: m.away_id, fotmobId: m.fotmob_id, homeGoals: m.home_goals, awayGoals: m.away_goals, events: null, lineups: parse(m.lineups), meta: parse(m.meta), shotmap: null, sources: ['essai'], teamStats, players, ...changements };
}

// ------------------------------------------------------------ requêtes Express sans réseau

async function requete(app, methode, url, corps) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new Socket());
    req.method = methode;
    req.url = url;
    req.headers = { host: 'essai', ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) };
    if (corps !== undefined) {
      req._body = true;
      req.body = corps;
    }
    const res = new http.ServerResponse(req);
    const morceaux = [];
    res.write = (c) => {
      morceaux.push(Buffer.from(c));
      return true;
    };
    res.end = (c) => {
      if (c) morceaux.push(Buffer.from(c));
      let rendu = null;
      try {
        rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps: rendu });
      return res;
    };
    app.handle(req, res, reject);
  });
}

// ------------------------------------------------------------ les phases

if (phase === 'rejeu') {
  await preparer();
  // Un 9-0 avec 45 tirs (P2) ; une ligne lien = 4 (aucune rencontre au magasin) ; une ligne de 2023-03 (P2, jamais vue).
  const neufZero = { code: 'E0', saison: '2020-21', date: '2021-05-30', date_fichier: '2021-05-30', dom: club('ENG', 'E0 club 1'), ext: club('ENG', 'E0 club 2'), lien: 0, bd: 9, be: 0, tirs_d: 30, tirs_e: 15, cadres_d: 15, cadres_e: 2, corners_d: 9, corners_e: 1 };
  trio(neufZero, 'moy', [1.5, 4.2, 6.5]);
  insererFd(neufZero);
  const lien4 = { code: 'E0', saison: '2020-21', date: '2021-05-30', date_fichier: '2021-05-30', dom: club('ENG', 'E0 club 3'), ext: club('ENG', 'E0 club 4'), lien: 4, bd: 1, be: 1 };
  trio(lien4, 'moy', [2.1, 3.3, 3.5]);
  insererFd(lien4);
  const mars23 = { code: 'E0', saison: '2022-23', date: '2023-03-11', date_fichier: '2023-03-11', dom: club('ENG', 'E0 club 5'), ext: club('ENG', 'E0 club 6'), lien: 0, bd: 2, be: 1 };
  trio(mars23, 'moy', [1.9, 3.4, 4.1]);
  insererFd(mars23);
  // Une ligne lien = 1 datée de P2 (football-data le 30/06/2023, le magasin le lendemain) : elle a ses prix au
  // magasin, jamais un second rejeu par football-data (bug volontaire 20).
  const premiere = db.prepare('SELECT match_key FROM matches ORDER BY date, match_key LIMIT 1').get().match_key;
  const juin23 = { code: 'E0', saison: '2022-23', date: '2023-06-30', date_fichier: '2023-06-30', dom: club('ENG', 'E0 club 7'), ext: club('ENG', 'E0 club 8'), match_key: premiere, lien: 1, bd: 1, be: 0 };
  trio(juin23, 'moy', [2.0, 3.3, 3.9]);
  insererFd(juin23);
  gc();
  const tas0 = process.memoryUsage().heapUsed;
  // L'avancement que la page lit pendant un rejeu : la passe football-data le dit aussi (pas seulement le magasin).
  const parties = new Set();
  // La main rendue : rendreLaMain appelé (bug volontaire 27 : jamais appelé), le juge dans son fil.
  sortie.mainRendue = 0;
  const r1 = await rejeu({ periodes: ['P2'], prix: ['fd-avant-match', 'fd-cloture'], avancement: (a) => parties.add(`${a.partie}|${a.total === null || a.total === undefined ? 'sans total' : 'total'}`), rendreLaMain: (fin) => { sortie.mainRendue++; setImmediate(fin); } });
  sortie.avancement = [...parties];
  gc();
  sortie.tasAjouteMo = (process.memoryUsage().heapUsed - tas0) / 1048576;
  const r2 = await rejeu({ periodes: ['P4'], prix: ['fd-avant-match', 'fd-cloture', 'gratuites-avant-match'], de: '2026-08-15' });
  // P3 et P4a de la base d'essai (coupes de 2023, championnats de 2024-25) : les étiquettes « déjà vu ».
  const r3 = await rejeu({ periodes: ['P3', 'P4'], prix: ['fd-avant-match'], de: '2023-07-01', a: '2025-06-30' });
  sortie.r3 = { erreur: r3.bilan.erreur, vues: casesDe(r3).filter((c) => c.sousTable === 'tout' && c.marketKey === 'result').map((c) => ({ cle: c.cle, vues: c.vues })) };
  // Une copie SANS football-data : aucune erreur.
  const sansFd = await R.rejouer({ database: db, periodes: ['P4'], prix: ['fd-avant-match'], de: '2026-09-15', tirages: 100, minBlocs: 20, reproduction: false });
  sortie.sansFd = { erreur: sansFd.bilan.erreur, rejouees: sansFd.bilan.rencontres.rejouees };
  for (const [nom, r] of [['r1', r1], ['r2', r2]]) {
    const cles = r.lignes.filter((l) => l.type === 'ligne').map((l) => l.cle);
    sortie[nom] = {
      erreur: r.bilan.erreur,
      bilan: { rencontres: r.bilan.rencontres, ecartees: r.bilan.ecartees, referenceDifferente: r.bilan.referenceDifferente, grilleDifferente: r.bilan.grilleDifferente, horsGrille: r.bilan.horsGrille, liensFd: r.bilan.liensFd, blocMaxMs: r.bilan.blocMaxMs },
      lignes: cles.length,
      clesUniques: new Set(cles).size,
      comptes: r.resume?.comptes ?? null,
      juge: r.resume?.juge ?? null,
      reproduction: r.resume?.reproduction ?? null,
      cases: casesDe(r).map((c) => ({ cle: c.cle, n: c.n, marcheN: c.marche?.n ?? null, repereN: c.repere?.n ?? null, vues: c.vues, juge: { marche: c.marche?.juge ?? null, repere: c.repere?.juge ?? null }, horsGrille: c.horsGrille, sousTable: c.sousTable }))
    };
  }
  // Les lignes détaillées utiles au test : par match, les clés de marché et la ligne ; quelques distributions.
  const parMatch = (r) => {
    const m = {};
    for (const l of r.lignes) {
      if (l.type !== 'ligne') continue;
      (m[`${l.fixtureKey}|${l.prix}`] ??= []).push(`${l.marketKey}|${l.ligne ?? '-'}`);
    }
    return m;
  };
  sortie.r1.parMatch = parMatch(r1);
  sortie.r2.parMatch = parMatch(r2);
  const garder = (l) => ({ cle: l.cle, fixtureKey: l.fixtureKey, matchKey: l.matchKey, prix: l.prix, date: l.date, league: l.league, marketKey: l.marketKey, ligne: l.ligne, periode: l.periode, vues: l.vues, huisClos: l.huisClos, moteur: { distribution: Array.isArray(l.moteur.distribution) || l.moteur.distribution?.pmf ? null : l.moteur.distribution, source: l.moteur.source, reference: l.moteur.reference }, issue: l.issue, horsGrille: l.horsGrille, mesures: l.mesures, repere: l.repere });
  sortie.r1.lignes1N2 = r1.lignes.filter((l) => l.type === 'ligne' && (l.marketKey === 'result' || (l.marketKey === 'totalGoals' && l.ligne === 2.5))).map(garder);
  sortie.r1.neufZero = r1.lignes.filter((l) => l.type === 'ligne' && l.date === '2021-05-30' && ['scoreExact', 'totalShots', 'teamShots:home'].includes(l.marketKey)).map(garder);
  sortie.r2.lignesCloture = r2.lignes.filter((l) => l.type === 'ligne' && l.marketKey === 'result' && l.prix === 'fd-cloture').map(garder);
  // L'ORACLE DE LA COPIE TRONQUÉE : pour des rencontres de P4b à prix d'avant-match, toutes les rencontres de date ≥ J
  // supprimées, puis le chemin de l'APPLI (enrichMatchWithRealAverages, analyzeMatch, mêmes prix) : les lecteurs
  // « maintenant » voient alors exactement « avant J ». Du plus récent au plus ancien, dans la même copie.
  const { enrichMatchWithRealAverages } = await imp('data/providers/matchEnrichment.js');
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getSport } = await imp('sports/index.js');
  const { lireReglagesDuMoteur } = await imp('core/engine/engineConfig.js');
  const { prixFd } = await imp('bench/prix.js');
  const config = JSON.parse(JSON.stringify(lireReglagesDuMoteur().football));
  const lignesBanc = r2.lignes.filter((l) => l.type === 'ligne' && l.prix === 'fd-avant-match' && l.periode === 'P4b');
  const cibles = [...new Set(lignesBanc.map((l) => l.matchKey))].filter(Boolean).sort().reverse().filter((_, i) => i % 9 === 0).slice(0, 6);
  const DIST = ['result', 'totalGoals', 'bothTeamsScore', 'teamGoals:home', 'teamGoals:away', 'resultAndTotal'];
  sortie.oracle = [];
  for (const k of cibles) {
    const m = db.prepare('SELECT match_key, date, league, home_name, away_name FROM matches WHERE match_key = ?').get(k);
    const ligneFd = db.prepare(`SELECT * FROM fd_history WHERE match_key = ? AND lien = 1`).get(k);
    const aSupprimer = db.prepare('SELECT match_key FROM matches WHERE date >= ?').all(m.date).map((x) => x.match_key);
    deleteMatches(aSupprimer, { database: db });
    const mo = prixFd(ligneFd, { jeu: 'fd-avant-match' });
    const match = { matchId: k, home: m.home_name, away: m.away_name, league: m.league, commenceTime: `${m.date}T12:00:00.000Z`, sportKey: 'football', bankroll: 1000, hasOdds: true, marketOdds: { odds1: mo.odds1, oddsDraw: mo.oddsDraw, odds2: mo.odds2, bookmakersCount: mo.bookmakersCount, byBookmaker: mo.byBookmaker } };
    const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
    const a = await analyzeMatch(enrichi, config, R.__pourLesTests?.TILT ?? { currentDownswing: 0, circuitBreakerActive: false }, getSport('football'));
    let ecartMax = 0;
    let comparees = 0;
    for (const l of lignesBanc.filter((x) => x.matchKey === k && DIST.includes(x.marketKey))) {
      const [famille, equipe] = l.marketKey.split(':');
      const d = famille === 'result' ? a.distributions.result : famille === 'bothTeamsScore' ? a.distributions.bothTeamsScore : famille === 'teamGoals' ? a.distributions.teamGoals[equipe][l.ligne] : a.distributions[famille][l.ligne];
      for (const [cle, p] of Object.entries(l.moteur.distribution)) {
        ecartMax = Math.max(ecartMax, Math.abs(p - d[cle]));
        comparees++;
      }
    }
    const attendus = lignesBanc.find((x) => x.matchKey === k && x.marketKey === 'totalCorners');
    sortie.oracle.push({ matchKey: k, comparees, ecartMax, corners: { banc: attendus?.moteur?.distribution?.attendu ?? null, appli: a.statExpectations?.corners?.total ?? null } });
  }
}

if (phase === 'antiFuite') {
  await preparer({ rattacher: true, plantation: { codes: ['E0'], saisons: ['2020-21'] } });
  const fenetre = { periodes: ['P4'], prix: ['fd-avant-match', 'gratuites-avant-match'], de: '2026-09-10', a: '2026-09-14' };
  const base = await rejeu(fenetre);
  const J = '2026-09-12';
  const duJour = (r, jour = J) => r.lignes.filter((l) => l.type === 'ligne' && l.date === jour);
  sortie.lignesDuJour = duJour(base).length;
  // (a) Un match FUTUR (J + 1, 9-0, 25 corners) entre deux clubs qui jouent le jour J : la table du jour J refaite la nuit.
  const modele = db.prepare("SELECT match_key FROM matches WHERE date = ? AND league = 'EPL' ORDER BY match_key LIMIT 1").get(J).match_key;
  const e = entreeDe(modele, { date: '2026-09-13', fotmobId: '990000301', homeGoals: 9, awayGoals: 0, meta: { kickoff: '2026-09-13T14:00:00.000Z' } });
  e.teamStats = { home: { ...(e.teamStats.home ?? {}), 'Corner Kicks': 25, 'Total Shots': 40, 'Shots on Goal': 20 }, away: { ...(e.teamStats.away ?? {}), 'Corner Kicks': 0, 'Total Shots': 1, 'Shots on Goal': 0 } };
  upsertMatches([e], { database: db });
  const cleFuture = db.prepare("SELECT match_key FROM matches WHERE fotmob_id = '990000301'").get().match_key;
  await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
  const futur = await rejeu(fenetre);
  sortie.futur = { jourIdentique: empreinte(duJour(base)) === empreinte(duJour(futur)), planteRejoue: futur.lignes.some((l) => l.matchKey === cleFuture), lignesDuJour: duJour(futur).length };
  // (b) La clôture × 2 : aucune distribution ni décision d'avant-match ne bouge ; seule la valeur de clôture.
  const avantP2 = await rejeu({ periodes: ['P2'], prix: ['fd-avant-match'] });
  db.exec('UPDATE fd_history SET moy_c1 = moy_c1 * 2, pin_c1 = pin_c1 * 2');
  const apresP2 = await rejeu({ periodes: ['P2'], prix: ['fd-avant-match'] });
  const sansValeur = (lignes) => lignes.map((l) => (l.type === 'pari' ? { ...l, probaCloture: null, valeurCloture: null, livreCloture: null } : { ...l, mesures: { ...l.mesures, temoin: null } }));
  sortie.cloture = {
    lignesIdentiques: JSON.stringify(sansValeur(avantP2.lignes.filter((l) => l.type === 'ligne'))) === JSON.stringify(sansValeur(apresP2.lignes.filter((l) => l.type === 'ligne'))),
    parisIdentiques: JSON.stringify(sansValeur(avantP2.lignes.filter((l) => l.type === 'pari'))) === JSON.stringify(sansValeur(apresP2.lignes.filter((l) => l.type === 'pari'))),
    paris: avantP2.lignes.filter((l) => l.type === 'pari').length,
    valeurChange: JSON.stringify(avantP2.lignes.filter((l) => l.type === 'pari').map((l) => l.valeurCloture)) !== JSON.stringify(apresP2.lignes.filter((l) => l.type === 'pari').map((l) => l.valeurCloture))
  };
  // (c) Deux matchs d'un club le MÊME jour : aucun ne voit l'autre.
  const d = db.prepare("SELECT date, dom FROM fd_history WHERE code = 'E0' AND saison = '2020-21' ORDER BY date LIMIT 1 OFFSET 30").get();
  const fixture = db.prepare("SELECT * FROM fd_history WHERE code = 'E0' AND date = ? AND dom = ?").get(d.date, d.dom);
  const cleFixture = `fd:E0|${fixture.date_fichier}|${fixture.dom}|${fixture.ext}`;
  const memeJourAvant = apresP2.lignes.filter((l) => l.fixtureKey === cleFixture);
  const autre = { code: 'E0', saison: '2020-21', date: d.date, date_fichier: d.date, dom: club('ENG', 'E0 club invité'), ext: d.dom, lien: 0, bd: 7, be: 0, corners_d: 20, corners_e: 0, tirs_d: 30, tirs_e: 2, cadres_d: 12, cadres_e: 1 };
  trio(autre, 'moy', [1.3, 5, 9]);
  insererFd(autre);
  const memeJour = await rejeu({ periodes: ['P2'], prix: ['fd-avant-match'] });
  const memeJourApres = memeJour.lignes.filter((l) => l.fixtureKey === cleFixture);
  // Les entrées du moteur du match sont les mêmes ; seul le repère du lendemain peut bouger (pas celui du jour).
  sortie.memeJour = { lignes: memeJourApres.length, identiques: JSON.stringify(memeJourAvant.map((l) => [l.cle, l.moteur.distribution, l.repere])) === JSON.stringify(memeJourApres.map((l) => [l.cle, l.moteur.distribution, l.repere])) };
  // (d) Un 8-8 planté le jour J dans un championnat : le repère des lignes de J ne bouge pas, celui de J + 7 (la journée suivante) oui.
  const jd = db.prepare("SELECT date FROM fd_history WHERE code = 'E0' AND saison = '2020-21' AND date > ? GROUP BY date ORDER BY date LIMIT 1 OFFSET 2").get(d.date).date;
  const suivant = db.prepare("SELECT MIN(date) d FROM fd_history WHERE code = 'E0' AND date > ?").get(jd).d;
  const modifie = db.prepare("SELECT * FROM fd_history WHERE code = 'E0' AND date = ? ORDER BY id LIMIT 1").get(jd);
  const cleModifiee = `fd:E0|${modifie.date_fichier}|${modifie.dom}|${modifie.ext}`;
  // Le repère des AUTRES matchs du jour (celui du match modifié se mesure sur son propre score) : sa perte log sur leur issue.
  const reperes = (r, jour) => JSON.stringify(r.lignes.filter((l) => l.type === 'ligne' && l.date === jour && l.league === 'EPL' && l.marketKey === 'totalGoals' && l.fixtureKey !== cleModifiee).map((l) => [l.cle, l.repere]));
  const avant8 = memeJour;
  db.prepare('UPDATE fd_history SET bd = 8, be = 8 WHERE id = ?').run(modifie.id);
  const apres8 = await rejeu({ periodes: ['P2'], prix: ['fd-avant-match'] });
  sortie.huitHuit = { jour: jd, suivant, jourIdentique: reperes(avant8, jd) === reperes(apres8, jd), suivantChange: reperes(avant8, suivant) !== reperes(apres8, suivant) };
  // (e) Une fuite glissée dans l'histoire d'un club (un fait du jour J) : avantEquipe lève, le rejeu s'ARRÊTE, l'erreur est nommée.
  const E = await imp('bench/entrees.js');
  const original = E.MemoireFd.prototype.entrees;
  E.MemoireFd.prototype.entrees = function (ligne) {
    const histoire = this.clubs.get(Number(ligne.dom));
    if (histoire?.length && ligne.date >= '2020-01-01') histoire.push({ ...histoire[histoire.length - 1], date: ligne.date });
    return original.call(this, ligne);
  };
  const fuite = await R.rejouer({ database: db, periodes: ['P2'], prix: ['fd-avant-match'], tirages: 100, minBlocs: 20 });
  E.MemoireFd.prototype.entrees = original;
  sortie.fuite = { erreur: fuite.bilan.erreur, resume: fuite.resume };
  // (f) Un match du MAGASIN de 2023-09 planté 9-0 (EPL) ne change pas le repère des lignes football-data de 2023-03 (EPL).
  const mars = { code: 'E0', saison: '2022-23', date: '2023-03-11', date_fichier: '2023-03-11', dom: club('ENG', 'E0 club 7'), ext: club('ENG', 'E0 club 8'), lien: 0, bd: 1, be: 0 };
  trio(mars, 'moy', [2.2, 3.2, 3.4]);
  insererFd(mars);
  const lignesMars = async () => JSON.stringify((await rejeu({ periodes: ['P2'], prix: ['fd-avant-match'], de: '2023-01-01' })).lignes.filter((l) => l.type === 'ligne' && l.date === '2023-03-11').map((l) => [l.cle, l.repere, l.moteur.distribution]));
  const marsAvant = await lignesMars();
  const modeleEpl = db.prepare("SELECT match_key FROM matches WHERE league = 'EPL' ORDER BY date LIMIT 1").get().match_key;
  upsertMatches([entreeDe(modeleEpl, { date: '2023-09-10', fotmobId: '990000302', homeGoals: 9, awayGoals: 0, meta: { kickoff: '2023-09-10T14:00:00.000Z' } })], { database: db });
  await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
  sortie.magasinApres = { identique: marsAvant === (await lignesMars()), lignes: JSON.parse(marsAvant).length };
}

if (phase === 'paris') {
  await preparer({ rattacher: false, plantation: { codes: ['E0'], saisons: ['2020-21'] } });
  // Des matchs de P2 aux prix choisis (E0, 2021-04) : Pinnacle + William Hill à 4 % de value sur le domicile, sans Pinnacle,
  // Pinnacle sans William Hill, une value au-delà de la cote 5 ; clôture connue.
  const plantes = [];
  const planter = (n, { pin, wh, b365 = null, cloturePin = null, bd = 2, be = 1 }) => {
    const v = { code: 'E0', saison: '2020-21', date: `2021-04-${String(10 + n).padStart(2, '0')}`, date_fichier: `2021-04-${String(10 + n).padStart(2, '0')}`, dom: club('ENG', `pari dom ${n}`), ext: club('ENG', `pari ext ${n}`), lien: 0, bd, be };
    trio(v, 'moy', [2.0, 3.4, 3.9]);
    trio(v, 'pin', pin);
    trio(v, 'wh', wh);
    trio(v, 'b365', b365);
    trio(v, 'pin', cloturePin, ['c1', 'cn', 'c2']);
    insererFd(v);
    plantes.push({ n, fixtureKey: `fd:E0|${v.date_fichier}|${v.dom}|${v.ext}`, date: v.date });
  };
  // Pinnacle 2,10 / 3,40 / 3,90 (marge ≈ 3,9 %) → p(dom) ≈ 0,4635 ; William Hill 2,26 au domicile : avantage ≈ +4,7 %.
  planter(1, { pin: [2.1, 3.4, 3.9], wh: [2.26, 3.1, 3.4], cloturePin: [2.0, 3.5, 4.1] });
  planter(2, { pin: null, wh: [2.26, 3.1, 3.4] });
  planter(3, { pin: [2.1, 3.4, 3.9], wh: null });
  planter(4, { pin: [6.0, 4.4, 1.6], wh: [7.6, 4.0, 1.45] });
  planter(5, { pin: [2.1, 3.4, 3.9], wh: [2.26, 3.1, 3.4], b365: [2.3, 3.0, 3.3], bd: 0, be: 1 });
  const r = await rejeu({ periodes: ['P2'], prix: ['fd-avant-match'] });
  sortie.plantes = plantes;
  sortie.paris = r.lignes.filter((l) => l.type === 'pari');
  sortie.resumeParis = r.resume.paris;
  sortie.lignesPlantees = r.lignes.filter((l) => l.type === 'ligne' && l.marketKey === 'result' && plantes.some((p) => p.fixtureKey === l.fixtureKey)).map((l) => ({ fixtureKey: l.fixtureKey, distribution: l.moteur.distribution, reference: l.moteur.reference }));
  // Le règlement : la coupe d'Allemagne prolongée (P4a et P4b), un match attribué, des corners à 0-0.
  const prolonges = db.prepare("SELECT match_key FROM matches WHERE league = 'DFB Pokal - Germany' AND json_extract(meta, '$.reason') IN ('afterextra', 'afterpenalties')").all().map((x) => x.match_key);
  const attribue = db.prepare("SELECT match_key FROM matches WHERE league = 'Bundesliga - Germany' ORDER BY date DESC LIMIT 1").get().match_key;
  db.prepare("UPDATE matches SET meta = json_set(COALESCE(meta, '{}'), '$.awarded', 1) WHERE match_key = ?").run(attribue);
  const zero = db.prepare("SELECT match_key FROM matches WHERE league = 'Serie A - Italy' AND date BETWEEN '2026-08-20' AND '2026-08-31' ORDER BY date DESC LIMIT 1").get().match_key;
  db.prepare('UPDATE team_stats SET corner_kicks = 0 WHERE match_key = ?').run(zero);
  db.prepare("UPDATE matches SET updated_at = '2026-10-04T00:00:00Z' WHERE match_key IN (?, ?)").run(attribue, zero);
  await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
  const reg1 = await rejeu({ periodes: ['P4'], prix: ['fd-avant-match'], de: '2024-08-01', a: '2024-08-31' });
  const reg2 = await rejeu({ periodes: ['P4'], prix: ['fd-avant-match'], de: '2026-08-20', a: '2026-08-31' });
  const reg = { bilan: { ecartees: { attribue: reg1.bilan.ecartees.attribue + reg2.bilan.ecartees.attribue } }, resume: { comptes: { ...reg1.resume.comptes, ...reg2.resume.comptes } }, lignes: [...reg1.lignes, ...reg2.lignes] };
  sortie.reglement = {
    prolonges,
    attribue,
    zero,
    bilan: { attribue: reg.bilan.ecartees.attribue, comptes: reg.resume.comptes },
    lignes: reg.lignes.filter((l) => l.type === 'ligne' && [...prolonges, attribue, zero].includes(l.matchKey) && ['result', 'totalCorners', 'totalShots'].includes(l.marketKey)).map((l) => ({ matchKey: l.matchKey, marketKey: l.marketKey, issue: l.issue, reglable: l.reglable, nonReglable: l.nonReglable }))
  };
}

if (phase === 'prix') {
  const { prixGratuits, prixVosBookmakers } = await imp('bench/prix.js');
  const { freeMarketOddsFor } = await imp('data/freeMarketOdds.js');
  const S = await imp('bench/simulateBets.js');
  const evenement = (source, matchKey, date, kickoff, ids = [null, null]) =>
    Number(db.prepare("INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at) VALUES (?, ?, 'EPL', ?, ?, 'Burnley', 'Chelsea', ?, ?, ?, 'essai', '2026-10-01T00:00:00Z')").run(source, `${source}-${matchKey}`, date, kickoff, ids[0], ids[1], matchKey).lastInsertRowid);
  const cote = (ev, bookmaker, kind, releveAt, prix, seq = '') => {
    ['home', 'draw', 'away'].forEach((sel, z) => db.prepare("INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price) VALUES (?, ?, '1x2', ?, 0, ?, ?, ?, ?)").run(ev, bookmaker, sel, kind, seq || (kind === 'snapshot' || kind === 'live' ? releveAt : ''), releveAt, prix[z]));
  };
  const K = '2026-03-14T19:00:00.000Z';
  const H = (min) => new Date(Date.parse(K) + min * 60_000).toISOString();
  const coupure = P.coupureDe({ date: '2026-03-14', kickoff: K });
  // 1. Un livre : ouverture J−3, pré-clôture J−1, relevés H−90 et H−30, clôture H−5 → le relevé H−90.
  const e1 = evenement('espn', 'cle-1', '2026-03-14', K);
  cote(e1, 'DraftKings', 'open', H(-3 * 1440), [2.5, 3.3, 2.9]);
  cote(e1, 'DraftKings', 'preclose', H(-1440), [2.4, 3.3, 3.0]);
  cote(e1, 'DraftKings', 'snapshot', H(-90), [2.3, 3.4, 3.1]);
  cote(e1, 'DraftKings', 'snapshot', H(-30), [2.2, 3.5, 3.2]);
  cote(e1, 'DraftKings', 'close', H(-5), [2.1, 3.6, 3.3]);
  // 2. Une clôture seule relevée à J−3 : prise ; 3. une clôture seule à H−5 : écartée ; 4. une ouverture rattrapée après le coup d'envoi : prise.
  const e2 = evenement('espn', 'cle-2', '2026-03-14', K);
  cote(e2, 'DraftKings', 'close', H(-3 * 1440), [1.9, 3.6, 4.0]);
  const e3 = evenement('espn', 'cle-3', '2026-03-14', K);
  cote(e3, 'DraftKings', 'close', H(-5), [1.9, 3.6, 4.0]);
  const e4 = evenement('365scores', 'cle-4', '2026-03-14', K);
  cote(e4, 'Bet365', 'open', H(120), [2.6, 3.2, 2.8]);
  cote(e4, 'Bet365', 'live', H(10), [1.2, 6, 12]);
  sortie.gratuites = ['cle-1', 'cle-2', 'cle-3', 'cle-4'].map((k) => prixGratuits(k, { coupure, database: db }));
  // 5. Vos bookmakers : William Hill H−3 j, H−90, H−30 (après la coupure) et en direct ; Betsson H−3 j seulement.
  const e5 = evenement('odds-api', 'cle-5', '2026-03-14', K);
  cote(e5, 'williamhill', 'snapshot', H(-3 * 1440), [2.5, 3.2, 2.9]);
  cote(e5, 'williamhill', 'snapshot', H(-90), [2.45, 3.25, 2.95]);
  cote(e5, 'williamhill', 'snapshot', H(-30), [2.2, 3.4, 3.3]);
  cote(e5, 'williamhill', 'live', H(15), [1.5, 4, 6]);
  cote(e5, 'betsson', 'snapshot', H(-3 * 1440), [2.55, 3.1, 2.9]);
  const vos = prixVosBookmakers('cle-5', { coupure, database: db });
  sortie.vos = vos;
  const fraicheur = (bookmaker) =>
    S.parisDUnMatch({ staking: { action: 'RECOMMENDED', outcome: 'home', bookmaker, odds: 2.45, displayedOdds: 2.45, fairOdds: 2.3, ev: 0.05, stake: 3 }, issue: 'home', fixtureKey: 'f', date: '2026-03-14', league: 'EPL', prixDuLivre: vos.byBookmaker.find((b) => b.key === bookmaker), coupure }).pari.fraicheur;
  sortie.fraicheur = { williamhill: fraicheur('williamhill'), betsson: fraicheur('betsson') };
  // 6. Égalité avec freeMarketOddsFor sur le même jeu (un match à venir : ouvertures et pré-clôtures, le maximum, une bourse sans volume).
  const ids = ['Burnley', 'Chelsea'].map((n) => db.prepare("SELECT home_id FROM matches WHERE home_name = ? AND league = 'EPL' LIMIT 1").get(n).home_id);
  const e6 = evenement('espn', 'futur-1', '2026-10-10', '2026-10-10T14:00:00.000Z', ids);
  cote(e6, 'DraftKings', 'open', '2026-10-04T10:00:00.000Z', [2.0, 3.6, 3.7]);
  cote(e6, 'DraftKings', 'preclose', '2026-10-05T10:00:00.000Z', [1.95, 3.6, 3.9]);
  const e7 = evenement('football-data.co.uk', 'futur-1', '2026-10-10', null, ids);
  cote(e7, 'Moyenne du marché', 'preclose', '2026-10-05T09:00:00.000Z', [1.98, 3.55, 3.8]);
  cote(e7, 'Maximum du marché', 'preclose', '2026-10-05T09:00:00.000Z', [2.1, 3.9, 4.2]);
  const e8 = evenement('kalshi', 'futur-1', '2026-10-10', null, ids);
  cote(e8, 'Kalshi', 'open', '2026-10-04T10:00:00.000Z', [2.1, 3.4, 3.6]);
  const banc = prixGratuits('futur-1', { coupure: P.coupureDe({ date: '2026-10-10', kickoff: '2026-10-10T14:00:00.000Z' }), database: db });
  const appli = freeMarketOddsFor({ league: 'EPL', date: '2026-10-10', homeName: 'Burnley', awayName: 'Chelsea', database: db });
  const forme = (m) => m && { odds1: m.odds1, oddsDraw: m.oddsDraw, odds2: m.odds2, bookmakersCount: m.bookmakersCount, livres: m.byBookmaker.map((b) => [b.key, b.title, b.odds1, b.oddsDraw, b.odds2, b.referenceOnly, b.kind]).sort() };
  sortie.egalite = { banc: forme(banc), appli: forme(appli) };
}

if (phase === 'route') {
  await preparer();
  const { createApp } = await imp('app.js');
  const { withRefreshLock } = await imp('data/providers/refreshLock.js');
  const D = await imp('bench/depotBanc.js');
  const app = createApp();
  sortie.vide = (await requete(app, 'GET', '/api/bench')).corps;
  // Sous le verrou (une passe en cours dans ce processus) : 409, la raison dite.
  let liberer;
  const tenu = withRefreshLock(() => new Promise((fin) => (liberer = fin)), { stamp: false });
  sortie.sousVerrou = await requete(app, 'POST', '/api/bench/run', { periodes: ['P3'], prix: ['fd-cloture'] });
  liberer();
  await tenu;
  sortie.invalide = await requete(app, 'POST', '/api/bench/run', { periodes: ['P9'] });
  // Un rejeu lancé : 202 ; pendant qu'il tourne, une passe d'actualisation est REPORTÉE (jamais le bilan du banc).
  const lance = await requete(app, 'POST', '/api/bench/run', { periodes: ['P3'], prix: ['fd-cloture'] });
  sortie.lance = { code: lance.code, options: lance.corps?.options };
  const passe = await withRefreshLock(async () => ({ bilan: 'de la passe' }), { stamp: false });
  sortie.passePendantLeBanc = passe;
  sortie.encore = (await requete(app, 'POST', '/api/bench/run', { periodes: ['P3'], prix: ['fd-cloture'] })).code;
  let etat;
  for (let i = 0; i < 600; i++) {
    etat = (await requete(app, 'GET', '/api/bench')).corps;
    if (!etat.enCours) break;
    await new Promise((fin) => setTimeout(fin, 100));
  }
  sortie.apres = { enCours: etat.enCours, refus: etat.dernierRefus, rejeux: etat.rejeux.length, dernier: etat.dernierRejeu && { id: etat.dernierRejeu.id, ou: etat.dernierRejeu.ou, finiLe: Boolean(etat.dernierRejeu.finiLe), erreur: etat.dernierRejeu.bilan?.erreur ?? null, rencontres: etat.dernierRejeu.bilan?.rencontres ?? null, tranches: Object.keys(etat.dernierRejeu.resume?.tranches ?? {}), variantes: etat.dernierRejeu.resume?.juge?.variantes ?? null } };
  sortie.passeApres = await withRefreshLock(async () => ({ bilan: 'de la passe' }), { stamp: false });
  // bench_runs : un INSERT (fini_le NULL), un UPDATE, un second UPDATE refusé (la ligne ne bouge pas).
  const id = D.ouvrirRejeu({ database: db, ou: 'bac', moteur: { empreinte: 'a'.repeat(40), empreinteCode: 'b'.repeat(40), version: null }, options: { essai: true } });
  const ouverte = db.prepare('SELECT fini_le, bilan, resume FROM bench_runs WHERE id = ?').get(id);
  D.finirRejeu({ database: db, id, bilan: { n: 1 }, resume: { r: 1 } });
  const finie = db.prepare('SELECT fini_le, bilan, resume FROM bench_runs WHERE id = ?').get(id);
  let second = null;
  try {
    D.finirRejeu({ database: db, id, bilan: { n: 2 }, resume: { r: 2 } });
  } catch (error) {
    second = error.constructor.name;
  }
  sortie.depot = { ouverte, finie, second, apresSecond: db.prepare('SELECT fini_le, bilan, resume FROM bench_runs WHERE id = ?').get(id) };
}

if (phase === 'moteur') {
  // Amendement A1 : la clé `leagueGoalAverages` que le banc pose. Sur un championnat dont la moyenne du magasin
  // diffère du barème : clé absente → le magasin d'aujourd'hui (l'appli, inchangée) ; posée à cette moyenne → le
  // même résultat champ pour champ ; nulle → le barème, jamais le magasin. Avec et sans cotes.
  const { analyzeMatch } = await imp('core/engine/oddsEngine.js');
  const { getSport } = await imp('sports/index.js');
  const { getLeagueGoalAverages } = await imp('data/providers/standingsService.js');
  const { getLeagueBaselineXg } = await imp('sports/football/xgBaseline.js');
  const { lireReglagesDuMoteur } = await imp('core/engine/engineConfig.js');
  const E = await imp('bench/entrees.js');
  const config = lireReglagesDuMoteur().football;
  const sport = getSport('football');
  const reel = await getLeagueGoalAverages('EPL');
  const b = getLeagueBaselineXg('football', {});
  const bareme = { home: b.xgHome, away: b.xgAway };
  sortie.moyennes = { reel, bareme };
  const prix = { odds1: 2.1, oddsDraw: 3.4, odds2: 3.6, bookmakersCount: 1, byBookmaker: [{ key: 'fd_moyenne', title: 'Moyenne du marché', odds1: 2.1, oddsDraw: 3.4, odds2: 3.6, referenceOnly: true }], jeu: 'fd-avant-match' };
  const garder = (a) => JSON.parse(JSON.stringify({ distributions: a.distributions, trueOdds: a.trueOdds, staking: a.staking, marketPredictions: a.marketPredictions, prediction: a.prediction }));
  const analyser = async (cle, marketOdds) => {
    const m = E.matchDuBanc({ rencontre: { fixtureKey: 'essai-a1', home: 'Arsenal', away: 'Chelsea', league: 'EPL', date: '2026-10-01', kickoff: null }, entrees: null, marketOdds });
    if (cle === 'absente') delete m.leagueGoalAverages;
    else m.leagueGoalAverages = cle === 'reelle' ? reel : cle === 'bareme' ? bareme : null;
    return garder(await analyzeMatch(m, config, E.TILT_NEUTRE, sport));
  };
  sortie.cle = {};
  for (const [nom, marketOdds] of [['avecCotes', prix], ['sansCotes', null]]) {
    sortie.cle[nom] = { absente: await analyser('absente', marketOdds), reelle: await analyser('reelle', marketOdds), nulle: await analyser('nulle', marketOdds), bareme: await analyser('bareme', marketOdds) };
  }
}

if (phase === 'ecran') {
  // Les réponses de GET /api/bench que l'écran lit (bancEcran.test.mjs) : avant tout rejeu, juste après le
  // lancement (en cours), après le rejeu par défaut (P2 à P5, avant-match, cotes gratuites, vos bookmakers),
  // une demande refusée. Le vrai serveur, la vraie route, les vrais seuils (1 000 tirages, 200 blocs).
  await preparer();
  const { createApp } = await imp('app.js');
  const app = createApp();
  sortie.vide = (await requete(app, 'GET', '/api/bench')).corps;
  const lance = await requete(app, 'POST', '/api/bench/run', {});
  sortie.lance = { code: lance.code, options: lance.corps?.options ?? null };
  sortie.pendant = (await requete(app, 'GET', '/api/bench')).corps;
  let etat;
  for (let i = 0; i < 1200; i++) {
    etat = (await requete(app, 'GET', '/api/bench')).corps;
    if (!etat.enCours) break;
    await new Promise((fin) => setTimeout(fin, 100));
  }
  sortie.fini = etat;
  // La lecture légère de l'avancement : le dernier rejeu sans son résumé.
  const leger = (await requete(app, 'GET', '/api/bench?resume=non')).corps;
  sortie.leger = { id: leger.dernierRejeu?.id ?? null, aUnResume: Boolean(leger.dernierRejeu && 'resume' in leger.dernierRejeu), bilan: Boolean(leger.dernierRejeu?.bilan), octets: JSON.stringify(leger).length, octetsComplet: JSON.stringify(etat).length };
  sortie.refuse = await requete(app, 'POST', '/api/bench/run', { periodes: ['P9'] });
}

if (phase === 'preparer') {
  await preparer({ fd: false });
}

if (phase === 'fumee') {
  await preparer();
  const r = await rejeu({ periodes: ['P2', 'P4'], prix: ['fd-avant-match', 'fd-cloture', 'gratuites-avant-match'] });
  sortie.bilan = r.bilan;
  sortie.cases = casesDe(r).length;
  sortie.juge = r.resume?.juge ?? null;
}

closeDb();
process.stdout.write(`${JSON.stringify(sortie)}\n`);
