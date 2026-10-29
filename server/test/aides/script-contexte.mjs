/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-contexte.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LE CONTEXTE DU MATCH (étape 32, lot 1a, 29/10/2026), sur un MAGASIN FABRIQUÉ (contexteFabrique.mjs : huit clubs réels de
 * venues.json, des matchs fabriqués — aucun résultat réel), réseau coupé, heure figée, base NEUVE de la copie :
 *   oracle    T-F1 (l'oracle de la copie tronquée : la fiche et les arbitres au jour J, calculés sur la base entière et
 *             sur une copie coupée à J, égaux hors du bloc « enchaînement »), T-F3 et T-F4 (des moyennes d'arbitre FotMob
 *             et une météo absurdes plantées ne changent rien), T-F5 (un nouvel entraîneur publié dans la composition du
 *             jour J ne change pas la fiche de J ; il compte au match suivant) ;
 *   nuit      l'étape de nuit (T-N1 à T-N5, T-N8, T-N9) : plusieurs nuits sur le même magasin et un calendrier fabriqué ;
 *   archive   T-N3b : l'archive d'avant-match écrite au moment de l'écriture (upsertUpcomingLineup) ;
 *   ddl       T-X8 : openDb sur une copie de forme réelle (la base d'essai) crée les tables et les index du contexte ; une
 *             seconde ouverture ne change rien.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasin, ecrireUnCalendrier, plusJours, LIGUE } from './contexteFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const s = { ok: true, phase };
const dossier = process.env.CM_TEST_DOSSIER;

async function magasin(database) {
  const { lireStades } = await imp('data/reference/donneesDeReference.js');
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  return fabriquerLeMagasin(database, { venues: lireStades(), rebuildRegistries, jours: o.jours ?? 60 });
}

