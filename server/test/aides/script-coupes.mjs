/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-coupes.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LES COUPES (étape 36, lot 1, 09/11/2026), sur un MAGASIN FABRIQUÉ (coupesFabrique.mjs : clubs et matchs fabriqués —
 * aucun résultat réel), réseau coupé, heure figée, base NEUVE de la copie. Phases :
 *   « nuit »     le magasin, l'annuaire reconstruit, le calendrier de la copie ; T-T1 (les blocs refaits = cupBracket) ;
 *                la nuit dans le VRAI processus à part ; la lecture de cinq matchs ; une seconde nuit après un coup
 *                d'envoi (la fiche figée jamais réécrite) ; le jeton pris (reportée) ; le délai dépassé ; une fuite plantée ;
 *   « fuite »    T-F1 (l'oracle de la copie coupée au jour J, six jours J, à nature égale), T-F2 (un tour suivant planté ne
 *                change aucune entrée), T-F3 (le format du jour J ignore J et après) ;
 *   « base »     T-Q5 : λS et μS de la passe de la 36 = ceux de la passe de l'étape 32, à l'octet, sur le même magasin ;
 *   « ddl »      T-X8 : les 5 tables et les 3 index créés à l'ouverture, une seconde ouverture ne change rien ;
 *   « fabriquer » le magasin seul (le script coupes.mjs est lancé ensuite dans la même copie : T-B10) ;
 *   « echantillon » T-T1 sur la copie de test/fixtures/echantillon.db.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLesCoupes, fabriquerLesMatchsAVenir, JUSQUA, NUIT_D_ESSAI, plusJours, CLUBS } from './coupesFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const s = { ok: true, phase, pid: process.pid };
const FICHIER = process.env.MATCH_STATS_DB;

function magasinNeuf(fichier = FICHIER, options = {}) {
  for (const x of ['', '-wal', '-shm']) fs.rmSync(fichier + x, { force: true });
  return M.openDb({ file: fichier, ...options });
}

if (phase === 'ddl') {
  const db = magasinNeuf();
  const tables = (d) => d.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name LIKE '%coupes%' ORDER BY name").all().map((r) => r.name);
  s.tables = tables(db);
  s.schema = db.prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE '%coupes%' ORDER BY name").all().map((r) => `${r.name}:${r.sql}`);
  // Une seconde ouverture (le même fichier) : rien ne change.
  const db2 = M.openDb({ file: FICHIER });
  s.schema2 = db2.prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE '%coupes%' ORDER BY name").all().map((r) => `${r.name}:${r.sql}`);
  s.indexAttendus = M.indexAttendus().filter((n) => n.includes('coupes'));
  db2.close();
}

