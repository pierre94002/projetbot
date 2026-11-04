/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-combinaison.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LA COMBINAISON (étape 38, lot 1a, 03-04/11/2026), sur une base NEUVE de la copie, réseau coupé, heure figée — AUCUN
 * résultat réel :
 *   fabriquer  remplace fd_history par des matchs FABRIQUÉS (2000-07-28 → 2023-06-30, un jour sur `pas`, `parJour` matchs ;
 *              prix d'avant-match Pinnacle, William Hill, Bet365, moyenne, plus/moins 2,5 ; clôtures ; scores tirés au
 *              hasard) et ajoute des pronostics 1N2 gelés de P5-a (nuit et coup d'envoi) avec leurs relevés et clôtures ;
 *   comptes    la passe sans résultat dans le processus courant (compterLaCombinaison) ;
 *   ddl        T-X8 : openDb crée les deux tables de la combinaison, aucun index, une seconde ouverture ne change rien.
 * Sortie : une ligne JSON.
 */

import { importeur } from './versionsMoteurCommun.mjs';
import { generateur, plusJours } from './combinaisonMondes.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const s = { ok: true, phase };

/** Fabrique fd_history et P5-a dans la base de la copie. */
function fabriquer(database, { pas = 9, parJour = 6, graine = 38, p5 = 40 } = {}) {
  const u = generateur(graine);
  const cent = (x) => Math.round(100 * x);
  const cols = ['id', 'code', 'saison', 'date', 'date_fichier', 'dom', 'ext', 'match_key', 'lien', 'bd', 'be', 'moy_1', 'moy_n', 'moy_2', 'max_1', 'max_n', 'max_2', 'pin_1', 'pin_n', 'pin_2', 'wh_1', 'wh_n', 'wh_2', 'b365_1', 'b365_n', 'b365_2', 'moy_c1', 'moy_cn', 'moy_c2', 'pin_c1', 'pin_cn', 'pin_c2', 'moy_p25', 'moy_m25', 'moy_cp25', 'moy_cm25', 'pin_cp25', 'pin_cm25'];
  database.exec('DELETE FROM fd_history');
  // Les clubs fabriqués (fd_history.dom / ext → fd_teams.id).
  const club = database.prepare('INSERT OR IGNORE INTO fd_teams (id, pays, nom) VALUES (?, ?, ?)');
  for (let c = 1; c <= 80; c++) club.run(c, 'Pays fabriqué', `Club fabriqué ${c}`);
  const ins = database.prepare(`INSERT INTO fd_history (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  let id = 1;
  let n = 0;
  database.exec('BEGIN');
  for (let jour = '2000-07-28'; jour <= '2023-06-30'; jour = plusJours(jour, pas)) {
    for (let k = 0; k < parJour; k++) {
      const code = ['E0', 'SP1', 'D1'][k % 3];
      const dom = 1 + ((k * 7 + n) % 40);
      const ext = 41 + ((k * 3 + n) % 40);
      const p = [0.45 + 0.1 * (u() - 0.5), 0.27, 0];
      p[2] = 1 - p[0] - p[1];
      const cote = (m) => p.map((x) => cent(1 / (x * m)));
      const avecPin = jour >= '2012-07-27' && u() > 0.02;
      const [m1, mn, m2] = cote(1.05);
      const [p1, pn, p2] = avecPin ? cote(1.025) : [null, null, null];
      const [w1, wn, w2] = cote(1.06 + 0.04 * (u() - 0.5));
      const bd = Math.floor(-Math.log(u() + 1e-9) * 1.4);
      const be = Math.floor(-Math.log(u() + 1e-9) * 1.1);
      const o25 = 0.5 + 0.1 * (u() - 0.5);
      ins.run(id++, code, `${jour.slice(0, 4)}`, jour, jour, dom, ext, null, 0, bd, be, m1, mn, m2, m1 + 5, mn + 5, m2 + 5, p1, pn, p2, w1, wn, w2, m1, mn, m2, m1, mn, m2, p1, pn, p2, cent(1 / (o25 * 1.05)), cent(1 / ((1 - o25) * 1.05)), cent(1 / (o25 * 1.04)), cent(1 / ((1 - o25) * 1.04)), avecPin ? cent(1 / (o25 * 1.02)) : null, avecPin ? cent(1 / ((1 - o25) * 1.02)) : null);
      n++;
    }
  }
  database.exec('COMMIT');
  // P5-a : des pronostics 1N2 gelés (nuit, révision 1 ; coup d'envoi), sans cote ou avec des cotes gratuites.
  const pick = database.prepare(`INSERT OR REPLACE INTO engine_picks (fixture_key, market_key, version, recorded_at, origin, match_id, league, date, kickoff, home_name, away_name, home_id, away_id, market_id, market, params, choice, label, probability, predicted_odds, market_odds, min_odds, odds_source, odds_at, lineup_state, lineup_at, engine_hash, engine_version, distribution)
    VALUES (?, 'result', ?, ?, ?, NULL, 'Ligue fabriquée', ?, ?, 'A', 'B', ?, ?, 'result', '1N2', '{}', 'home', 'A gagne', 0.5, 2, NULL, NULL, ?, ?, ?, NULL, 'h', 3, ?)`);
  for (let i = 0; i < p5; i++) {
    const date = plusJours('2026-10-06', i % 12);
    const kickoff = `${date}T19:00:00.000Z`;
    const fk = `fotmob:fotmob-${900 + i}|fotmob-${800 + i}|${date}`;
    const dist = JSON.stringify({ issues: { home: 0.48, draw: 0.27, away: 0.25 } });
    pick.run(fk, 1, `${plusJours(date, -1)}T01:00:00.000Z`, 'nuit', date, kickoff, `fotmob-${900 + i}`, `fotmob-${800 + i}`, i % 2 ? 'cotes gratuites : espn' : 'aucune cote (modèle de buts)', i % 2 ? `${plusJours(date, -1)}T00:30:00.000Z` : null, 'inconnue (non relue)', dist);
    pick.run(fk, 2, `${date}T18:10:00.000Z`, 'analyse-coup-d-envoi', date, kickoff, `fotmob-${900 + i}`, `fotmob-${800 + i}`, 'cotes gratuites : espn', `${date}T18:00:00.000Z`, 'publiée (FotMob)', dist);
  }
  return { fd: n, p5 };
}

if (phase === 'fabriquer') {
  const database = M.openDb();
  const r = fabriquer(database, o);
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  Object.assign(s, r);
} else if (phase === 'comptes') {
  const E = await imp('data/combinaison/combinaisonEnfant.js');
  const database = M.openDb();
  fabriquer(database, o);
  const r = E.compterLaCombinaison({ database });
  s.comptes = r.comptes;
} else if (phase === 'ddl') {
  const database = M.openDb();
  s.premiere = database.prepare("SELECT type, name, sql FROM sqlite_master WHERE name LIKE 'combinaison%' ORDER BY type, name").all().map((r) => ({ ...r }));
  s.indexDeLaCombinaison = M.indexAttendus().filter((n) => /combinaison/.test(n));
  const toutAvant = database.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  M.closeDb();
  const db2 = M.openDb();
  const toutApres = db2.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  s.secondeOuvertureIdentique = JSON.stringify(toutAvant) === JSON.stringify(toutApres);
  s.entrees = M.__testing.DDL.filter((sql) => /combinaison_/.test(String(sql))).map((sql) => String(sql).slice(0, 70));
  s.rencontres = db2.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
} else throw new Error(`phase inconnue « ${phase} »`);

process.stdout.write(`${JSON.stringify(s)}\n`);
process.exit(0);
