/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-simulation-nuit.mjs <serveur de la copie> <phase>
 *
 * Étape 28 — LES DEUX ÉTAPES DE NUIT DE LA SIMULATION sur la copie de la base d'essai (réseau coupé, heure figée).
 * Ce script ne juge rien : il plante (test/aides/simulationFabrique.mjs), lance les vraies fonctions de nuit et rend ce
 * qu'elles ont rangé ; les attentes sont recalculées par le TEST (test/simulationNuit.test.mjs).
 * Phases :
 *   saisons    T9 : la nuit à D (à part, les 48 championnats) ; la base « entière » (rencontres, forces et calendrier
 *              d'après D) puis tronquée à D redonnent les mêmes octets ; un 9-0 planté le jour D sans effet ; un club à
 *              une rencontre de plus dans la table → refusé, nommé ; une table orpheline ignorée ; B8 : l'enjeu figé
 *              après le coup d'envoi, une rencontre reportée (ligne neuve, l'ancienne jamais lue) ;
 *   loi        T9 bis : la loi affichée (95 % → forces, 85 % → table et sa phrase, forces de D − 4 → table) ; l'enjeu
 *              d'une rencontre garde la loi de sa ligne ;
 *   matchs     T10, B5 : la nuit des matchs (trois rencontres cotées, une du calendrier seul demain, une aujourd'hui),
 *              les fuites plantées (un λ d'après-match, un calcule_le après le coup d'envoi), 40 rencontres refaites,
 *              le rangement par tranches (aucune transaction ouverte quand on rend la main) ;
 *   garde      T16, B4 : « maintenant » obligatoire ; un calcul lourd en cours → reporté ; délai dépassé → enfant
 *              arrêté, rien rangé ; rangement interrompu → en_cours, la nuit d'avant lue, repris ; enfants sans
 *              écriture ;
 *   principal  « un seul principal » : le jugement principal pris une fois à l'horizon, jamais refait ;
 *   retention  B11 : l'élagage des déroulés et des fins de saison.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { planterUnChampionnat, planterLesForces, instantaneDesSaisons, LIGUE_ESSAI, EMPREINTE_ESSAI } from './simulationFabrique.mjs';
import { avecLeModele } from './modeleDeButsCommun.mjs';
import { recopierScripts } from './claudeSimule.mjs';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const SN = await imp('data/simulation/simulationNuit.js');
const SR = await imp('data/simulation/simulationRead.js');
const ES = await imp('data/simulation/etatSimulation.js');
const { CALENDAR_FILE_PATH } = await imp('data/repositories/seasonCalendarRepository.js');
if (!path.resolve(CALENDAR_FILE_PATH).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error('calendrier hors de la copie');
const ecrireCalendrier = (liste) => {
  fs.mkdirSync(path.dirname(CALENDAR_FILE_PATH), { recursive: true });
  fs.writeFileSync(CALENDAR_FILE_PATH, JSON.stringify(liste));
};
const sortie = { ok: true, phase };
const D = '2026-10-20';
const M = '2026-10-20T01:00:00.000Z';
const RELEVE = '2026-10-19T20:00:00.000Z';
const L = LIGUE_ESSAI;

// ======================================================================== saisons (T9, B8)
if (phase === 'saisons') {
  const P = planterUnChampionnat(db, { n: 20, jouees: 3, jourD: D, releveLe: RELEVE, aVenir: 4 });
  ecrireCalendrier(P.calendrier);
  planterLesForces(db, { clubs: P.clubs, jour: '2026-10-19', calculeLe: '2026-10-19T03:00:00.000Z' });
  // A. La nuit à D, à part, les 48 championnats.
  const A = await SN.simulerLesSaisonsDeLaNuit({ maintenant: M, aPart: true, n: 2000 });
  const instA = instantaneDesSaisons(db, { calculeLe: M });
  const etatA = db.prepare('SELECT * FROM saisons_etat WHERE league = ? AND calcule_le = ?').get(L, M);
  sortie.A = {
    mode: A.mode,
    erreur: A.erreur ?? null,
    championnats: A.bilan?.championnats,
    simules: A.bilan?.simules,
    nonCalcules: A.bilan?.nonCalcules?.length,
    forces: A.forces,
    rss: A.bilan?.aPart?.rssMaxOctets ?? null,
    etat: etatA,
    enjeux: db.prepare('SELECT loi, COUNT(*) n, MIN(date) du, MAX(date) au FROM enjeux_rencontres WHERE league = ? AND calcule_le = ? GROUP BY loi ORDER BY loi').all(L, M),
    familles: db.prepare('SELECT loi, famille, COUNT(*) n, ROUND(SUM(probabilite), 6) somme FROM saisons_simulees WHERE league = ? AND calcule_le = ? GROUP BY loi, famille ORDER BY loi, famille').all(L, M),
    nuit: ES.lireEtat({ database: db }).nuits.saisons?.calculeLe ?? null,
    enCours: ES.lireEtat({ database: db }).enCours.saisons
  };
  sortie.planté = { joues: P.joues.length, calendrier: P.calendrier.length, clubs: P.clubs.map((c) => c.numero) };
  const nuit = (extra = {}) => SN.simulerLesSaisonsDeLaNuit({ maintenant: M, aPart: false, n: 2000, ligues: [L], ...extra });
  // B. La base « entière » : des rencontres jouées APRÈS D (la journée 4), des forces de jour > D, le calendrier qui les dit finies.
  const journee4 = P.calendrier.filter((e) => e.round === 'Journée 4');
  const inserer = db.prepare("INSERT OR REPLACE INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const idDe = (nom) => P.clubs.find((c) => c.nom === nom).teamId;
  journee4.forEach((e, k) => inserer.run(`apres-${k}`, `apres-${k}`, e.date, L, e.homeName, e.awayName, idDe(e.homeName), idDe(e.awayName), 3, k % 3, JSON.stringify({ round: '4', leagueKey: 'FRA|Ligue 2' })));
  // Des forces datées du jour D LUI-MÊME (les rencontres de D comptées) et d'après : lues avec « jour <= D », elles feraient fuir.
  for (const jourApres of [D, '2026-10-22']) db.prepare("INSERT OR REPLACE INTO forces_buts (reglages, club, jour, ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd) SELECT reglages, club, ?, ligue, n + 1, nx + 1, sa * 3, wa, sd * 0.2, wd, sga * 3, wga, sgd * 0.2, wgd FROM forces_buts WHERE reglages = ? AND jour = '2026-10-19'").run(jourApres, EMPREINTE_ESSAI);
  ecrireCalendrier(P.calendrier.map((e) => (e.round === 'Journée 4' ? { ...e, status: 'finished', homeGoals: 3, awayGoals: 1 } : e)));
  const B = await nuit();
  sortie.B = { mode: B.mode, identique: instantaneDesSaisons(db, { calculeLe: M }) === instA };
  // C. Tronquée à D : tout ce qui est daté du jour D ou après supprimé, le calendrier remis.
  db.prepare('DELETE FROM matches WHERE league = ? AND date >= ?').run(L, D);
  db.prepare('DELETE FROM forces_buts WHERE jour >= ?').run(D);
  ecrireCalendrier(P.calendrier);
  const C = await nuit();
  sortie.C = { mode: C.mode, identique: instantaneDesSaisons(db, { calculeLe: M }) === instA };
  // D. Un 9-0 planté LE JOUR D (club A contre club B) : sans effet (date < D strict).
  inserer.run('neuf-zero', 'neuf-zero', D, L, P.clubs[0].nom, P.clubs[1].nom, P.clubs[0].teamId, P.clubs[1].teamId, 9, 0, JSON.stringify({ round: '4', leagueKey: 'FRA|Ligue 2' }));
  const D9 = await nuit();
  sortie.neufZero = { mode: D9.mode, identique: instantaneDesSaisons(db, { calculeLe: M }) === instA, auMagasin: db.prepare('SELECT COUNT(*) n FROM matches WHERE match_key = ?').get('neuf-zero').n };
  db.prepare("DELETE FROM matches WHERE match_key = 'neuf-zero'").run();
  // E. Un club à une rencontre de plus dans la table que dans le magasin avant D : refusé, nommé.
  const tableBrute = db.prepare('SELECT rows FROM standings_official WHERE league = ? AND season = 2026').get(L).rows;
  const fautive = JSON.parse(tableBrute).map((r) => (r.teamName === 'Essai C' ? { ...r, played: r.played + 1 } : r));
  db.prepare('UPDATE standings_official SET rows = ? WHERE league = ? AND season = 2026').run(JSON.stringify(fautive), L);
  const E = await nuit();
  sortie.unDePlus = { mode: E.mode, etat: db.prepare('SELECT complet, raison FROM saisons_etat WHERE league = ? AND calcule_le = ?').get(L, M), probas: db.prepare('SELECT COUNT(*) n FROM saisons_simulees WHERE league = ? AND calcule_le = ?').get(L, M).n };
  db.prepare('UPDATE standings_official SET rows = ? WHERE league = ? AND season = 2026').run(tableBrute, L);
  // F. Une table ORPHELINE (le même classement sous un autre nom, relevé deux heures plus tôt, autres chiffres) : ignorée.
  db.prepare("INSERT INTO standings_official (league, season, table_name, ord, fetched_at, rows) VALUES (?, 2026, 'Ligue 2 (ancien nom)', 0, ?, ?)").run(L, '2026-10-19T18:00:00.000Z', JSON.stringify(JSON.parse(tableBrute).map((r) => ({ ...r, points: r.points + 5 }))));
  const F = await nuit();
  sortie.orpheline = { mode: F.mode, identique: instantaneDesSaisons(db, { calculeLe: M }) === instA };
  db.prepare("DELETE FROM standings_official WHERE table_name = 'Ligue 2 (ancien nom)'").run();
  // G. L'enjeu FIGÉ et la rencontre REPORTÉE : la nuit du lendemain (D2), une rencontre de la journée 5 déplacée de 3 jours.
  const remise = await nuit();
  const j5 = P.calendrier.filter((e) => e.round === 'Journée 5');
  const reportee = j5[0];
  const nouvelleDate = '2026-10-31';
  // Le report tel que FotMob l'écrit (vérification du 27/10, constat 1) : l'entrée d'origine GARDÉE, statut « postponed »
  // à l'ancienne date, PUIS une entrée « scheduled » à la nouvelle date — deux matchId, deux identifiants (Sheffield
  // Wednesday – Stevenage au calendrier du 24/10 : 26/09 « postponed » puis 13/04/2027 « scheduled »).
  const nouvelleEntree = { ...reportee, id: `${reportee.id}-nouvelle-date`, matchId: reportee.matchId.replace(reportee.date, nouvelleDate), date: nouvelleDate, status: 'scheduled' };
  ecrireCalendrier([...P.calendrier.map((e) => (e.id === reportee.id ? { ...e, status: 'postponed' } : e)), nouvelleEntree]);
  const M2 = '2026-10-21T01:00:00.000Z';
  const G = await SN.simulerLesSaisonsDeLaNuit({ maintenant: M2, aPart: false, n: 2000, ligues: [L] });
  const h = String(Number(idDe(reportee.homeName).slice(7)));
  const a = String(Number(idDe(reportee.awayName).slice(7)));
  ES.ecrireLaValeur(db, 'affichage_saisons', 'allume');
  const lus = SR.enjeuxDu({ du: '2026-10-21', au: '2026-11-05', database: db, maintenant: Date.parse('2026-10-21T09:00:00Z') });
  sortie.figes = {
    remise: remise.mode,
    mode: G.mode,
    enjeuxFiges: G.ecrites?.enjeuxFiges ?? null,
    jour4: db.prepare('SELECT calcule_le, COUNT(*) n FROM enjeux_rencontres WHERE league = ? AND date = ? GROUP BY calcule_le ORDER BY calcule_le').all(L, '2026-10-21'),
    jour5: db.prepare('SELECT calcule_le, COUNT(*) n FROM enjeux_rencontres WHERE league = ? AND date = ? GROUP BY calcule_le ORDER BY calcule_le').all(L, reportee.date),
    ancienneLigne: db.prepare('SELECT calcule_le, loi FROM enjeux_rencontres WHERE league = ? AND date = ? AND home_id = ? AND away_id = ? ORDER BY loi').all(L, reportee.date, h, a),
    nouvelleLigne: db.prepare('SELECT calcule_le, loi FROM enjeux_rencontres WHERE league = ? AND date = ? AND home_id = ? AND away_id = ? ORDER BY loi').all(L, nouvelleDate, h, a),
    lus: lus.enjeux.map((e) => ({ date: e.date, h: e.homeId, a: e.awayId, matchId: e.matchId, calculeLe: e.calculeLe, loi: e.loi, categorie: e.categorie, phrase: e.phrase, quand: e.quand, enjeuDom: e.enjeuDom })),
    reportee: { h, a, ancienne: reportee.date, nouvelle: nouvelleDate, matchIdAncien: reportee.matchId, matchIdNouveau: nouvelleEntree.matchId },
    M,
    M2
  };
}

// ======================================================================== loi affichée (T9 bis)
if (phase === 'loi') {
  const P = planterUnChampionnat(db, { n: 20, jouees: 3, jourD: D, releveLe: RELEVE, aVenir: 2 });
  ecrireCalendrier(P.calendrier);
  planterLesForces(db, { clubs: P.clubs, jour: '2026-10-19', calculeLe: '2026-10-19T03:00:00.000Z' });
  const r = await SN.simulerLesSaisonsDeLaNuit({ maintenant: M, aPart: false, n: 2000, ligues: [L] });
  ES.ecrireLaValeur(db, 'affichage_saisons', 'allume');
  const lecture = Date.parse('2026-10-20T09:00:00Z');
  const loi = () => SR.loiAffichee(L, { database: db, maintenant: lecture });
  const e0 = P.calendrier[0];
  const idDe = (nom) => P.clubs.find((c) => c.nom === nom).numero;
  const enjeu = () => SR.enjeuDe({ league: L, date: e0.date, homeId: idDe(e0.homeName), awayId: idDe(e0.awayName), database: db, maintenant: lecture });
  const ligneDe = (l) => db.prepare('SELECT enjeu_dom, enjeu_ext, loi FROM enjeux_rencontres WHERE league = ? AND date = ? AND home_id = ? AND away_id = ? AND loi = ?').get(L, e0.date, idDe(e0.homeName), idDe(e0.awayName), l);
  const saison = () => SR.saisonDe(L, { database: db, maintenant: lecture });
  const cas = {};
  cas.toutes = { loi: loi(), enjeu: enjeu(), saison: saison() };
  const retirer = (n) => db.prepare('DELETE FROM forces_buts WHERE club IN (' + P.clubs.slice(0, n).map((c) => c.numero).join(',') + ')').run();
  retirer(1);
  cas.p95 = { loi: loi() };
  retirer(3);
  cas.p85 = { loi: loi(), enjeu: enjeu(), saison: saison() };
  planterLesForces(db, { clubs: P.clubs, jour: '2026-10-19', calculeLe: '2026-10-16T03:00:00.000Z' });
  cas.dMoins4 = { loi: loi(), enjeu: enjeu() };
  planterLesForces(db, { clubs: P.clubs, jour: '2026-10-19', calculeLe: '2026-10-17T03:00:00.000Z' });
  cas.dMoins3 = { loi: loi() };
  db.prepare("INSERT OR REPLACE INTO forces_buts_state (cle, valeur) VALUES ('en_cours', ?)").run('2026-10-20T00:50:00.000Z');
  cas.enCours = { loi: loi() };
  sortie.nuit = { mode: r.mode, forces: r.forces };
  sortie.cas = cas;
  sortie.lignes = { forces: ligneDe('forces'), table: ligneDe('table') };
  sortie.phrases = { table: SR.PHRASE_LOI_TABLE, essai: SR.PHRASE_LOI_FORCES_ESSAI };
  // Vérification du 27/10, constat 9 : des forces rangées par une AUTRE version du calcul ne servent jamais la loi
  // « forces » des fins de saison (la garde `aJour` de la nuit des matchs et de moteurABlanc.js) — dit, version nommée.
  db.prepare("DELETE FROM forces_buts_state WHERE cle = 'en_cours'").run();
  const aJour = SN.forcesDeLaNuit({ database: db, instant: Date.parse(M) });
  db.prepare("UPDATE forces_buts_state SET valeur = '0' WHERE cle = 'version'").run();
  const autreVersion = SN.forcesDeLaNuit({ database: db, instant: Date.parse(M) });
  sortie.versionDesForces = { aJour: { empreinte: aJour.empreinte, raison: aJour.raison }, autre: { empreinte: autreVersion.empreinte, raison: autreVersion.raison } };
}

// ======================================================================== matchs (T10, B5)
if (phase === 'matchs') {
  const { getFixturePaths } = await imp('data/repositories/fixturesRepository.js');
  const instantane = getFixturePaths().odds;
  if (!path.resolve(instantane).toLowerCase().startsWith(path.resolve(serveur).toLowerCase())) throw new Error('instantané hors de la copie');
  const h2h = (home, away, [o1, ox, o2]) => ({ key: 'h2h', outcomes: [{ name: home, price: o1 }, { name: away, price: o2 }, { name: 'Draw', price: ox }] });
  const coté = (id, home, away, ko, cotes) => ({ id, sport_key: 'soccer_epl', sport_title: 'EPL', commence_time: ko, home_team: home, away_team: away, bookmakers: [{ key: 'pinnacle', title: 'Pinnacle', last_update: '2026-10-04T20:00:00Z', markets: [h2h(home, away, cotes)] }] });
  fs.mkdirSync(path.dirname(instantane), { recursive: true });
  fs.writeFileSync(instantane, JSON.stringify([{ data: [coté('essai-a', 'Man City', 'Liverpool', '2026-10-05T18:30:00Z', [2.0, 3.6, 3.9]), coté('essai-b', 'Arsenal', 'Chelsea', '2026-10-05T19:00:00Z', [2.2, 3.5, 3.4]), coté('essai-e', 'Fulham', 'Brentford', '2026-10-06T20:00:00Z', [2.4, 3.3, 3.0])] }]));
  // Deux rencontres du calendrier seul (Championship, pas de cote) : l'une aujourd'hui (jamais écrite), l'autre demain.
  const deux = db.prepare("SELECT home_name, away_name FROM matches WHERE league = 'Championship' AND home_id IS NOT NULL AND away_id IS NOT NULL ORDER BY date DESC LIMIT 2").all();
  const entree = (date, x) => ({ id: `cal-essai-${date}`, matchId: `cal-${date}-essai`, date, league: 'Championship', homeName: x.home_name, awayName: x.away_name, status: 'scheduled', homeGoals: null, awayGoals: null, round: '9', source: 'fotmob', updatedAt: '2026-10-01T00:00:00Z' });
  ecrireCalendrier([entree('2026-10-05', deux[0]), entree('2026-10-06', deux[1])]);
  const { lireReglagesDuMoteur } = await imp('core/engine/engineConfig.js');
  const service = avecLeModele(lireReglagesDuMoteur().football);
  const M1 = '2026-10-05T01:00:00.000Z';
  const r = await SN.simulerLesMatchsDeLaNuit({ maintenant: M1, aPart: true, reglagesEnService: service });
  sortie.nuit = { mode: r.mode, erreur: r.erreur ?? null, bilan: r.bilan, controleDesTables: r.controleDesTables, controle: r.controle, jugement: r.jugement, ecrites: r.ecrites, rss: r.calculAPart?.aPart?.rssMaxOctets ?? null };
  sortie.calendrierSeul = { aujourdhui: deux[0], demain: deux[1] };
  sortie.lignes = db.prepare('SELECT fixture_key, role, calcule_le, version, grille, match_id, league, date, kickoff, kickoff_connu, home_id, away_id, home_name, away_name, lambda, mu, rho, fair, graine, n, length(table_jointe) octets, marches, masse_non_couverte, apres_coup_d_envoi FROM simulation_matchs ORDER BY fixture_key').all();
  sortie.tables = Object.fromEntries(db.prepare('SELECT fixture_key, table_jointe FROM simulation_matchs').all().map((x) => [x.fixture_key, Buffer.from(x.table_jointe ?? []).toString('base64')]));
  sortie.etat = ES.lireEtat({ database: db });
  // Les fuites plantées : un λ d'après-match (entrées changées sans nouveau tirage), une ligne calculée après le coup d'envoi.
  const city = sortie.lignes.find((l) => l.home_name === 'Man City');
  const arsenal = sortie.lignes.find((l) => l.home_name === 'Arsenal');
  db.prepare('UPDATE simulation_matchs SET lambda = lambda + 0.25 WHERE fixture_key = ? AND role = ?').run(city.fixture_key, city.role);
  db.prepare('UPDATE simulation_matchs SET calcule_le = ? WHERE fixture_key = ? AND role = ?').run('2026-10-05T19:30:00.000Z', arsenal.fixture_key, arsenal.role);
  const travail = SN.controlerLesLignes({ database: db, depuis: '2026-10-01' });
  let etape = travail.next();
  while (!etape.done) etape = travail.next();
  sortie.fuites = { ...etape.value, arsenal: db.prepare('SELECT apres_coup_d_envoi FROM simulation_matchs WHERE fixture_key = ?').get(arsenal.fixture_key) };
  // 40 rencontres refaites avec la graine du jour (sur 41) : la même table à l'octet.
  const items = Array.from({ length: 41 }, (_, i) => ({ cle: `k${i}`, role: 'service', lambda: 0.8 + i * 0.03, mu: 0.7 + i * 0.02, rho: -0.05, seed: 1000 + i, n: 400 }));
  sortie.quarante = SN.graineDuJour(Date.parse(M1));
  const ctl = (await imp('data/simulation/simulationMatchsEnfant.js')).calculerLesDeroules({ items, graineDuJour: sortie.quarante });
  sortie.quarante = { graine: sortie.quarante, controle: ctl.controle };
  // B5 : 600 lignes rangées par tranches de 250 ; à chaque fois qu'on rend la main, aucune transaction ouverte.
  const gabarit = db.prepare('SELECT * FROM simulation_matchs LIMIT 1').get();
  const lignes = Array.from({ length: 600 }, (_, i) => ({ ...gabarit, fixture_key: `tranche-${i}`, calcule_le: '2026-10-05T02:00:00.000Z' }));
  const g = SN.rangerLesMatchs({ database: db, lignes, calculeLe: '2026-10-05T02:00:00.000Z' });
  const pauses = [];
  let e2 = g.next();
  while (!e2.done) {
    pauses.push({ ou: e2.value, transaction: db.isTransaction, enCours: ES.lireEtat({ database: db }).enCours.matchs });
    e2 = g.next();
  }
  sortie.tranches = { pauses, retour: e2.value, rangees: db.prepare("SELECT COUNT(*) n FROM simulation_matchs WHERE fixture_key LIKE 'tranche-%'").get().n, enCoursApres: ES.lireEtat({ database: db }).enCours.matchs, nuit: ES.lireEtat({ database: db }).nuits.matchs?.calculeLe ?? null };
}

// ======================================================================== garde (T16, B4)
if (phase === 'garde') {
  const P = planterUnChampionnat(db, { n: 20, jouees: 3, jourD: D, releveLe: RELEVE, aVenir: 2 });
  ecrireCalendrier(P.calendrier);
  const essais = {};
  for (const [nom, f] of [['saisons', () => SN.simulerLesSaisonsDeLaNuit({})], ['matchs', () => SN.simulerLesMatchsDeLaNuit({ matchs: [] })], ['ranger', () => SN.instantDe(undefined, 'rangerLesSaisons')]]) {
    try {
      await f();
      essais[nom] = 'aucune erreur';
    } catch (error) {
      essais[nom] = error.message;
    }
  }
  sortie.sansMaintenant = essais;
  const { commencerCalculLourd, calculLourdEnCours } = await imp('utils/calculLourd.js');
  // Un calcul lourd en cours (un banc) : reporté, rien de rangé.
  const premiere = await SN.simulerLesSaisonsDeLaNuit({ maintenant: M, aPart: false, n: 1000, ligues: [L] });
  const fin = commencerCalculLourd('banc d’essai');
  const reporte = await SN.simulerLesSaisonsDeLaNuit({ maintenant: '2026-10-21T01:00:00.000Z', aPart: true, n: 1000, ligues: [L] });
  const items = [{ home: 'Man City', away: 'Liverpool', league: 'EPL', commenceTime: '2026-10-21T18:00:00Z', hasOdds: true, marketOdds: { odds1: 2, oddsDraw: 3.5, odds2: 3.8 } }];
  const { lireReglagesDuMoteur } = await imp('core/engine/engineConfig.js');
  const reporteMatchs = await SN.simulerLesMatchsDeLaNuit({ maintenant: '2026-10-21T01:00:00.000Z', matchs: items, aPart: true, reglagesEnService: avecLeModele(lireReglagesDuMoteur().football), juger: false });
  // Vérification du 27/10, constat 13 (c) : les ÉTAPES de la passe (le job), le banc tenant toujours le jeton → « warn »,
  // details.reporte, et l'étape reste DUE le jour même (refaite à la passe suivante, pas le lendemain) ; faite sans
  // report, elle ne l'est plus (le contrôle qui rend le test discriminant). L'heure du processus est figée (garde.mjs).
  recopierScripts(serveur);
  const J = (await imp('jobs/matchStatsAutoRefresh.js')).__testing;
  const { env } = await imp('config/env.js');
  const passeS = await J.passeSimulationSaisons({}, { maintenant: '2026-10-21T01:00:00.000Z', aPart: true, n: 1000, ligues: [L] });
  const passeM = await J.passeSimulationMatchs({}, { maintenant: '2026-10-21T01:00:00.000Z', matchs: items, aPart: true, reglagesEnService: avecLeModele(lireReglagesDuMoteur().football), juger: false });
  const aujourdhui = new Date().toISOString();
  const ctx = (details) => ({ derniere: () => aujourdhui, derniersDetails: () => details });
  sortie.passes = {
    saisons: { status: passeS.status, reporte: passeS.details?.reporte ?? null, summary: passeS.summary, due: J.dueSimulationSaisons(ctx(passeS.details)), dueSansReport: J.dueSimulationSaisons(ctx({ mode: 'complet' })) },
    matchs: { status: passeM.status, reporte: passeM.details?.reporte ?? null, summary: passeM.summary, due: J.dueSimulationMatchs(ctx(passeM.details)), dueSansReport: J.dueSimulationMatchs(ctx({ mode: 'complet' })) },
    enregistreurs: Boolean(env.enregistreurs?.enabled),
    lignesMatchs: db.prepare('SELECT COUNT(*) n FROM simulation_matchs').get().n
  };
  fin();
  sortie.reporte = {
    premiere: premiere.mode,
    saisons: { mode: reporte.mode, raison: reporte.raison ?? null },
    matchs: { mode: reporteMatchs.mode, raison: reporteMatchs.raison ?? null, analyses: reporteMatchs.bilan?.analyses ?? null, dansLaFenetre: reporteMatchs.bilan?.dansLaFenetre ?? null },
    nuitSaisons: ES.lireEtat({ database: db }).nuits.saisons?.calculeLe ?? null,
    lignesDuLendemain: db.prepare("SELECT COUNT(*) n FROM saisons_etat WHERE calcule_le = '2026-10-21T01:00:00.000Z'").get().n,
    lignesMatchs: db.prepare('SELECT COUNT(*) n FROM simulation_matchs').get().n,
    jetonApres: calculLourdEnCours()
  };
  // Délai dépassé : l'enfant arrêté, rien de rangé, le jeton rendu.
  const delai = await SN.simulerLesSaisonsDeLaNuit({ maintenant: '2026-10-22T01:00:00.000Z', aPart: true, n: 1000, ligues: [L], delaiMs: 1 });
  sortie.delai = { mode: delai.mode, erreur: delai.erreur ?? null, lignes: db.prepare("SELECT COUNT(*) n FROM saisons_etat WHERE calcule_le = '2026-10-22T01:00:00.000Z'").get().n, jeton: calculLourdEnCours(), nuit: ES.lireEtat({ database: db }).nuits.saisons?.calculeLe ?? null };
  // Rangement interrompu : en_cours posé, la nuit d'avant lue ; la nuit suivante retire les lignes interrompues et finit.
  const parLigue = [];
  const travail = (await imp('data/simulation/simulationSaisonsEnfant.js')).calculerLesSaisons({ database: db, jourD: '2026-10-23', calculeLe: '2026-10-23T01:00:00.000Z', calendrier: P.calendrier, n: 500, ligues: [L], surChampionnat: (m) => parLigue.push(m) });
  let x = travail.next();
  while (!x.done) x = travail.next();
  const g = SN.rangerLesSaisons({ database: db, parLigue, calculeLe: '2026-10-23T01:00:00.000Z', jourD: '2026-10-23', instant: Date.parse('2026-10-23T01:00:00.000Z'), tranche: 7 });
  for (let k = 0; k < 4; k++) g.next();
  g.return();
  const lecture = Date.parse('2026-10-23T09:00:00Z');
  sortie.interrompu = {
    enCours: ES.lireEtat({ database: db }).enCours.saisons,
    nuit: ES.lireEtat({ database: db }).nuits.saisons?.calculeLe ?? null,
    lignesInterrompues: db.prepare("SELECT COUNT(*) n FROM saisons_simulees WHERE calcule_le = '2026-10-23T01:00:00.000Z'").get().n,
    transaction: db.isTransaction,
    lu: SR.saisonDe(L, { database: db, maintenant: lecture }).calculeLe ?? null
  };
  const reprise = await SN.simulerLesSaisonsDeLaNuit({ maintenant: '2026-10-24T01:00:00.000Z', aPart: false, n: 500, ligues: [L] });
  sortie.reprise = {
    mode: reprise.mode,
    retirees: reprise.ecrites?.retirees ?? null,
    enCours: ES.lireEtat({ database: db }).enCours.saisons,
    nuit: ES.lireEtat({ database: db }).nuits.saisons?.calculeLe ?? null,
    lignesInterrompues: db.prepare("SELECT COUNT(*) n FROM saisons_simulees WHERE calcule_le = '2026-10-23T01:00:00.000Z'").get().n
  };
  // Les enfants n'écrivent rien : la base de la copie, octet pour octet, avant et après un calcul à part de chaque sorte.
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const sha = () => crypto.createHash('sha1').update(fs.readFileSync(BASE)).digest('hex');
  const avant = sha();
  const morceaux = [];
  const finSaisons = await SN.calculerAPart({ fichier: path.join(serveur, 'src', 'data', 'simulation', 'simulationSaisonsEnfant.js'), nom: 'essai', options: SN.OPTIONS_ENFANT_SAISONS, message: { chemin: BASE, jourD: '2026-10-25', calculeLe: '2026-10-25T01:00:00.000Z', fichierCalendrier: CALENDAR_FILE_PATH, n: 300, ligues: [L] }, surMorceau: (m) => morceaux.push(m) });
  const finMatchs = await SN.calculerAPart({ fichier: path.join(serveur, 'src', 'data', 'simulation', 'simulationMatchsEnfant.js'), nom: 'essai', options: SN.OPTIONS_ENFANT_MATCHS, message: { items: [{ cle: 'x', role: 'service', lambda: 1.3, mu: 1.1, rho: -0.05, seed: 7, n: 300 }], graineDuJour: 20261025 }, surMorceau: () => {} });
  sortie.enfants = { baseIntacte: sha() === avant, saisons: { fin: Boolean(finSaisons.fin), morceaux: morceaux.length, pidAutre: finSaisons.bilan?.aPart?.pid !== process.pid, simules: finSaisons.bilan?.simules }, matchs: { fin: Boolean(finMatchs.fin), controle: finMatchs.controle, pidAutre: finMatchs.bilan?.aPart?.pid !== process.pid } };
  // Vérification du 27/10, constat 13 (b) : le jeton du calcul lourd est TENU pendant que l'enfant tourne (lu à chaque
  // morceau ; un second calcul lourd y est refusé), puis rendu. L'enfant des saisons au plus court : un championnat, 100 tirages.
  const pendant = [];
  let second = null;
  const finJeton = await SN.calculerAPart({
    fichier: path.join(serveur, 'src', 'data', 'simulation', 'simulationSaisonsEnfant.js'),
    nom: 'fins de saison',
    options: SN.OPTIONS_ENFANT_SAISONS,
    message: { chemin: BASE, jourD: '2026-10-25', calculeLe: '2026-10-25T01:00:00.000Z', fichierCalendrier: CALENDAR_FILE_PATH, n: 100, ligues: [L] },
    surMorceau: () => {
      pendant.push(calculLourdEnCours()?.nom ?? null);
      try {
        commencerCalculLourd('autre')();
        second = 'accepte';
      } catch {
        second = 'refuse';
      }
    }
  });
  sortie.jeton = { pendant: [...new Set(pendant)], morceaux: pendant.length, second, apres: calculLourdEnCours(), fin: Boolean(finJeton.fin) };
}

// ======================================================================== un seul principal
if (phase === 'principal') {
  const { enregistrerLancements, jugementsDe } = await imp('bench/trialsRegistry.js');
  // L'étape 28 lancée le 01/09 (registre de la COPIE), puis cinq rencontres jouées de la base d'essai rangées la nuit.
  enregistrerLancements({ maintenant: Date.parse('2026-09-01T10:00:00Z') });
  const matchs = db.prepare("SELECT date, home_id, away_id, home_name, away_name FROM matches WHERE league = 'EPL' AND date > '2026-09-01' AND home_goals IS NOT NULL AND home_id IS NOT NULL ORDER BY date LIMIT 6").all();
  // La sixième : une ligne calculée APRÈS le coup d'envoi (marquée par le contrôle de nuit) — comptée, jamais jugée.
  const apresCoupDEnvoi = matchs.pop();
  const graine = (await imp('data/simulation/simulationMatch.js')).graineDuMatch;
  const ins = db.prepare("INSERT INTO simulation_matchs (fixture_key, role, calcule_le, version, grille, date, kickoff_connu, home_id, away_id, home_name, away_name, lambda, mu, rho, graine, n, marches, apres_coup_d_envoi) VALUES (?, 'candidate', ?, 1, 'modele-buts-441', ?, 0, ?, ?, ?, ?, 1.4, 1.1, -0.05, ?, 10000, ?, ?)");
  const marchesRanges = JSON.stringify({ htH: 0.34, htD: 0.42, htA: 0.24, htFt: [0.28, 0.05, 0.02, 0.15, 0.16, 0.11, 0.02, 0.05, 0.16] });
  for (const m of matchs) {
    const cle = `fotmob:${m.home_id}|${m.away_id}|${m.date}`;
    ins.run(cle, `${m.date.slice(0, 8)}${String(Number(m.date.slice(8, 10)) - 1).padStart(2, '0')}T01:00:00.000Z`, m.date, m.home_id.slice(7), m.away_id.slice(7), m.home_name, m.away_name, graine({ cle, role: 'candidate', lambda: 1.4, mu: 1.1, rho: -0.05 }), marchesRanges, 0);
  }
  {
    const m = apresCoupDEnvoi;
    const cle = `fotmob:${m.home_id}|${m.away_id}|${m.date}`;
    ins.run(cle, `${m.date}T20:00:00.000Z`, m.date, m.home_id.slice(7), m.away_id.slice(7), m.home_name, m.away_name, graine({ cle, role: 'candidate', lambda: 1.4, mu: 1.1, rho: -0.05 }), marchesRanges, 1);
  }
  // Les minutes des buts de ces cinq rencontres (la base d'essai n'a pas d'événements) : le déroulé devient jugeable.
  const MIN_DOM = [12, 47, 63, 78, 88, 33, 55];
  const MIN_EXT = [25, 58, 71, 84, 40];
  const faits = [];
  for (const m of matchs) {
    const r = db.prepare('SELECT match_key, home_goals hg, away_goals ag FROM matches WHERE date = ? AND home_id = ? AND away_id = ?').get(m.date, m.home_id, m.away_id);
    const dom = MIN_DOM.slice(0, r.hg);
    const ext = MIN_EXT.slice(0, r.ag);
    const events = [...dom.map((minute) => ({ type: 'goal', minute, side: 'home' })), ...ext.map((minute) => ({ type: 'goal', minute, side: 'away' }))];
    db.prepare('UPDATE matches SET events = ? WHERE match_key = ?').run(JSON.stringify(events), r.match_key);
    faits.push({ cle: `fotmob:${m.home_id}|${m.away_id}|${m.date}`, hg: r.hg, ag: r.ag, hHt: dom.filter((x) => x <= 45).length, aHt: ext.filter((x) => x <= 45).length });
  }
  const { commencerCalculLourd } = await imp('utils/calculLourd.js');
  const nuit1 = Date.parse('2026-10-05T01:00:00Z');
  const pas = await SN.jugerLaNuit({ database: db, instant: nuit1, horizon: { matchs: 9999, jours: 1 }, aPart: false });
  // À l'horizon, un autre calcul lourd tient le jeton : le principal est pris, le contrôle « sans effets » reporté.
  const rendre = commencerCalculLourd('essai : un autre calcul lourd');
  let j1;
  try {
    j1 = await SN.jugerLaNuit({ database: db, instant: nuit1, horizon: { matchs: 3, jours: 1 }, aPart: true });
  } finally {
    rendre();
  }
  const principal1 = ES.lireEtat({ database: db }).principal;
  // La nuit suivante : le contrôle retenté (ici, dans le processus), le principal inchangé ; la nuit d'après : rien.
  const j2 = await SN.jugerLaNuit({ database: db, instant: Date.parse('2026-10-06T01:00:00Z'), horizon: { matchs: 3, jours: 1 }, aPart: false });
  const principal2 = ES.lireEtat({ database: db }).principal;
  const j3 = await SN.jugerLaNuit({ database: db, instant: Date.parse('2026-10-07T01:00:00Z'), horizon: { matchs: 3, jours: 1 }, aPart: false });
  const principal3 = ES.lireEtat({ database: db }).principal;
  const jugementApresJ3 = ES.lireEtat({ database: db }).jugement;
  // Vérification du 27/10, constat 16 : bien après le principal, la nuit ne relit plus que les 60 derniers jours (le
  // 25/11 : depuis le 26/09 — les cinq rencontres de septembre sont hors du rapport), sans juge provisoire.
  const j4 = await SN.jugerLaNuit({ database: db, instant: Date.parse('2026-11-25T01:00:00Z'), horizon: { matchs: 3, jours: 1 }, aPart: false });
  const principal4 = ES.lireEtat({ database: db }).principal;
  // L'oracle du contrôle, écrit ICI : les réglages sans effets refaits à la main, simulerMatch, les issues des minutes plantées.
  const SM = await imp('data/simulation/simulationMatch.js');
  const G = await imp('core/engine/goalModel.js');
  const { PARAMS } = await imp('data/simulation/reglages.js');
  const sansEffets = { ...PARAMS, MH: PARAMS.MH.map(() => 1), MA: PARAMS.MA.map(() => 1), rougeBande: PARAMS.rougeBande.map(() => 0) };
  const range = { htH: 0.34, htD: 0.42, htA: 0.24, htFt: [0.28, 0.05, 0.02, 0.15, 0.16, 0.11, 0.02, 0.05, 0.16] };
  const lire = (mm, k) => (k.startsWith('htFt') ? mm.htFt[Number(k.slice(4))] : mm[k]);
  const pl = (p, y) => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, y ? p : 1 - p)));
  const oracle = { sansEffets: 0, avecEffets: 0, lignes: 0 };
  for (const f of faits) {
    const ch = SM.simulerMatch({ lambda: 1.4, mu: 1.1, grille: G.grilleDesButs(1.4, 1.1, -0.05), params: sansEffets, n: 10000, seed: graine({ cle: f.cle, role: 'candidate', lambda: 1.4, mu: 1.1, rho: -0.05 }) });
    const m0 = SM.marchesDesChemins(ch);
    const rH = f.hHt > f.aHt ? 0 : f.hHt === f.aHt ? 1 : 2;
    const rF = f.hg > f.ag ? 0 : f.hg === f.ag ? 1 : 2;
    const y = { htH: rH === 0 ? 1 : 0, htD: rH === 1 ? 1 : 0, htA: rH === 2 ? 1 : 0 };
    for (let c = 0; c < 9; c++) y[`htFt${c}`] = rH * 3 + rF === c ? 1 : 0;
    for (const k of Object.keys(y)) {
      oracle.sansEffets += pl(lire(m0, k), y[k]);
      oracle.avecEffets += pl(lire(range, k), y[k]);
      oracle.lignes++;
    }
  }
  // Le même contrôle dans l'ENFANT (un vrai processus à part) et ici : les mêmes pertes.
  const unDeroule = [{ fixtureKey: faits[0].cle, role: 'candidate', date: matchs[0].date, lambda: 1.4, mu: 1.1, rho: -0.05, marches: range, y: { htH: 0, htD: 1, htA: 0, htFt4: 1, htFt3: 0 } }];
  const aPartOui = await SN.controleSansEffets({ deroules: unDeroule, instant: nuit1, aPart: true });
  const aPartNon = await SN.controleSansEffets({ deroules: unDeroule, instant: nuit1, aPart: false });
  const sansSE = (p) => JSON.stringify({ ...p, sansEffets: null });
  sortie.principal = {
    avantLHorizon: { calcule: pas.calcule, principal: pas.principal, matchs: pas.matchs, raison: pas.raison ?? null, sansEffets: pas.sansEffets ?? null },
    j1: { calcule: j1.calcule, principal: j1.principal, verdict: j1.verdict ?? null, matchs: j1.matchs, lignes: j1.lignes, sansEffets: j1.sansEffets ?? null },
    j2: { calcule: j2.calcule, principal: j2.principal, deja: j2.dejaPrincipal ?? null, sansEffets: j2.sansEffets ?? null, rapportJours: j2.rapportJours ?? null, provisoire: j2.provisoire ?? null, matchs: j2.matchs },
    j3: { calcule: j3.calcule, principal: j3.principal, deja: j3.dejaPrincipal ?? null, sansEffets: j3.sansEffets ?? null, rapportJours: j3.rapportJours ?? null, provisoire: j3.provisoire ?? null, matchs: j3.matchs },
    j4: { calcule: j4.calcule, principal: j4.principal, deja: j4.dejaPrincipal ?? null, rapportJours: j4.rapportJours ?? null, provisoire: j4.provisoire ?? null, matchs: j4.matchs, du: j4.du ?? null },
    avantLHorizonDetail: { rapportJours: pas.rapportJours ?? null, provisoire: Boolean(pas.provisoire) },
    principalInchange: JSON.stringify(principal3) === JSON.stringify(principal4),
    principauxAuRegistre: jugementsDe('28').filter((j) => j.principal === true).length,
    jugementsAuRegistre: jugementsDe('28').length,
    memePrincipal: sansSE(principal1) === sansSE(principal2),
    rienRefait: JSON.stringify(principal2) === JSON.stringify(principal3),
    principal1,
    principal2,
    oracle,
    enfant: { oui: { calcule: aPartOui.calcule, raison: aPartOui.raison, sommes: aPartOui.sommes, lignes: aPartOui.lignes, pid: aPartOui.aPart?.pid ?? null }, non: { calcule: aPartNon.calcule, sommes: aPartNon.sommes, lignes: aPartNon.lignes, pid: aPartNon.aPart?.pid ?? null }, moi: process.pid },
    provisoire: jugementApresJ3
  };
}

