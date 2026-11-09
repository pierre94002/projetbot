/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-debuts.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LES DÉBUTS DE SAISON (étape 35, lot 1a, 09/11/2026), sur un MAGASIN FABRIQUÉ (debutsFabrique.mjs : clubs, matchs et minutes
 * fabriqués — aucun résultat réel), réseau coupé, heure figée, base NEUVE de la copie. Phases :
 *   « ddl »        T-X8 : les 3 tables et l'index créés à l'ouverture, une seconde ouverture ne change rien ;
 *   « fabriquer »  le magasin fabriqué et un football-data fabriqué rangés dans la base de la copie (le script
 *                  debuts-de-saison.mjs est lancé ensuite dans la même copie : T-B10).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import { importeur } from './versionsMoteurCommun.mjs';
import { magasinFabrique, fdFabrique } from './debutsFabrique.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const s = { ok: true, phase, pid: process.pid };
const FICHIER = process.env.MATCH_STATS_DB;

function magasinNeuf(fichier = FICHIER) {
  for (const x of ['', '-wal', '-shm']) fs.rmSync(fichier + x, { force: true });
  return M.openDb({ file: fichier });
}

if (phase === 'ddl') {
  const db = magasinNeuf();
  const tables = (d) => d.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name LIKE '%debuts%' ORDER BY name").all().map((r) => r.name);
  s.tables = tables(db);
  s.schema = db.prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE '%debuts%' ORDER BY name").all().map((r) => `${r.name}:${r.sql}`);
  const db2 = M.openDb({ file: FICHIER });
  s.schema2 = db2.prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE '%debuts%' ORDER BY name").all().map((r) => `${r.name}:${r.sql}`);
  s.indexAttendus = M.indexAttendus().filter((n) => n.includes('debuts'));
  db2.close();
}

if (phase === 'fabriquer') {
  const db = magasinNeuf();
  const rs = magasinFabrique();
  const dm = db.prepare('INSERT INTO day_matches (rencontre, match_key, date, league, saison, home, away) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const td = db.prepare(`INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc, bp90, bc90, xg_p, xg_c, possession_p)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 50)`);
  const pd = db.prepare('INSERT OR REPLACE INTO player_day (joueur, date, rencontre, club, camp, joue, titulaire, poste, minutes, note, tirs, pc) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 700, 1, 1)');
  const b = (x) => (x ? 1 : 0);
  db.exec('BEGIN');
  rs.forEach((r, i) => {
    const id = i + 1;
    const f = r.faitDom;
    dm.run(id, r.cle, r.date, r.league, r.saison, r.home, r.away);
    td.run(id, 1, r.home, r.away, r.date, r.league, r.saison, b(r.attribue), b(r.prolongation), b(r.compte), b(r.coupe), f.bp, f.bc, f.bp90, f.bc90, f.xg_p, f.xg_c);
    td.run(id, 0, r.away, r.home, r.date, r.league, r.saison, b(r.attribue), b(r.prolongation), b(r.compte), b(r.coupe), f.bc, f.bp, f.bc90, f.bp90, f.xg_c, f.xg_p);
    for (const l of r.joueurs ?? []) pd.run(l.joueur, r.date, id, l.club, l.club === r.home ? 1 : 0, l.minutes >= 90 ? 1 : 0, l.poste ?? 3, l.minutes);
  });
  const ft = db.prepare('INSERT OR IGNORE INTO fd_teams (id, pays, nom) VALUES (?, ?, ?)');
  const fh = db.prepare('INSERT INTO fd_history (code, saison, date, date_fichier, dom, ext, bd, be) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const r of fdFabrique()) {
    const pays = r.league.startsWith('SC') ? 'SCO' : 'ENG';
    ft.run(r.home, pays, `club ${r.home}`);
    ft.run(r.away, pays, `club ${r.away}`);
    fh.run(r.league, r.libelle, r.date, r.date, r.home, r.away, r.buts90.dom, r.buts90.ext);
  }
  db.exec('COMMIT');
  s.rencontres = rs.length;
  s.fd = db.prepare('SELECT COUNT(*) n FROM fd_history').get().n;
  db.close();
}

process.stdout.write(`${JSON.stringify(s)}\n`);
