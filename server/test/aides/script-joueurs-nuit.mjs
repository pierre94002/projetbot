/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-joueurs-nuit.mjs <serveur de la copie> <options JSON>
 *
 * LA NUIT, L'ARCHIVE ET LA LECTURE DES CHIFFRES DES JOUEURS (étape 34, lot 1b, 03/11/2026), sur un MAGASIN FABRIQUÉ
 * (joueursFabrique.mjs : clubs, joueurs et matchs fabriqués — aucun résultat réel), réseau coupé, heure figée, base NEUVE
 * de la copie. Autour : un calendrier de saison fabriqué (quatre matchs à venir, dont un club inconnu), une compo publiée
 * dans le cache des compositions, une lecture des absents, une révision de la candidate de l'étape 27. Plusieurs nuits
 * de suite et leurs cas — la première (le VRAI processus à part), la suivante (l'archive gardée), le jeton pris
 * (reportée), le délai dépassé, des tranches de 5, une nuit interrompue reprise, la fuite plantée ; l'oracle des tables
 * (l'état de JoueursAuJourJ au jour de la nuit) ; l'enregistreur d'avant-match (relecture, verrou, budget, coup d'envoi) ;
 * la lecture de la page du match (prête, dernière alignée, sans note, clubs inconnus, illisible, avant la première nuit).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { importeur } from './versionsMoteurCommun.mjs';
import { fabriquerLeMagasinDesJoueurs, plusJours, LIGUE } from './joueursFabrique.mjs';

const [serveur, brut] = process.argv.slice(2);
const o = JSON.parse(brut ?? '{}');
const imp = importeur(serveur);
const M = await imp('data/db/matchStatsDb.js');
const N = await imp('data/joueurs/joueursNuit.js');
const E = await imp('data/joueurs/joueursEnfant.js');
const C = await imp('data/joueurs/chiffresDesJoueurs.js');
const R = await imp('data/joueurs/joueursRead.js');
const A = await imp('data/joueurs/avantMatchJoueurs.js');
const NOTE = await imp('data/joueurs/noteDesJoueurs.js');
const { ensureRegistries } = await imp('data/db/identityRegistry.js');
const { commencerCalculLourd } = await imp('utils/calculLourd.js');
const s = { ok: true, pid: process.pid };
const sha1 = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex');

const database = M.openDb();
const fab = fabriquerLeMagasinDesJoueurs(database, {});
const dernier = fab.matchs.at(-1).date;
const instant = Date.parse(`${plusJours(dernier, 1)}T04:00:00.000Z`);
const jourD = N.jourParis(instant);
const demain = plusJours(jourD, 1);
s.jourD = jourD;
s.matchs = fab.matchs.length;
ensureRegistries({ database });

// ------------------------------------------------------------ ce qui entoure la nuit
const KO1 = `${demain}T12:00:00.000Z`; // M1 : 32 h après la nuit (dans les 36 h)
const KO2 = `${demain}T10:00:00.000Z`; // M2 : connu par la lecture des absents
const calendrier = [
  { matchId: 'cal-m1', date: demain, league: LIGUE, homeName: 'Club 7001', awayName: 'Club 7002', status: 'scheduled' },
  { matchId: 'cal-m2', date: demain, league: LIGUE, homeName: 'Club 7003', awayName: 'Club 7004', status: 'scheduled' },
  { matchId: 'cal-m3', date: plusJours(jourD, 3), league: LIGUE, homeName: 'Club 7005', awayName: 'Club 7006', status: 'scheduled' },
  { matchId: 'cal-m4', date: demain, league: LIGUE, homeName: 'Club Inconnu', awayName: 'Club 7007', status: 'scheduled' },
  { matchId: 'cal-m5', date: plusJours(jourD, 2), league: LIGUE, homeName: 'Club 7008', awayName: 'Club 7009', status: 'postponed' }
];
const fichierCalendrier = path.join(process.env.CM_TEST_DOSSIER, 'calendrier-joueurs.json');
fs.writeFileSync(fichierCalendrier, JSON.stringify(calendrier));
/** La dernière feuille d'un club (ses titulaires et trois remplaçants), relue dans le magasin fabriqué. */
function feuilleDe(club) {
  const m = database.prepare('SELECT match_key, home_id FROM matches WHERE (home_id = ? OR away_id = ?) AND home_goals IS NOT NULL ORDER BY date DESC, match_key DESC LIMIT 1').get(`fotmob-${club}`, `fotmob-${club}`);
  const side = m.home_id === `fotmob-${club}` ? 'home' : 'away';
  const lignes = database.prepare('SELECT player_id, name, position, starter FROM players WHERE match_key = ? AND side = ? ORDER BY ord').all(m.match_key, side);
  return { titulaires: lignes.filter((l) => l.starter === 1), banc: lignes.filter((l) => l.starter !== 1).slice(0, 3) };
}
const joueurPage = (l) => ({ id: l.player_id, name: l.name, position: l.position, countryCode: 'FRA', countryName: 'France' });
function pageDe(home, away, { echange = false } = {}) {
  const cote = (club) => {
    const f = feuilleDe(club);
    const tit = f.titulaires.map(joueurPage);
    const banc = f.banc.map(joueurPage);
    if (echange && banc.length) [tit[10], banc[0]] = [banc[0], tit[10]];
    return { teamId: `fotmob-${club}`, teamName: `Club ${club}`, startXI: tit, substitutes: banc, unavailable: [] };
  };
  return { available: true, meta: { kickoff: KO1 }, home: cote(home), away: cote(away) };
}
const ecrireLaCompo = (page, lueLe) =>
  M.upsertUpcomingLineup({ fotmobId: '777001', date: demain, kickoff: KO1, league: LIGUE, homeId: 'fotmob-7001', awayId: 'fotmob-7002', homeName: 'Club 7001', awayName: 'Club 7002', payload: page, fetchedAt: lueLe }, { database });
const LUE1 = new Date(instant - 3_600_000).toISOString();
ecrireLaCompo(pageDe(7001, 7002), LUE1);
const absent = feuilleDe(7003).titulaires[3].player_id;
s.absent = Number(String(absent).replace('fotmob-', ''));
database.prepare("INSERT INTO unavailable_reads (day, fotmob_id, date, kickoff, league, home_id, away_id, home_name, away_name, read_at, origin, status, home_count, away_count) VALUES (?, '777002', ?, ?, ?, 'fotmob-7003', 'fotmob-7004', 'Club 7003', 'Club 7004', ?, 'essai', 'ok', 1, 0)").run(jourD, demain, KO2, LIGUE, new Date(instant - 1_800_000).toISOString());
database.prepare("INSERT INTO unavailable_daily (day, fotmob_id, side, player_key, player_id, player_name, team_id, reason, expected_return, read_at) VALUES (?, '777002', 'home', ?, ?, 'Absent Essai', 'fotmob-7003', 'injury', NULL, ?)").run(jourD, absent, absent, new Date(instant - 1_800_000).toISOString());
const candidate = (revision, enregistreLe, issues) =>
  database
    .prepare("INSERT INTO engine_candidate_picks (candidate_id, fixture_key, market_key, revision, recorded_at, candidate_hash, date, home_id, away_id, market_id, distribution) VALUES ('essai-27', 'f-m1', 'scoreExact', ?, ?, 'h', ?, 'fotmob-7001', 'fotmob-7002', 'scoreExact', ?)")
    .run(revision, enregistreLe, demain, JSON.stringify({ issues, horsGrille: 0 }));
candidate(1, new Date(instant - 7_200_000).toISOString(), { '0-0': 0.1, '1-0': 0.3, '0-1': 0.2, '1-1': 0.4 });
candidate(2, `${demain}T13:00:00.000Z`, { '5-5': 1 }); // APRÈS le coup d'envoi : jamais lue

// ------------------------------------------------------------ la lecture, avant la première nuit
const matchDe = (home, away, date, { league = LIGUE, ids = true } = {}) => ({
  home: `Club ${home}`,
  away: `Club ${away}`,
  league,
  commenceTime: `${date}T12:00:00.000Z`,
  scoreInputs: { home: { teamId: ids ? `fotmob-${home}` : null }, away: { teamId: ids ? `fotmob-${away}` : null } }
});
/** Une lecture mesurée : les ordres passés à la base (aucune écriture), la durée de la seconde lecture. */
function lire(match, { db = database, note = undefined } = {}) {
  const ordres = [];
  const espion = { prepare: (q) => (ordres.push(q.trim().split(/\s+/).slice(0, 6).join(' ')), db.prepare(q)) };
  const args = { match, database: espion, maintenant: instant, ...(note !== undefined ? { note } : {}) };
  const r = R.joueursDuMatch(args);
  const t = performance.now();
  R.joueursDuMatch({ ...args, database: db });
  return { ...r, __mesure: { ordres, deuxieme: performance.now() - t } };
}
s.lectures = { avant: lire(matchDe(7001, 7002, demain)) };

// ------------------------------------------------------------ A. la première nuit, dans le VRAI processus à part
const tables = () => ({
  fiches: database.prepare('SELECT * FROM joueurs_fiches ORDER BY joueur').all().map((r) => ({ ...r })),
  matchs: database.prepare('SELECT * FROM joueurs_matchs ORDER BY rencontre').all().map((r) => ({ ...r })),
  archive: database.prepare('SELECT * FROM joueurs_avant_match ORDER BY rencontre, etat').all().map((r) => ({ ...r })),
  etat: database.prepare('SELECT cle FROM joueurs_etat ORDER BY cle').all().map((r) => r.cle)
});
const resume = (r) => ({
  mode: r.mode,
  erreur: r.erreur ?? null,
  raison: r.raison ?? null,
  ecrites: r.ecrites ?? null,
  bilan: r.bilan ? { fiches: r.bilan.fiches, matchs: r.bilan.matchs, avecBase: r.bilan.avecBase, sansIdentifiant: r.bilan.sansIdentifiant, inconnus: r.bilan.inconnus, archive: r.bilan.archive, aPart: r.bilan.aPart ?? null, durees: r.bilan.durees ?? null } : null,
  controle: r.controle ? { couples: r.controle.couples, lignes: r.controle.lignes, ecarts: r.controle.ecarts } : null,
  transactions: r.transactions ?? null,
  ordresMax: r.ordresParTransactionMax ?? null,
  blocMaxMs: r.blocMaxMs ?? null,
  plusLongueTrancheMs: r.plusLongueTrancheMs ?? null,
  repriseApres: r.repriseApres ?? null
});
const nA = await N.faireLesJoueursDeLaNuit({ maintenant: instant, database, graine: 20261103, fichierCalendrier });
s.nuitA = resume(nA);
const apresA = tables();
s.apresA = { fiches: apresA.fiches.length, matchs: apresA.matchs, archive: apresA.archive, etat: apresA.etat };

// T-N1 : l'oracle — la passe refaite ici, l'état de JoueursAuJourJ au jour de la nuit, comparé aux tables à l'octet.
const passe = E.passeDesJoueurs({ database, periodes: { dernierJourLu: plusJours(jourD, -1) }, surObservation: () => {} });
const accJ = passe.accumulateurs.accJ;
const attendues = [];
for (const [id, j] of accJ.joueurs) {
  if (!j.derniere || j.derniere < plusJours(jourD, -540)) continue;
  attendues.push({ joueur: id, club: j.club, poste: accJ.posteRetenu(id, null) || null, derniere: j.derniere, apparitions: j.n, X: j.X, E: j.E, pen_club: j.penClub, tit: j.tit, entre: j.entre, banc: j.banc });
}
attendues.sort((a, b) => a.joueur - b.joueur);
const rangees = apresA.fiches.map((f) => ({ joueur: f.joueur, club: f.club, poste: f.poste, derniere: f.derniere, apparitions: f.apparitions, X: [f.np_x, f.pen_x, f.sot_x, f.av_x, f.xa_x], E: [f.np_e, f.pen_e, f.sot_e, f.av_e, f.xa_e], pen_club: f.pen_club, tit: [f.tit_min, f.tit_n], entre: [f.entre_min, f.entre_n], banc: [f.banc_n, f.banc_entrees] }));
const reperesRanges = JSON.parse(database.prepare("SELECT valeur FROM joueurs_etat WHERE cle = 'reperes'").get().valeur);
s.oracle = {
  fiches: attendues.length,
  fichesEgales: JSON.stringify(attendues) === JSON.stringify(rangees),
  reperesEgaux: JSON.stringify(JSON.parse(JSON.stringify(E.reperesAuJour(accJ, jourD)))) === JSON.stringify(reperesRanges),
  calculeLe: [...new Set(apresA.fiches.map((f) => f.calcule_le))]
};
// Les entrées d'une compo depuis les fiches = celles de l'accumulateur (joueurs qui ont joué ; sans les faux joueurs).
const page1 = pageDe(7001, 7002);
const compo1 = [...page1.home.startXI.map((j) => ({ id: Number(j.id.replace('fotmob-', '')), poste: { Goalkeeper: 1, Defender: 2, Midfielder: 3, Forward: 4 }[j.position] ?? 0, titulaire: true })), ...page1.home.substitutes.map((j) => ({ id: Number(j.id.replace('fotmob-', '')), poste: { Goalkeeper: 1, Defender: 2, Midfielder: 3, Forward: 4 }[j.position] ?? 0, titulaire: false }))];
const ficheDe = new Map(apresA.fiches.map((f) => [f.joueur, f]));
const deLAcc = accJ.entreesDUneComposition({ cle: 'essai', league: LIGUE, club: 7001, joueurs: compo1, jour: jourD });
const deFiches = C.entreesDepuisLesFiches({ joueurs: compo1, fiches: ficheDe, reperes: reperesRanges, league: LIGUE, club: 7001 });
const t = (x) => ({ id: x.id, poste: x.poste, m: x.m, X: x.X, E: x.E, repere: x.repere });
const r = (x) => ({ id: x.id, poste: x.poste, pEntre: x.pEntre, mEntre: x.mEntre, X: x.X, E: x.E });
s.oracle.entreesEgales = JSON.stringify(deLAcc.titulaires.map(t)) === JSON.stringify(deFiches.titulaires.map(t)) && JSON.stringify(deLAcc.remplacants.filter((x) => x.apparitions > 0).map(r)) === JSON.stringify(deFiches.remplacants.filter((x) => x.apparitions > 0).map(r)) && JSON.stringify(deLAcc.bloc.repere) === JSON.stringify(deFiches.bloc.repere);
s.oracle.titulairesComparés = deLAcc.titulaires.length;

// ------------------------------------------------------------ l'enregistreur d'avant-match
const ligneArchive = (etat) => database.prepare("SELECT * FROM joueurs_avant_match WHERE rencontre LIKE ? AND etat = ?").get(`${demain}|7001|7002`, etat);
const derniereAvant = { ...ligneArchive('derniere-alignee') };
const ko1 = Date.parse(KO1);
s.avantMatch = {};
s.avantMatch.dejaLue = A.tourAvantMatch({ maintenant: ko1 - 60 * 60_000, database });
const LUE2 = new Date(ko1 - 50 * 60_000).toISOString();
ecrireLaCompo(pageDe(7001, 7002, { echange: true }), LUE2);
s.avantMatch.verrou = A.tourAvantMatch({ maintenant: ko1 - 45 * 60_000, database, verrouTenu: () => true });
s.avantMatch.budget = A.tourAvantMatch({ maintenant: ko1 - 45 * 60_000, database, budgetMs: 0, chrono: () => 1 });
s.avantMatch.relue = A.tourAvantMatch({ maintenant: ko1 - 45 * 60_000, database });
s.avantMatch.publiee = { ...ligneArchive('publiee') };
s.avantMatch.derniereInchangee = sha1(derniereAvant) === sha1({ ...ligneArchive('derniere-alignee') });
s.avantMatch.apres = A.tourAvantMatch({ maintenant: ko1 + 5 * 60_000, database });
s.avantMatch.directApres = N.ecrireLArchive(database, { ...s.avantMatch.publiee, compo_lue_le: new Date(ko1 + 60_000).toISOString() }, ko1 + 60_000);
s.avantMatch.sansNote = A.tourAvantMatch({ maintenant: ko1 - 40 * 60_000, database, note: null });
s.avantMatch.publieeFinale = { ...ligneArchive('publiee') };

// ------------------------------------------------------------ la lecture (la page du match)
s.lectures.pret = lire(matchDe(7001, 7002, demain));
s.lectures.derniere = lire(matchDe(7003, 7004, demain));
s.lectures.loin = lire(matchDe(7005, 7006, plusJours(jourD, 3)));
s.lectures.sansNote = lire(matchDe(7001, 7002, demain), { note: null });
s.lectures.clubsInconnus = lire(matchDe(7001, 7002, demain, { ids: false }));
s.lectures.illisible = lire(matchDe(7001, 7002, demain), { db: { prepare: () => { throw new Error('base fermée'); } } });
s.lectures.sansBase = R.joueursDuMatch({ match: matchDe(7001, 7002, demain), database: null });
s.lectures.pasDansLaNuit = lire(matchDe(7010, 7011, demain));
s.note = { statuts: NOTE.JOUEURS_AU_BANC?.statuts ?? null };

// ------------------------------------------------------------ B. la nuit suivante : l'archive n'est jamais réécrite
const avantB = tables();
const nB = await N.faireLesJoueursDeLaNuit({ maintenant: instant + 3_600_000, database, aPart: false, graine: 20261103, fichierCalendrier });
s.nuitB = resume(nB);
const apresB = tables();
s.archiveGardee = JSON.stringify(avantB.archive) === JSON.stringify(apresB.archive);
// Le jeton pris par un autre : reportée, rien de rangé.
const rendre = commencerCalculLourd('un autre calcul lourd');
try {
  s.reporte = resume(await N.faireLesJoueursDeLaNuit({ maintenant: instant + 2 * 3_600_000, database, graine: 20261103, fichierCalendrier }));
} finally {
  rendre();
}
s.reporteInchange = JSON.stringify(tables()) === JSON.stringify(apresB);
// Le délai dépassé : le processus à part arrêté, rien de rangé.
s.delai = resume(await N.faireLesJoueursDeLaNuit({ maintenant: instant + 3 * 3_600_000, database, graine: 20261103, fichierCalendrier, delaiMs: 1 }));
s.delaiInchange = JSON.stringify(tables()) === JSON.stringify(apresB);
// Des tranches de 5, après une nuit interrompue pendant son rangement (« en cours » resté) : reprise et finie.
database.prepare("INSERT INTO joueurs_etat (cle, valeur) VALUES ('en_cours', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(JSON.stringify({ calculeLe: '2023-01-01T00:00:00.000Z' }));
s.lectures.enCours = lire(matchDe(7001, 7002, demain));
const nE = await N.faireLesJoueursDeLaNuit({ maintenant: instant + 4 * 3_600_000, database, aPart: false, graine: 20261103, fichierCalendrier, tranche: 5 });
s.interrompue = resume(nE);
s.interrompueEtat = database.prepare('SELECT cle FROM joueurs_etat ORDER BY cle').all().map((x) => x.cle);
// La fuite plantée : les couples relevés APRÈS la publication de leur journée.
const nF = await N.faireLesJoueursDeLaNuit({ maintenant: instant + 5 * 3_600_000, database, aPart: false, graine: 20261103, fichierCalendrier, fuite: true });
s.fuite = { mode: nF.mode, ecarts: nF.controle?.ecarts?.length ?? 0, colonnes: [...new Set((nF.controle?.ecarts ?? []).map((e) => e.colonne))].sort(), textes: (nF.controle?.ecarts ?? []).slice(0, 4).map((e) => e.texte) };
// Sans note du banc : rien n'est gardé avant les matchs (aucun chiffre), les tables du jour quand même.
const nN = await N.faireLesJoueursDeLaNuit({ maintenant: instant + 6 * 3_600_000, database, aPart: false, graine: 20261103, fichierCalendrier, note: null });
s.sansNote = resume(nN);
// Le résultat de l'étape pour la passe (le résumé, l'alerte durable).
s.etape = N.resultatDeLEtape(nA, { updatedAt: '2026-11-03T23:00:00.000Z' });
s.etapeFuite = N.resultatDeLEtape(nF, { updatedAt: '2026-11-03T23:00:00.000Z' });
s.etapeReporte = N.resultatDeLEtape({ mode: 'reporte', raison: 'Un autre calcul lourd tourne.' });
s.etapeEchec = N.resultatDeLEtape({ mode: 'echec', erreur: 'base absente', dureeMs: 12 });
s.etapeSansNote = N.resultatDeLEtape(nN, { updatedAt: '2026-11-03T23:00:00.000Z' });
void o;
console.log(JSON.stringify(s));
