/**
 * UN MAGASIN FABRIQUÉ pour les essais des débuts de saison (étape 35, lot 1a, 09/11/2026) — ce n'est PAS un fichier de test.
 * Pur (sauf `baseEnMemoire`, qui écrit une base SQLite EN MÉMOIRE) ; aucune donnée réelle.
 *
 *   rencontre(o)            une rencontre à la forme de la passe (lectureDesDebuts.js) : la saison du magasin par seasonOf, la
 *                           ligne du camp qui reçoit pour les forces, les buts à la 90e, les minutes des joueurs ;
 *   magasinFabrique()       un magasin à pièges : saisons à cheval (EPL, Championship, Liga MX — Apertura / Clausura) et civiles
 *                           (Suède, Argentine), un tour préliminaire de juillet, un match reporté, des promus et relégués, un
 *                           nouveau venu, un retour après deux ans, des
 *                           joueurs (minutes, postes), un double identifiant, l'identifiant 0, des lignes sans identifiant ;
 *   fdFabrique()            un football-data fabriqué : deux pays (ENG, SCO), montées et descentes, un nouveau venu ;
 *   baseEnMemoire(rs)       une base SQLite en mémoire (day_matches, team_day, player_day, fd_history, fd_teams,
 *                           standings_official, team_squad_reads, player_birthdates) remplie de ces rencontres ;
 *   tronquer(db, J)         la copie coupée à J (l'oracle T-F1) : tout ce qui est de date > J supprimé ; pour J, day_matches
 *                           gardé, scores, xG et minutes à NULL, lignes de joueurs retirées.
 */

import { DatabaseSync } from 'node:sqlite';
import { seasonOf } from '../../src/data/providers/seasonWindows.js';

const JOUR_MS = 86_400_000;
export const plusJours = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/** Une rencontre fabriquée (magasin). `bp`, `bc` : buts (à la 90e) ; `xg` : [dom, ext] ou null ; `joueurs` : [{ joueur, club, minutes, poste }]. */
export function rencontre({ date, league, home, away, coupe = false, compte = true, attribue = false, prolongation = false, bp = 1, bc = 1, xg = [1.3, 1.1], joueurs = [], cle = null }) {
  const saison = seasonOf(league, date);
  const k = cle ?? `f:${league}|${date}|${home}|${away}`;
  return {
    cle: k,
    date,
    league,
    saison,
    home,
    away,
    attribue,
    prolongation,
    compte,
    coupe,
    aScore90: true,
    buts90: { dom: bp, ext: bc },
    faitDom: { matchKey: k, club: home, adversaire: away, camp: 1, date, league, saison, attribue: attribue ? 1 : 0, prolongation: prolongation ? 1 : 0, compte: compte ? 1 : 0, coupe: coupe ? 1 : 0, bp, bc, bp90: bp, bc90: bc, xg_p: xg ? xg[0] : null, xg_c: xg ? xg[1] : null },
    joueurs
  };
}

/** Un championnat aller-retour entre `clubs`, une journée tous les `pas` jours depuis `debut` (n tours). */
export function championnat({ league, clubs, debut, pas = 7, tours = null, buts = (i) => [(i * 7) % 4, (i * 5 + 1) % 3], joueurs = null }) {
  const n = clubs.length;
  const arr = [...clubs];
  const rondes = [];
  for (let r = 0; r < n - 1; r++) {
    const ronde = [];
    for (let i = 0; i < n / 2; i++) ronde.push(r % 2 === 0 ? [arr[i], arr[n - 1 - i]] : [arr[n - 1 - i], arr[i]]);
    rondes.push(ronde);
    arr.splice(1, 0, arr.pop());
  }
  const cycle = [...rondes, ...rondes.map((ro) => ro.map(([a, b]) => [b, a]))];
  const toutes = Array.from({ length: tours ?? cycle.length }, (_, k) => cycle[k % cycle.length]);
  const out = [];
  let i = 0;
  toutes.forEach((ronde, r) => {
    const date = plusJours(debut, r * pas);
    for (const [h, a] of ronde) {
      const [bp, bc] = buts(i++);
      out.push(rencontre({ date, league, home: h, away: a, bp, bc, joueurs: joueurs ? joueurs(h, a, date) : [] }));
    }
  });
  return out;
}

