/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-cartons.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LES CARTONS (étape 33, lot 1a, 02/11/2026), sur un MAGASIN FABRIQUÉ (cartonsFabrique.mjs : clubs et matchs fabriqués —
 * aucun résultat réel), réseau coupé, heure figée, base NEUVE de la copie :
 *   oracle    T-F1 (l'oracle de la copie tronquée : l'état de la passe au jour J et l'instantané d'avant-match de chaque
 *             match de J, calculés sur la base entière et sur une copie coupée à J, égaux à l'octet), T-F3 (les moyennes
 *             d'arbitre que FotMob affiche, plantées absurdes, ne changent rien), T-F4 (les jaunes de ligne plantés à 0 sur
 *             les matchs « accord » : rien ne change, le déroulé gagne) ; et les statuts du magasin fabriqué ;
 *   fabriquer T-B10 (partie B) : un magasin fabriqué pour le script du banc ;
 *   ddl       T-X8 : openDb sur une copie de forme réelle (la base d'essai) crée les quatre tables des cartons ; une seconde
 *             ouverture ne change rien ; chaque entrée du DDL commence par son ordre.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasinDesCartons, plusJours } from './cartonsFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const s = { ok: true, phase };
const dossier = process.env.CM_TEST_DOSSIER;

/** Une copie du fichier de la base (après un point de reprise), ouverte par openDb. */
function copieDeLaBase(database, nom) {
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const fichier = path.join(dossier, `${nom}.db`);
  fs.copyFileSync(process.env.MATCH_STATS_DB, fichier);
  return { fichier, database: M.openDb({ file: fichier }) };
}