// ======================================================================== rétention (B11)
if (phase === 'retention') {
  const ins = db.prepare("INSERT INTO simulation_matchs (fixture_key, role, calcule_le, version, grille, date, kickoff, kickoff_connu, lambda, mu, rho, graine, n, table_jointe, apres_coup_d_envoi) VALUES (?, 'candidate', ?, 1, 'modele-buts-441', ?, ?, 1, 1.4, 1.1, -0.05, 1, 10000, ?, ?)");
  const octets = new Uint8Array([0, 0, 1, 0, 0, 10, 0]);
  ins.run('X', '2026-10-15T01:00:00.000Z', '2026-10-17', '2026-10-17T18:00:00.000Z', octets, 0);
  ins.run('X', '2026-10-16T01:00:00.000Z', '2026-10-17', '2026-10-17T18:00:00.000Z', octets, 0);
  ins.run('X', '2026-10-17T19:00:00.000Z', '2026-10-17', '2026-10-17T18:00:00.000Z', octets, 1);
  ins.run('Y', '2026-10-18T01:00:00.000Z', '2026-10-19', '2026-10-19T18:00:00.000Z', octets, 0);
  ins.run('Y', '2026-10-19T01:00:00.000Z', '2026-10-19', '2026-10-19T18:00:00.000Z', octets, 0);
  ins.run('Z', '2025-09-01T01:00:00.000Z', '2025-09-02', '2025-09-02T18:00:00.000Z', octets, 0);
  const t = SN.elaguerLesMatchs({ database: db, jourD: D });
  let e = t.next();
  while (!e.done) e = t.next();
  sortie.matchs = { retour: e.value, lignes: db.prepare('SELECT fixture_key, calcule_le, length(table_jointe) octets FROM simulation_matchs ORDER BY fixture_key, calcule_le').all() };
  const insS = db.prepare("INSERT INTO saisons_simulees (league, season, table_name, team_id, calcule_le, loi, famille, probabilite) VALUES (?, '2026', 'Ligue 2', '1', ?, 'forces', 'premiere', 0.5)");
  const nuits = [];
  for (let k = 1; k <= 40; k++) nuits.push(new Date(Date.parse(M) - k * 86_400_000).toISOString());
  nuits.push('2025-09-01T01:00:00.000Z');
  for (const c of nuits) insS.run(L, c);
  db.prepare("INSERT INTO saisons_etat (league, calcule_le, complet, version) VALUES (?, '2025-09-01T01:00:00.000Z', 1, 1), (?, '2026-10-19T01:00:00.000Z', 1, 1)").run(L, L);
  db.prepare("INSERT INTO enjeux_rencontres (league, date, home_id, away_id, loi, calcule_le, categorie, version) VALUES (?, '2025-09-05', '1', '2', 'forces', '2025-09-01T01:00:00.000Z', 'enjeu', 1), (?, '2026-10-25', '1', '2', 'forces', '2026-10-19T01:00:00.000Z', 'enjeu', 1)").run(L, L);
  const s = SN.elaguerLesSaisons({ database: db, instant: Date.parse(M) });
  let es = s.next();
  while (!es.done) es = s.next();
  sortie.saisons = {
    retour: es.value,
    nuits: db.prepare('SELECT calcule_le FROM saisons_simulees ORDER BY calcule_le').all().map((x) => x.calcule_le),
    etat: db.prepare('SELECT calcule_le FROM saisons_etat ORDER BY calcule_le').all().map((x) => x.calcule_le),
    enjeux: db.prepare('SELECT date FROM enjeux_rencontres ORDER BY date').all().map((x) => x.date),
    toutes: nuits
  };
}

console.log(JSON.stringify(sortie));