/** Les joueurs d'un club : `effectif` = [joueur…] ; 11 titulaires à 90 minutes et un remplaçant, tournants. */
export const feuilleDe = (effectifs) => (h, a, date) => {
  const lignes = [];
  for (const club of [h, a]) {
    const eff = effectifs.get(club);
    if (!eff) continue;
    const decal = Number(date.slice(8, 10)) % Math.max(1, eff.length - 11);
    for (let k = 0; k < Math.min(12, eff.length); k++) lignes.push({ joueur: eff[(k + decal) % eff.length], club, minutes: k < 11 ? 90 : 20, poste: k === 0 ? 1 : 3 });
  }
  return lignes;
};

const tri = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0);

/**
 * LE MAGASIN À PIÈGES. Clubs : EPL 1-6 (2023-24 et 2024-25), Championship 11-16 ; à la fin de 2023-24, 5 et 6 descendent,
 * 11 et 12 montent ; 13 quitte le magasin (division non suivie) et 21 arrive en Championship 2024-25 (nouveau venu) ; 14
 * revient en 2025-26 après une saison d'absence (nouveau venu, « retour après deux ans ») ; Suède 31-34 (civile 2024, 2025) ;
 * Argentine 41-44 (civile) ; Liga MX 51-54 (Apertura juillet, Clausura janvier : une seule saison) ; un tour préliminaire de
 * Ligue des champions en juillet 2024 pour le club 1 ; un match d'EPL reporté (joué trois semaines plus tard) ; un match
 * attribué.
 */
export function magasinFabrique() {
  const eff = new Map();
  for (const c of [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16, 21]) eff.set(c, Array.from({ length: 15 }, (_, k) => c * 1000 + k + 1));
  // un joueur parti de 1 vers 2 (vu jouer ailleurs), un « pas revu » de 3, un double identifiant (3015 / 3099)
  eff.get(2).push(1001);
  eff.get(3).push(3099);
  const j23 = feuilleDe(eff);
  const out = [];
  // 2023-24
  out.push(...championnat({ league: 'EPL', clubs: [1, 2, 3, 4, 5, 6], debut: '2023-08-12', joueurs: (h, a, d) => j23(h, a, d).filter((l) => !(l.joueur === 1001 && l.club === 2) && l.joueur !== 3099) }));
  out.push(...championnat({ league: 'Championship', clubs: [11, 12, 13, 14, 15, 16], debut: '2023-08-05', joueurs: j23 }));
  // 2024-25 : 11, 12 montent ; 5, 6 descendent ; 13 et 14 quittent ; 21 arrive
  out.push(rencontre({ date: '2024-07-23', league: 'UEFA Champions League', home: 1, away: 99, coupe: true, compte: true, joueurs: j23(1, 99, '2024-07-23') }));
  const epl24 = championnat({ league: 'EPL', clubs: [1, 2, 3, 4, 11, 12], debut: '2024-08-17', joueurs: (h, a, d) => j23(h, a, d).filter((l) => !(l.joueur === 1001 && l.club === 1) && l.joueur !== 3015) });
  // un match reporté : la première rencontre de la 2e journée, jouée un mardi, deux semaines et demie plus tard
  const reporte = epl24.find((r) => r.date === '2024-08-24');
  if (reporte) Object.assign(reporte, rencontre({ ...reporte, date: '2024-09-10', league: 'EPL', home: reporte.home, away: reporte.away, bp: 2, bc: 2, joueurs: j23(reporte.home, reporte.away, '2024-09-10') }));
  out.push(...epl24);
  out.push(...championnat({ league: 'Championship', clubs: [5, 6, 15, 16, 21, 22], debut: '2024-08-10', joueurs: j23 }));
  // un match attribué (n'entre nulle part)
  out.push(rencontre({ date: '2024-12-26', league: 'Championship', home: 15, away: 22, attribue: true, joueurs: [] }));
  // 2025-26 : 14 revient (après une saison sans match au magasin)
  out.push(...championnat({ league: 'Championship', clubs: [5, 6, 14, 15, 21, 22], debut: '2025-08-09', tours: 4, joueurs: j23 }));
  out.push(...championnat({ league: 'EPL', clubs: [1, 2, 3, 4, 11, 12], debut: '2025-08-16', tours: 4, joueurs: j23 }));
  // une saison longue (Serie A, clubs 61-66, une journée toutes les 3 semaines d'août 2024 à mai 2025) : le faux point y tombe
  out.push(...championnat({ league: 'Serie A - Italy', clubs: [61, 62, 63, 64, 65, 66], debut: '2023-08-19', pas: 21, tours: 14 }));
  out.push(...championnat({ league: 'Serie A - Italy', clubs: [61, 62, 63, 64, 65, 66], debut: '2024-08-17', pas: 21, tours: 14 }));
  // Suède (civile) 2024 et 2025 ; Argentine (civile) 2024 et 2025
  out.push(...championnat({ league: 'Allsvenskan - Sweden', clubs: [31, 32, 33, 34], debut: '2024-03-30' }));
  out.push(...championnat({ league: 'Allsvenskan - Sweden', clubs: [31, 32, 33, 34], debut: '2025-03-29' }));
  out.push(...championnat({ league: 'Primera División - Argentina', clubs: [41, 42, 43, 44], debut: '2024-01-26' }));
  out.push(...championnat({ league: 'Primera División - Argentina', clubs: [41, 42, 43, 44], debut: '2025-01-24' }));
  // Liga MX (juillet-juin) : Apertura 2024 (juillet), Clausura 2025 (janvier) — une seule saison ; puis Apertura 2025
  out.push(...championnat({ league: 'Liga MX', clubs: [51, 52, 53, 54], debut: '2024-07-05' }));
  out.push(...championnat({ league: 'Liga MX', clubs: [51, 52, 53, 54], debut: '2025-01-10' }));
  out.push(...championnat({ league: 'Liga MX', clubs: [51, 52, 53, 54], debut: '2025-07-11' }));
  return out.sort(tri);
}