if (phase === 'nuit') {
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const R = await imp('data/db/matchStatsRead.js');
  const T = await imp('data/coupes/toursDeCoupe.js');
  const N = await imp('data/coupes/coupesNuit.js');
  const L = await imp('data/coupes/coupesRead.js');
  const { commencerCalculLourd } = await imp('utils/calculLourd.js');
  const db = magasinNeuf();
  const { rencontres, attendus } = fabriquerLesCoupes(db, { rebuildRegistries });
  s.rencontres = rencontres.length;
  s.attendus = attendus;
  // T-T1 : les blocs refaits = ceux de cupBracket, pour chaque coupe et chaque saison du magasin fabriqué.
  const coupes = [...new Set(rencontres.filter((r) => !['Ligue 1', 'Liga X'].includes(r.league)).map((r) => r.league))];
  const S = await imp('data/providers/seasonWindows.js');
  s.tT1 = [];
  for (const league of coupes) {
    const saisons = [...new Set(rencontres.filter((r) => r.league === league).map((r) => S.seasonOf(league, r.date)))];
    for (const saison of saisons) {
      const [de, a] = S.seasonBounds(league, saison);
      const lignes = db.prepare("SELECT match_key, fotmob_id, date, json_extract(meta, '$.round') AS tour FROM matches WHERE league = ? AND date >= ? AND date < ? ORDER BY date").all(league, de, a);
      const miens = T.blocsCommeCupBracket(lignes.map((l) => ({ matchKey: l.match_key, fotmobId: l.fotmob_id, date: l.date, tour: l.tour === null ? null : String(l.tour) }))).map((b) => `${b.from}|${b.intitule}|${b.rencontres.map((r) => r.fotmobId ?? r.matchKey).sort().join(',')}`).sort();
      const cb = R.cupBracket(league, { season: saison, database: db });
      const siens = cb.rounds.map((r) => `${r.from}|${r.round.split(' — ')[0]}|${r.matches.map((m) => m.matchId).sort().join(',')}`).sort();
      s.tT1.push({ league, saison, egaux: JSON.stringify(miens) === JSON.stringify(siens), miens: miens.length, siens: siens.length });
    }
  }
  // Le calendrier de la copie (le fichier que lit la nuit) et les matchs à venir.
  const calendrier = path.join(serveur, 'data', 'runtime', 'season-calendar.json');
  fabriquerLesMatchsAVenir(db, calendrier, { apresLeCoupDEnvoi: Boolean(o.fuite) });
  // La nuit, dans le VRAI processus à part (la base ouverte en lecture seule là-bas).
  const t0 = performance.now();
  const r1 = await N.faireLesCoupesDeLaNuit({ maintenant: NUIT_D_ESSAI, database: db, chemin: FICHIER });
  s.nuit1 = { mode: r1.mode, erreur: r1.erreur ?? null, raison: r1.raison ?? null, ecrites: r1.ecrites ?? null, bilan: r1.bilan ?? null, controles: r1.controles ?? null, fuites: r1.fuites ?? [], ms: Math.round(performance.now() - t0), transactions: r1.transactions ?? null, plusLongueTrancheMs: r1.plusLongueTrancheMs ?? null };
  s.resultat1 = N.resultatDeLEtape(r1, { updatedAt: NUIT_D_ESSAI });
  s.fiches1 = db.prepare('SELECT date, home_id, away_id, league, kickoff, kickoff_connu, calcule_le, apres_coup_d_envoi, faits, grille_page FROM coupes_lignes ORDER BY date, home_id').all().map((r) => ({ ...r }));
  s.etat1 = db.prepare('SELECT cle FROM coupes_etat ORDER BY cle').all().map((r) => r.cle);
  s.rencontresRangees = db.prepare('SELECT COUNT(*) AS n FROM coupes_rencontres').get().n;
  s.formats = db.prepare('SELECT * FROM coupes_formats ORDER BY league, saison, nature').all().map((r) => ({ ...r }));
  s.stades = db.prepare('SELECT COUNT(*) AS n FROM coupes_stades').get().n;
  s.lignesRangees = db.prepare('SELECT match_key, tour, famille, nature_du_bloc, role, avance, qualifie, comment, raison, observation_format, seance_carte, seance_suite, lieu FROM coupes_rencontres ORDER BY match_key').all().map((r) => ({ ...r }));
  // La lecture de cinq matchs (la grille de la page : un 1N2 affiché fabriqué).
  const analyse = { distributions: { result: { home: 0.47, draw: 0.27, away: 0.26 } }, modeleDeButs: { expectedGoals: { home: 1.42, away: 1.08 }, rho: -0.05 }, engineVersion: 5 };
  const lire = (h, a, d, league, extra = {}) => {
    const nom = (id) => CLUBS.find((x) => x.id === id)?.nom ?? 'Club sans identifiant';
    const match = { league, home: nom(h), away: nom(a), commenceTime: `${d}T19:00:00Z`, scoreInputs: { home: { teamId: h === null ? null : `fotmob-${h}` }, away: { teamId: `fotmob-${a}` } }, ...extra };
    const t = performance.now();
    const r = L.coupeDuMatch({ match, analyse, config: { defaultCorrelation: -0.05 }, database: db, maintenant: Date.parse(NUIT_D_ESSAI) + 3_600_000 });
    return { r, ms: performance.now() - t };
  };
  s.lectures = {
    retour: lire(9021, 9017, '2026-04-16', 'UEFA Europa League'),
    retourArchive: lire(9022, 9018, '2026-04-16', 'UEFA Europa League'),
    unique: lire(9016, 9015, '2026-04-15', 'Coupe de France'),
    groupe: lire(9027, 9031, '2026-04-21', 'Copa Libertadores'),
    aller: lire(9017, 9019, '2026-04-23', 'UEFA Europa League'),
    championnat: lire(9001, 9002, '2026-04-18', 'Ligue 1'),
    sansIdentifiant: lire(null, 9002, '2026-04-15', 'Coupe de France'),
    portsmouth: lire(9032, 9001, '2026-04-15', 'Coupe de France')
  };
  // Une seconde nuit, APRÈS le coup d'envoi des retours du 16/04 : leurs fiches ne sont jamais réécrites.
  const r2 = await N.faireLesCoupesDeLaNuit({ maintenant: '2026-04-16T21:00:00.000Z', database: db, chemin: FICHIER, aPart: false });
  s.nuit2 = { mode: r2.mode, erreur: r2.erreur ?? null, ecrites: r2.ecrites ?? null };
  s.fiches2 = db.prepare('SELECT date, home_id, away_id, calcule_le, apres_coup_d_envoi, faits FROM coupes_lignes ORDER BY date, home_id').all().map((r) => ({ ...r }));
  // Le jeton pris par un autre calcul lourd : « reporté », rien d'écrit.
  const rendre = commencerCalculLourd('autre calcul');
  try {
    const r3 = await N.faireLesCoupesDeLaNuit({ maintenant: '2026-04-17T00:40:00.000Z', database: db, chemin: FICHIER });
    s.reporte = { mode: r3.mode, raison: r3.raison ?? null, resultat: N.resultatDeLEtape(r3) };
  } finally {
    rendre();
  }
  // Le délai dépassé : l'enfant est arrêté, rien n'est rangé.
  const avant = db.prepare('SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM coupes_lignes').get();
  const r4 = await N.faireLesCoupesDeLaNuit({ maintenant: '2026-04-18T00:40:00.000Z', database: db, chemin: FICHIER, delaiMs: 1 });
  const apres = db.prepare('SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM coupes_lignes').get();
  s.delai = { mode: r4.mode, erreur: r4.erreur ?? null, avant: { ...avant }, apres: { ...apres } };
  // Les orphelines : une fiche d'un match jamais joué part après 30 jours ; celle d'un match joué reste.
  db.prepare("INSERT INTO coupes_lignes (date, home_id, away_id, league, calcule_le, version, faits) VALUES ('2026-02-01', '9001', '9002', 'Coupe de France', '2026-01-31T00:40:00.000Z', 1, '{}')").run();
  db.prepare("INSERT INTO coupes_lignes (date, home_id, away_id, league, calcule_le, version, faits) VALUES ('2024-01-06', '9001', '9002', 'FA Cup - England', '2024-01-05T00:40:00.000Z', 1, '{}')").run();
  const r5 = await N.faireLesCoupesDeLaNuit({ maintenant: '2026-04-19T00:40:00.000Z', database: db, chemin: FICHIER, aPart: false });
  s.orphelines = { mode: r5.mode, fiches: r5.ecrites?.fiches ?? null, restantes: db.prepare("SELECT date, home_id, away_id, apres_coup_d_envoi FROM coupes_lignes WHERE date < '2026-04-01' ORDER BY date").all().map((r) => ({ ...r })) };
  // Une nuit interrompue pendant son rangement (en_cours resté) : la suivante la reprend et le dit.
  db.prepare("INSERT INTO coupes_etat (cle, valeur) VALUES ('en_cours', '{\"calculeLe\":\"2026-04-19T00:41:00.000Z\"}') ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run();
  const r6 = await N.faireLesCoupesDeLaNuit({ maintenant: '2026-04-20T00:40:00.000Z', database: db, chemin: FICHIER, aPart: false, tranche: 5 });
  s.reprise = { mode: r6.mode, repriseApres: r6.repriseApres ?? null, transactions: r6.transactions, enCours: db.prepare("SELECT COUNT(*) AS n FROM coupes_etat WHERE cle = 'en_cours'").get().n, resume: N.resultatDeLEtape(r6).summary };
  db.close();
  // L'annuaire pas prêt (people vide, players non vide : la reconstruction voudrait écrire, la base de l'enfant est en lecture
  // seule) : la nuit est REPORTÉE, jamais « tous les clubs inconnus ».
  const autre = path.join(path.dirname(FICHIER), 'sans-annuaire.db');
  const db2 = magasinNeuf(autre);
  fabriquerLesCoupes(db2, {});
  const unMatch = db2.prepare('SELECT match_key FROM matches LIMIT 1').get().match_key;
  db2.prepare("INSERT INTO players (match_key, side, player_key, name) VALUES (?, 'home', 'p1', 'Un Joueur')").run(unMatch);
  db2.close();
  const r7 = await N.faireLesCoupesDeLaNuit({ maintenant: NUIT_D_ESSAI, database: M.openDb({ file: autre }), chemin: autre });
  s.annuaire = { mode: r7.mode, raison: r7.raison ?? null, erreur: r7.erreur ?? null };
}

if (phase === 'fabriquer') {
  // Le magasin fabriqué seul (pour le script coupes.mjs, lancé ensuite dans la même copie : T-B10).
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const db = magasinNeuf();
  s.rencontres = fabriquerLesCoupes(db, { rebuildRegistries }).rencontres.length;
  db.close();
}

if (phase === 'echantillon') {
  // T-T1 sur test/fixtures/echantillon.db (copié dans la copie de travail) : pour chaque coupe et chaque saison présentes,
  // les blocs refaits (structure seule : clé, jour, intitulé) = ceux de cupBracket.
  const R = await imp('data/db/matchStatsRead.js');
  const T = await imp('data/coupes/toursDeCoupe.js');
  const S = await imp('data/providers/seasonWindows.js');
  const { isCup } = await imp('data/providers/leagueCups.js');
  const db = M.openDb({ file: FICHIER });
  const ligues = db.prepare('SELECT DISTINCT league FROM matches').all().map((r) => r.league).filter((l) => isCup(l));
  s.tT1 = [];
  for (const league of ligues) {
    const saisons = [...new Set(db.prepare('SELECT date FROM matches WHERE league = ?').all(league).map((r) => S.seasonOf(league, r.date)))].sort();
    for (const saison of saisons) {
      const [de, a] = S.seasonBounds(league, saison);
      const lignes = db.prepare("SELECT match_key, fotmob_id, date, json_extract(meta, '$.round') AS tour FROM matches WHERE league = ? AND date >= ? AND date < ? ORDER BY date").all(league, de, a);
      const miens = T.blocsCommeCupBracket(lignes.map((l) => ({ matchKey: l.match_key, fotmobId: l.fotmob_id, date: l.date, tour: l.tour === null ? null : String(l.tour) }))).map((b) => `${b.from}|${b.intitule}|${b.rencontres.map((r) => r.fotmobId ?? r.matchKey).sort().join(',')}`).sort();
      const cb = R.cupBracket(league, { season: saison, database: db });
      const siens = (cb?.rounds ?? []).map((r) => `${r.from}|${r.round.split(' — ')[0]}|${r.matches.map((m) => m.matchId).sort().join(',')}`).sort();
      s.tT1.push({ league, saison, rencontres: lignes.length, egaux: JSON.stringify(miens) === JSON.stringify(siens), miens: miens.length, siens: siens.length });
    }
  }
}

if (phase === 'fuite') {
  const E = await imp('data/coupes/coupesEnfant.js');
  const C = await imp('data/coupes/confrontations.js');
  const Lc = await imp('data/coupes/lectureDesCoupes.js');
  const S = await imp('data/providers/seasonWindows.js');
  const T = await imp('data/coupes/toursDeCoupe.js');
  // Les ENTRÉES des unités du jour J (la liste des unités vient de la SAISON ENTIÈRE du magasin complet : la forme de la
  // compétition est connue d’avance en vrai — l’exemption nommée, critique constat 6 ; T-F1 compare « à nature égale ») :
  // l’aller et l’avance (le match inversé JOUÉ avant J, sous 40 jours), la nature visible au jour J, le format (les
  // observations d’avant J), λS et μS (la passe d’avant J) — tous lus sur la base `db` jusqu’à J.
  const entrees = (db, J, unites) => {
    const saisons = E.apparierLesCoupes(db, { jusqua: J });
    const observations = saisons.flatMap((x) => x.cs.observations);
    const ranges = saisons.flatMap((x) => x.cs.rencontres.map((y) => ({ ...y, saison: x.saison })));
    const { bases } = Lc.passeDesForces(db, { jusqua: J, cles: new Set(unites.map((u) => u.cle)) });
    const out = {};
    for (const u of unites) {
      const d = u.decisif;
      const aller = ranges.filter((x) => x.r.league === u.league && x.r.home === d.away && x.r.away === d.home && x.r.date < J && T.joursEntre(x.r.date, J) <= 40).sort((a, b) => (a.r.date < b.r.date ? 1 : -1))[0] ?? null;
      const ici = ranges.find((x) => x.r.matchKey === u.cle) ?? null;
      const b = bases.get(u.cle) ?? null;
      out[u.cle] = { natureVisible: ici ? T.natureVisible(ici.r, ici.bloc) : null, aller: aller ? { cle: aller.r.matchKey, hg: aller.r.hg, ag: aller.r.ag } : null, avance: aller ? aller.r.ag - aller.r.hg : 0, format: C.formatAuJourJ(observations, { league: u.league, saison: S.seasonOf(u.league, J), nature: u.nature, jour: J }), lambdaS: b?.lambdaS ?? null, muS: b?.muS ?? null };
    }
    return out;
  };
  const jours = o.jours ?? ['2025-01-11', '2025-02-08', '2025-03-08', '2025-04-17', '2025-05-08', '2025-08-28'];
  const complet = magasinNeuf();
  fabriquerLesCoupes(complet, {});
  const saisonsCompletes = E.apparierLesCoupes(complet, { jusqua: JUSQUA });
  const unitesDuJour = (J) => saisonsCompletes.flatMap((x) => x.cs.unites.filter((u) => u.date === J).map((u) => ({ ...u, league: x.league })));
  s.tF1 = [];
  for (const J of jours) {
    const fichier = path.join(path.dirname(FICHIER), `coupee-${J}.db`);
    for (const x of ['', '-wal', '-shm']) fs.rmSync(fichier + x, { force: true });
    complet.exec(`VACUUM INTO '${fichier.replace(/'/g, "''")}'`);
    const coupee = M.openDb({ file: fichier });
    // LA COPIE COUPÉE À J : tout ce qui est après J retiré ; pour J, la structure gardée, résultats et déroulés effacés.
    coupee.exec('BEGIN');
    coupee.prepare('DELETE FROM team_day WHERE date > ?').run(J);
    coupee.prepare('DELETE FROM day_matches WHERE date > ?').run(J);
    coupee.prepare('DELETE FROM matches WHERE date > ?').run(J);
    coupee.prepare("UPDATE matches SET home_goals = NULL, away_goals = NULL, events = NULL, shotmap = NULL, meta = json_remove(meta, '$.reason', '$.awarded') WHERE date = ?").run(J);
    coupee.prepare('UPDATE team_day SET bp = 0, bc = 0, bp90 = NULL, bc90 = NULL, prolongation = 0 WHERE date = ?').run(J);
    coupee.exec('COMMIT');
    const unites = unitesDuJour(J);
    const a = entrees(complet, J, unites);
    const b = entrees(coupee, J, unites);
    const egales = [];
    const ecarts = [];
    for (const [cle, x] of Object.entries(a)) {
      if (JSON.stringify(x) === JSON.stringify(b[cle])) egales.push(cle);
      else ecarts.push({ cle, complet: x, coupee: b[cle] ?? null });
    }
    s.tF1.push({ J, unites: unites.length, natures: [...new Set(unites.map((u) => u.nature))], egales: egales.length, ecarts, avecBase: Object.values(a).filter((x) => x.lambdaS !== null).length });
    coupee.close();
  }
  // T-F2 : un tour suivant PLANTÉ (un match d'après J entre deux clubs du jour J) ne change aucune entrée du jour J.
  const J = '2025-02-08';
  const avant = entrees(complet, J, unitesDuJour(J));
  complet.prepare("INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, meta) VALUES ('plante', 'plante', '2025-02-20', 'Coupe de France', 'X', 'Y', 'fotmob-9001', 'fotmob-9011', '999999', 0, 0, '{\"round\":\"1/2\",\"leagueKey\":\"FRA|Coupe de France\"}')").run();
  s.tF2 = { avant, apres: entrees(complet, J, unitesDuJour(J)), unites: unitesDuJour(J).length, auDela: E.apparierLesCoupes(complet, { jusqua: J }).flatMap((x) => x.cs.rencontres).filter((y) => y.r.date > J).length };
  // T-F3 : le format du jour J ignore les matchs de J et d'après.
  const obs = [
    { league: 'L', saison: 2025, nature: 'match-unique', date: '2026-01-10', observation: 'direct' },
    { league: 'L', saison: 2025, nature: 'match-unique', date: '2026-01-11', observation: 'direct' },
    { league: 'L', saison: 2025, nature: 'match-unique', date: '2026-01-12', observation: 'direct' },
    { league: 'L', saison: 2025, nature: 'match-unique', date: '2026-02-01', observation: 'prolongation' },
    { league: 'L', saison: 2025, nature: 'match-unique', date: '2026-02-02', observation: 'prolongation' }
  ];
  s.tF3 = { aJ: C.formatAuJourJ(obs, { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-01' }), apres: C.formatAuJourJ(obs, { league: 'L', saison: 2025, nature: 'match-unique', jour: '2026-02-03' }) };
  complet.close();
}

if (phase === 'base') {
  const Lc = await imp('data/coupes/lectureDesCoupes.js');
  const CB = await imp('data/contexte/contexteBancEnfant.js');
  const db = magasinNeuf();
  const { rencontres } = fabriquerLesCoupes(db, {});
  const dernier = JUSQUA;
  const p32 = CB.passeDuBanc({ database: db, periodes: { miseEnRoute: { de: '2024-08-01', a: '2024-12-31' }, plis: [{ apprendre: { de: '2025-01-01', a: dernier }, juger: { de: '2025-01-01', a: dernier } }], dernierJourLu: dernier }, venues: {}, avecResultats: true });
  const cles = new Set(rencontres.filter((r) => !['Ligue 1', 'Liga X'].includes(r.league)).map((r) => r.matchKey));
  const { bases } = Lc.passeDesForces(db, { jusqua: dernier, cles });
  let egales = 0;
  const ecarts = [];
  for (const m of p32.rencontres) {
    if (!cles.has(m.cle) || !m.base) continue;
    const b = bases.get(m.cle);
    if (b && b.lambdaS === m.base.lambda && b.muS === m.base.mu) egales++;
    else ecarts.push({ cle: m.cle, b32: m.base, b36: b ?? null });
  }
  s.base = { comparees: egales + ecarts.length, egales, ecarts: ecarts.slice(0, 5) };
  db.close();
}

process.stdout.write(`${JSON.stringify(s)}\n`);
