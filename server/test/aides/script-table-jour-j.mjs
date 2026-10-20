/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-table-jour-j.mjs <serveur de la copie> <phase> [graine] [lignes]
 *
 * Étape 17 — la table du jour J. Base = la copie de la base d'essai (2 156
 * rencontres, 15 compétitions dont deux coupes avec prolongations et tirs au
 * but, des clubs pièges), réseau coupé, heure figée au 05/10/2026 12 h UTC.
 * Sortie : une ligne JSON. Ici, les LECTEURS DU MOTEUR eux-mêmes servent
 * d'oracle (exactitude) ; les comptes et les lignes tirées au hasard sont
 * recalculés par le test lui-même, en SQL sur la copie, après ce script.
 *
 * Phases :
 *   construction  la construction (pauses comptées), l'état, une nuit « rien », « tout » (0 changement, registre
 *                 stable) ; l'exactitude (graine 1, [lignes] tirées en plus des 201 cibles) ; les lectures
 *                 (entreesMoteurAvant = entreesMoteur, ligneLigue à la volée) ; le contrôle anti-fuite (0 écart),
 *                 puis deux fuites plantées dans des lignes qu'il reverra (2 écarts nommés), que « tout » répare
 *   exactitude    l'exactitude seule, [graine] [lignes] : pour la relancer avec d'autres graines, ou dans une copie
 *                 de la base du bac (MATCH_STATS_DB)
 *   pieges        les pièges de la nuit un par un (match tardif, même jour, changement de date, annulée, attribuée
 *                 après coup, fusion, feuille relue sans un joueur, rien ne change), puis « tout » (0 changement)
 *   nuit          les pièges, puis dans la même copie une nuit ordinaire en petit (durée, pauses, plus long blocage),
 *                 une panne provoquée au milieu, la reprise, puis « tout » (0 changement)
 *   etape         l'étape « tableJourJ » telle que la passe la lance (due, bilan, alerte) ; GET /api/match-stats/day-table
 *                 sans table puis avec ; due, l'état et la route n'écrivent rien
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase, grainePassee, lignesPassees] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, closeDb, resolveDbPath, upsertMatches, deleteMatches } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const T = await imp('data/db/dayTable.js');
const { TEAM_COLUMNS, PLAYER_COLUMNS } = await imp('data/db/columns.js');
const { seasonOf } = await imp('data/providers/seasonWindows.js');

const sortie = { phase };
const jourApres = T.__testing.jourApres;
const joursAvant = (iso, n) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
};
const joursApres = (iso, n) => joursAvant(iso, -n);
const num = (id) => Number(String(id).replace(/^fotmob-/, ''));

let pauses = 0;
const compter = () => {
  pauses++;
  return new Promise((fin) => setImmediate(fin));
};

/** Le générateur à graine du contrôle (mulberry32) : le même tirage à chaque passage. */
function mulberry(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Les différences entre deux valeurs : objets et tableaux en profondeur, nombres à 1e-9 près, absent = null. */
function differences(a, b, chemin = '', out = []) {
  if (out.length >= 20) return out;
  const x = a ?? null;
  const y = b ?? null;
  if (typeof x === 'number' && typeof y === 'number') {
    if (!(x === y || Math.abs(x - y) <= 1e-9)) out.push({ chemin, table: x, moteur: y });
    return out;
  }
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') {
    if (x !== y) out.push({ chemin, table: x, moteur: y });
    return out;
  }
  if (Array.isArray(x) !== Array.isArray(y)) {
    out.push({ chemin, table: Array.isArray(x) ? 'tableau' : 'objet', moteur: Array.isArray(y) ? 'tableau' : 'objet' });
    return out;
  }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) differences(x[k], y[k], `${chemin}.${k}`, out);
  return out;
}

/** splitAverages de standingsService.js (non exportée), refaite à l'identique sur un classement calculé. */
function splitAverages(st) {
  if (!st?.rows?.length) return null;
  let hg = 0;
  let hp = 0;
  let ag = 0;
  let ap = 0;
  for (const row of st.rows) {
    hg += row.home?.goalsFor ?? 0;
    hp += row.home?.played ?? 0;
    ag += row.away?.goalsFor ?? 0;
    ap += row.away?.played ?? 0;
  }
  if (hp === 0 || ap === 0) return null;
  return { home: Number((hg / hp).toFixed(3)), away: Number((ag / ap).toFixed(3)) };
}