/** Un football-data fabriqué : ENG (E0 1-4, E1 5-8), SCO (SC0 101-104) ; 2018-19 → 2020-21 ; 4 monte en E1 et 5 en E0 ; 9 arrive en E1. */
export function fdFabrique() {
  const out = [];
  const saison = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  const ajouter = (code, clubs, y) => {
    for (const r of championnat({ league: code, clubs, debut: `${y}-08-11`, pas: 7 })) {
      const lib = saison(y);
      out.push({ ...r, cle: `fd:${code}|${r.date}|${r.home}|${r.away}`, saison: y, libelle: lib, joueurs: null, faitDom: { ...r.faitDom, saison: lib, xg_p: null, xg_c: null } });
    }
  };
  ajouter('E0', [1, 2, 3, 4], 2018);
  ajouter('E1', [5, 6, 7, 8], 2018);
  ajouter('SC0', [101, 102, 103, 104], 2018);
  ajouter('E0', [1, 2, 3, 5], 2019);
  ajouter('E1', [4, 6, 7, 9], 2019);
  ajouter('SC0', [101, 102, 103, 104], 2019);
  ajouter('E0', [1, 2, 3, 5], 2020);
  ajouter('E1', [4, 6, 7, 9], 2020);
  return out.sort(tri);
}

