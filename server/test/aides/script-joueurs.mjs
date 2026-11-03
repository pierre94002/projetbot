/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-joueurs.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1a, 03/11/2026), sur un MAGASIN FABRIQUÉ (joueursFabrique.mjs : clubs, joueurs et
 * matchs fabriqués — aucun résultat réel), réseau coupé, heure figée, base NEUVE de la copie :
 *   oracle    T-F1 (l'oracle de la copie tronquée : l'état de la passe au jour J — joueurs, faux joueurs, repères, rapports
 *             des compétitions, minutes, dernières feuilles — et l'observation de chaque match de J — base λ, S, C, entrées
 *             des compositions, dernières feuilles — calculés sur la base entière et sur une copie coupée à J, égaux à
 *             l'octet) ; T-F2 (buts, cartons, tirs cadrés, minutes plantés le jour J : l'état de J inchangé, celui du
 *             lendemain changé) ; T-F3 (minutes, statistiques, note, déroulé et entrées en jeu de J plantés absurdes : les
 *             entrées de J inchangées) ; T-F3bis (le banc listé de J réduit aux entrants : titulaires et bloc identiques) ;
 *             T-F4 (la dernière feuille de l'accumulateur = derniereFeuille de derniereComposition.js) ; T-F5 (la base λ =
 *             passeDuBanc de la 32 ; S = statExpectations des fenêtres f10 ; C = la moyenne de CartonsAuJourJ de la 33) ;
 *   comptes   les comptes du magasin fabriqué (comptesDesJoueurs, par la passe du processus à part, dans le processus courant) ;
 *   fabriquer un magasin fabriqué pour le script du banc (partie B) ;
 *   ddl       T-X8 : openDb sur une copie de forme réelle (la base d'essai) crée les quatre tables des joueurs ; une seconde
 *             ouverture ne change rien ; chaque entrée du DDL commence par son ordre.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasinDesJoueurs, plusJours } from './joueursFabrique.mjs';

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

/** Coupe une base au jour J : rien après J ; le jour J ne garde que la composition (titulaires, banc, postes, identifiants). */
function tronquer(t, J) {
  t.exec('BEGIN');
  t.prepare('DELETE FROM players WHERE match_key IN (SELECT match_key FROM matches WHERE date > ?)').run(J);
  t.prepare('DELETE FROM team_stats WHERE match_key IN (SELECT match_key FROM matches WHERE date >= ?)').run(J);
  t.prepare('DELETE FROM team_day WHERE date > ?').run(J);
  t.prepare('DELETE FROM day_matches WHERE date > ?').run(J);
  t.prepare('DELETE FROM matches WHERE date > ?').run(J);
  t.prepare("UPDATE matches SET events = NULL, home_goals = NULL, away_goals = NULL, meta = json_object('kickoff', json_extract(meta, '$.kickoff')), updated_at = '2030-01-01T00:00:00.000Z' WHERE date = ?").run(J);
  t.prepare(
    `UPDATE players SET minutes = NULL, rating = NULL, goals = NULL, assists = NULL, shots = NULL, shots_on_target = NULL, xg = NULL, xa = NULL,
       xg_non_penalty = NULL, touches = NULL, passes = NULL, yellow_cards = NULL, subbed_in = NULL, sub_in_minute = NULL, sub_out_minute = NULL
     WHERE match_key IN (SELECT match_key FROM matches WHERE date = ?)`
  ).run(J);
  t.prepare('UPDATE team_day SET bp = 0, bc = 0, bp90 = NULL, bc90 = NULL, xg_p = NULL, xg_c = NULL, tirs_p = NULL, tirs_c = NULL, cadres_p = NULL, cadres_c = NULL WHERE date = ?').run(J);
  t.exec('COMMIT');
}

