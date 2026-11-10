/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-debuts-nuit.mjs <serveur de la copie> <phase> <options JSON>
 *
 * LA NUIT DES DÉBUTS DE SAISON (étape 35, lot 1b, 10/11/2026), sur le MAGASIN FABRIQUÉ de debutsNuitFabrique.mjs (forme
 * réelle, aucune donnée réelle), réseau coupé, heure figée, base NEUVE de la copie. Phases :
 *   « nuit »   le magasin, l'annuaire refait, le calendrier de la copie ; LA NUIT dans le VRAI processus à part ; l'oracle
 *              (DebutsAuJourJ rejoué ici, au jour de la nuit : T-N2) ; une seconde nuit six jours plus tard (T-N1) ; le jeton
 *              pris, le délai dépassé (T-N3) ; des tranches de 5, `en_cours`, la reprise (T-N4) ; une fuite plantée (les
 *              instantanés pris APRÈS la publication du jour J : T-N5) ; l'annuaire pas prêt (T-N3) ;
 *   « gel »    T-F5 : les fiches figées jamais réécrites, la première écriture d'après le coup d'envoi marquée, le
 *              rattachement, les orphelines parties, une fiche d'un match joué jamais élaguée (le rangement seul) ;
 *   « casse »  T-N6 : data/debutsDeSaison/debutsNuit.js CASSÉ dans la copie AVANT tout import : l'actualisation se charge, les
 *              étapes du chemin de l'essai 27 y sont, l'étape des débuts sort « en échec » sans lever ;
 *   « ecran »  (debutsEcran.test.mjs) les VRAIES réponses de la lecture (debutsRead.debutsDuMatch, effectifDuClub, la route
 *              GET /api/match-stats/effectif par son contrôleur) après trois nuits dans ce processus, dans l'ordre des jours :
 *              B (02/09/2024 : promu, relégué, nouveaux venus, première saison au magasin), C (01/03/2025 : en saison, une
 *              saison civile), A (la nuit d'essai : début de saison, nouveau venu à effet mesuré, coupe, club inconnu, hors
 *              fenêtre, absent de la nuit) ; un annuaire des joueurs inventé (noms, pays) ; les états illisibles plantés.
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasinDesDebuts, ecrireLeCalendrierDesDebuts, NUIT_D_ESSAI, JOUR_D_ESSAI, VEILLE, SECONDE_NUIT, NOMS } from './debutsNuitFabrique.mjs';