/** Une base SQLite EN MÉMOIRE avec les tables que lit l'étape (formes simplifiées, colonnes lues seulement). */
export function baseEnMemoire(rencontres, { fd = [], zones = [], squad = [], naissances = [] } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE day_matches (rencontre INTEGER PRIMARY KEY, match_key TEXT, date TEXT, league TEXT, saison INTEGER, home INTEGER, away INTEGER);
    CREATE TABLE team_day (rencontre INTEGER, camp INTEGER, club INTEGER, adversaire INTEGER, date TEXT, league TEXT, saison INTEGER, attribue INTEGER, prolongation INTEGER, compte INTEGER, coupe INTEGER, bp INTEGER, bc INTEGER, bp90 INTEGER, bc90 INTEGER, xg_p REAL, xg_c REAL, PRIMARY KEY (rencontre, camp));
    CREATE TABLE player_day (joueur INTEGER, date TEXT, rencontre INTEGER, club INTEGER, camp INTEGER, joue INTEGER, minutes INTEGER, poste INTEGER, PRIMARY KEY (joueur, date, rencontre));
    CREATE TABLE fd_teams (id INTEGER PRIMARY KEY, pays TEXT, nom TEXT, team_id TEXT);
    CREATE TABLE fd_history (id INTEGER PRIMARY KEY, code TEXT, saison TEXT, date TEXT, date_fichier TEXT, dom INTEGER, ext INTEGER, match_key TEXT, lien INTEGER DEFAULT 0, bd INTEGER, be INTEGER,
      moy_1 INTEGER, moy_n INTEGER, moy_2 INTEGER, max_1 INTEGER, max_n INTEGER, max_2 INTEGER, pin_1 INTEGER, pin_n INTEGER, pin_2 INTEGER, b365_1 INTEGER, b365_n INTEGER, b365_2 INTEGER, wh_1 INTEGER, wh_n INTEGER, wh_2 INTEGER,
      moy_p25 INTEGER, moy_m25 INTEGER, max_p25 INTEGER, max_m25 INTEGER, pin_p25 INTEGER, pin_m25 INTEGER, b365_p25 INTEGER, b365_m25 INTEGER);
    CREATE TABLE standings_official (league TEXT, season INTEGER, table_name TEXT, rows TEXT);
    CREATE TABLE team_squad_reads (team_id TEXT, rows TEXT);
    CREATE TABLE player_birthdates (player_id TEXT PRIMARY KEY, birth_date TEXT);`);
  const dm = db.prepare('INSERT INTO day_matches VALUES (?, ?, ?, ?, ?, ?, ?)');
  const td = db.prepare('INSERT INTO team_day VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const pd = db.prepare('INSERT OR REPLACE INTO player_day VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  rencontres.forEach((r, i) => {
    const id = i + 1;
    dm.run(id, r.cle, r.date, r.league, r.saison, r.home, r.away);
    const f = r.faitDom;
    const b = (x) => (x ? 1 : 0);
    td.run(id, 1, r.home, r.away, r.date, r.league, r.saison, b(r.attribue), b(r.prolongation), b(r.compte), b(r.coupe), f.bp, f.bc, f.bp90, f.bc90, f.xg_p, f.xg_c);
    td.run(id, 0, r.away, r.home, r.date, r.league, r.saison, b(r.attribue), b(r.prolongation), b(r.compte), b(r.coupe), f.bc, f.bp, f.bc90, f.bp90, f.xg_c, f.xg_p);
    for (const l of r.joueurs ?? []) pd.run(l.joueur, r.date, id, l.club, l.club === r.home ? 1 : 0, 1, l.minutes, l.poste ?? null);
  });
  const ft = db.prepare('INSERT OR IGNORE INTO fd_teams (id, pays, nom) VALUES (?, ?, ?)');
  const fh = db.prepare('INSERT INTO fd_history (code, saison, date, date_fichier, dom, ext, bd, be) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const r of fd) {
    const pays = r.league.startsWith('SC') ? 'SCO' : 'ENG';
    ft.run(r.home, pays, `club ${r.home}`);
    ft.run(r.away, pays, `club ${r.away}`);
    fh.run(r.league, r.libelle, r.date, r.date, r.home, r.away, r.buts90.dom, r.buts90.ext);
  }
  const so = db.prepare('INSERT INTO standings_official VALUES (?, ?, ?, ?)');
  for (const z of zones) so.run(z.league, z.saison, 'tout', JSON.stringify(z.rows));
  const sq = db.prepare('INSERT INTO team_squad_reads VALUES (?, ?)');
  for (const s of squad) sq.run(s.team_id, JSON.stringify(s.rows));
  const pb = db.prepare('INSERT INTO player_birthdates VALUES (?, ?)');
  for (const n of naissances) pb.run(n.player_id, n.birth_date);
  return db;
}

/** LA COPIE COUPÉE À J (T-F1) : date > J supprimée partout ; pour J, day_matches gardé, scores, xG et minutes à NULL, lignes de joueurs retirées. */
export function tronquer(db, J) {
  db.exec(`DELETE FROM player_day WHERE date >= '${J}';
    DELETE FROM team_day WHERE date > '${J}';
    DELETE FROM day_matches WHERE date > '${J}';
    UPDATE team_day SET bp = NULL, bc = NULL, bp90 = NULL, bc90 = NULL, xg_p = NULL, xg_c = NULL WHERE date = '${J}';
    DELETE FROM fd_history WHERE date > '${J}';
    UPDATE fd_history SET bd = NULL, be = NULL WHERE date = '${J}';`);
  return db;
}