async function outils() {
  const C = await imp('data/contexte/contexteAuJourJ.js');
  const L = await imp('data/contexte/lectureDuMagasin.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const { lireStades } = await imp('data/reference/donneesDeReference.js');
  const venues = lireStades();
  /** La fiche et les arbitres AU JOUR J : la passe jusqu'à la veille, puis les rencontres du jour telles que publiées avant. */
  const auJourJ = (database, J) => {
    const maj = executerSansPause(L.mettreAJourLeCache(database));
    const contexte = new C.ContexteAuJourJ({ venues });
    executerSansPause(C.passerLesRencontres(contexte, L.rencontresChronologiques({ database, cache: maj.cache, jusqua: plusJours(J, -1) })));
    const prochains = C.indexDesProchains([...L.rencontresChronologiques({ database, cache: maj.cache })]);
    const fiches = L.rencontresAvantMatchDuJour({ database, cache: maj.cache, jour: J }).map((r) => ({ matchKey: r.matchKey, fiche: contexte.fiche({ rencontre: r, prochains, calculeLe: 'oracle' }) }));
    const arbitres = Object.fromEntries(contexte.arbitres.cles().sort().map((c) => [c, contexte.arbitres.etat(c)]));
    return { fiches, arbitres };
  };
  return { C, L, executerSansPause, venues, auJourJ };
}

const sansEnchainement = (f) => {
  const { enchainement, ...reste } = f;
  return reste;
};

/** Une copie du fichier de la base (après un point de reprise), ouverte par openDb. */
function copieDeLaBase(database, nom) {
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const fichier = path.join(dossier, `${nom}.db`);
  fs.copyFileSync(process.env.MATCH_STATS_DB, fichier);
  return { fichier, database: M.openDb({ file: fichier }) };
}

if (phase === 'oracle') {
  const database = M.openDb();
  const fab = await magasin(database);
  const { auJourJ } = await outils();
  const dates = [...new Set(fab.matchs.map((m) => m.date))].sort();
  const jours = [5, 9, 13, 17, 21, 24].map((i) => dates[Math.min(i, dates.length - 1)]);
  s.jours = jours;
  s.matchs = fab.matchs.length;
  const complet = Object.fromEntries(jours.map((J) => [J, auJourJ(database, J)]));
  // T-F1 : la copie TRONQUÉE à J (critique, constat 7) : après J, plus rien ; le jour J, le registre et la page d'avant-match
  // seulement (meta réduite à la liste blanche, déroulé, compositions, carte des tirs et score effacés ; table du jour J
  // et cache des styles retirés).
  s.oracle = [];
  for (const J of jours) {
    const { fichier, database: t } = copieDeLaBase(database, `tronquee-${J}`);
    t.exec('BEGIN');
    t.prepare('DELETE FROM team_day WHERE date >= ?').run(J);
    t.prepare('DELETE FROM team_style_matches WHERE date >= ?').run(J);
    t.prepare('DELETE FROM league_day WHERE date > ?').run(J);
    t.prepare('DELETE FROM day_matches WHERE date > ?').run(J);
    t.prepare('DELETE FROM matches WHERE date > ?').run(J);
    t.prepare(
      `UPDATE matches SET meta = json_object('kickoff', json_extract(meta, '$.kickoff'), 'stadium', json_extract(meta, '$.stadium'), 'surface', json_extract(meta, '$.surface'),
         'referee', json_object('name', json_extract(meta, '$.referee.name'), 'country', json_extract(meta, '$.referee.country'))),
         events = NULL, lineups = NULL, shotmap = NULL, home_goals = NULL, away_goals = NULL WHERE date = ?`
    ).run(J);
    t.exec('COMMIT');
    const r = auJourJ(t, J);
    M.closeDb(fichier);
    const a = complet[J];
    const parCle = new Map(r.fiches.map((x) => [x.matchKey, x.fiche]));
    const differences = [];
    let enchainementsDifferents = 0;
    for (const x of a.fiches) {
      const y = parCle.get(x.matchKey);
      if (!y) {
        differences.push(`${x.matchKey} : absente de la copie tronquée`);
        continue;
      }
      if (JSON.stringify(sansEnchainement(x.fiche)) !== JSON.stringify(sansEnchainement(y))) differences.push(`${x.matchKey} : la fiche diffère hors de l'enchaînement`);
      if (JSON.stringify(x.fiche.enchainement) !== JSON.stringify(y.enchainement)) enchainementsDifferents++;
    }
    s.oracle.push({ J, fiches: a.fiches.length, differences, enchainementsDifferents, arbitresEgaux: JSON.stringify(a.arbitres) === JSON.stringify(r.arbitres), arbitres: Object.keys(a.arbitres).length });
  }
  // T-F3 et T-F4 : les moyennes d'arbitre FotMob et la météo plantées absurdes (et la rencontre relue : signature changée).
  {
    const { fichier, database: t } = copieDeLaBase(database, 'absurde');
    t.prepare(
      `UPDATE matches SET meta = json_set(meta, '$.referee.yellowCardsPerMatch', 999, '$.referee.foulsPerMatch', 999, '$.referee.matches', 999,
         '$.referee.penalties', 999, '$.referee.redCards', 999, '$.temperature', 99, '$.windSpeed', 99, '$.precipitation', 99, '$.weather', 'Hurricane'),
         updated_at = '2030-01-01T00:00:00.000Z'`
    ).run();
    const J = jours[3];
    const r = auJourJ(t, J);
    M.closeDb(fichier);
    s.absurde = { J, fichesEgales: JSON.stringify(r.fiches) === JSON.stringify(complet[J].fiches), arbitresEgaux: JSON.stringify(r.arbitres) === JSON.stringify(complet[J].arbitres) };
  }
  // T-F5 : un entraîneur NOUVEAU publié dans la composition du jour J (le cache des styles et la composition).
  {
    const J = jours[2];
    const cible = fab.matchs.find((m) => m.date === J && !m.attribue);
    const { fichier, database: t } = copieDeLaBase(database, 'entraineur');
    t.prepare("UPDATE team_style_matches SET coach = 'Entraîneur Publié Le Jour J', coach_id = 799999 WHERE match_key = ? AND camp = 1").run(cible.matchKey);
    t.prepare("UPDATE matches SET lineups = json_set(lineups, '$.home.coach', 'Entraîneur Publié Le Jour J', '$.home.coachId', 799999) WHERE match_key = ?").run(cible.matchKey);
    const r = auJourJ(t, J);
    const avant = complet[J].fiches.find((x) => x.matchKey === cible.matchKey).fiche;
    const apres = r.fiches.find((x) => x.matchKey === cible.matchKey).fiche;
    // Le match suivant du club : l'entraîneur publié le jour J y est vu.
    const suivant = fab.matchs.find((m) => m.date > J && !m.attribue && (m.home === cible.home || m.away === cible.home));
    const lendemain = auJourJ(t, suivant.date).fiches.find((x) => x.matchKey === suivant.matchKey).fiche;
    M.closeDb(fichier);
    const camp = suivant.home === cible.home ? 'home' : 'away';
    s.entraineur = { J, matchKey: cible.matchKey, ficheEgale: JSON.stringify(avant) === JSON.stringify(apres), entraineurAuJourJ: apres.entraineur.home.nom, suivant: suivant.date, entraineurAuMatchSuivant: lendemain.entraineur[camp].nom };
  }
} else if (phase === 'nuit') {
  s.pid = process.pid;
  const database = M.openDb();
  const fab = await magasin(database);
  const N = await imp('data/contexte/contexteNuit.js');
  const { commencerCalculLourd } = await imp('utils/calculLourd.js');
  const clubs = fab.clubs;
  const fichierCalendrier = path.join(dossier, 'calendrier.json');
  // Un nom à une lettre près d'un vrai club (le dernier mot amputé) : jamais rapproché.
  const aDeuxMots = clubs.find((c) => / /.test(c.nom)) ?? clubs[1];
  const typo = aDeuxMots.nom.slice(0, -2);
  const enPlus = [
    { id: 'x1', matchId: 'cal-inconnu', date: '2026-10-04', league: LIGUE, homeName: 'Club Inconnu FC', awayName: clubs[0].nom, status: 'scheduled' },
    { id: 'x2', matchId: 'cal-typo', date: '2026-10-03', league: LIGUE, homeName: typo, awayName: clubs.find((c) => c.id !== aDeuxMots.id).nom, status: 'scheduled' },
    { id: 'x4', matchId: 'cal-reporte', date: '2026-10-05', league: LIGUE, homeName: clubs[6].nom, awayName: clubs[7].nom, status: 'postponed' }
  ];
  const lignesCal = ecrireUnCalendrier(fichierCalendrier, clubs, { de: '2026-09-30', a: '2026-10-20', enPlus });
  s.calendrier = { lignes: lignesCal.length, typo };
  const lire = () => ({
    fiches: database.prepare('SELECT date, home_id, away_id, calcule_le, apres_coup_d_envoi, kickoff_connu, version, match_key, length(facteurs) AS octets FROM contexte_fiches ORDER BY date, home_id, away_id').all().map((r) => ({ ...r })),
    arbitres: database.prepare('SELECT COUNT(*) AS n FROM contexte_arbitres').get().n,
    rencontres: database.prepare('SELECT COUNT(*) AS n FROM contexte_rencontres').get().n,
    etat: database.prepare('SELECT cle FROM contexte_etat ORDER BY cle').all().map((r) => r.cle),
    avantMatch: database.prepare('SELECT fotmob_id, releve_le, avant_match FROM contexte_avant_match ORDER BY fotmob_id').all().map((r) => ({ ...r }))
  });
  const resume = (r) => ({
    mode: r.mode,
    raison: r.raison ?? null,
    erreur: r.erreur ?? null,
    liste: r.liste ?? null,
    fiches: r.ecrites?.fiches ?? null,
    rencontres: r.ecrites?.rencontres ?? null,
    arbitres: r.ecrites?.arbitres ?? null,
    avantMatch: r.avantMatch ?? null,
    elague: r.elague ?? null,
    controle: r.controle ? { lignes: r.controle.lignes, couples: r.controle.couples, ecarts: r.controle.ecarts } : null,
    cache: r.bilan?.cache ?? null,
    passe: r.bilan?.passe ?? null,
    aPart: r.bilan?.aPart ?? null,
    blocMaxMs: r.blocMaxMs ?? null,
    transactions: r.transactions ?? null,
    ordresMax: r.ordresParTransactionMax ?? null
  });
  // L'avant-match resté dans upcoming_lineups (écrit directement, sans l'archive de l'écriture) : une lecture d'avant le
  // coup d'envoi (rattrapée), une d'après (jamais archivée) ; et, pour les matchs joués des deux derniers jours, une
  // archive, une lecture d'après seulement (« perdu »), et rien (« jamais relevé »).
  const joues = fab.matchs.filter((m) => m.date >= '2026-09-28' && m.date <= '2026-09-29');
  const insUp = database.prepare('INSERT INTO upcoming_lineups (fotmob_id, date, kickoff, league, home_id, away_id, home_name, away_name, payload, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const meta = (ko, t) => JSON.stringify({ available: false, meta: { kickoff: ko, temperature: t, windSpeed: 7, weather: 'Rain', referee: { name: 'Arbitre Prévu', country: 'France', yellowCardsPerMatch: 9 } } });
  const m0 = joues[0];
  const m1 = joues[1];
  insUp.run(m0.fotmobId, m0.date, m0.kickoff, m0.league, `fotmob-${m0.home}`, `fotmob-${m0.away}`, 'a', 'b', meta(m0.kickoff, 14), new Date(Date.parse(m0.kickoff) - 3_600_000).toISOString());
  insUp.run(m1.fotmobId, m1.date, m1.kickoff, m1.league, `fotmob-${m1.home}`, `fotmob-${m1.away}`, 'a', 'b', meta(m1.kickoff, 30), new Date(Date.parse(m1.kickoff) + 1_800_000).toISOString());
  s.joues = { total: joues.length, rattrape: m0.fotmobId, apres: m1.fotmobId };
  // Nuit A : le 30/09 à 01 h 30 de Paris, dans un PROCESSUS À PART.
  const A = await N.faireLeContexteDeLaNuit({ maintenant: '2026-09-29T23:30:00.000Z', fichierCalendrier, aPart: true });
  s.nuitA = { ...resume(A), base: lire() };
  // Un échantillon de fiche (la nuit A), décodé.
  const une = database.prepare("SELECT facteurs FROM contexte_fiches WHERE date = '2026-10-03' ORDER BY home_id LIMIT 1").get();
  s.exempleDeFiche = une ? JSON.parse(une.facteurs) : null;
  s.fichesAvecPrecedentPrevu = database.prepare('SELECT facteurs FROM contexte_fiches').all().filter((r) => ['home', 'away'].some((c) => JSON.parse(r.facteurs).repos[c].precedent?.prevu === true)).length;
  // Le jeton du calcul lourd pris par un autre : reportée, rien de rangé.
  const fin = commencerCalculLourd('un autre calcul lourd');
  const R = await N.faireLeContexteDeLaNuit({ maintenant: '2026-09-30T23:30:00.000Z', fichierCalendrier, aPart: true });
  fin();
  s.reporte = { ...resume(R), base: lire() };
  // Un délai dépassé : l'enfant arrêté, rien de rangé.
  const E = await N.faireLeContexteDeLaNuit({ maintenant: '2026-09-30T23:30:00.000Z', fichierCalendrier, aPart: true, delaiMs: 1 });
  s.delai = { ...resume(E), base: lire() };
  // Une nuit interrompue en plein rangement (« en_cours » resté) : la suivante finit et le retire.
  database.prepare("INSERT INTO contexte_etat (cle, valeur) VALUES ('en_cours', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify({ calculeLe: '2026-09-30T23:00:00.000Z' }));
  // Un report : le match du 05/10 entre les clubs 0 et 7 (s'il y en a un au calendrier) déplacé au 12/10.
  const cal = JSON.parse(fs.readFileSync(fichierCalendrier, 'utf8'));
  const deplace = cal.find((l) => l.status === 'scheduled' && l.date === '2026-10-06');
  if (deplace) {
    cal.push({ ...deplace, id: `${deplace.id}-nouveau`, date: '2026-10-13' });
    deplace.status = 'postponed';
    fs.writeFileSync(fichierCalendrier, JSON.stringify(cal));
  }
  s.report = deplace ? { de: '2026-10-06', a: '2026-10-13', homeName: deplace.homeName, awayName: deplace.awayName } : null;
  // Nuit B : le 03/10 (dans ce processus : le même calcul), par tranches de 5.
  const B = await N.faireLeContexteDeLaNuit({ maintenant: '2026-10-02T23:30:00.000Z', fichierCalendrier, aPart: false, tranche: 5 });
  s.nuitB = { ...resume(B), base: lire() };
  // Une rencontre JOUÉE pour une fiche du 03/10 (ajoutée au magasin le 04/10 : la date à un jour près), puis la nuit du 21/11 : rattachement et élagage.
  const f01 = database.prepare("SELECT date, home_id, away_id FROM contexte_fiches WHERE date = '2026-10-03' ORDER BY home_id LIMIT 1").get();
  if (f01) {
    const cle = `fab-joue-${f01.date}-${f01.home_id}-${f01.away_id}`;
    database.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)').run(cle, cle, '2026-10-04', LIGUE, 'x', 'y', `fotmob-${f01.home_id}`, `fotmob-${f01.away_id}`, '9999001', '2026-10-04T23:00:00.000Z', JSON.stringify({ kickoff: '2026-10-04T01:15:00.000Z' }));
    const r = database.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, 2026, ?, ?, ?)').run(cle, '9999001', '2026-10-04', LIGUE, f01.home_id, f01.away_id, '2026-10-04T23:00:00.000Z');
    const ins = database.prepare('INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc) VALUES (?, ?, ?, ?, ?, ?, 2026, 0, 0, 1, 0, 1, ?, ?)');
    ins.run(Number(r.lastInsertRowid), 1, f01.home_id, f01.away_id, '2026-10-04', LIGUE, 1, 0);
    ins.run(Number(r.lastInsertRowid), 0, f01.away_id, f01.home_id, '2026-10-04', LIGUE, 0, 1);
  }
  s.ficheJouee = f01 ? { ...f01 } : null;
  const C = await N.faireLeContexteDeLaNuit({ maintenant: '2026-11-20T23:30:00.000Z', fichierCalendrier, aPart: false });
  s.nuitC = { ...resume(C), base: lire() };
  s.clubs = clubs.map((c) => ({ id: c.id, nom: c.nom, synthetique: c.synthetique, altitude: c.altitude }));
  // T-N8 : une FUITE plantée (l'instantané pris APRÈS la publication du jour J) → des écarts nommés.
  const Cx = await imp('data/contexte/contexteAuJourJ.js');
  const L = await imp('data/contexte/lectureDuMagasin.js');
  const K = await imp('data/contexte/controleDuContexte.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const { lireStades } = await imp('data/reference/donneesDeReference.js');
  const couples = K.tirerLesCouples({ database, jourD: '2026-09-30', graine: 20260930, nombre: 6 });
  const instantanes = new Map();
  const maj = executerSansPause(L.mettreAJourLeCache(database));
  for (const c of couples) {
    const ctx = new Cx.ContexteAuJourJ({ venues: lireStades() });
    executerSansPause(Cx.passerLesRencontres(ctx, L.rencontresChronologiques({ database, cache: maj.cache, jusqua: c.date })));
    const r = L.rencontresAvantMatchDuJour({ database, cache: maj.cache, jour: c.date }).find((x) => x.matchKey === c.matchKey);
    instantanes.set(`${c.matchKey}|${c.camp}`, K.instantaneDeLaPasse(ctx, c, r));
  }
  const fuite = K.controlerLesInstantanes({ database, couples, instantanes });
  s.fuite = { couples: couples.length, lignes: fuite.lignes, ecarts: fuite.ecarts.length, colonnes: [...new Set(fuite.ecarts.map((e) => e.colonne))].sort(), textes: fuite.ecarts.slice(0, 3).map((e) => e.texte) };
} else if (phase === 'archive') {
  const database = M.openDb();
  const N = await imp('data/contexte/contexteNuit.js');
  const ko = '2026-10-10T19:00:00.000Z';
  const ecrire = (fetchedAt, meta, fotmobId = '5550001') =>
    M.upsertUpcomingLineup({ fotmobId, date: '2026-10-10', kickoff: ko, league: LIGUE, homeId: 'fotmob-8456', awayId: 'fotmob-9825', homeName: 'A', awayName: 'B', payload: { available: true, meta: { kickoff: ko, ...meta } }, fetchedAt }, { database });
  const archive = () => database.prepare('SELECT fotmob_id, date, kickoff, home_id, away_id, releve_le, avant_match FROM contexte_avant_match ORDER BY fotmob_id').all().map((r) => ({ ...r, avant_match: JSON.parse(r.avant_match) }));
  const lu = () => database.prepare("SELECT fetched_at, json_extract(payload, '$.meta.temperature') AS t FROM upcoming_lineups WHERE fotmob_id = '5550001'").get();
  const etapes = [];
  ecrire('2026-10-10T16:00:00.000Z', { temperature: 10, windSpeed: 5, weather: 'Rain', stadium: 'Stade A', surface: 'grass', referee: { name: 'Arbitre  A', country: 'France', yellowCardsPerMatch: 4.4, matches: 12 } });
  etapes.push({ quoi: 'lecture 3 h avant', archive: archive(), lu: lu() });
  ecrire('2026-10-10T19:30:00.000Z', { temperature: 25, weather: 'Clear' });
  etapes.push({ quoi: 'lecture 30 min APRÈS le coup d’envoi', archive: archive(), lu: lu() });
  ecrire('2026-10-10T18:00:00.000Z', { temperature: 11, weather: 'Light Rain' });
  etapes.push({ quoi: 'lecture 1 h avant', archive: archive(), lu: lu() });
  ecrire('2026-10-10T17:00:00.000Z', { temperature: 12 });
  etapes.push({ quoi: 'lecture 2 h avant, arrivée après celle d’1 h avant', archive: archive(), lu: lu() });
  ecrire('2026-10-10T16:30:00.000Z', {}, '5550002');
  ecrire('2026-10-10T20:00:00.000Z', { temperature: 20 }, '5550003');
  etapes.push({ quoi: 'une page sans cadre ; une lecture seulement après le coup d’envoi', archive: archive() });
  const g = await (async () => {
    const { executerSansPause } = await imp('utils/travailCooperatif.js');
    return executerSansPause(N.gelerLesAvantMatchs({ database, jourD: '2026-10-11' }));
  })();
  etapes.push({ quoi: 'la nuit (rattrapage)', archive: archive(), rattrapage: { lus: g.lus, archives: g.archives, apresCoupDEnvoi: g.apresCoupDEnvoi, sansCadre: g.sansCadre, dejaArchives: g.dejaArchives } });
  s.etapes = etapes;
} else if (phase === 'ddl') {
  const database = M.openDb();
  const tables = () => database.prepare("SELECT type, name, sql FROM sqlite_master WHERE name LIKE '%contexte%' ORDER BY type, name").all().map((r) => ({ ...r }));
  s.premiere = tables();
  s.indexAttendus = M.indexAttendus().filter((n) => /contexte/.test(n));
  s.indexEnBase = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_contexte%' ORDER BY name").all().map((r) => r.name);
  s.tousLesIndexAttendus = M.indexAttendus().filter((n) => !database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(n));
  const toutAvant = database.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  M.closeDb();
  const db2 = M.openDb();
  const toutApres = db2.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all().map((r) => `${r.type}|${r.name}|${r.sql}`);
  s.secondeOuvertureIdentique = JSON.stringify(toutAvant) === JSON.stringify(toutApres);
  s.entrees = M.__testing.DDL.filter((sql) => /contexte_/.test(String(sql))).map((sql) => String(sql).slice(0, 60));
  s.rencontres = db2.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
}

console.log(JSON.stringify(s));