if (phase === 'oracle') {
  const A = await imp('data/joueurs/joueursAuJourJ.js');
  const Lj = await imp('data/joueurs/lectureDesJoueurs.js');
  const E = await imp('data/joueurs/joueursEnfant.js');
  const Dc = await imp('data/db/derniereComposition.js');
  const CB = await imp('data/contexte/contexteBancEnfant.js');
  const Sm = await imp('sports/football/statMarkets.js');
  const Lc = await imp('data/cartons/lectureDesCartons.js');
  const Cc = await imp('data/cartons/cartonsAuJourJ.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const database = M.openDb();
  const fab = fabriquerLeMagasinDesJoueurs(database, { jours: o.jours ?? 150 });
  s.matchs = fab.matchs.length;
  /** L'état de la passe au jour J (tout ce qui est d'avant J). */
  const etatAuJourJ = (db, J) => {
    const acc = new A.JoueursAuJourJ();
    executerSansPause(A.passerLesRencontres(acc, Lj.rencontresChronologiques({ database: db, jusqua: plusJours(J, -1) })));
    return acc.etatAuJourJ(J);
  };
  /** L'observation de chaque match de J par la passe du processus à part (base, entrées, dernières feuilles), arrêtée à J. */
  const observationsDuJour = (db, J) => {
    const out = [];
    E.passeDesJoueurs({ database: db, periodes: { dernierJourLu: J }, surObservation: (x) => {
      if (x.r.date === J) out.push({ matchKey: x.r.matchKey, base: x.base, entrees: x.entrees, dernieres: x.dernieres });
    } });
    return out;
  };
  const dates = [...new Set(fab.matchs.map((m) => m.date))].sort();
  const jours = [15, 28, 41, 55, 70, 88].map((i) => dates[Math.min(i, dates.length - 1)]);
  s.jours = jours;
  s.oracle = [];
  for (const J of jours) {
    const etat = etatAuJourJ(database, J);
    const obs = observationsDuJour(database, J);
    const { database: t } = copieDeLaBase(database, `tronquee-${J}`);
    tronquer(t, J);
    const etatT = etatAuJourJ(t, J);
    const obsT = observationsDuJour(t, J);
    s.oracle.push({
      J,
      etatEgal: JSON.stringify(etat) === JSON.stringify(etatT),
      observationsEgales: JSON.stringify(obs) === JSON.stringify(obsT),
      observations: obs.length,
      joueurs: Object.keys(etat.joueurs).length,
      faux: Object.keys(etat.faux).length,
      ligues: Object.keys(etat.ligues).length,
      feuilles: Object.values(etat.feuilles).filter(Boolean).length,
      titulaires: obs.reduce((n, x) => n + (x.entrees?.home?.titulaires.length ?? 0) + (x.entrees?.away?.titulaires.length ?? 0), 0),
      avecBase: obs.filter((x) => x.base.lambda && x.base.cadres && x.base.cartons).length
    });

  }
  // T-F2 : des faits plantés le jour J ne changent rien à l'état de J ; le lendemain, ils comptent.
  {
    const J = jours[2];
    const lendemain = dates[dates.indexOf(J) + 1];
    const avant = { J: JSON.stringify(etatAuJourJ(database, J)), L: JSON.stringify(etatAuJourJ(database, lendemain)) };
    const { database: t } = copieDeLaBase(database, 'plantee');
    t.exec('BEGIN');
    const cle = t.prepare('SELECT match_key FROM matches WHERE date = ? ORDER BY match_key LIMIT 1').get(J).match_key;
    const ev = JSON.parse(t.prepare('SELECT events FROM matches WHERE match_key = ?').get(cle).events);
    const tit = t.prepare("SELECT player_id FROM players WHERE match_key = ? AND side = 'home' AND starter = 1 AND player_id IS NOT NULL ORDER BY ord").all(cle).map((x) => x.player_id);
    for (let k = 0; k < 4; k++) ev.push({ type: 'goal', side: 'home', minute: 20 + k, player: 'X', playerId: tit[3] });
    for (let k = 0; k < 3; k++) ev.push({ type: 'card', side: 'home', minute: 30 + k, player: 'X', playerId: tit[2 + k], card: 'yellow' });
    t.prepare('UPDATE matches SET events = ?, home_goals = home_goals + 4 WHERE match_key = ?').run(JSON.stringify(ev), cle);
    t.prepare('UPDATE team_day SET bp = bp + 4 WHERE rencontre = (SELECT rencontre FROM day_matches WHERE match_key = ?) AND camp = 1').run(cle);
    t.prepare("UPDATE players SET shots_on_target = 9, xg = 3.3, xg_non_penalty = 3.3, minutes = 90 WHERE match_key = ? AND side = 'home' AND starter = 1").run(cle);
    t.prepare("UPDATE team_stats SET shots_on_goal = 99 WHERE match_key = ? AND side = 'home'").run(cle);
    t.exec('COMMIT');
    s.TF2 = { J, lendemain, etatJIdentique: JSON.stringify(etatAuJourJ(t, J)) === avant.J, lendemainChange: JSON.stringify(etatAuJourJ(t, lendemain)) !== avant.L };

  }
  // T-F3 et T-F3bis : minutes, statistiques, note, déroulé, entrées en jeu de J absurdes, puis le banc réduit aux entrants.
  {
    const J = jours[3];
    const ref = JSON.stringify(observationsDuJour(database, J).map((x) => ({ k: x.matchKey, e: x.entrees, b: x.base })));
    const { database: t } = copieDeLaBase(database, 'absurde');
    t.exec('BEGIN');
    t.prepare('UPDATE players SET minutes = 999, rating = 99, goals = 7, assists = 7, shots_on_target = 50, xg = 9.9, xa = 9.9, xg_non_penalty = 0.1, subbed_in = 1, sub_in_minute = 1, sub_out_minute = 2 WHERE match_key IN (SELECT match_key FROM matches WHERE date = ?)').run(J);
    t.prepare('UPDATE matches SET events = ?, home_goals = 9, away_goals = 9 WHERE date = ?').run(JSON.stringify([{ type: 'goal', side: 'home', minute: 1, playerId: 'fotmob-1' }]), J);
    t.exec('COMMIT');
    const absurde = JSON.stringify(observationsDuJour(t, J).map((x) => ({ k: x.matchKey, e: x.entrees, b: x.base })));
    t.exec('BEGIN');
    t.prepare('DELETE FROM players WHERE starter = 0 AND (minutes IS NULL OR minutes = 0) AND match_key IN (SELECT match_key FROM matches WHERE date = ?)').run(J);
    t.exec('COMMIT');
    const reduit = observationsDuJour(t, J).map((x) => ({ k: x.matchKey, tit: x.entrees.home.titulaires.concat(x.entrees.away.titulaires), bloc: [x.entrees.home.bloc, x.entrees.away.bloc] }));
    const refTit = JSON.parse(ref).map((x) => ({ k: x.k, tit: x.e.home.titulaires.concat(x.e.away.titulaires), bloc: [x.e.home.bloc, x.e.away.bloc] }));
    s.TF3 = { J, absurdeIdentique: absurde === ref, matchs: JSON.parse(ref).length };
    s.TF3bis = { J, titulairesEtBlocIdentiques: JSON.stringify(reduit) === JSON.stringify(refTit) };

  }
  // T-F4 : la dernière feuille de l'accumulateur = derniereFeuille de derniereComposition.js.
  {
    let compares = 0;
    let egaux = 0;
    for (const J of jours) {
      const etat = etatAuJourJ(database, J);
      for (const club of Object.keys(etat.feuilles)) {
        const a = etat.feuilles[club];
        const b = Dc.derniereFeuille(`fotmob-${club}`, J, database);
        compares += 1;
        const idsB = b ? b.team.startXI.map((x) => (x.id ? Lj.numeroApresFusion(x.id, Lj.fusions(database)) : null)) : null;
        if ((a === null && b === null) || (a && b && JSON.stringify(a.onze) === JSON.stringify(idsB) && a.date === b.match.date)) egaux += 1;
      }
    }
    s.TF4 = { compares, egaux };
  }
  // T-F5 : la base λ = passeDuBanc de la 32 ; S = statExpectations des fenêtres f10 ; C = la moyenne de CartonsAuJourJ.
  {
    const dernier = dates[dates.length - 1];
    const toutes = [];
    E.passeDesJoueurs({ database, periodes: { dernierJourLu: dernier }, surObservation: (x) => toutes.push({ cle: x.r.matchKey, attribue: x.r.attribue, base: x.base }) });
    const p32 = CB.passeDuBanc({ database, periodes: { miseEnRoute: { de: dates[0], a: dates[5] }, plis: [{ apprendre: { de: dates[6], a: dernier }, juger: { de: dates[6], a: dernier } }], dernierJourLu: dernier }, venues: {}, avecResultats: true });
    const base32 = new Map(p32.rencontres.map((r) => [r.cle, r.base]));
    let lambdaEgaux = 0;
    let lambdaCompares = 0;
    for (const x of toutes) {
      if (x.attribue) continue;
      lambdaCompares += 1;
      const b = base32.get(x.cle);
      if (b && x.base.lambda && b.lambda === x.base.lambda.lambda && b.mu === x.base.lambda.mu) lambdaEgaux += 1;
    }
    let sEgaux = 0;
    let sCompares = 0;
    for (const r of database.prepare(`SELECT d.match_key, h.f10_cadres_p hp, h.f10_cadres_c hc, h.f10_cadres_n hn, a.f10_cadres_p ap, a.f10_cadres_c ac, a.f10_cadres_n an
       FROM day_matches d JOIN team_day h ON h.rencontre = d.rencontre AND h.camp = 1 JOIN team_day a ON a.rencontre = d.rencontre AND a.camp = 0`).all()) {
      const x = toutes.find((y) => y.cle === r.match_key);
      const attendu = r.hn >= 6 && r.an >= 6 ? Sm.statExpectations({ statInputs: { home: { shotsOnTarget: { for: r.hp / r.hn, against: r.hc / r.hn } }, away: { shotsOnTarget: { for: r.ap / r.an, against: r.ac / r.an } } } }).shotsOnTarget : null;
      sCompares += 1;
      if ((attendu === null && x.base.cadres === null) || (attendu && x.base.cadres && attendu.home === x.base.cadres.home && attendu.away === x.base.cadres.away)) sEgaux += 1;
    }
    const maj = executerSansPause(Lc.mettreAJourLeCache(database, { jusqua: dernier }));
    const accC = new Cc.CartonsAuJourJ();
    const mParCle = new Map();
    executerSansPause(Cc.passerLesRencontres(accC, Lc.rencontresChronologiques({ database, cache: maj.cache, jusqua: dernier }), { avantLaJournee: (jour, inst) => { for (const [k, v] of inst) mParCle.set(k, v.m); } }));
    let cEgaux = 0;
    for (const x of toutes) {
      const m = mParCle.get(x.cle);
      if ((m === null && x.base.cartons === null) || (m && x.base.cartons && m.dom === x.base.cartons.dom && m.ext === x.base.cartons.ext)) cEgaux += 1;
    }
    s.TF5 = { lambdaCompares, lambdaEgaux, sCompares, sEgaux, cCompares: toutes.length, cEgaux, avecCartons: toutes.filter((x) => x.base.cartons).length };
  }
} else if (phase === 'comptes') {
  const E = await imp('data/joueurs/joueursEnfant.js');
  const database = M.openDb();
  const fab = fabriquerLeMagasinDesJoueurs(database, { jours: o.jours ?? 160 });
  s.matchs = fab.matchs.length;
  const r = E.compterLesJoueurs({ database, periodes: o.periodes });
  s.comptes = r.comptes;
  s.lues = r.lues;
} else if (phase === 'fabriquer') {
  const database = M.openDb();
  const fab = fabriquerLeMagasinDesJoueurs(database, { debut: o.debut ?? '2023-01-02', jours: o.jours ?? 160, effet: o.effet ?? 0.4 });
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  s.matchs = fab.matchs.length;
  s.base = process.env.MATCH_STATS_DB;
} else if (phase === 'ddl') {
  const database = M.openDb();
  s.premiere = database.prepare("SELECT type, name, sql FROM sqlite_master WHERE name LIKE 'joueurs%' ORDER BY type, name").all().map((r) => ({ ...r }));
  s.indexDesJoueurs = M.indexAttendus().filter((n) => /joueurs_/.test(n));
  s.tousLesIndexAttendus = M.indexAttendus().filter((n) => !database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(n));
  const toutAvant = database.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  M.closeDb();
  const db2 = M.openDb();
  const toutApres = db2.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  s.secondeOuvertureIdentique = JSON.stringify(toutAvant) === JSON.stringify(toutApres);
  s.entrees = M.__testing.DDL.filter((sql) => /joueurs_/.test(String(sql))).map((sql) => String(sql).slice(0, 60));
  s.rencontres = db2.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
} else throw new Error(`phase inconnue « ${phase} »`);

process.stdout.write(`${JSON.stringify(s)}\n`);
process.exit(0);