const [serveur, phase, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const s = { ok: true, phase, pid: process.pid };
const FICHIER = process.env.MATCH_STATS_DB;
const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

if (phase === 'casse') {
  // Le module de nuit de l'étape lève au chargement : rien de ce qui charge la passe ne doit en dépendre.
  fs.writeFileSync(path.join(serveur, 'src', 'data', 'debutsDeSaison', 'debutsNuit.js'), "throw new Error('module des débuts cassé (essai)');\n");
  const J = await imp('jobs/matchStatsAutoRefresh.js');
  const cles = J.__testing.ETAPES().map((e) => e.key);
  s.etapes = cles;
  s.etapeDebuts = await J.__debutsPourLesTests.passeDebuts({}, { maintenant: NUIT_D_ESSAI });
  s.cheminEssai = ['gelPronostics', 'moteurABlanc'].map((k) => ({ cle: k, present: cles.includes(k), avant: cles.indexOf(k) < cles.indexOf('debutsDeSaison'), run: typeof J.__testing.ETAPES().find((e) => e.key === k)?.run }));
  process.stdout.write(`${JSON.stringify(s)}\n`);
  process.exit(0);
}

const M = await imp('data/db/matchStatsDb.js');
function magasinNeuf(fichier = FICHIER) {
  for (const x of ['', '-wal', '-shm']) fs.rmSync(fichier + x, { force: true });
  return M.openDb({ file: fichier });
}
const lignes = (db, sql, ...a) => db.prepare(sql).all(...a).map((r) => ({ ...r }));

if (phase === 'nuit') {
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const N = await imp('data/debutsDeSaison/debutsNuit.js');
  const C = await imp('data/debutsDeSaison/controleDesDebuts.js');
  const { DebutsAuJourJ, passerLesRencontres } = await imp('data/debutsDeSaison/debutsAuJourJ.js');
  const { rencontresDuMagasin, minutesParRencontre } = await imp('data/debutsDeSaison/lectureDesDebuts.js');
  const { continuiteDe } = await imp('data/db/squadChanges.js');
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const { seasonOf } = await imp('data/providers/seasonWindows.js');
  const { NUIT } = await imp('data/debutsDeSaison/reglagesDebuts.js');
  const { commencerCalculLourd } = await imp('utils/calculLourd.js');
  const db = magasinNeuf();
  fabriquerLeMagasinDesDebuts(db, { rebuildRegistries });
  const calendrier = ecrireLeCalendrierDesDebuts(path.join(serveur, 'data', 'runtime', 'season-calendar.json'));
  s.tranche = NUIT.tranche;
  // 1. LA NUIT, dans le VRAI processus à part (la base ouverte en lecture seule là-bas).
  const r1 = await N.faireLesDebutsDeLaNuit({ maintenant: NUIT_D_ESSAI, database: db, chemin: FICHIER });
  s.nuit1 = { mode: r1.mode, erreur: r1.erreur ?? null, raison: r1.raison ?? null, ecrites: r1.ecrites ?? null, bilan: r1.bilan ? { ...r1.bilan, durees: undefined, aPart: { pidAPart: r1.bilan.aPart?.pid !== process.pid, rss: (r1.bilan.aPart?.rssMaxOctets ?? 0) > 0 } } : null, controle: r1.controle ?? null, transactions: r1.transactions ?? null };
  s.resultat1 = N.resultatDeLEtape(r1, { updatedAt: NUIT_D_ESSAI });
  s.clubs1 = lignes(db, 'SELECT * FROM debuts_clubs ORDER BY club');
  s.fiches1 = lignes(db, 'SELECT * FROM debuts_fiches ORDER BY date, home_id');
  s.etat1 = lignes(db, 'SELECT cle FROM debuts_etat ORDER BY cle').map((r) => r.cle);
  s.etatNuit1 = N.etatDesDebuts({ database: db });
  // 2. L'ORACLE (T-N2) : DebutsAuJourJ rejoué ici jusqu'à la veille, lu au jour de la nuit (et au jour de chaque fiche).
  const D = new DebutsAuJourJ({ avecForces: true });
  executerSansPause(passerLesRencontres(D, rencontresDuMagasin({ database: db, jusqua: VEILLE, avecResultats: true, minutes: minutesParRencontre(db, { jusqua: VEILLE }) })));
  const ecartsClubs = [];
  for (const c of s.clubs1) {
    const attendu = { saison: null, rang: null, statut: null, ligue_avant: null, continuite: null };
    if (c.league) {
      const lu = D.lireLeClub(c.club, { date: JOUR_D_ESSAI, league: c.league, coupe: false, compte: true, attribue: false });
      Object.assign(attendu, { saison: lu.saison, rang: lu.rang, statut: lu.statut, ligue_avant: lu.ligueAvant });
    } else attendu.saison = c.saison;
    const ms = D.minutesDuClub(c.club, attendu.saison);
    const mav = D.minutesDuClub(c.club, attendu.saison - 1);
    attendu.continuite = ms && mav ? continuiteDe(ms.joueurs, new Set(mav.joueurs.keys())) : null;
    const lu = { saison: c.saison, rang: c.rang, statut: c.statut, ligue_avant: c.ligue_avant, continuite: c.continuite };
    if (JSON.stringify(lu) !== JSON.stringify(attendu)) ecartsClubs.push({ club: c.club, lu, attendu });
  }
  const ecartsFiches = [];
  const parNom = new Map(Object.entries(NOMS).map(([id, nom]) => [nom, Number(id)]));
  const aVenir = calendrier
    .filter((x) => x.status === 'scheduled' && x.date >= JOUR_D_ESSAI && x.date <= plusJours(JOUR_D_ESSAI, 14) && parNom.has(x.homeName) && parNom.has(x.awayName))
    .map((x) => ({ ...x, home: parNom.get(x.homeName), away: parNom.get(x.awayName) }));
  for (const f of s.fiches1) {
    const e = JSON.parse(f.entrees);
    const r = { date: f.date, league: f.league, coupe: false, compte: true, attribue: false };
    const attendus = {};
    for (const [camp, club] of [['home', f.home_id], ['away', f.away_id]]) {
      const lu = D.lireLeClub(club, r);
      // le rang du jour du match : les matchs de championnat déjà au calendrier d'ici là (même championnat, même saison)
      const avant = aVenir.filter((x) => (x.home === club || x.away === club) && x.league === f.league && x.date < f.date && seasonOf(x.league, x.date) === lu.saison).length;
      attendus[camp] = { saison: lu.saison, rang: lu.rang === null ? null : lu.rang + avant, statut: lu.statut, ligueAvant: lu.ligueAvant, treve: lu.treve, remise: lu.remise, n: lu.sommes.n, nx: lu.sommes.nx, tot: Array.from(lu.sommes.tot), sai: Array.from(lu.sommes.sai) };
    }
    const lus = Object.fromEntries(['home', 'away'].map((camp) => [camp, { saison: e[camp].saison, rang: e[camp].rang, statut: e[camp].statut, ligueAvant: e[camp].ligueAvant, treve: e[camp].treve, remise: e[camp].remise, n: e[camp].n, nx: e[camp].nx, tot: e[camp].tot, sai: e[camp].sai }]));
    const ligue = D.moyennes(f.league, f.date, seasonOf(f.league, f.date));
    if (JSON.stringify(lus) !== JSON.stringify(attendus) || JSON.stringify(e.ligue) !== JSON.stringify(ligue)) ecartsFiches.push({ date: f.date, home: f.home_id, lus, attendus });
  }
  s.oracle = { clubs: s.clubs1.length, ecartsClubs, fiches: s.fiches1.length, ecartsFiches: ecartsFiches.slice(0, 3), nEcartsFiches: ecartsFiches.length };
  // 3. LA SECONDE NUIT (six jours plus tard, dans ce processus) : les fiches du jour et d'avant figées, les autres réécrites.
  const r2 = await N.faireLesDebutsDeLaNuit({ maintenant: SECONDE_NUIT, database: db, chemin: FICHIER, aPart: false });
  s.nuit2 = { mode: r2.mode, erreur: r2.erreur ?? null, ecrites: r2.ecrites ?? null, bilan: r2.bilan ? { fiches: r2.bilan.fiches, sansIdentifiant: r2.bilan.sansIdentifiant } : null };
  s.fiches2 = lignes(db, 'SELECT * FROM debuts_fiches ORDER BY date, home_id');
  // 4. LE JETON pris par un autre calcul lourd : « reporté », rien d'écrit (T-N3).
  const avantJeton = lignes(db, 'SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM debuts_fiches')[0];
  const rendre = commencerCalculLourd('autre calcul');
  try {
    const r3 = await N.faireLesDebutsDeLaNuit({ maintenant: '2025-09-15T00:40:00.000Z', database: db, chemin: FICHIER });
    s.reporte = { mode: r3.mode, raison: r3.raison ?? null, resultat: N.resultatDeLEtape(r3), apres: lignes(db, 'SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM debuts_fiches')[0], avant: avantJeton };
  } finally {
    rendre();
  }
  // 5. LE DÉLAI DÉPASSÉ : l'enfant arrêté, rien rangé (T-N3).
  const avant = { fiches: lignes(db, 'SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM debuts_fiches')[0], clubs: lignes(db, 'SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM debuts_clubs')[0], nuit: N.etatDesDebuts({ database: db }).nuit?.calculeLe ?? null };
  const r4 = await N.faireLesDebutsDeLaNuit({ maintenant: '2025-09-16T00:40:00.000Z', database: db, chemin: FICHIER, delaiMs: 1 });
  const apres = { fiches: lignes(db, 'SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM debuts_fiches')[0], clubs: lignes(db, 'SELECT COUNT(*) AS n, MAX(calcule_le) AS c FROM debuts_clubs')[0], nuit: N.etatDesDebuts({ database: db }).nuit?.calculeLe ?? null };
  s.delai = { mode: r4.mode, erreur: r4.erreur ?? null, resultat: N.resultatDeLEtape(r4), avant, apres };
  // 6. LES TRANCHES (5 ici), `en_cours`, LA REPRISE d'une nuit interrompue pendant son rangement (T-N4).
  db.prepare("INSERT INTO debuts_etat (cle, valeur) VALUES ('en_cours', '{\"calculeLe\":\"2025-09-16T00:41:00.000Z\"}') ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run();
  const vus = [];
  const r6 = await N.faireLesDebutsDeLaNuit({
    maintenant: '2025-09-17T00:40:00.000Z',
    database: db,
    chemin: FICHIER,
    aPart: false,
    tranche: 5,
    rendreLaMain: async (ou) => vus.push({ ou: ou ?? null, transaction: db.isTransaction })
  });
  s.reprise = { mode: r6.mode, repriseApres: r6.repriseApres ?? null, transactions: r6.transactions, enCours: lignes(db, "SELECT COUNT(*) AS n FROM debuts_etat WHERE cle = 'en_cours'")[0].n, clubs: r6.ecrites?.clubs ?? null, fiches: r6.ecrites?.fiches ?? null, pauses: vus.length, pausesEnTransaction: vus.filter((v) => v.transaction).length };
  // parTranches seul : la main n'est rendue (yield) qu'ENTRE deux transactions.
  const ordres = Array.from({ length: 12 }, (_, k) => () => db.prepare("INSERT INTO debuts_etat (cle, valeur) VALUES (?, '1') ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(`essai-${k}`));
  const mesure = {};
  const enTransaction = [];
  for (const _ of N.__pourLesTests.parTranches(db, ordres, 5, mesure)) enTransaction.push(db.isTransaction);
  db.prepare("DELETE FROM debuts_etat WHERE cle LIKE 'essai-%'").run();
  s.parTranches = { rendus: enTransaction.length, enTransaction: enTransaction.filter(Boolean).length, transactions: mesure.transactions, finEnTransaction: db.isTransaction };
  // 7. UNE FUITE PLANTÉE (T-N5) : les instantanés pris APRÈS la publication du jour J (le jour J déjà compté) → écarts nommés.
  const couples = C.tirerLesCouples({ database: db, jourD: JOUR_D_ESSAI, graine: C.graineDuJour(JOUR_D_ESSAI) });
  const parJour = new Map();
  for (const c of couples) parJour.set(c.date, [...(parJour.get(c.date) ?? []), c]);
  const D2 = new DebutsAuJourJ({ avecForces: true });
  const instantanes = new Map();
  executerSansPause(
    passerLesRencontres(D2, rencontresDuMagasin({ database: db, jusqua: VEILLE, avecResultats: true, minutes: minutesParRencontre(db, { jusqua: VEILLE }) }), {
      apres: (jour, duJour) => {
        for (const c of parJour.get(jour) ?? []) {
          const r = duJour.find((x) => x.cle === c.matchKey);
          if (r) instantanes.set(`${c.matchKey}|${c.camp}`, C.instantaneDuClub(D2, c, { ...r, date: plusJours(jour, 1) }));
        }
      }
    })
  );
  const fuite = C.controlerLesInstantanes({ database: db, couples, instantanes, nomDuClub: C.nomDuClubParLAnnuaire(db) });
  s.fuite = { couples: couples.length, lignes: fuite.lignes, ecarts: fuite.ecarts.length, colonnes: [...new Set(fuite.ecarts.map((e) => e.colonne))].sort(), premiers: fuite.ecarts.slice(0, 3).map((e) => e.texte) };
  const controleFuite = { couples: couples.length, lignes: fuite.lignes, ecarts: fuite.ecarts };
  s.alerteFuite = N.alerteDesDebuts({ controle: controleFuite, updatedAt: NUIT_D_ESSAI });
  s.resultatFuite = N.resultatDeLEtape({ mode: 'complet', bilan: r1.bilan, ecrites: r1.ecrites, controle: controleFuite }, { updatedAt: NUIT_D_ESSAI });
  db.close();
  // 8. L'ANNUAIRE PAS PRÊT (des joueurs, aucun annuaire : la reconstruction voudrait écrire, la base de l'enfant est en lecture
  // seule) : la nuit est REPORTÉE, jamais « tous les clubs inconnus ».
  const autre = path.join(path.dirname(FICHIER), 'sans-annuaire.db');
  const db2 = magasinNeuf(autre);
  fabriquerLeMagasinDesDebuts(db2, {});
  db2.close();
  const r7 = await N.faireLesDebutsDeLaNuit({ maintenant: NUIT_D_ESSAI, database: M.openDb({ file: autre }), chemin: autre });
  s.annuaire = { mode: r7.mode, raison: r7.raison ?? null, erreur: r7.erreur ?? null, resultat: N.resultatDeLEtape(r7) };
}

if (phase === 'gel') {
  const N = await imp('data/debutsDeSaison/debutsNuit.js');
  const db = magasinNeuf();
  // Deux rencontres JOUÉES : 1-2 le 01/07/2025, 9-10 le 04/07/2025 (la fiche du 03/07 s'y rattache, à un jour près).
  const insDay = db.prepare("INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away) VALUES (?, ?, ?, 'EPL', 2025, ?, ?)");
  const insTeam = db.prepare("INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc) VALUES (?, ?, ?, ?, ?, 'EPL', 2025, 0, 0, 1, 0, 1, 1, 0)");
  for (const [cle, date, h, a] of [['joue-1-2', '2025-07-01', 1, 2], ['joue-9-10', '2025-07-04', 9, 10]]) {
    const r = Number(insDay.run(cle, cle, date, h, a).lastInsertRowid);
    insTeam.run(r, 1, h, a, date);
    insTeam.run(r, 0, a, h, date);
  }
  const fiche = (date, home, away, calcule, extra = {}) => ({ date, home_id: home, away_id: away, league: 'EPL', match_id: null, kickoff: null, kickoff_connu: 0, calcule_le: calcule, version: 1, note: null, entrees: JSON.stringify({ calcule }), bras: null, ...extra });
  const I1 = '2025-06-20T00:40:00.000Z';
  const I2 = '2025-07-01T21:00:00.000Z';
  const ranger = (fiches, instant, jourD) => {
    const g = N.rangerLesFiches({ database: db, fiches, instant: Date.parse(instant), jourD, tranche: 2 });
    let x = g.next();
    while (!x.done) x = g.next();
    return x.value;
  };
  const premiere = ranger(
    [
      fiche('2025-07-01', 1, 2, I1),
      fiche('2025-07-02', 3, 4, I1),
      fiche('2025-07-03', 9, 10, I1),
      fiche('2025-07-05', 5, 6, I1, { kickoff: '2025-07-01T18:00:00.000Z', kickoff_connu: 1 }),
      fiche('2025-07-08', 11, 12, I1)
    ],
    I1,
    '2025-06-20'
  );
  const seconde = ranger(
    [
      fiche('2025-07-01', 1, 2, I2),
      fiche('2025-07-05', 5, 6, I2, { kickoff: '2025-07-01T18:00:00.000Z', kickoff_connu: 1 }),
      fiche('2025-07-08', 11, 12, I2),
      fiche('2025-07-01', 7, 8, I2)
    ],
    I2,
    '2025-07-01'
  );
  s.rangement = { premiere, seconde };
  s.fiches = lignes(db, 'SELECT date, home_id, away_id, calcule_le, entrees, apres_coup_d_envoi, match_key FROM debuts_fiches ORDER BY date, home_id');
  // Une fiche d'un match JOUÉ que le rattachement ne trouve pas (les camps inversés : 10-9 au lieu de 9-10, le 04/07) :
  // l'élagage relit team_day au moment de retirer, et la garde.
  db.prepare("INSERT INTO debuts_fiches (date, home_id, away_id, league, calcule_le, version, entrees) VALUES ('2025-07-04', 10, 9, 'EPL', ?, 1, '{}')").run(I1);
  // Le rattachement puis l'élagage, 45 jours après : les fiches des matchs joués rattachées et gardées, les orphelines parties.
  const g = N.rattacherEtElaguer({ database: db, jourD: '2025-08-15', tranche: 2 });
  let x = g.next();
  while (!x.done) x = g.next();
  s.elagage = x.value;
  s.apres = lignes(db, 'SELECT date, home_id, away_id, match_key FROM debuts_fiches ORDER BY date, home_id');
  db.close();
}

if (phase === 'ecran') {
  const { rebuildRegistries } = await imp('data/db/identityRegistry.js');
  const N = await imp('data/debutsDeSaison/debutsNuit.js');
  const R = await imp('data/debutsDeSaison/debutsRead.js');
  const { DEBUTS_AU_BANC } = await imp('data/debutsDeSaison/noteDesDebuts.js');
  const { getEffectif } = await imp('api/controllers/effectif.controller.js');
  const db = magasinNeuf();
  fabriquerLeMagasinDesDebuts(db, { rebuildRegistries });
  // L'annuaire des joueurs, INVENTÉ (aucun vrai joueur) : des noms et des pays pour Bocage United (2), Causses City (3) et
  // 1001 ; certains sans pays (pas de drapeau, jamais une requête pour le chercher). Pas de date de naissance de plus (aucun
  // double inventé : seuls 3015 et 3099 partagent la leur).
  const NOMS_JOUEURS = { 2005: ['Émile Varenne', 'FRA', 'France'], 2007: ['Jonas Lindqvist', 'SWE', 'Sweden'], 3015: ['Tomás Arriaga', 'ARG', 'Argentina'], 3099: ['Tomas Arriaga', 'ARG', 'Argentina'], 1001: ['Kofi Mensah', 'GHA', 'Ghana'] };
  for (let k = 1; k <= 15; k++) {
    NOMS_JOUEURS[2000 + k] ??= [`Bocage ${k}`, k % 3 ? 'ENG' : null, k % 3 ? 'England' : null];
    NOMS_JOUEURS[3000 + k] ??= [`Causses ${k}`, k % 4 ? 'WAL' : null, k % 4 ? 'Wales' : null];
  }
  const insPeople = db.prepare(
    "INSERT INTO people (player_id, name, slug, team_id, team_name, first_seen, last_seen, appearances, updated_at) VALUES (?, ?, ?, NULL, NULL, '2023-08-12', '2025-09-06', 10, '2025-09-07T00:00:00.000Z') ON CONFLICT(player_id) DO UPDATE SET name = excluded.name, slug = excluded.slug"
  );
  const insPays = db.prepare(
    "INSERT INTO player_birthdates (player_id, birth_date, country_code, country_name, source, fetched_at) VALUES (?, NULL, ?, ?, 'essai', '2025-09-01T00:00:00.000Z') ON CONFLICT(player_id) DO UPDATE SET country_code = excluded.country_code, country_name = excluded.country_name"
  );
  for (const [j, [nom, code, pays]] of Object.entries(NOMS_JOUEURS)) {
    insPeople.run(`fotmob-${j}`, nom, nom.toLowerCase().replace(/\s+/g, '-'));
    if (code) insPays.run(`fotmob-${j}`, code, pays);
  }
  const ligneCal = (date, league, h, a) => ({ id: `cal-${date}-${h}-${a}`, matchId: `cal-${date}-${h}-${a}`, date, league, homeName: typeof h === 'number' ? NOMS[h] : h, awayName: typeof a === 'number' ? NOMS[a] : a, status: 'scheduled', homeGoals: null, awayGoals: null, round: null, source: 'fotmob', updatedAt: `${date}T00:00:00.000Z` });
  const calendrier = (nom, lignesCal) => {
    const f = path.join(path.dirname(FICHIER), `calendrier-${nom}.json`);
    fs.writeFileSync(f, JSON.stringify(lignesCal));
    return f;
  };
  /** Le match de l'analyse : les identifiants par scoreInputs (« fotmob-N »), un club inconnu sans identifiant. */
  const m = (date, league, h, a) => ({ commenceTime: `${date}T14:00:00.000Z`, league, home: typeof h === 'number' ? NOMS[h] : h, away: typeof a === 'number' ? NOMS[a] : a, scoreInputs: { home: { teamId: typeof h === 'number' ? `fotmob-${h}` : null }, away: { teamId: typeof a === 'number' ? `fotmob-${a}` : null } } });
  const lire = (match, maintenant, extra = {}) => {
    const t0 = performance.now();
    const r = R.debutsDuMatch({ match, database: db, maintenant, ...extra });
    return { r: JSON.parse(JSON.stringify(r)), ms: performance.now() - t0, match };
  };
  const effectif = (club, extra = {}) => {
    const t0 = performance.now();
    const r = R.effectifDuClub({ club, database: db, ...extra });
    return { r: JSON.parse(JSON.stringify(r)), ms: performance.now() - t0 };
  };
  const nuit = async (maintenant, fichierCalendrier) => {
    const r = await N.faireLesDebutsDeLaNuit({ maintenant, database: db, chemin: FICHIER, aPart: false, fichierCalendrier });
    return { mode: r.mode, erreur: r.erreur ?? null, raison: r.raison ?? null, fiches: r.ecrites?.fiches ?? null, clubs: r.ecrites?.clubs ?? null, controle: r.controle ? { couples: r.controle.couples, ecarts: r.controle.ecarts.length } : null };
  };
  s.lectures = {};
  s.effectifs = {};
  s.nuits = {};
  // 0. AVANT TOUTE NUIT : « pas encore calculé » (la première nuit), jamais « 0 ».
  s.lectures.premiereNuit = lire(m('2024-09-07', 'EPL', 11, 1), '2024-09-01T10:00:00.000Z');
  s.effectifs.premiereNuit = effectif('fotmob-2');
  // 1. LA NUIT B (02/09/2024) : promu, relégué, nouveaux venus, première saison du championnat au magasin.
  s.nuits.B = await nuit('2024-09-02T00:40:00.000Z', calendrier('B', [ligneCal('2024-09-07', 'EPL', 11, 1), ligneCal('2024-09-07', 'Championship', 5, 15), ligneCal('2024-09-08', 'Championship', 21, 22), ligneCal('2024-09-14', 'Championship', 6, 21), ligneCal('2024-09-07', 'Allsvenskan - Sweden', 31, 32)]));
  const B = '2024-09-02T10:00:00.000Z';
  s.lectures.promu = lire(m('2024-09-07', 'EPL', 11, 1), B);
  s.lectures.relegue = lire(m('2024-09-07', 'Championship', 5, 15), B);
  s.lectures.nouveaux = lire(m('2024-09-08', 'Championship', 21, 22), B);
  s.lectures.releguesEtNouveau = lire(m('2024-09-14', 'Championship', 6, 21), B);
  s.lectures.premier = lire(m('2024-09-07', 'Allsvenskan - Sweden', 31, 32), B);
  s.effectifs.promu = effectif('fotmob-11');
  s.effectifs.premier = effectif('fotmob-31');
  // 2. LA NUIT C (01/03/2025) : deux clubs en saison (11e match), une saison civile en début de saison.
  s.nuits.C = await nuit('2025-03-01T00:40:00.000Z', calendrier('C', [ligneCal('2025-03-08', 'Serie A - Italy', 61, 62), ligneCal('2025-03-08', 'Primera División - Argentina', 41, 42)]));
  const C = '2025-03-01T10:00:00.000Z';
  s.lectures.enSaison = lire(m('2025-03-08', 'Serie A - Italy', 61, 62), C);
  s.lectures.civile = lire(m('2025-03-08', 'Primera División - Argentina', 41, 42), C);
  s.effectifs.enSaison = effectif('fotmob-61');
  // 3. LA NUIT A (la nuit d'essai, 08/09/2025) : le calendrier de la nuit.
  s.nuits.A = await nuit(NUIT_D_ESSAI, (() => {
    const f = path.join(path.dirname(FICHIER), 'calendrier-A.json');
    ecrireLeCalendrierDesDebuts(f);
    return f;
  })());
  const A = '2025-09-08T10:00:00.000Z';
  s.lectures.debut = lire(m('2025-09-13', 'EPL', 1, 2), A);
  s.lectures.nouveau = lire(m('2025-09-13', 'Championship', 14, 5), A);
  s.lectures.coupe = lire(m('2025-09-17', 'EFL Cup', 1, 21), A);
  s.lectures.inconnu = lire(m('2025-09-16', 'Championship', 'Ombres Inconnues FC', 6), A);
  // Un club sans identifiant au nom proche d'un club connu (« Bocage United FC » / Bocage United) : jamais les chiffres de l'autre.
  s.lectures.procheDUnAutre = lire(m('2025-09-20', 'EPL', 'Bocage United FC', 3), A);
  s.lectures.hors = lire(m('2025-09-27', 'EPL', 1, 3), A);
  s.lectures.absent = lire(m('2025-09-13', 'EPL', 2, 4), A);
  s.lectures.ligaMx = lire(m('2025-09-08', 'Liga MX', 51, 53), A);
  s.lectures.serieA = lire(m('2025-09-14', 'Serie A - Italy', 61, 62), A);
  // La lecture passe par scoreInputs.home/away.teamId, jamais par les noms : d'autres noms, mêmes identifiants → la même fiche ;
  // les noms seuls (sans scoreInputs) → club non reconnu.
  s.lectures.parIdentifiants = lire({ ...m('2025-09-13', 'EPL', 1, 2), home: 'Un autre nom', away: 'Encore un autre' }, A);
  s.lectures.nomsSeuls = lire({ commenceTime: '2025-09-13T14:00:00.000Z', league: 'EPL', home: NOMS[1], away: NOMS[2] }, A);
  // Le banc autrement (la note est un paramètre de la lecture ; la vraie n'est jamais touchée) : sans note, et le rappel utile.
  s.lectures.sansNote = lire(m('2025-09-13', 'EPL', 1, 2), A, { note: null });
  const rappelUtile = JSON.parse(JSON.stringify(DEBUTS_AU_BANC));
  rappelUtile.familles.rappel = { ...rappelUtile.familles.rappel, utile: true, fenetre: 'magasin', prudent: true };
  rappelUtile.utiles = ['rappel', ...rappelUtile.utiles];
  Object.assign(rappelUtile.variantes.find((v) => v.id === 'magasin-rappel-sans-cote'), { verdict: 'retenu', gainRelatif: 0.0042, fourchetteRelative: [0.0021, 0.0063], ampleur: { max: 0.018, marche: 'dom15' } });
  s.lectures.rappelUtile = lire(m('2025-09-13', 'EPL', 1, 2), A, { note: rappelUtile });
  for (const club of [2, 3, 5, 14, 61, 99, 12345]) s.effectifs[`c${club}`] = effectif(`fotmob-${club}`);
  s.effectifs.nombre = effectif(2);
  s.effectifs.sansIdentifiant = effectif(null);
  s.effectifs.zero = effectif('fotmob-0');
  s.effectifs.nom = effectif('Bocage United');
  // 4. LA ROUTE, par son contrôleur (la réponse telle que l'interface la reçoit) ; un paramètre qui n'est pas un identifiant.
  const route = async (query) => {
    const res = { code: 200, corps: null, status(c) { this.code = c; return this; }, json(x) { this.corps = JSON.parse(JSON.stringify(x)); return this; } };
    try {
      await getEffectif({ query }, res);
      return { code: res.code, corps: res.corps };
    } catch (error) {
      return { code: error.status ?? error.statusCode ?? 500, message: error.message };
    }
  };
  s.route = { c2: await route({ club: 'fotmob-2' }), c3: await route({ club: '3' }), c5: await route({ club: 'fotmob-5' }), c14: await route({ club: 'fotmob-14' }), c61: await route({ club: 'fotmob-61' }), c99: await route({ club: 'fotmob-99' }), nom: await route({ club: 'Bocage United' }), vide: await route({}) };
  // 5. LES ÉTATS ILLISIBLES, plantés un à un puis retirés : une base qui ne répond plus, une fiche ou une ligne d'une autre
  // version, un JSON illisible.
  const enPanne = { prepare() { throw new Error('base fermée (essai)'); } };
  s.lectures.basePanne = { r: JSON.parse(JSON.stringify(R.debutsDuMatch({ match: m('2025-09-13', 'EPL', 1, 2), database: enPanne, maintenant: A }))) };
  s.effectifs.basePanne = { r: JSON.parse(JSON.stringify(R.effectifDuClub({ club: 'fotmob-2', database: enPanne }))) };
  const planter = (sql, retour, f) => {
    db.prepare(sql).run();
    try {
      return f();
    } finally {
      db.prepare(retour).run();
    }
  };
  const fiche12 = lignes(db, "SELECT id, version, entrees FROM debuts_fiches WHERE date = '2025-09-13' AND home_id = 1 AND away_id = 2")[0];
  s.lectures.autreVersion = planter(`UPDATE debuts_fiches SET version = 99 WHERE id = ${fiche12.id}`, `UPDATE debuts_fiches SET version = ${fiche12.version} WHERE id = ${fiche12.id}`, () => lire(m('2025-09-13', 'EPL', 1, 2), A));
  db.prepare("CREATE TEMP TABLE garde_entrees AS SELECT id, entrees FROM debuts_fiches WHERE id = ?").run(fiche12.id);
  s.lectures.ficheIllisible = planter(`UPDATE debuts_fiches SET entrees = '{oups' WHERE id = ${fiche12.id}`, `UPDATE debuts_fiches SET entrees = (SELECT entrees FROM garde_entrees) WHERE id = ${fiche12.id}`, () => lire(m('2025-09-13', 'EPL', 1, 2), A));
  db.prepare("CREATE TEMP TABLE garde_club AS SELECT club, mouvements, version FROM debuts_clubs WHERE club IN (2, 3)").run();
  s.lectures.ligneIllisible = planter("UPDATE debuts_clubs SET mouvements = '{oups' WHERE club = 2", 'UPDATE debuts_clubs SET mouvements = (SELECT mouvements FROM garde_club WHERE club = 2) WHERE club = 2', () => lire(m('2025-09-13', 'EPL', 1, 2), A));
  s.effectifs.ligneIllisible = planter("UPDATE debuts_clubs SET mouvements = '{oups' WHERE club = 2", 'UPDATE debuts_clubs SET mouvements = (SELECT mouvements FROM garde_club WHERE club = 2) WHERE club = 2', () => effectif('fotmob-2'));
  s.effectifs.autreVersion = planter('UPDATE debuts_clubs SET version = 99 WHERE club = 3', 'UPDATE debuts_clubs SET version = (SELECT version FROM garde_club WHERE club = 3) WHERE club = 3', () => effectif('fotmob-3'));
  s.relu = { debut: lire(m('2025-09-13', 'EPL', 1, 2), A).r.etat, c2: effectif('fotmob-2').r.etat, c3: effectif('fotmob-3').r.etat };
  s.annuaire = Object.fromEntries(Object.entries(NOMS_JOUEURS).map(([j, [nom, code]]) => [j, { nom, code }]));
  db.close();
}

process.stdout.write(`${JSON.stringify(s)}\n`);