if (phase === 'oracle') {
  const C = await imp('data/cartons/cartonsAuJourJ.js');
  const L = await imp('data/cartons/lectureDesCartons.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const database = M.openDb();
  const fab = fabriquerLeMagasinDesCartons(database, { jours: o.jours ?? 150, aZeroDe: '2023-04-01', aZeroA: '2023-04-20' });
  s.matchs = fab.matchs.length;
  /** L'état de la passe au jour J (tout ce qui est d'avant J) et l'instantané d'avant-match de chaque match de J. */
  const auJourJ = (db, J) => {
    const maj = executerSansPause(L.mettreAJourLeCache(db));
    const acc = new C.CartonsAuJourJ();
    executerSansPause(C.passerLesRencontres(acc, L.rencontresChronologiques({ database: db, cache: maj.cache, jusqua: plusJours(J, -1) })));
    const etat = acc.etatAuJourJ(J);
    // Les instantanés de J par le chemin même du banc et de la nuit : la journée ajoutée puis publiée (finDeJournee).
    const duJour = [...L.rencontresChronologiques({ database: db, cache: maj.cache, depuis: J, jusqua: J })];
    for (const r of duJour) acc.ajouter(r);
    const inst = acc.finDeJournee();
    const fiches = duJour.map((r) => {
      // Le statut du match de J est SON résultat (ses cartons) : ce n'est pas un fait d'avant-match.
      const { statut, releve, ...avantMatch } = inst.get(r.matchKey);
      return { matchKey: r.matchKey, avantMatch };
    });
    return { etat, fiches, statuts: Object.fromEntries([...maj.cache.values()].reduce((m, l) => m.set(l.statut, (m.get(l.statut) ?? 0) + 1), new Map())) };
  };
  const dates = [...new Set(fab.matchs.map((m) => m.date))].sort();
  const jours = [12, 25, 40, 55, 70, 85].map((i) => dates[Math.min(i, dates.length - 1)]);
  s.jours = jours;
  const complet = Object.fromEntries(jours.map((J) => [J, auJourJ(database, J)]));
  s.statuts = complet[jours[0]].statuts;
  s.oracle = [];
  for (const J of jours) {
    const { fichier, database: t } = copieDeLaBase(database, `tronquee-${J}`);
    t.exec('BEGIN');
    t.prepare('DELETE FROM team_day WHERE date > ?').run(J);
    t.prepare('DELETE FROM day_matches WHERE date > ?').run(J);
    t.prepare('DELETE FROM team_stats WHERE match_key IN (SELECT match_key FROM matches WHERE date >= ?)').run(J);
    t.prepare('DELETE FROM matches WHERE date > ?').run(J);
    t.prepare(
      `UPDATE matches SET meta = json_object('kickoff', json_extract(meta, '$.kickoff'),
         'referee', json_object('name', json_extract(meta, '$.referee.name'), 'country', json_extract(meta, '$.referee.country'))),
         events = NULL, home_goals = NULL, away_goals = NULL, updated_at = '2030-01-01T00:00:00.000Z' WHERE date = ?`
    ).run(J);
    t.prepare(
      `UPDATE team_day SET bp = 0, bc = 0, bp90 = NULL, bc90 = NULL, tirs_p = NULL, tirs_c = NULL, cadres_p = NULL, cadres_c = NULL, corners_p = NULL, corners_c = NULL,
         jaunes_p = NULL, jaunes_c = NULL, rouges_p = NULL, rouges_c = NULL, attribue = 0, prolongation = 0 WHERE date = ?`
    ).run(J);
    t.exec('COMMIT');
    const r = auJourJ(t, J);
    M.closeDb(fichier);
    const a = complet[J];
    s.oracle.push({
      J,
      fiches: a.fiches.length,
      fichesEgales: JSON.stringify(a.fiches) === JSON.stringify(r.fiches),
      etatEgal: JSON.stringify(a.etat) === JSON.stringify(r.etat),
      equipes: Object.keys(a.etat.equipes).length,
      arbitres: Object.keys(a.etat.arbitres).filter((c) => !c.startsWith('faux:')).length,
      faux: Object.keys(a.etat.arbitres).filter((c) => c.startsWith('faux:')).length,
      ligues: Object.keys(a.etat.ligues).length,
      avecMoyenne: Object.values(a.etat.ligues).filter((x) => x.m && x.m.dom !== null).length,
      gardeActive: Object.values(a.etat.ligues).some((x) => x.garde.active),
      fichesAvecArbitreConnu: a.fiches.filter((f) => f.avantMatch.arbitre && f.avantMatch.arbitre.n > 0).length
    });
  }
  // T-F3 : les moyennes d'arbitre que FotMob affiche, plantées absurdes (la rencontre relue : signature changée).
  {
    const { fichier, database: t } = copieDeLaBase(database, 'absurde');
    t.prepare(
      `UPDATE matches SET meta = json_set(meta, '$.referee.yellowCardsPerMatch', 999, '$.referee.foulsPerMatch', 999, '$.referee.matches', 999, '$.referee.redCards', 999),
         updated_at = '2030-01-01T00:00:00.000Z' WHERE json_extract(meta, '$.referee.name') IS NOT NULL`
    ).run();
    s.absurde = jours.slice(2, 5).map((J) => {
      const r = auJourJ(t, J);
      return { J, egal: JSON.stringify(r.etat) === JSON.stringify(complet[J].etat) && JSON.stringify(r.fiches) === JSON.stringify(complet[J].fiches) };
    });
    M.closeDb(fichier);
  }
  // T-F4 : les jaunes de la ligne d'équipe plantés à 0 sur les matchs « accord » au déroulé complet : rien ne change.
  {
    const { fichier, database: t } = copieDeLaBase(database, 'jaunes-a-zero');
    const maj = executerSansPause(L.mettreAJourLeCache(database));
    const accords = [...maj.cache.values()].filter((l) => l.statut === 'accord' && l.j_dom + l.jr_dom + l.j_ext + l.jr_ext > 0).map((l) => l.match_key);
    t.exec('BEGIN');
    const st = t.prepare('UPDATE team_stats SET yellow_cards = 0 WHERE match_key = ?');
    const mj = t.prepare("UPDATE matches SET updated_at = '2030-01-01T00:00:00.000Z' WHERE match_key = ?");
    for (const k of accords) {
      st.run(k);
      mj.run(k);
    }
    t.exec('COMMIT');
    s.jaunesAZero = { matchs: accords.length };
    s.jaunesAZero.jours = jours.slice(1, 4).map((J) => {
      const r = auJourJ(t, J);
      return { J, egal: JSON.stringify(r.etat) === JSON.stringify(complet[J].etat) && JSON.stringify(r.fiches) === JSON.stringify(complet[J].fiches), ligneAZero: r.statuts['ligne-a-zero'] ?? 0 };
    });
    M.closeDb(fichier);
  }
} else if (phase === 'fabriquer') {
  // T-B10 (partie B) : un magasin fabriqué dans la base de la copie, pour le script du banc.
  const database = M.openDb();
  const fab = fabriquerLeMagasinDesCartons(database, { debut: o.debut ?? '2025-03-01', jours: o.jours ?? 200 });
  s.matchs = fab.matchs.length;
  s.premier = fab.matchs[0].date;
  s.dernier = fab.matchs.at(-1).date;
} else if (phase === 'ddl') {
  const database = M.openDb();
  const tables = () => database.prepare("SELECT type, name, sql FROM sqlite_master WHERE name LIKE 'cartons%' ORDER BY type, name").all().map((r) => ({ ...r }));
  s.premiere = tables();
  s.indexDesCartons = M.indexAttendus().filter((n) => /cartons/.test(n));
  s.tousLesIndexAttendus = M.indexAttendus().filter((n) => !database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(n));
  const toutAvant = database.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  M.closeDb();
  const db2 = M.openDb();
  const toutApres = db2.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  s.secondeOuvertureIdentique = JSON.stringify(toutAvant) === JSON.stringify(toutApres);
  s.entrees = M.__testing.DDL.filter((sql) => /cartons_/.test(String(sql))).map((sql) => String(sql).slice(0, 60));
  s.rencontres = db2.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
  s.colonnesRencontres = db2.prepare("SELECT name FROM pragma_table_info('cartons_rencontres') ORDER BY cid").all().map((r) => r.name);
}

console.log(JSON.stringify(s));