const sha1 = (f) => (fs.existsSync(f) ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') : null);
/** L'empreinte des fichiers de la base (la base et son journal) : rien d'écrit = identique. */
const empreinteFichiers = () => ({ base: sha1(BASE), wal: sha1(`${BASE}-wal`) });
const ecritures = (db) => db.prepare('SELECT total_changes() n').get().n;
const etatBrut = (db) => Object.fromEntries(db.prepare('SELECT cle, valeur FROM day_state').all().map((r) => [r.cle, r.valeur]));

// ====================================================================== exactitude

/**
 * LE « FINI QUAND » : pour les 201 cibles de la base d'essai et `lignes` rencontres tirées (graine), les entrées que
 * la table rend (entreesMoteur) face aux lecteurs du moteur, à l'identique :
 *   (a)  statInputsFromStore par les noms, seulement quand clubDuMagasin rend les bons identifiants (les autres comptés) ;
 *   (b) (c) (e1)  scoreInputsFromStore avec les identifiants ;
 *   (d)  teamGoalsFromStore(nom, { league, season: la plus récente }) et (e2) splitAverages(standingsFromStore) : ces
 *        deux lecteurs lisent « maintenant », sans borne — l'égalité se vérifie au LENDEMAIN du dernier match de chaque
 *        championnat (avantEquipe / ligneLigue à ce jour-là, la même règle que la construction).
 */
async function exactitude(db, { graine = 1, lignes = 150, clubsParLigue = 8 } = {}) {
  const { statInputsFromStore } = await imp('data/db/statInputsRead.js');
  const { scoreInputsFromStore } = await imp('data/db/scoreFormRead.js');
  const { teamGoalsFromStore, seasonsForLeague, standingsFromStore } = await imp('data/db/matchStatsRead.js');
  const { clubDuMagasin } = await imp('data/db/oddsProfileRead.js');
  const manifeste = path.join(process.env.CM_TEST_MODULES ?? '', 'test', 'fixtures', 'echantillon.json');
  const cibles = fs.existsSync(manifeste) ? JSON.parse(fs.readFileSync(manifeste, 'utf8')).cibles.map((c) => c.cle) : [];
  const registre = db.prepare('SELECT match_key FROM day_matches ORDER BY rencontre').all().map((r) => r.match_key);
  const connues = new Set(registre);
  const choisies = cibles.filter((k) => connues.has(k));
  const prises = new Set(choisies);
  const autres = registre.filter((k) => !prises.has(k));
  const tirer = mulberry(graine);
  const tirees = new Set();
  while (tirees.size < Math.min(lignes, autres.length)) tirees.add(autres[Math.floor(tirer() * autres.length)]);
  const r = {
    graine,
    cibles: cibles.length,
    ciblesAbsentes: cibles.length - choisies.length,
    tirees: tirees.size,
    comparees: 0,
    sansEntrees: [],
    a: { comparees: 0, nomsAmbigus: 0, ecarts: [] },
    bce1: { comparees: 0, ecarts: [] },
    d: { comparees: 0, nomsAmbigus: 0, ecarts: [] },
    e2: { comparees: 0, nulles: 0, ecarts: [] }
  };
  const lire = db.prepare('SELECT match_key, date, league, home_name, away_name, home_id, away_id FROM matches WHERE match_key = ?');
  for (const k of [...choisies, ...tirees]) {
    const m = lire.get(k);
    const e = T.entreesMoteur(k, { database: db });
    if (!m || !e) {
      r.sansEntrees.push(k);
      continue;
    }
    r.comparees++;
    if (clubDuMagasin(m.home_name, m.league, db) === m.home_id && clubDuMagasin(m.away_name, m.league, db) === m.away_id) {
      const a = statInputsFromStore({ homeName: m.home_name, awayName: m.away_name, league: m.league, beforeDate: m.date, database: db });
      r.a.comparees++;
      for (const d of differences(e.statInputs, a)) r.a.ecarts.push({ k, ...d });
    } else r.a.nomsAmbigus++;
    const s = scoreInputsFromStore({ league: m.league, home: m.home_name, away: m.away_name, date: m.date, homeId: m.home_id, awayId: m.away_id, database: db });
    r.bce1.comparees++;
    for (const d of differences(e.scoreInputs, s)) r.bce1.ecarts.push({ k, ...d });
  }
  // (d) et (e2) : au lendemain du dernier match de chaque championnat.
  const nomDuClub = db.prepare('SELECT CASE WHEN home_id = ? THEN home_name ELSE away_name END n FROM matches WHERE (home_id = ? OR away_id = ?) AND league = ? ORDER BY date DESC LIMIT 1');
  for (const { league, d } of db.prepare('SELECT league, MAX(date) d FROM day_matches GROUP BY league ORDER BY league').all()) {
    const J = jourApres(d);
    const saison = seasonsForLeague(league, { database: db })[0]?.season ?? null;
    const ligne = T.ligneLigue(league, J, { database: db });
    const attendu = splitAverages(standingsFromStore(league, { database: db }));
    r.e2.comparees++;
    if (attendu === null) r.e2.nulles++;
    for (const x of differences(ligne.classement, attendu)) r.e2.ecarts.push({ league, ...x });
    const faitsL = T.faitsLigue(league, { avant: J, database: db });
    const clubs = db.prepare('SELECT DISTINCT club FROM team_day WHERE league = ? ORDER BY club LIMIT ?').all(league, clubsParLigue).map((x) => x.club);
    for (const club of clubs) {
      const id = `fotmob-${club}`;
      const nom = nomDuClub.get(id, id, id, league)?.n;
      const moteur = nom ? teamGoalsFromStore(nom, { league, season: saison, database: db }) : null;
      if (!moteur || moteur.teamId !== id) {
        r.d.nomsAmbigus++;
        continue;
      }
      const avant = T.avantEquipe(T.faitsEquipe(id, { avant: J, database: db }), faitsL, { date: J, league, saison: seasonOf(league, J) });
      const { dates, ...sansDates } = moteur;
      r.d.comparees++;
      for (const x of differences(T.__testing.butsMoteur({ ...avant, club }), sansDates)) r.d.ecarts.push({ league, club: id, ...x });
    }
  }
  return r;
}

// ====================================================================== plantations

/** Une rencontre du magasin sous la forme d'une entrée d'upsertMatches (statistiques, feuille, déroulé), avec des changements. */
function entreeDe(db, matchKey, changements = {}) {
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
  return {
    date: m.date,
    league: m.league,
    homeName: m.home_name,
    awayName: m.away_name,
    homeId: m.home_id,
    awayId: m.away_id,
    fotmobId: m.fotmob_id,
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
    events: parse(m.events),
    lineups: parse(m.lineups),
    meta: parse(m.meta),
    shotmap: parse(m.shotmap),
    sources: ['essai'],
    teamStats,
    players,
    ...changements
  };
}

const jouentCeJour = (db, jour, ids) => ids.some((id) => db.prepare('SELECT 1 FROM matches WHERE date = ? AND (home_id = ? OR away_id = ?) LIMIT 1').get(jour, id, id));
/** Un jour libre pour ces clubs (aucun match, toutes compétitions), en partant de `jour` et en avançant de `pas`. */
function jourLibre(db, jour, ids, pas = 1) {
  let j = jour;
  while (jouentCeJour(db, j, ids)) j = joursApres(j, pas);
  return j;
}
const rencontreDe = (db, matchKey) => db.prepare('SELECT rencontre FROM day_matches WHERE match_key = ?').get(matchKey)?.rencontre ?? null;
const ligneSuivante = (db, club, date) =>
  db.prepare('SELECT t.*, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.club = ? AND t.date > ? ORDER BY t.date, d.match_key LIMIT 1').get(club, date) ?? null;
const joueursDe = (db, matchKey) =>
  [...new Set(db.prepare("SELECT player_id FROM players WHERE match_key = ? AND player_id LIKE 'fotmob-%'").all(matchKey).map((x) => num(x.player_id)))].filter(Number.isSafeInteger);

/** Les trois tables (et le registre), ligne par ligne : clé → { j: texte, r: ligne }. */
function instantane(db) {
  const carte = (sql, cle) => new Map(db.prepare(sql).all().map((r) => [cle(r), { j: JSON.stringify(r), r }]));
  return {
    registre: carte('SELECT * FROM day_matches', (r) => r.match_key),
    equipe: carte('SELECT * FROM team_day', (r) => `${r.rencontre}|${r.camp}`),
    ligue: carte('SELECT * FROM league_day', (r) => `${r.league}|${r.date}`),
    joueur: carte('SELECT * FROM player_day', (r) => `${r.joueur}|${r.date}|${r.rencontre}`)
  };
}

/** Les colonnes qui diffèrent entre deux versions d'une ligne. */
const colonnesChangees = (a, b) => (a && b ? Object.keys(b).filter((c) => (a[c] ?? null) !== (b[c] ?? null)) : []);

/**
 * Ce qui a bougé entre deux instantanés, table par table, et ce qui a bougé HORS de ce qui est permis
 * (`permis[table](quoi, ligne, ancienne)` : quoi = 'ajoutee' | 'retiree' | 'modifiee' ; `ancienne` : la ligne d'avant).
 */
function bouge(avant, apres, permis) {
  const out = {};
  for (const table of ['equipe', 'ligue', 'joueur']) {
    const a = avant[table];
    const b = apres[table];
    const lignes = [];
    for (const [k, v] of b) {
      if (!a.has(k)) lignes.push(['ajoutee', k, v.r, null]);
      else if (a.get(k).j !== v.j) lignes.push(['modifiee', k, v.r, a.get(k).r]);
    }
    for (const [k, v] of a) if (!b.has(k)) lignes.push(['retiree', k, v.r, v.r]);
    const compte = (q) => lignes.filter((l) => l[0] === q).length;
    out[table] = {
      ajoutees: compte('ajoutee'),
      retirees: compte('retiree'),
      modifiees: compte('modifiee'),
      cles: lignes.map(([q, k]) => `${q} ${k}`),
      horsPermis: lignes
        .filter(([q, , r, ancienne]) => !(permis[table] ?? (() => false))(q, r, ancienne))
        .map(([q, k, r, ancienne]) => `${q} ${k}${q === 'modifiee' ? ` [${colonnesChangees(ancienne, r).join(', ')}]` : ''}`)
        .slice(0, 10)
    };
  }
  return out;
}

/**
 * Des cas que la base d'essai n'a pas, plantés AVANT la construction (les lecteurs du moteur et la table les voient
 * pareil) : des tirs cadrés à 0-0 (un vrai zéro pour la forme et les moyennes du championnat) et un xG d'un seul côté
 * (ni l'un ni l'autre pour la table), dans les deux derniers matchs du club qui reçoit une cible ; un titulaire sans
 * minutes (il a joué).
 */
function planterLesCasRares(db) {
  const manifeste = path.join(process.env.CM_TEST_MODULES ?? '', 'test', 'fixtures', 'echantillon.json');
  const cibles = JSON.parse(fs.readFileSync(manifeste, 'utf8')).cibles.map((c) => c.cle);
  const out = {};
  for (const k of cibles) {
    const c = db.prepare('SELECT match_key, date, home_id FROM matches WHERE match_key = ?').get(k);
    if (!c) continue;
    const deux = db
      .prepare(
        `SELECT m.match_key, th.expected_goals xh, ta.expected_goals xa, th.shots_on_goal sh, ta.shots_on_goal sa FROM matches m
         LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home' LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
         WHERE (m.home_id = ? OR m.away_id = ?) AND m.date < ? ORDER BY m.date DESC, m.match_key DESC LIMIT 2`
      )
      .all(c.home_id, c.home_id, c.date);
    if (deux.length < 2 || deux.some((x) => x.xh === null || x.xa === null || x.sh === null || x.sa === null)) continue;
    db.prepare('UPDATE team_stats SET shots_on_goal = 0 WHERE match_key = ?').run(deux[0].match_key);
    db.prepare("UPDATE team_stats SET expected_goals = NULL WHERE match_key = ? AND side = 'away'").run(deux[1].match_key);
    Object.assign(out, { cible: k, cadres00: deux[0].match_key, xgUnCote: deux[1].match_key });
    break;
  }
  const t = db
    .prepare(
      `SELECT p.player_id, p.match_key FROM players p JOIN matches m ON m.match_key = p.match_key
       WHERE m.league = 'EPL' AND p.player_id LIKE 'fotmob-%' AND p.starter = 1 AND p.minutes > 0
         AND EXISTS (SELECT 1 FROM players q JOIN matches n ON n.match_key = q.match_key WHERE q.player_id = p.player_id AND n.date > m.date)
       ORDER BY m.date, p.player_id LIMIT 1`
    )
    .get();
  db.prepare('UPDATE players SET minutes = NULL WHERE player_id = ? AND match_key = ?').run(t.player_id, t.match_key);
  out.titulaire = { joueur: num(t.player_id), matchKey: t.match_key };
  return out;
}

const resumeNuit = (b) => ({ mode: b.mode, erreur: b.erreur, rencontres: { ...b.rencontres, refusees: b.rencontres.refusees.length }, fusions: b.fusions, lignes: b.lignes, joueursRecalcules: b.joueursRecalcules, dureeMs: b.dureeMs, blocMaxMs: b.blocMaxMs });

// ====================================================================== phases

if (phase === 'construction') {
  const db = openDb();
  sortie.tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('day_matches', 'team_day', 'league_day', 'player_day', 'day_state') ORDER BY name").all().map((r) => r.name);
  sortie.etatAvant = T.etatTableJourJ({ database: db });
  sortie.plantes = planterLesCasRares(db);
  sortie.construction = await T.construireTableJourJ({ database: db, rendreLaMain: compter, controle: { lignes: 0 } });
  sortie.pauses = pauses;
  sortie.etat = T.etatTableJourJ({ database: db });
  const registreAvant = db.prepare('SELECT match_key, rencontre FROM day_matches ORDER BY rencontre').all();
  // Une nuit sans rien de neuf : rien à faire, rien d'écrit.
  const e0 = ecritures(db);
  sortie.rien = resumeNuit(await T.construireTableJourJ({ database: db }));
  sortie.rienEcritures = ecritures(db) - e0;
  // « tout » : chaque fait refait et comparé ; 0 changement, et le registre (numéros) inchangé.
  sortie.tout = await T.construireTableJourJ({ database: db, tout: true, controle: { lignes: 0 } });
  sortie.registreStable = JSON.stringify(registreAvant) === JSON.stringify(db.prepare('SELECT match_key, rencontre FROM day_matches ORDER BY rencontre').all());
  sortie.exactitude = await exactitude(db, { graine: Number(grainePassee ?? 1), lignes: Number(lignesPassees ?? 150) });
  // Les lectures (§6.2) : pour une rencontre stockée, entreesMoteurAvant = entreesMoteur.
  const derniere = db.prepare("SELECT d.match_key, d.date, d.league, d.home, d.away FROM day_matches d WHERE d.league = 'EPL' ORDER BY d.date DESC, d.match_key DESC LIMIT 1").get();
  const stockee = T.entreesMoteur(derniere.match_key, { database: db });
  const recalculee = T.entreesMoteurAvant({ homeId: `fotmob-${derniere.home}`, awayId: `fotmob-${derniere.away}`, league: derniere.league, date: derniere.date }, { database: db });
  sortie.lectures = { matchKey: derniere.match_key, ecarts: differences(stockee, recalculee), formeDomicile: stockee.scoreInputs.home.last.length };
  // ligneLigue à la volée pour un jour SANS match du championnat (le lendemain du dernier) : stockee = false, et c'est
  // la ligne qu'écrirait la construction si une rencontre avait lieu ce jour-là (plantée, puis la nuit).
  const L = derniere.league;
  const lendemain = jourLibre(db, jourApres(derniere.date), [], 1);
  const aLaVolee = T.ligneLigue(L, lendemain, { database: db });
  const modele = db.prepare("SELECT match_key FROM matches WHERE league = ? AND fotmob_id IS NOT NULL ORDER BY date DESC, match_key DESC LIMIT 1 OFFSET 2").get(L).match_key;
  upsertMatches([entreeDe(db, modele, { date: lendemain, fotmobId: '990000100', updatedAt: '2026-10-05T09:00:00.000Z' })], { database: db });
  const nuitDuLendemain = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
  const stockeeLeLendemain = T.ligneLigue(L, lendemain, { database: db });
  sortie.ligneALaVolee = {
    jour: lendemain,
    stockeeAvant: aLaVolee.stockee,
    stockeeApres: stockeeLeLendemain.stockee,
    nuit: resumeNuit(nuitDuLendemain),
    ecarts: differences({ ...aLaVolee, stockee: null }, { ...stockeeLeLendemain, stockee: null })
  };
  // Le contrôle anti-fuite : 0 écart, puis deux fuites plantées dans des lignes que le même tirage reverra.
  const { moyennesEquipe } = await imp('data/db/statInputsRead.js');
  const c1 = T.controleAntiFuite({ database: db, lignes: 20, graine: 7 });
  sortie.controle = { lignes: c1.lignes, ecarts: c1.ecarts, verifiees: c1.verifiees };
  let fuiteEquipe = null;
  for (const v of c1.verifiees.equipe) {
    const r = db.prepare('SELECT * FROM team_day WHERE rencontre = ? AND camp = ?').get(v.rencontre, v.camp);
    if (r.f10_corners_n < 6) continue;
    // La fenêtre (a) « jusqu'au jour J compris » : le match lui-même dedans.
    const avecLeJour = moyennesEquipe(`fotmob-${r.club}`, jourApres(r.date), db).corners;
    if (!avecLeJour) continue;
    const somme = Math.round(avecLeJour.for * avecLeJour.sample);
    if (somme === r.f10_corners_p) continue;
    db.prepare('UPDATE team_day SET f10_corners_p = ? WHERE rencontre = ? AND camp = ?').run(somme, v.rencontre, v.camp);
    fuiteEquipe = { rencontre: v.rencontre, camp: v.camp, matchKey: v.matchKey, avant: r.f10_corners_p, apres: somme };
    break;
  }
  let fuiteJoueur = null;
  for (const v of c1.verifiees.joueur) {
    const r = db.prepare('SELECT * FROM player_day WHERE joueur = ? AND date = ? AND rencontre = ?').get(v.joueur, v.date, v.rencontre);
    if (!r.joue || !r.minutes) continue;
    // a10_min avec le match lui-même : ses 10 dernières apparitions jouées d'un jour ≤ J.
    const a = T.avantJoueur(T.faitsJoueur(`fotmob-${r.joueur}`, { avant: jourApres(r.date), database: db }), { date: jourApres(r.date) });
    if (a.a10_min === r.a10_min) continue;
    db.prepare('UPDATE player_day SET a10_min = ? WHERE joueur = ? AND date = ? AND rencontre = ?').run(a.a10_min, v.joueur, v.date, v.rencontre);
    fuiteJoueur = { joueur: v.joueur, date: v.date, rencontre: v.rencontre, avant: r.a10_min, apres: a.a10_min };
    break;
  }
  const c2 = T.controleAntiFuite({ database: db, lignes: 20, graine: 7 });
  sortie.fuites = { equipe: fuiteEquipe, joueur: fuiteJoueur, ecarts: c2.ecarts, memesLignes: JSON.stringify(c2.verifiees) === JSON.stringify(c1.verifiees) };
  // « tout » répare les deux lignes, et elles seules.
  const reparation = await T.construireTableJourJ({ database: db, tout: true, controle: { lignes: 0 } });
  sortie.reparation = { mode: reparation.mode, changements: reparation.changements, erreur: reparation.erreur };
  sortie.apresReparation = T.controleAntiFuite({ database: db, lignes: 20, graine: 7 }).ecarts.length;
  // Les colonnes que le contrôle ne relisait pas avant le 13/10 : des valeurs fausses plantées dans des lignes que le même
  // tirage revoit — faits de joueur (xG, buts contre son camp, camp, poste), possession et saison d'une équipe, et le
  // contenu d'une rencontre de la forme (les buts que le moteur lira dans `last`).
  const revues = T.controleAntiFuite({ database: db, lignes: 20, graine: 7 }).verifiees;
  const [j1, j2] = revues.joueur;
  const e1 = revues.equipe[0];
  const avecForme = revues.equipe.find((v) => db.prepare('SELECT f5_1 FROM team_day WHERE rencontre = ? AND camp = ?').get(v.rencontre, v.camp).f5_1 !== null && v !== e1);
  const ref = db.prepare('SELECT club, f5_1 FROM team_day WHERE rencontre = ? AND camp = ?').get(avecForme.rencontre, avecForme.camp);
  db.prepare('UPDATE player_day SET xg = COALESCE(xg, 0) + 7, csc = COALESCE(csc, 0) + 3 WHERE joueur = ? AND date = ? AND rencontre = ?').run(j1.joueur, j1.date, j1.rencontre);
  db.prepare('UPDATE player_day SET camp = 1 - camp, poste = CASE WHEN poste = 4 THEN 1 ELSE 4 END WHERE joueur = ? AND date = ? AND rencontre = ?').run(j2.joueur, j2.date, j2.rencontre);
  db.prepare('UPDATE team_day SET possession_p = 99.5, saison = saison + 1 WHERE rencontre = ? AND camp = ?').run(e1.rencontre, e1.camp);
  db.prepare('UPDATE team_day SET bp = bp + 4 WHERE rencontre = ? AND club = ?').run(ref.f5_1, ref.club);
  const aveugles = T.controleAntiFuite({ database: db, lignes: 20, graine: 7 });
  const nommes = (filtre) => [...new Set(aveugles.ecarts.filter(filtre).map((e) => e.colonne))].sort();
  sortie.colonnesPlantees = {
    joueur1: nommes((e) => e.table === 'player_day' && e.joueur === j1.joueur && e.rencontre === j1.rencontre),
    joueur2: nommes((e) => e.table === 'player_day' && e.joueur === j2.joueur && e.rencontre === j2.rencontre),
    equipe: nommes((e) => e.table === 'team_day' && e.rencontre === e1.rencontre && e.camp === e1.camp),
    forme: nommes((e) => e.table === 'team_day' && e.rencontre === avecForme.rencontre && e.camp === avecForme.camp && String(e.colonne).startsWith('f5_'))
  };
  const reparationColonnes = await T.construireTableJourJ({ database: db, tout: true, controle: { lignes: 0 } });
  sortie.colonnesReparees = { changements: reparationColonnes.changements, apres: T.controleAntiFuite({ database: db, lignes: 20, graine: 7 }).ecarts.length };
  closeDb();
} else if (phase === 'exactitude') {
  const db = openDb();
  if (T.etatTableJourJ({ database: db }).aJour !== true) sortie.construction = resumeNuit(await T.construireTableJourJ({ database: db, controle: { lignes: 0 } }));
  sortie.exactitude = await exactitude(db, { graine: Number(grainePassee ?? 1), lignes: Number(lignesPassees ?? 150) });
  closeDb();
} else if (phase === 'pieges' || phase === 'nuit') {
  const db = openDb();
  await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
  const p = {};
  let maj = 0;
  const majLe = () => `2026-10-05T10:${String(++maj).padStart(2, '0')}:00.000Z`;

  // 1. MATCH TARDIF : une rencontre jouée 40 jours avant le dernier match du club, arrivée après la construction.
  {
    const modele = db
      .prepare("SELECT m.* FROM matches m WHERE m.league = 'EPL' AND EXISTS (SELECT 1 FROM players p WHERE p.match_key = m.match_key AND p.player_id LIKE 'fotmob-%') ORDER BY m.date DESC, m.match_key DESC LIMIT 1")
      .get();
    const C = num(modele.home_id);
    const D = num(modele.away_id);
    const dernier = db.prepare('SELECT MAX(date) d FROM matches WHERE home_id = ? OR away_id = ?').get(modele.home_id, modele.home_id).d;
    const jour = jourLibre(db, joursAvant(dernier, 40), [modele.home_id, modele.away_id], -1);
    const joueurs = new Set(joueursDe(db, modele.match_key));
    const suivante = ligneSuivante(db, C, jour);
    const avant = instantane(db);
    upsertMatches([entreeDe(db, modele.match_key, { date: jour, fotmobId: '990000001', updatedAt: majLe() })], { database: db });
    const cle = db.prepare("SELECT match_key FROM matches WHERE fotmob_id = '990000001'").get().match_key;
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    const apres = instantane(db);
    const rencontre = rencontreDe(db, cle);
    p.tardif = {
      jour,
      clubs: [C, D],
      nuit: resumeNuit(nuit),
      rencontre,
      lignesNouvelles: db.prepare('SELECT COUNT(*) n FROM team_day WHERE rencontre = ?').get(rencontre).n,
      lignesJoueurNouvelles: db.prepare('SELECT COUNT(*) n FROM player_day WHERE rencontre = ?').get(rencontre).n,
      joueursSurLaFeuille: joueurs.size,
      suivante: suivante && { cle: `${suivante.rencontre}|${suivante.camp}`, changee: avant.equipe.get(`${suivante.rencontre}|${suivante.camp}`)?.j !== apres.equipe.get(`${suivante.rencontre}|${suivante.camp}`)?.j },
      bouge: bouge(avant, apres, {
        // Les autres clubs du championnat ne bougent que par (d) : la rencontre plantée peut ouvrir une saison plus
        // récente de L « avant J » (g_saison), comme pour teamGoalsFromStore ; seulement leurs colonnes g_*.
        equipe: (q, r, ancienne) =>
          q === 'ajoutee'
            ? r.rencontre === rencontre
            : q === 'modifiee' && r.date > jour && (r.club === C || r.club === D || (r.league === modele.league && colonnesChangees(ancienne, r).every((c) => c.startsWith('g_')))),
        ligue: (q, r) => r.league === modele.league && (r.date > jour || (q === 'ajoutee' && r.date === jour)),
        joueur: (q, r) => joueurs.has(r.joueur) && (q === 'ajoutee' ? r.rencontre === rencontre : q === 'modifiee' && r.date > jour)
      })
    };
  }

  // 2. MÊME JOUR : un club à deux matchs le même jour — aucun ne voit l'autre, le match suivant voit les deux.
  {
    const club = db.prepare("SELECT home_id id FROM matches WHERE league = 'Championship' GROUP BY home_id ORDER BY COUNT(*) DESC, home_id LIMIT 1").get().id;
    const sesMatchs = db.prepare('SELECT * FROM matches WHERE (home_id = ? OR away_id = ?) ORDER BY date DESC, match_key DESC').all(club, club);
    const X = sesMatchs[1];
    const autreDe = (m) => (m.home_id === club ? m.away_id : m.home_id);
    const C2 = num(club);
    const avant = instantane(db);
    // La rencontre plantée doit avoir une clé AVANT celle de X (à date égale, le moteur range par clé décroissante :
    // X d'abord) et un numéro APRÈS (elle arrive la dernière) : un tri par numéro ou sans départage se verrait.
    let Y = null;
    let cleY2 = null;
    for (const m of sesMatchs.slice(2)) {
      if (autreDe(m) === autreDe(X) || jouentCeJour(db, X.date, [autreDe(m)])) continue;
      upsertMatches([entreeDe(db, m.match_key, { date: X.date, fotmobId: '990000002', updatedAt: majLe() })], { database: db });
      const cle = db.prepare("SELECT match_key FROM matches WHERE fotmob_id = '990000002'").get().match_key;
      if (cle < X.match_key) {
        Y = m;
        cleY2 = cle;
        break;
      }
      deleteMatches([cle], { database: db });
    }
    const E = num(autreDe(Y));
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    const apres = instantane(db);
    const rX = rencontreDe(db, X.match_key);
    const rY = rencontreDe(db, cleY2);
    const f5 = (rencontre) => {
      const l = db.prepare('SELECT f5_1, f5_2, f5_3, f5_4, f5_5 FROM team_day WHERE rencontre = ? AND club = ?').get(rencontre, C2);
      return [l.f5_1, l.f5_2, l.f5_3, l.f5_4, l.f5_5];
    };
    const suivante = ligneSuivante(db, C2, X.date);
    const joueursY = new Set(joueursDe(db, cleY2));
    // L'oracle : les entrées du moteur pour le match suivant, lues par scoreInputsFromStore, contre la table.
    const { scoreInputsFromStore } = await imp('data/db/scoreFormRead.js');
    const ms = db.prepare('SELECT * FROM matches WHERE match_key = ?').get(suivante.match_key);
    const moteur = scoreInputsFromStore({ league: ms.league, home: ms.home_name, away: ms.away_name, date: ms.date, homeId: ms.home_id, awayId: ms.away_id, database: db });
    p.memeJour = {
      jour: X.date,
      club: C2,
      rX,
      rY,
      clesDepartagees: cleY2 < X.match_key,
      f5X: f5(rX),
      f5Y: f5(rY),
      f5Suivante: suivante ? [suivante.f5_1, suivante.f5_2] : null,
      ecartsMoteur: differences(T.entreesMoteur(suivante.match_key, { database: db }).scoreInputs, moteur),
      nuit: resumeNuit(nuit),
      bouge: bouge(avant, apres, {
        equipe: (q, r) => (q === 'ajoutee' ? r.rencontre === rY : q === 'modifiee' && (r.club === C2 || r.club === E) && r.date > X.date),
        ligue: (q, r) => r.league === Y.league && (r.date > X.date || (q === 'ajoutee' && r.date === X.date)),
        joueur: (q, r) => joueursY.has(r.joueur) && (q === 'ajoutee' ? r.rencontre === rY : q === 'modifiee' && r.date > X.date)
      })
    };
  }

  // 3. CHANGEMENT DE DATE : la même rencontre (même identifiant FotMob) réimportée trois jours plus tard.
  {
    const Z = db
      .prepare("SELECT m.* FROM matches m WHERE m.league = 'División Profesional - Paraguay' AND m.fotmob_id IS NOT NULL AND EXISTS (SELECT 1 FROM players p WHERE p.match_key = m.match_key AND p.player_id LIKE 'fotmob-%') ORDER BY m.date DESC, m.match_key DESC LIMIT 1 OFFSET 3")
      .get();
    const nouvelleDate = jourLibre(db, joursApres(Z.date, 3), [Z.home_id, Z.away_id], 1);
    const ancienne = rencontreDe(db, Z.match_key);
    const clubs = [num(Z.home_id), num(Z.away_id)];
    const joueurs = new Set(joueursDe(db, Z.match_key));
    const avant = instantane(db);
    const rapport = upsertMatches([entreeDe(db, Z.match_key, { date: nouvelleDate, updatedAt: majLe() })], { database: db });
    const nouvelleCle = db.prepare('SELECT match_key FROM matches WHERE fotmob_id = ?').get(Z.fotmob_id).match_key;
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    const apres = instantane(db);
    const nouvelle = rencontreDe(db, nouvelleCle);
    const reste = (table, col) => db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${col} = ?`).get(ancienne).n;
    p.changementDeDate = {
      ancienneDate: Z.date,
      nouvelleDate,
      rekeyed: rapport.rekeyed,
      ancienneCle: Z.match_key,
      nouvelleCle,
      ancienne,
      nouvelle,
      ancienneRestante: { registre: reste('day_matches', 'rencontre'), equipe: reste('team_day', 'rencontre'), joueur: reste('player_day', 'rencontre') },
      lignesNouvelles: db.prepare('SELECT COUNT(*) n FROM team_day WHERE rencontre = ?').get(nouvelle).n,
      nuit: resumeNuit(nuit),
      bouge: bouge(avant, apres, {
        equipe: (q, r) => (q === 'ajoutee' ? r.rencontre === nouvelle : q === 'retiree' ? r.rencontre === ancienne : clubs.includes(r.club) && r.date > Z.date),
        ligue: (q, r) => r.league === Z.league && (q === 'retiree' ? r.date === Z.date : q === 'ajoutee' ? r.date === nouvelleDate : r.date > Z.date),
        joueur: (q, r) => joueurs.has(r.joueur) && (q === 'ajoutee' ? r.rencontre === nouvelle : q === 'retiree' ? r.rencontre === ancienne : r.date > Z.date)
      })
    };
  }

  // 4. ANNULÉE : une rencontre retirée du magasin (deleteMatches) disparaît partout ; l'avant des clubs est refait.
  {
    const W = db.prepare("SELECT * FROM matches WHERE league = 'MLS' ORDER BY date DESC, match_key DESC LIMIT 1 OFFSET 5").get();
    const r = rencontreDe(db, W.match_key);
    const clubs = [num(W.home_id), num(W.away_id)];
    const joueurs = new Set(joueursDe(db, W.match_key));
    const avant = instantane(db);
    deleteMatches([W.match_key], { database: db });
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    const apres = instantane(db);
    p.annulee = {
      date: W.date,
      rencontre: r,
      restante: db.prepare('SELECT (SELECT COUNT(*) FROM day_matches WHERE rencontre = ?) + (SELECT COUNT(*) FROM team_day WHERE rencontre = ?) + (SELECT COUNT(*) FROM player_day WHERE rencontre = ?) n').get(r, r, r).n,
      nuit: resumeNuit(nuit),
      bouge: bouge(avant, apres, {
        equipe: (q, x) => (q === 'retiree' ? x.rencontre === r : q === 'modifiee' && clubs.includes(x.club) && x.date > W.date),
        ligue: (q, x) => x.league === W.league && (q === 'retiree' ? x.date === W.date : q === 'modifiee' && x.date > W.date),
        joueur: (q, x) => joueurs.has(x.joueur) && (q === 'retiree' ? x.rencontre === r : q === 'modifiee' && x.date > W.date)
      })
    };
  }

  // 5. ATTRIBUÉE APRÈS COUP : meta.awarded posé par upsertMatches — exclue de (b) (c) (e1), gardée en (a) (d) (e2).
  {
    const candidats = db
      .prepare(
        `SELECT m.*, th.corner_kicks hc, ta.corner_kicks ac FROM matches m
         JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home' JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
         WHERE m.league = 'Primeira Liga - Portugal' AND th.corner_kicks IS NOT NULL AND ta.corner_kicks IS NOT NULL AND (th.corner_kicks + ta.corner_kicks) > 0
           AND COALESCE(json_extract(m.meta, '$.awarded'), 0) <> 1
         ORDER BY m.date DESC, m.match_key DESC`
      )
      .all();
    let choix = null;
    for (const A of candidats) {
      const H = num(A.home_id);
      const rA = rencontreDe(db, A.match_key);
      const suivante = ligneSuivante(db, H, A.date);
      if (!suivante || suivante.league !== A.league || suivante.saison !== seasonOf(A.league, A.date)) continue;
      if (![suivante.f5_1].includes(rA)) continue;
      if (suivante.s_n_dom + suivante.s_n_ext < 7 || !suivante.s_en_saison) continue;
      choix = { A, H, rA, suivante };
      break;
    }
    const { A, H, rA, suivante } = choix;
    const jourLigue = db.prepare('SELECT MIN(date) d FROM day_matches WHERE league = ? AND date > ?').get(A.league, A.date).d;
    const ligueAvant = db.prepare('SELECT * FROM league_day WHERE league = ? AND date = ?').get(A.league, jourLigue);
    const clubs = [H, num(A.away_id)];
    const joueurs = new Set(joueursDe(db, A.match_key));
    const avant = instantane(db);
    upsertMatches([entreeDe(db, A.match_key, { meta: { ...(JSON.parse(A.meta ?? '{}') ?? {}), awarded: 1 }, updatedAt: majLe() })], { database: db });
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    const apres = instantane(db);
    const apresSuivante = db.prepare('SELECT * FROM team_day WHERE rencontre = ? AND camp = ?').get(suivante.rencontre, suivante.camp);
    const ligueApres = db.prepare('SELECT * FROM league_day WHERE league = ? AND date = ?').get(A.league, jourLigue);
    const champs = (l) => ({
      f5: [l.f5_1, l.f5_2, l.f5_3, l.f5_4, l.f5_5],
      f10_corners_n: l.f10_corners_n,
      f10_tirs_n: l.f10_tirs_n,
      s_n: l.s_n_dom + l.s_n_ext,
      g_n: l.g_n_dom + l.g_n_ext
    });
    p.attribuee = {
      matchKey: A.match_key,
      rencontre: rA,
      attribue: db.prepare('SELECT attribue FROM team_day WHERE rencontre = ? ORDER BY camp').all(rA).map((x) => x.attribue),
      suivanteAvant: champs(suivante),
      suivanteApres: champs(apresSuivante),
      ligueAvant: { source: ligueAvant.l_source, l_n: ligueAvant.l_n, c_n: ligueAvant.c_n },
      ligueApres: { source: ligueApres.l_source, l_n: ligueApres.l_n, c_n: ligueApres.c_n },
      nuit: resumeNuit(nuit),
      bouge: bouge(avant, apres, {
        equipe: (q, r) => q === 'modifiee' && (r.rencontre === rA || (clubs.includes(r.club) && r.date > A.date)),
        ligue: (q, r) => q === 'modifiee' && r.league === A.league && r.date > A.date,
        joueur: (q, r) => q === 'modifiee' && joueurs.has(r.joueur) && r.date > A.date
      })
    };
  }

  // 6. FUSION D'IDENTITÉ : people_merges + UPDATE players, comme scripts/merge-player-identities.mjs.
  {
    const apparitions = (league) =>
      db
        .prepare(
          `SELECT p.player_id id, COUNT(*) n FROM players p JOIN matches m ON m.match_key = p.match_key
           WHERE m.league = ? AND p.player_id LIKE 'fotmob-%' AND (p.minutes > 0 OR p.starter = 1) GROUP BY p.player_id HAVING n >= 2 ORDER BY n DESC, p.player_id LIMIT 1`
        )
        .get(league).id;
    const de = apparitions('Virsliga - Latvia');
    const vers = apparitions('EPL');
    const P = num(de);
    const Q = num(vers);
    const lignesAvant = { de: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(P).n, vers: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(Q).n };
    // Deux coéquipiers d'une même feuille (EFL Cup) : leurs lignes de la table se heurteraient sous la même clé si la
    // fusion se faisait par « UPDATE player_day SET joueur » ; le script de fusion retire d'abord la ligne en double.
    const paire = db
      .prepare(
        `SELECT a.player_id de, b.player_id vers, a.match_key k, a.side, a.player_key cle FROM players a JOIN players b ON b.match_key = a.match_key AND b.side = a.side AND b.player_id > a.player_id
         JOIN matches m ON m.match_key = a.match_key
         WHERE m.league = 'EFL Cup' AND a.player_id LIKE 'fotmob-%' AND b.player_id LIKE 'fotmob-%' AND a.player_id NOT IN (?, ?) AND b.player_id NOT IN (?, ?)
           AND (SELECT COUNT(*) FROM players x WHERE x.player_id = a.player_id) >= 2
         ORDER BY a.match_key, a.player_id LIMIT 1`
      )
      .get(de, vers, de, vers);
    const P2 = num(paire.de);
    const Q2 = num(paire.vers);
    const lignesAvant2 = { de: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(P2).n, vers: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(Q2).n };
    const avant = instantane(db);
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT OR REPLACE INTO people_merges (from_id, to_id, evidence, created_at) VALUES (?, ?, ?, ?)').run(de, vers, 'essai', '2026-10-05T10:30:00.000Z');
    const reecrites = db.prepare('UPDATE players SET player_id = ? WHERE player_id = ?').run(vers, de).changes;
    const enDouble = db.prepare('DELETE FROM players WHERE match_key = ? AND side = ? AND player_key = ?').run(paire.k, paire.side, paire.cle).changes;
    db.prepare('INSERT OR REPLACE INTO people_merges (from_id, to_id, evidence, created_at) VALUES (?, ?, ?, ?)').run(paire.de, paire.vers, 'meme-feuille', '2026-10-05T10:31:00.000Z');
    const reecrites2 = db.prepare('UPDATE players SET player_id = ? WHERE player_id = ?').run(paire.vers, paire.de).changes;
    db.exec('COMMIT');
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    const apres = instantane(db);
    const derniere = db.prepare('SELECT * FROM player_day WHERE joueur = ? ORDER BY date DESC, rencontre DESC LIMIT 1').get(Q);
    // Attendu, en SQL sur le magasin : ses apparitions jouées (les deux carrières), d'un jour strictement antérieur, non attribuées.
    const attendu = db
      .prepare(
        `SELECT COUNT(*) n FROM players p JOIN matches m ON m.match_key = p.match_key WHERE p.player_id = ? AND m.date < ? AND (p.minutes > 0 OR p.starter = 1)
           AND COALESCE(json_extract(m.meta, '$.awarded'), 0) <> 1 AND COALESCE(json_extract(m.meta, '$.reason'), '') NOT IN ('awarded_win', 'id_reused')`
      )
      .get(vers, derniere.date).n;
    p.fusion = {
      de: P,
      vers: Q,
      reecrites,
      lignesAvant,
      lignesApres: { de: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(P).n, vers: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(Q).n },
      a10DerniereLigne: derniere.a10_n,
      a10Attendu: Math.min(10, attendu),
      memeFeuille: {
        de: P2,
        vers: Q2,
        enDouble,
        reecrites: reecrites2,
        lignesAvant: lignesAvant2,
        lignesApres: { de: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(P2).n, vers: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ?').get(Q2).n }
      },
      nuit: resumeNuit(nuit),
      bouge: bouge(avant, apres, { equipe: () => false, ligue: () => false, joueur: (q, r) => [P, Q, P2, Q2].includes(r.joueur) })
    };
  }

  // 7. FEUILLE RELUE SANS UN JOUEUR (replacePlayers) : sa ligne disparaît, ses lignes suivantes sont refaites.
  {
    const S = db
      .prepare(
        `SELECT m.* FROM matches m WHERE m.league = 'EPL' AND m.fotmob_id IS NOT NULL AND m.fotmob_id <> '990000001'
           AND EXISTS (SELECT 1 FROM players p WHERE p.match_key = m.match_key AND p.player_id LIKE 'fotmob-%')
         ORDER BY m.date ASC, m.match_key ASC LIMIT 1`
      )
      .get();
    const R = db
      .prepare(
        `SELECT p.player_id id FROM players p WHERE p.match_key = ? AND p.player_id LIKE 'fotmob-%' AND (p.minutes > 0 OR p.starter = 1)
           AND (SELECT COUNT(*) FROM players q JOIN matches n ON n.match_key = q.match_key WHERE q.player_id = p.player_id AND n.date > ?) > 0
         ORDER BY p.player_id LIMIT 1`
      )
      .get(S.match_key, S.date).id;
    const rS = rencontreDe(db, S.match_key);
    const entree = entreeDe(db, S.match_key, { updatedAt: majLe(), replacePlayers: true });
    for (const side of ['home', 'away']) entree.players[side] = entree.players[side].filter((j) => j.playerId !== R);
    const avant = instantane(db);
    upsertMatches([entree], { database: db });
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    const apres = instantane(db);
    p.feuilleRelue = {
      matchKey: S.match_key,
      joueur: num(R),
      ligneRestante: db.prepare('SELECT COUNT(*) n FROM player_day WHERE joueur = ? AND rencontre = ?').get(num(R), rS).n,
      nuit: resumeNuit(nuit),
      bouge: bouge(avant, apres, { equipe: () => false, ligue: () => false, joueur: (q, r) => r.joueur === num(R) && (q === 'retiree' ? r.rencontre === rS : q === 'modifiee' && r.date > S.date) })
    };
  }

  // 7 bis. BASE RESTAURÉE : la date de mise à jour d'une rencontre RECULE (une sauvegarde rendue) et un chiffre change —
  // le registre compare par égalité, jamais par « plus récent ».
  {
    const B = db
      .prepare("SELECT m.match_key FROM matches m JOIN team_stats t ON t.match_key = m.match_key AND t.side = 'home' WHERE m.league = 'Serie A - Italy' AND t.corner_kicks IS NOT NULL ORDER BY m.date DESC, m.match_key DESC LIMIT 1 OFFSET 2")
      .get().match_key;
    const rB = rencontreDe(db, B);
    const coinsAvant = db.prepare('SELECT corners_p FROM team_day WHERE rencontre = ? AND camp = 1').get(rB).corners_p;
    db.prepare("UPDATE team_stats SET corner_kicks = corner_kicks + 2 WHERE match_key = ? AND side = 'home'").run(B);
    db.prepare("UPDATE matches SET updated_at = '2020-01-01T00:00:00.000Z' WHERE match_key = ?").run(B);
    const nuit = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
    p.restauree = { matchKey: B, nuit: resumeNuit(nuit), coinsAvant, coinsApres: db.prepare('SELECT corners_p FROM team_day WHERE rencontre = ? AND camp = 1').get(rB).corners_p };
  }

  // 8. RIEN NE CHANGE : une seconde nuit ne fait rien et n'écrit rien (pas même l'état).
  {
    const e0 = ecritures(db);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const f0 = empreinteFichiers();
    const nuit = await T.construireTableJourJ({ database: db });
    p.rien = { nuit: resumeNuit(nuit), ecritures: ecritures(db) - e0, fichiersIdentiques: JSON.stringify(empreinteFichiers()) === JSON.stringify(f0) };
  }

  // Et le recalcul direct : « tout » refait chaque fait et chaque colonne « avant » depuis les tables sources — après
  // ces sept nuits, rien ne doit différer d'une construction neuve.
  const tout = await T.construireTableJourJ({ database: db, tout: true, controle: { lignes: 40, graine: 3 } });
  p.tout = { mode: tout.mode, changements: tout.changements, erreur: tout.erreur, controle: { lignes: tout.controle?.lignes, ecarts: tout.controle?.ecarts } };
  sortie.pieges = p;
  if (phase === 'nuit') await nuitOrdinaireEtPanne(db);
  closeDb();
} else if (phase === 'etape') {
  const t0 = performance.now();
  const { withRefreshLock } = await imp('data/providers/refreshLock.js');
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  const { createApp } = await imp('app.js');
  sortie.importsMs = Math.round(performance.now() - t0);
  const J = job.__testing;
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  const aujourdhui = '2026-10-05T01:30:00.000Z';
  const hier = '2026-10-04T10:00:00.000Z';
  const ctx = (derniere, manuel = false) => ({ manuel, derniere: (cle) => (cle === 'tableJourJ' ? derniere : null) });
  const app = createApp();
  const get = (url) => requeteExpress(app, 'GET', url);
  const db = openDb();
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

  // Sans table : due (même « faite aujourd'hui »), l'état et la route lisent sans rien écrire.
  let e0 = ecritures(db);
  let f0 = empreinteFichiers();
  sortie.dueSansTable = { jamais: J.dueTableJourJ(ctx(null), { database: db }), aujourdhui: J.dueTableJourJ(ctx(aujourdhui), { database: db }) };
  sortie.etatSansTable = T.etatTableJourJ({ database: db });
  sortie.routeSansTable = await get('/api/match-stats/day-table');
  sortie.rienEcritSansTable = { ecritures: ecritures(db) - e0, fichiersIdentiques: JSON.stringify(empreinteFichiers()) === JSON.stringify(f0) };

  // La passe de l'actualisation, sous le verrou : la première construction.
  pauses = 0;
  sortie.premiere = await withRefreshLock(() => J.passeTableJourJ(ctx(null), { database: db, rendreLaMain: compter }), { stamp: false });
  sortie.premierePauses = pauses;
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  e0 = ecritures(db);
  f0 = empreinteFichiers();
  sortie.due = {
    jamais: J.dueTableJourJ(ctx(null), { database: db }),
    hier: J.dueTableJourJ(ctx(hier), { database: db }),
    aujourdhui: J.dueTableJourJ(ctx(aujourdhui), { database: db }),
    clic: J.dueTableJourJ(ctx(aujourdhui, true), { database: db })
  };
  sortie.etat = T.etatTableJourJ({ database: db });
  sortie.route = await get('/api/match-stats/day-table');
  sortie.rienEcritAvecTable = { ecritures: ecritures(db) - e0, fichiersIdentiques: JSON.stringify(empreinteFichiers()) === JSON.stringify(f0) };
  // Une table d'une autre version, ou une passe commencée et pas finie : due, même faite aujourd'hui.
  db.prepare("UPDATE day_state SET valeur = '0' WHERE cle = 'version'").run();
  sortie.dueAutreVersion = J.dueTableJourJ(ctx(aujourdhui), { database: db });
  db.prepare("UPDATE day_state SET valeur = ? WHERE cle = 'version'").run(String(T.VERSION_TABLE_JOUR));
  db.prepare("INSERT INTO day_state (cle, valeur) VALUES ('en_cours', '2026-10-05T01:00:00.000Z')").run();
  sortie.dueEnCours = J.dueTableJourJ(ctx(aujourdhui), { database: db });
  sortie.etatEnCours = T.etatTableJourJ({ database: db });
  db.prepare("DELETE FROM day_state WHERE cle = 'en_cours'").run();
  // Au clic, rien de neuf : « rien à faire ».
  const petitControle = { lignes: 5, graine: 1 };
  sortie.rien = await J.passeTableJourJ(ctx(aujourdhui, true), { database: db, controle: petitControle });
  // Une rencontre modifiée : la nuit.
  const k = db.prepare("SELECT match_key FROM matches WHERE league = 'EPL' ORDER BY date DESC, match_key DESC LIMIT 1").get().match_key;
  db.prepare("UPDATE matches SET updated_at = '2026-10-05T11:30:00.000Z' WHERE match_key = ?").run(k);
  sortie.nuit = await J.passeTableJourJ(ctx(aujourdhui, true), { database: db, controle: petitControle });
  // Une rencontre dont un club a un identifiant mal formé (« fotmob-0 ») : refusée ; l’étape est « à regarder » et le dit.
  db.prepare("UPDATE matches SET home_id = 'fotmob-0', updated_at = '2026-10-05T11:40:00.000Z' WHERE match_key = (SELECT match_key FROM matches WHERE league = 'MLS' ORDER BY date DESC, match_key DESC LIMIT 1)").run();
  sortie.refus = await J.passeTableJourJ(ctx(aujourdhui, true), { database: db, controle: petitControle });
  // La passe suivante n'a rien à faire, mais la rencontre est toujours refusée : le résumé le dit.
  sortie.rienAvecRefus = await J.passeTableJourJ(ctx(aujourdhui, true), { database: db, controle: petitControle });
  sortie.routeApres = await get('/api/match-stats/day-table');
  // Un contrôle à part qui ne répond pas à temps : l'étape est « à regarder », l'alerte n'est pas touchée.
  db.prepare("UPDATE matches SET updated_at = '2026-10-05T11:50:00.000Z' WHERE match_key = ?").run(k);
  sortie.pasFait = await J.passeTableJourJ(ctx(aujourdhui, true), { database: db, controle: { lignes: 5, delaiMs: 1 } });
  sortie.routePasFait = await get('/api/match-stats/day-table');
  sortie.dernierJourMagasin = db.prepare('SELECT MAX(date) d FROM matches').get().d;
  sortie.totalMs = Math.round(performance.now() - t0);
  closeDb();
} else {
  throw new Error(`phase inconnue : ${phase}`);
}

/**
 * Phase « nuit » (après les pièges, dans la même copie) : une nuit ordinaire en petit — trois rencontres modifiées, une
 * retirée, une arrivée en retard — avec les pauses comptées ; puis une PANNE provoquée au milieu (la base passe en
 * lecture seule après la deuxième pause) ; la reprise ; les comptes face aux tables sources ; « tout » (0 changement).
 */
async function nuitOrdinaireEtPanne(db) {
  // Une nuit ordinaire en petit : trois rencontres modifiées (un corner de plus), une retirée, une arrivée en retard.
  const recentes = db.prepare("SELECT match_key FROM matches WHERE league = 'EPL' ORDER BY date DESC, match_key DESC LIMIT 6").all().map((r) => r.match_key);
  db.exec('BEGIN IMMEDIATE');
  for (const [i, k] of recentes.slice(0, 3).entries()) {
    db.prepare("UPDATE team_stats SET corner_kicks = COALESCE(corner_kicks, 0) + 1 WHERE match_key = ? AND side = 'home'").run(k);
    db.prepare('UPDATE matches SET updated_at = ? WHERE match_key = ?').run(`2026-10-05T11:0${i}:00.000Z`, k);
  }
  db.exec('COMMIT');
  deleteMatches([recentes[3]], { database: db });
  const m = db.prepare('SELECT * FROM matches WHERE match_key = ?').get(recentes[4]);
  upsertMatches([entreeDe(db, recentes[4], { date: jourLibre(db, joursAvant(m.date, 20), [m.home_id, m.away_id], -1), fotmobId: '990000010', updatedAt: '2026-10-05T11:05:00.000Z' })], { database: db });
  pauses = 0;
  const nuit = await T.construireTableJourJ({ database: db, rendreLaMain: compter });
  sortie.nuit = { ...resumeNuit(nuit), pauses, blocMaxOu: nuit.blocMaxOu, controle: { lignes: nuit.controle?.lignes, ecarts: nuit.controle?.ecarts?.length, graine: nuit.controle?.graine ?? null }, aPart: nuit.controleAPart ?? null };
  // Un contrôle à part qui ne répond pas à temps : arrêté au délai, noté « pas fait » avec sa raison, jamais refait ici.
  db.prepare("UPDATE matches SET updated_at = '2026-10-05T11:08:00.000Z' WHERE match_key = ?").run(recentes[0]);
  const sansReponse = await T.construireTableJourJ({ database: db, controle: { lignes: 20, delaiMs: 1 } });
  sortie.delai = { erreur: sansReponse.erreur, controle: sansReponse.controle, aPart: sansReponse.controleAPart ?? null, blocMaxMs: sansReponse.blocMaxMs, etat: T.etatTableJourJ({ database: db }).controle };

  // Une PANNE au milieu, après la deuxième pause : des déclencheurs temporaires font échouer toute écriture dans les tables
  // du jour J — DANS une transaction déjà ouverte (une base en lecture seule la refuserait dès le BEGIN, et un ROLLBACK
  // oublié ne se verrait pas). Une rencontre modifiée à relire.
  const TABLES_JOUR = ['day_matches', 'team_day', 'league_day', 'player_day'];
  const poserLaPanne = () => {
    for (const t of TABLES_JOUR) {
      for (const quand of ['INSERT', 'UPDATE', 'DELETE']) db.exec(`CREATE TEMP TRIGGER panne_${t}_${quand.toLowerCase()} BEFORE ${quand} ON main.${t} BEGIN SELECT RAISE(ABORT, 'panne provoquée'); END;`);
    }
  };
  const leverLaPanne = () => {
    for (const t of TABLES_JOUR) for (const quand of ['insert', 'update', 'delete']) db.exec(`DROP TRIGGER IF EXISTS temp.panne_${t}_${quand}`);
  };
  db.prepare("UPDATE matches SET updated_at = '2026-10-05T11:10:00.000Z' WHERE match_key = ?").run(recentes[5]);
  const etatAvant = etatBrut(db);
  let n = 0;
  let leve = null;
  let panne = null;
  try {
    panne = await T.construireTableJourJ({
      database: db,
      controle: { lignes: 0 },
      rendreLaMain: () => {
        n++;
        if (n === 2) poserLaPanne();
        return new Promise((fin) => setImmediate(fin));
      }
    });
  } catch (error) {
    leve = error.message;
  }
  leverLaPanne();
  const etatApres = etatBrut(db);
  sortie.panne = {
    leve,
    erreur: panne?.erreur ?? null,
    mode: panne?.mode ?? null,
    pausesAvantLaPanne: n,
    repereAvance: etatApres.repere_updated_at !== etatAvant.repere_updated_at,
    miseAJourAvancee: etatApres.mise_a_jour_le !== etatAvant.mise_a_jour_le,
    enCours: etatApres.en_cours ?? null,
    aJour: T.etatTableJourJ({ database: db }).aJour
  };
  // La nuit suivante reprend tout (en comparant), et la table retombe sur les tables sources.
  const reprise = await T.construireTableJourJ({ database: db, controle: { lignes: 0 } });
  sortie.reprise = { mode: reprise.mode, erreur: reprise.erreur, aJour: T.etatTableJourJ({ database: db }).aJour, enCours: etatBrut(db).en_cours ?? null };
  const un = (sql) => db.prepare(sql).get().n;
  sortie.comptes = {
    registre: un('SELECT COUNT(*) n FROM day_matches'),
    magasin: un("SELECT COUNT(*) n FROM matches WHERE home_id GLOB 'fotmob-[1-9]*' AND away_id GLOB 'fotmob-[1-9]*'"),
    equipe: un('SELECT COUNT(*) n FROM team_day'),
    joueur: un('SELECT COUNT(*) n FROM player_day'),
    feuilles: un(
      "SELECT COUNT(*) n FROM (SELECT DISTINCT p.player_id, p.match_key FROM players p JOIN day_matches d ON d.match_key = p.match_key WHERE p.player_id GLOB 'fotmob-[1-9]*' AND p.player_id NOT GLOB 'fotmob-*[^0-9]*' AND p.side IN ('home', 'away'))"
    )
  };
  const tout = await T.construireTableJourJ({ database: db, tout: true, controle: { lignes: 0 } });
  sortie.tout = { mode: tout.mode, changements: tout.changements, erreur: tout.erreur };
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

process.stdout.write(`${JSON.stringify(sortie)}\n`);
