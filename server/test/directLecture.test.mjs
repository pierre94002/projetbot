/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie B — LA LECTURE DU DIRECT (data/direct/entreesDuDirect.js,
 * data/direct/lectureDuDirect.js) et SES DEUX ROUTES (api/controllers/direct.controller.js), sur un direct FABRIQUÉ
 * (aides/directFabrique.mjs : base SQLite en mémoire, boucle et mémoire fabriquées ; aucune donnée réelle, aucun réseau) :
 *   node --test test/directLecture.test.mjs        (depuis server/)
 *
 *   T-L1  ligneDeService : la dernière ligne « service » d'avant le coup d'envoi d'une nuit COMPLÈTE ; jamais `candidate`,
 *         jamais `apres_coup_d_envoi = 1`, jamais une nuit en cours, jamais calculée au coup d'envoi ou après ; la veille et
 *         le lendemain seulement à heure inconnue ou à moins de 3 h ; la provenance rendue (R9) ;
 *   T-L2  chaque raison d'absence (7) et la structure complète, de ligneDeService au tableau (le match reste listé) ;
 *   T-L3  GET /api/direct et GET /api/direct/match : la forme exacte (clés, types) ; `null` jamais remplacé par 0 ;
 *   T-L4  les routes : un nom refusé (400), un identifiant mal formé, `instant` hors du bac (les deux routes, R28) ; par
 *         identifiants + coup d'envoi ; par `id` ; module illisible et lecture ratée → « illisible », jamais une 500 ;
 *   T-L5  la table en mémoire (O1, R24) : même état → un seul calcul ; un but → un calcul neuf ; deux requêtes en même
 *         temps sur 30 matchs neufs → 30 calculs, pas 60 ;
 *   T-L6  le budget (O2) : 30 matchs réalistes en UNE requête en moins de 1 000 ms, tous calculés, aucun bloc de plus de
 *         100 ms (mesuré par la lecture ET par un battement extérieur) ; 40 matchs neufs → une partie « en attente », le
 *         reste aux requêtes suivantes (un minutage tombé sous la charge est relancé une fois, et dit) ;
 *   P6 bis 60 matchs en cours → 60 entrées, jamais coupées, même sans aucun budget ;
 *   T-L7  aucune écriture : total_changes() inchangé après 50 appels ; data/runtime inchangé ;
 *   T-L8  la référence (R2, § 3.4) : marge retirée, prix d'échange dit, source retardée, anomalie, issue manquante,
 *         `avantLeDernierBut` et `avantLeRouge`, JAMAIS d'écart, aucune cote payante, gardée 60 s ;
 *   T-L9  la courbe : un point par instantané, trou de plus de 12 min dit, rouges reportés, prolongation sans chiffre,
 *         second appel sans aucun calcul ;
 *   T-L10 la boucle (R10) : coupée, bac à sable, pas démarrée, suspendue, interrupteur du direct, plus de tour, trois
 *         erreurs de suite, absent de la liste, « aucun match, liste vieille de 9 min, dernier tour il y a 20 s » → vide
 *         sans alarme ; le tableau vide est complet ;
 *   T-L11 la note (P4, P5) : nulle → `aBlanc` partout ; fabriquée → sa variante, ses paires écartées de la tranche, ses
 *         tranches non montrées ; autre grille ou autre version → « pas encore jugé pour cette version » ; candidate ;
 *   le repli de l'ancrage (point laissé ouvert par la partie A) : λ + μ hors des bornes → direct-v1, la raison rendue ;
 *   T-L12 (correctif K4 du 13/11) à blanc, aucun chiffre ne sort du JSON (lecture et contrôleur), sauf `chiffresABlanc: true`
 *         (les essais) ; K9 (13/11) la grille dans les clés de la lecture (ancrage et calcul) ;
 *   R11   les raisons d'un match non suivi ; R28 le rejeu d'un instant (et sa limite : sans durée max, les arrêts de jeu
 *         de la 1re mi-temps en minutes pleines restent « minute inconnue »).
 *   Correctifs D2 (12/11/2026) : 2 a — GET /api/direct/en-cours (tous les matchs suivis en cours, depuis l'état de la boucle
 *         seulement) ; 3 — la page du match dans l'appli (ligne de nuit, sinon l'unique entrée du calendrier du jour par
 *         les identifiants FotMob des deux clubs) ; 3 bis — l'index du calendrier se bâtit après les calculs (hors budget).
 *   Correctifs D3 (12/11/2026) : 1 — l'index du calendrier bâti sans tenir la main (patron T-L6 : un fichier de 18 Mo,
 *         aucun bloc de plus de 100 ms, avant / après mesurés) ; 1 bis — l'index d'avant servi pendant qu'il se rebâtit,
 *         une lecture ratée jamais gardée, l'annuaire STRICT ; 2 — la page d'un match fini (sa fiche au magasin, par les
 *         identifiants FotMob et le jour).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { SERVEUR, RACINE_ESSAIS, nettoyer } from './aides/isolement.mjs';
import * as F from './aides/directFabrique.mjs';
import * as L from '../src/data/direct/lectureDuDirect.js';
import { ligneDeService, nuitComplete, RAISONS_SANS_LIGNE } from '../src/data/direct/entreesDuDirect.js';
import { cleDeNuit } from '../src/data/simulation/simulationRead.js';
import { BLOC_MAX_MS, BUDGET_CALCUL_MS, VARIANTE_AFFICHEE } from '../src/data/direct/reglagesDirect.js';
import { removeMargin } from '../src/core/market/marginRemoval.js';
import { __reglerControleurDuDirect, getDirect, getDirectMatch, getDirectEnCours } from '../src/api/controllers/direct.controller.js';
import * as RF from './aides/reconductionFabriquee.mjs';

const MIN = 60_000;
const T = Date.parse('2026-11-14T20:34:40.000Z');
const iso = (t) => new Date(t).toISOString();
const NUIT = '2026-11-14T12:00:00.000Z';
const CALCULE = '2026-11-14T11:00:00.000Z';
const APO = String.fromCharCode(0x2019);
const lbl = (m) => `${m}${APO}`;

/** Un match suivi à la minute `minute` (coup d'envoi `minute` minutes avant T, 15 de plus après la pause), lu 20 s avant T. */
function suivi(id, homeId, awayId, { minute = 34, h = 0, a = 0, rh = null, ra = null, label = null, maxTime = null, halfTime = false, coup = null, lectures = null, memoire = true, rang = 3 } = {}) {
  const kickoff = coup ?? iso(T - (minute > 45 ? minute + 15 : minute) * MIN);
  const liste = F.listeEnJeu({ id, homeId, awayId, kickoff, label: label ?? lbl(minute), maxTime: maxTime ?? (minute > 45 ? 90 : 45), h, a, rh, ra, halfTime });
  return F.matchSuivi({ id, homeId, awayId, kickoff, rang, memoire, lectures: lectures ?? [{ t: T - 20_000, liste }] });
}
/** La ligne fabriquée d'un match (ligneDe), λ et μ variés par le club. */
function ligneVariee(q) {
  const k = Number(String(q.homeId).replace('fotmob-', '')) % 11;
  return F.ligneFabriquee({ ...q, lambda: 0.9 + 0.12 * k, mu: 0.7 + 0.09 * ((k * 7) % 11), fair: k % 4 === 0 ? null : { home: 0.3 + 0.03 * k, draw: 0.27, away: 0.43 - 0.03 * k } });
}
/** n matchs réalistes : minutes 1 à 88, scores et rouges variés, clubs fotmob-(base + 2i) / (base + 2i + 1). */
function matchsReels(n, { premier, base }) {
  return Array.from({ length: n }, (_, i) =>
    suivi(premier + i, `fotmob-${base + 2 * i}`, `fotmob-${base + 2 * i + 1}`, { minute: 1 + ((i * 3) % 88), h: i % 3, a: (i >> 1) % 2, rh: i % 7 === 0 ? 1 : 0, ra: i % 5 === 0 ? 1 : 0 })
  );
}
const lire = (db, em, extra = {}) => L.tableauDuDirect({ maintenant: T, database: db, note: null, ...F.sourcesActives(em), ...extra });
const detail = (db, em, cible, extra = {}) => L.matchDuDirect({ maintenant: T, database: db, note: null, ...F.sourcesActives(em), ...cible, ...extra });
const forme = (objet, cles, qui) => assert.deepEqual(Object.keys(objet), cles, qui);
const proche = (x, y, qui, eps = 1e-12) => assert.ok(Math.abs(x - y) <= eps, `${qui} : ${x} au lieu de ${y}`);

// ------------------------------------------------------------ T-L1

test('T-L1 ligneDeService : la dernière ligne « service » d’avant le coup d’envoi d’une nuit complète — jamais candidate, jamais après le coup d’envoi, jamais une nuit en cours ; veille et lendemain à heure inconnue ou à moins de 3 h ; la provenance (R9)', () => {
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const K = '2026-11-14T20:00:00.000Z';
  const p = { homeId: 'fotmob-101', awayId: 'fotmob-102', kickoff: K };
  F.poserUneLigne(db, { ...p, calculeLe: '2026-11-13T11:00:00.000Z', lambda: 1.1 });
  F.poserUneLigne(db, { ...p, calculeLe: CALCULE, lambda: 1.45, oddsAt: '2026-11-14T10:30:00.000Z', oddsSource: 'cotes gratuites : essai' });
  F.poserUneLigne(db, { ...p, calculeLe: '2026-11-14T11:30:00.000Z', role: 'candidate', lambda: 2.2, candidateHash: 'abc' });
  F.poserUneLigne(db, { ...p, calculeLe: '2026-11-14T11:45:00.000Z', apres: 1, lambda: 2.3 });
  F.poserUneLigne(db, { ...p, calculeLe: '2026-11-14T13:00:00.000Z', lambda: 2.4 }); // la nuit EN COURS (après la dernière nuit complète)
  assert.equal(nuitComplete(db), NUIT);
  const l = ligneDeService({ ...p, database: db });
  forme(l, ['trouve', 'raison', 'cle', 'nuit', 'calculeLe', 'grille', 'engineVersion', 'candidateHash', 'lambda', 'mu', 'rho', 'fair', 'oddsSource', 'oddsAt', 'kickoff', 'kickoffConnu', 'date', 'decalageJours', 'ageAuCoupDEnvoiH', 'coteAgeAuCoupDEnvoiH']);
  assert.deepEqual(l, {
    trouve: true,
    raison: null,
    cle: cleDeNuit({ homeId: 'fotmob-101', awayId: 'fotmob-102', commenceTime: K }),
    nuit: NUIT,
    calculeLe: CALCULE,
    grille: 'ancien-81',
    engineVersion: 5,
    candidateHash: null,
    lambda: 1.45,
    mu: 1.15,
    rho: -0.08,
    fair: { home: 0.45, draw: 0.28, away: 0.27 },
    oddsSource: 'cotes gratuites : essai',
    oddsAt: '2026-11-14T10:30:00.000Z',
    kickoff: K,
    kickoffConnu: true,
    date: '2026-11-14',
    decalageJours: 0,
    ageAuCoupDEnvoiH: 9,
    coteAgeAuCoupDEnvoiH: 9.5
  });
  assert.equal(l.cle, 'fotmob:fotmob-101|fotmob-102|2026-11-14');
  // La nuit passée par l'appelant (lue une fois par requête) : celle de la veille rend la ligne de la veille.
  assert.equal(ligneDeService({ ...p, database: db, nuit: '2026-11-13T12:00:00.000Z' }).lambda, 1.1);

  // Calculée APRÈS le coup d'envoi (la nuit est passée après un match du matin) : jamais prise.
  F.poserUneLigne(db, { homeId: 'fotmob-103', awayId: 'fotmob-104', kickoff: '2026-11-14T10:00:00.000Z', calculeLe: CALCULE });
  const apres = ligneDeService({ homeId: 'fotmob-103', awayId: 'fotmob-104', kickoff: '2026-11-14T10:00:00.000Z', database: db });
  assert.deepEqual(apres, { trouve: false, raison: 'calculee-apres', cle: 'fotmob:fotmob-103|fotmob-104|2026-11-14', nuit: NUIT });

  // La veille : à 1 h 30 du coup d'envoi FotMob → prise ; à 12 h 30 → non ; à heure inconnue → prise.
  const KF = '2026-11-15T00:30:00.000Z';
  F.poserUneLigne(db, { homeId: 'fotmob-111', awayId: 'fotmob-112', kickoff: '2026-11-14T23:00:00.000Z', calculeLe: CALCULE });
  F.poserUneLigne(db, { homeId: 'fotmob-113', awayId: 'fotmob-114', kickoff: '2026-11-14T12:00:00.000Z', calculeLe: CALCULE });
  F.poserUneLigne(db, { homeId: 'fotmob-115', awayId: 'fotmob-116', kickoff: '2026-11-14T12:00:00.000Z', calculeLe: CALCULE, kickoffConnu: 0 });
  const veille = ligneDeService({ homeId: 'fotmob-111', awayId: 'fotmob-112', kickoff: KF, database: db });
  assert.equal(veille.trouve, true);
  assert.equal(veille.decalageJours, -1);
  assert.equal(veille.cle, 'fotmob:fotmob-111|fotmob-112|2026-11-14');
  assert.equal(veille.ageAuCoupDEnvoiH, 13.5, 'l’âge se compte jusqu’au coup d’envoi FotMob');
  assert.deepEqual(ligneDeService({ homeId: 'fotmob-113', awayId: 'fotmob-114', kickoff: KF, database: db }), { trouve: false, raison: 'aucune-ligne', cle: 'fotmob:fotmob-113|fotmob-114|2026-11-15', nuit: NUIT });
  const inconnue = ligneDeService({ homeId: 'fotmob-115', awayId: 'fotmob-116', kickoff: KF, database: db });
  assert.equal(inconnue.trouve, true);
  assert.equal(inconnue.kickoffConnu, false);
  assert.equal(inconnue.decalageJours, -1);
  // Le lendemain, à 1 h 30.
  F.poserUneLigne(db, { homeId: 'fotmob-117', awayId: 'fotmob-118', kickoff: '2026-11-15T01:00:00.000Z', calculeLe: CALCULE });
  const lendemain = ligneDeService({ homeId: 'fotmob-117', awayId: 'fotmob-118', kickoff: '2026-11-14T23:30:00.000Z', database: db });
  assert.equal(lendemain.trouve, true);
  assert.equal(lendemain.decalageJours, 1);
  // Le jour exact d'abord, même quand le lendemain a aussi une ligne.
  F.poserUneLigne(db, { homeId: 'fotmob-119', awayId: 'fotmob-120', kickoff: '2026-11-14T22:30:00.000Z', calculeLe: CALCULE, lambda: 1.3 });
  F.poserUneLigne(db, { homeId: 'fotmob-119', awayId: 'fotmob-120', kickoff: '2026-11-15T00:30:00.000Z', calculeLe: CALCULE, lambda: 1.9 });
  const exact = ligneDeService({ homeId: 'fotmob-119', awayId: 'fotmob-120', kickoff: '2026-11-14T23:00:00.000Z', database: db });
  assert.deepEqual([exact.decalageJours, exact.lambda], [0, 1.3]);
  // Une ligne sans 1N2 affiché : fair null, la ligne quand même.
  F.poserUneLigne(db, { homeId: 'fotmob-121', awayId: 'fotmob-122', kickoff: K, calculeLe: CALCULE, fair: null });
  assert.equal(ligneDeService({ homeId: 'fotmob-121', awayId: 'fotmob-122', kickoff: K, database: db }).fair, null);
});

// ------------------------------------------------------------ T-L2

test('T-L2 chaque raison d’absence (7) : la structure complète, de ligneDeService au tableau, où le match reste listé avec ses faits', async () => {
  assert.deepEqual(RAISONS_SANS_LIGNE, ['sans-identifiant', 'sans-coup-d-envoi', 'table-absente', 'aucune-nuit', 'aucune-ligne', 'calculee-apres', 'ligne-illisible']);
  const K = iso(T - 34 * MIN);
  const cle = 'fotmob:fotmob-201|fotmob-202|2026-11-14';
  const p = { homeId: 'fotmob-201', awayId: 'fotmob-202', kickoff: K };
  const sansTables = new DatabaseSync(':memory:');
  const sansNuit = F.baseDuDirect();
  const sansLigne = F.baseDuDirect();
  F.poserLaNuit(sansLigne, NUIT);
  const apres = F.baseDuDirect();
  F.poserLaNuit(apres, NUIT);
  F.poserUneLigne(apres, { ...p, calculeLe: CALCULE, apres: 1 });
  const illisible = F.baseDuDirect();
  F.poserLaNuit(illisible, NUIT);
  F.poserUneLigne(illisible, { ...p, calculeLe: CALCULE, grille: 'grille-inconnue' });
  const cas = [
    ['sans-identifiant', sansLigne, { homeId: null }, { cle: null, nuit: null }],
    ['sans-coup-d-envoi', sansLigne, { kickoff: null }, { cle: null, nuit: null }],
    ['table-absente', sansTables, {}, { cle, nuit: null }],
    ['aucune-nuit', sansNuit, {}, { cle, nuit: null }],
    ['aucune-ligne', sansLigne, {}, { cle, nuit: NUIT }],
    ['calculee-apres', apres, {}, { cle, nuit: NUIT }],
    ['ligne-illisible', illisible, {}, { cle, nuit: NUIT }]
  ];
  assert.deepEqual(
    cas.map((c) => c[0]),
    RAISONS_SANS_LIGNE
  );
  for (const [raison, db, change, attendu] of cas) {
    assert.deepEqual(ligneDeService({ ...p, ...change, database: db }), { trouve: false, raison, ...attendu }, raison);
    // Au tableau : le match listé, ses faits, une ligne d'avant-match complète et vide, « sans-avant-match ».
    L.viderLesTables();
    const m = suivi(4201, 'fotmob-201', 'fotmob-202', { minute: 34, h: 1 });
    if ('homeId' in change) m.homeId = null;
    if ('kickoff' in change) m.kickoff = null;
    const r = await lire(db, F.etatMinute({ maintenant: T, matchs: [m] }));
    assert.equal(r.matchs.length, 1, raison);
    const e = r.matchs[0];
    assert.equal(e.etat.phase, 'jeu');
    assert.deepEqual([e.etat.score.home, e.etat.score.away], [1, 0]);
    forme(e.avantMatch, ['trouve', 'raison', 'cle', 'nuit', 'calculeLe', 'grille', 'engineVersion', 'candidateHash', 'lambda', 'mu', 'rho', 'oddsSource', 'oddsAt', 'kickoff', 'kickoffConnu', 'date', 'decalageJours', 'ageAuCoupDEnvoiH', 'coteAgeAuCoupDEnvoiH', 'fair', 'ambre'], raison);
    assert.equal(e.avantMatch.trouve, false);
    assert.equal(e.avantMatch.raison, raison);
    assert.equal(e.avantMatch.cle, attendu.cle);
    for (const k of ['calculeLe', 'grille', 'engineVersion', 'lambda', 'mu', 'rho', 'fair', 'oddsSource', 'kickoff']) assert.equal(e.avantMatch[k], null, `${raison} : ${k}`);
    assert.equal(e.avantMatch.ambre, false);
    assert.deepEqual([e.calcul.fait, e.calcul.raison, e.calcul.un2, e.calcul.variante], [false, 'sans-avant-match', null, null], raison);
    assert.equal(e.calcul.note.raison, 'sans-note');
  }
});

// ------------------------------------------------------------ T-L3

const CLES = Object.freeze({
  tableau: ['version', 'versionDuDirect', 'genereLe', 'rejeu', 'boucle', 'note', 'varianteReglee', 'matchs', 'finis', 'calculs'],
  detail: ['version', 'versionDuDirect', 'genereLe', 'rejeu', 'boucle', 'note', 'varianteReglee', 'suivi', 'raison', 'fin', 'match', 'reference', 'courbe', 'calculs'],
  boucle: ['active', 'pourquoi', 'phrase', 'etat', 'rythme', 'vivante', 'dernierTourLe', 'dernierTourAgeS', 'listeLueLe', 'listeAgeS', 'listeRecueLe', 'prochainCoupDEnvoi', 'suspendueJusqua', 'erreurs', 'suivi46', 'charge', 'rejeu'],
  erreurs: ['consecutives', 'derniere', 'depuis'],
  suivi46: ['module', 'raison', 'pannes', 'dernierePanne'],
  charge: ['depuis', 'tours', 'listesDuDirect', 'listesFotmob', 'listesServies', 'listesEnEchec', 'details', 'horsPlafond'],
  // Correctifs D2 (12/11/2026, point 3) : `page` ajoutée en dernier — la page du match dans l'appli, ou null.
  match: ['fotmobId', 'league', 'leagueKey', 'kickoff', 'date', 'rang', 'home', 'away', 'etat', 'suivi', 'avantMatch', 'calcul', 'page'],
  // Correctifs D2 (point 2 a) : GET /api/direct/en-cours et chacune de ses entrées ; correctif « écrans 1 » (13/11/2026) :
  // `perime` et `ageS` ajoutés en dernier (la règle du relevé du tableau).
  enCours: ['version', 'genereLe', 'rejeu', 'boucle', 'matchs'],
  enCoursMatch: ['fotmobId', 'homeId', 'awayId', 'date', 'libelle', 'phase', 'minute', 'ajout', 'creneau', 'score', 'perime', 'ageS'],
  etat: ['phase', 'raison', 'calculable', 'minute', 'ajout', 'libelle', 'libelleType', 'minuteSource', 'dureeMax', 'creneau', 'part', 'tranche', 'score', 'rouges', 'score90', 'score90Absent', 'prolongation', 'fin', 'memoire', 'releveLe', 'ageS', 'ambre', 'perime', 'perimeCause', 'fige', 'figeDepuisLe', 'copies'],
  score: ['connu', 'home', 'away', 'source', 'depuisLe', 'baisseLe', 'precedent', 'aConfirmer'],
  rouges: ['connus', 'home', 'away', 'source', 'vusLe', 'depuisLe', 'ageS', 'ambre', 'desaccord', 'phrase', 'avantLaPause'],
  suiviMatch: ['vuLe', 'premiereVueLe', 'dernierDetailLe', 'coverage', 'memoire'],
  calcul: ['fait', 'enAttente', 'raison', 'erreur', 'aBlanc', 'note', 'variante', 'varianteSource', 'repli', 'ancrage', 'calculeLe', 'ms', 'masseNegligee', 'deTable', 'un2', 'plus25', 'plus25Etat', 'lesDeuxMarquent', 'lesDeuxMarquentEtat', 'minute0'],
  // § 2.7 de la vérification de la 46 (18/11/2026) : `reconduite` ajoutée en dernier — la reconduction qui vaut pour la ligne, ou null.
  noteMatch: ['applique', 'raison', 'verdict', 'regard', 'tranche', 'trancheNonMontree', 'famillesNonMontrees', 'ecartees', 'aSurveiller', 'reconduite'],
  ancrage: ['fait', 'raison', 'lambda', 'mu', 'borne', 'cible', 'ecart'],
  // Correctifs D3 (12/11/2026, point 2) : `page` ajoutée en dernier — la page « match terminé » de l'appli, ou null.
  fini: ['fotmobId', 'league', 'leagueKey', 'kickoff', 'date', 'home', 'away', 'statut', 'raison', 'phase', 'score', 'finReleveeLe', 'score90', 'score90Absent', 'prolongation', 'page'],
  calculs: ['faits', 'deTable', 'enAttente', 'sansCalcul', 'ancrages', 'c0', 'courbe', 'rendus', 'ms', 'blocMaxMs', 'budgetMs'],
  reference: ['trouvee', 'raison', 'gardeeLe', 'lignes'],
  ligneRef: ['marche', 'ligne', 'issue', 'source', 'bookmaker', 'provenance', 'echange', 'prix', 'proba', 'releveLe', 'ageS', 'avantLeDernierBut', 'avantLeRouge', 'ecartPt', 'raison', 'alerte'],
  courbe: ['variante', 'points', 'trous', 'complete', 'raison'],
  point: ['type', 'at', 'phase', 'libelle', 'creneau', 'part', 'minute', 'score', 'rouges', 'rougesReportes', 'un2', 'raison', 'enAttente']
});

/** Une requête au contrôleur (req, res fabriqués) : rend le corps JSON ; une ApiError remonte telle quelle. */
async function appel(fonction, query) {
  let corps;
  const res = {
    json(x) {
      corps = x;
      return res;
    }
  };
  await fonction({ query }, res);
  return corps;
}

test('T-L3 la forme exacte des deux routes (clés, types) ; null jamais remplacé par 0 (score et rouges inconnus, mémoire absente)', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const m1 = suivi(4301, 'fotmob-301', 'fotmob-302', { minute: 34, h: 1, a: 0, rh: 0, ra: 0 });
  const m2 = suivi(4302, 'fotmob-303', 'fotmob-304', { minute: 20, h: null, a: null }); // score inconnu, rouges inconnus
  const m3 = suivi(4303, 'fotmob-305', 'fotmob-306', { minute: 60, h: 2, a: 1, memoire: false }); // module de la 46 indisponible
  for (const m of [m1, m2, m3]) F.poserUneLigne(db, { homeId: m.homeId, awayId: m.awayId, kickoff: m.kickoff, calculeLe: CALCULE });
  const fin = {
    id: '4304',
    league: 'Premier League - England',
    leagueKey: 'ENG|Premier League',
    date: '2026-11-14',
    kickoff: iso(T - 120 * MIN),
    homeId: 'fotmob-307',
    awayId: 'fotmob-308',
    homeName: 'Domicile',
    awayName: 'Exterieur',
    at: T - 10 * MIN,
    liste: F.listeEnJeu({ id: 4304, homeId: 'fotmob-307', awayId: 'fotmob-308', kickoff: iso(T - 120 * MIN), label: 'FT', h: 2, a: 2, finished: true }),
    fin: { status: 'terminé', homeGoals: 2, awayGoals: 2 },
    memoire: null
  };
  const em = F.etatMinute({ maintenant: T, matchs: [m1, m2, m3], finis: [fin] });
  __reglerControleurDuDirect({ maintenant: () => T, database: () => db, options: { note: null, ...F.sourcesActives(em) } });
  try {
    const r = await appel(getDirect, {});
    forme(r, CLES.tableau, 'tableau');
    assert.equal(r.version, 1);
    assert.equal(r.versionDuDirect, 1);
    assert.equal(r.genereLe, iso(T));
    assert.equal(r.rejeu, null);
    assert.equal(r.varianteReglee, VARIANTE_AFFICHEE);
    assert.deepEqual(r.note, { etat: 'non-juge', raison: 'sans-note' });
    forme(r.boucle, CLES.boucle, 'boucle');
    forme(r.boucle.erreurs, CLES.erreurs);
    forme(r.boucle.suivi46, CLES.suivi46);
    forme(r.boucle.charge, CLES.charge);
    assert.deepEqual([r.boucle.active, r.boucle.pourquoi, r.boucle.etat, r.boucle.rythme, r.boucle.vivante, r.boucle.dernierTourAgeS, r.boucle.listeAgeS], [true, null, 'suivi', 'minute', true, 20, 20]);
    forme(r.calculs, CLES.calculs, 'calculs');
    for (const k of CLES.calculs) assert.equal(typeof r.calculs[k], 'number', k);
    assert.equal(r.calculs.budgetMs, BUDGET_CALCUL_MS);
    assert.equal(r.matchs.length, 3);
    for (const e of r.matchs) {
      forme(e, CLES.match, e.fotmobId);
      forme(e.etat, CLES.etat, e.fotmobId);
      forme(e.etat.score, CLES.score);
      forme(e.etat.rouges, CLES.rouges);
      forme(e.etat.prolongation, ['vueLe', 'joueeLe', 'tirsAuButVusLe']);
      forme(e.etat.fin, ['finished', 'cancelled', 'awarded']);
      forme(e.suivi, CLES.suiviMatch);
      forme(e.home, ['id', 'nom']);
      forme(e.calcul, CLES.calcul, e.fotmobId);
      forme(e.calcul.note, CLES.noteMatch);
      assert.equal(typeof e.fotmobId, 'string');
      assert.equal(e.calcul.aBlanc, true, 'sans note : à blanc');
      // Correctifs D2 (point 3) : ligne de nuit sans match_id, calendrier vide → aucune page sûre, null (jamais devinée).
      assert.equal(e.page, null, `${e.fotmobId} : page`);
    }
    const [e1, e2, e3] = ['4301', '4302', '4303'].map((id) => r.matchs.find((x) => x.fotmobId === id));
    // Le match calculé : les types.
    assert.equal(e1.calcul.fait, true);
    for (const k of ['home', 'draw', 'away']) assert.ok(e1.calcul.un2[k] > 0 && e1.calcul.un2[k] < 1);
    // La grille est bornée : le 1N2 couvre toute la masse, à la masse négligée près (au-delà de 1e-4, le calcul est une erreur).
    assert.ok(e1.calcul.masseNegligee >= 0 && e1.calcul.masseNegligee <= 1e-4, `masse négligée ${e1.calcul.masseNegligee}`);
    proche(e1.calcul.un2.home + e1.calcul.un2.draw + e1.calcul.un2.away, 1, 'somme du 1N2', 1e-4);
    assert.equal(typeof e1.calcul.plus25, 'number');
    assert.equal(e1.calcul.plus25Etat, 'ouvert');
    assert.equal(typeof e1.calcul.lesDeuxMarquent, 'number');
    assert.equal(e1.calcul.calculeLe, iso(T));
    forme(e1.calcul.ancrage, CLES.ancrage);
    assert.equal(e1.calcul.repli, null);
    forme(e1.calcul.minute0, ['avantDepuis', 'complet', 'marches']);
    assert.equal(e1.calcul.minute0.complet, false);
    for (const [k, v] of Object.entries(e1.calcul.minute0.marches)) {
      forme(v, ['avant', 'direct', 'ecartPt', 'dit'], k);
      assert.ok(k.startsWith('result.') || v.dit === true, `${k} : au tableau, le 1N2 et les marchés dont l'écart est dit`);
    }
    assert.ok(!('marches' in e1.calcul), 'au tableau, pas de marchés complets');
    assert.equal(e1.etat.tranche, '31-45');
    assert.equal(e1.etat.creneau, 33);
    assert.deepEqual([e1.etat.rouges.connus, e1.etat.rouges.home, e1.etat.rouges.away], [true, 0, 0]);
    // Score et rouges inconnus : null, jamais 0 ; pas de calcul (« score-inconnu »).
    assert.deepEqual([e2.etat.score.connu, e2.etat.score.home, e2.etat.score.away, e2.etat.score.source], [false, null, null, null]);
    assert.deepEqual([e2.etat.rouges.connus, e2.etat.rouges.home, e2.etat.rouges.away], [false, null, null]);
    assert.deepEqual([e2.calcul.fait, e2.calcul.raison, e2.calcul.un2, e2.calcul.plus25], [false, 'score-inconnu', null, null]);
    assert.equal(e2.etat.calculable, false);
    // Sans mémoire (module de la 46 indisponible) : l'âge depuis listeFotmobA, le score de la liste.
    assert.equal(e3.etat.memoire, false);
    assert.equal(e3.suivi.memoire, false);
    assert.deepEqual([e3.etat.score.home, e3.etat.score.away, e3.etat.ageS], [2, 1, 20]);
    assert.equal(e3.calcul.fait, true);
    // Les finis.
    assert.equal(r.finis.length, 1);
    forme(r.finis[0], CLES.fini);
    assert.deepEqual([r.finis[0].statut, r.finis[0].raison, r.finis[0].score.home, r.finis[0].score.away, r.finis[0].finReleveeLe], ['terminé', 'fini', 2, 2, iso(T - 10 * MIN)]);

    // Le détail : la même entrée, plus les marchés complets, la minute 0 complète, la référence et la courbe.
    const d = await appel(getDirectMatch, { id: '4301' });
    forme(d, CLES.detail, 'détail');
    assert.deepEqual([d.suivi, d.raison, d.fin], [true, null, null]);
    forme(d.match, CLES.match);
    forme(d.match.calcul, [...CLES.calcul, 'marches']);
    forme(d.match.calcul.marches, ['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal', 'scoreExact']);
    assert.equal(d.match.calcul.minute0.complet, true);
    const auTableau = e1.calcul.minute0.marches;
    const auDetail = d.match.calcul.minute0.marches;
    for (const [k, v] of Object.entries(auTableau)) assert.deepEqual(auDetail[k], v, `minute 0, ${k} : la même au détail`);
    assert.ok(Object.keys(auDetail).includes('totalGoals.2.5.over') && Object.keys(auDetail).includes('bothTeamsScore.yes'), 'au détail, tous les marchés');
    forme(d.reference, CLES.reference);
    assert.deepEqual([d.reference.trouvee, d.reference.raison, d.reference.lignes], [false, 'aucune-cote', []]);
    forme(d.courbe, CLES.courbe);
    for (const p of d.courbe.points) forme(p, CLES.point);
    // Non suivi : la même enveloppe, match, référence et courbe à null.
    const n = await appel(getDirectMatch, { id: '4999' });
    forme(n, CLES.detail, 'non suivi');
    assert.deepEqual([n.suivi, n.raison, n.match, n.reference, n.courbe], [false, 'inconnu', null, null, null]);
    const nf = await appel(getDirectMatch, { id: '4304' });
    assert.deepEqual([nf.suivi, nf.raison], [false, 'fini']);
    forme(nf.fin, CLES.fini);
  } finally {
    __reglerControleurDuDirect();
  }
});

// ------------------------------------------------------------ T-L4

test('T-L4 les routes : un nom refusé (400), un identifiant mal formé, `instant` hors du bac sur les deux routes (R28) ; par identifiants + coup d’envoi ; par id ; module illisible et lecture ratée → « illisible »', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const m = suivi(4401, 'fotmob-401', 'fotmob-402', { minute: 34, h: 1 });
  F.poserUneLigne(db, { homeId: m.homeId, awayId: m.awayId, kickoff: m.kickoff, calculeLe: CALCULE });
  const em = F.etatMinute({ maintenant: T, matchs: [m] });
  const regler = (r = {}) => __reglerControleurDuDirect({ maintenant: () => T, database: () => db, rejeuPermis: () => false, options: { note: null, ...F.sourcesActives(em) }, ...r });
  const refuse = (fonction, query, motif) =>
    assert.rejects(
      () => appel(fonction, query),
      (e) => e.statusCode === 400 && motif.test(e.message),
      JSON.stringify(query)
    );
  regler();
  try {
    const coup = m.kickoff;
    await refuse(getDirectMatch, { home: 'Arsenal', away: 'fotmob-402', coup }, /jamais un nom/);
    await refuse(getDirectMatch, { home: 'fotmob-401', away: 'Exterieur FC', coup }, /jamais un nom/);
    await refuse(getDirectMatch, { home: 'fotmob-0401', away: 'fotmob-402', coup }, /jamais un nom/);
    await refuse(getDirectMatch, { id: '44a01' }, /identifiant de match FotMob/);
    await refuse(getDirectMatch, { id: '04401' }, /identifiant de match FotMob/);
    await refuse(getDirectMatch, { id: ['4401', '4402'] }, /identifiant de match FotMob/);
    await refuse(getDirectMatch, { home: 'fotmob-401', away: 'fotmob-402' }, /"coup" doit être une date ISO/);
    await refuse(getDirectMatch, { home: 'fotmob-401', away: 'fotmob-402', coup: 'samedi soir' }, /"coup" doit être une date ISO/);
    await refuse(getDirectMatch, {}, /jamais un nom/);
    // Le rejeu hors du bac : 400 sur les deux routes ; une date illisible : 400 aussi.
    await refuse(getDirect, { instant: iso(T - 5 * MIN) }, /bac à sable/);
    await refuse(getDirectMatch, { id: '4401', instant: iso(T - 5 * MIN) }, /bac à sable/);
    await refuse(getDirect, { instant: 'hier' }, /"instant" doit être une date ISO/);
    // Par identifiants + coup d'envoi (à moins de 3 h), et par id.
    const parIds = await appel(getDirectMatch, { home: 'fotmob-401', away: 'fotmob-402', coup: iso(Date.parse(coup) + 90 * MIN) });
    assert.deepEqual([parIds.suivi, parIds.match.fotmobId], [true, '4401']);
    const loin = await appel(getDirectMatch, { home: 'fotmob-401', away: 'fotmob-402', coup: iso(T + 4 * 60 * MIN) });
    assert.deepEqual([loin.suivi, loin.raison], [false, 'pas-commence']);
    const parId = await appel(getDirectMatch, { id: ' 4401 ' });
    assert.deepEqual([parId.suivi, parId.match.fotmobId, parId.match.calcul.fait], [true, '4401', true]);
    // Le module rend aussi le refus (sans le contrôleur) : RejeuRefuse, code « rejeu-refuse ».
    for (const lecture of [L.tableauDuDirect, L.matchDuDirect]) {
      await assert.rejects(
        () => lecture({ maintenant: T, database: db, instant: iso(T - MIN), rejeuPermis: false, id: '4401' }),
        (e) => e instanceof L.RejeuRefuse && e.code === 'rejeu-refuse'
      );
    }
    assert.equal(L.rejeuPermis({ env: {}, bac: false }), false);
    // Mineur du 13/11 soir (comme C5) : CM_TEST_DOSSIER n'ouvre le rejeu que s'il CONTIENT ce code — un dossier étranger, non.
    assert.equal(L.rejeuPermis({ env: { CM_TEST_DOSSIER: 'C:/essai' }, bac: false }), false);
    assert.equal(L.rejeuPermis({ env: { CM_TEST_DOSSIER: path.join(SERVEUR, 'src') }, bac: false }), false, 'un dossier DANS le serveur ne le contient pas');
    assert.equal(L.rejeuPermis({ env: { CM_TEST_DOSSIER: path.dirname(SERVEUR) }, bac: false }), true);
    assert.equal(L.rejeuPermis({ env: {}, bac: true }), true);
    // S2 (mineur du 13/11 soir) : le chemin RÉEL du contrôleur — aucune permission réglée, celle du module chargé est APPELÉE.
    for (const [permis, attendu] of [
      [() => false, 'refus'],
      [() => true, 'rejeu']
    ]) {
      __reglerControleurDuDirect({ maintenant: () => T, database: () => db, charger: async () => ({ ...L, rejeuPermis: permis }), options: { note: null, ...F.sourcesActives(em) } });
      const I = iso(T - 5 * MIN);
      for (const [fonction, query] of [
        [getDirect, { instant: I }],
        [getDirectMatch, { id: '4401', instant: I }],
        [getDirectEnCours, { instant: I }]
      ]) {
        if (attendu === 'refus') await refuse(fonction, query, /bac à sable/);
        else assert.deepEqual((await appel(fonction, query)).rejeu, { instant: I }, `${fonction.name} : le rejeu accepté`);
      }
    }
    // Permis : la même requête rejoue l'instant.
    regler({ rejeuPermis: () => true });
    const rejeu = await appel(getDirect, { instant: iso(T - 5 * MIN) });
    assert.deepEqual(rejeu.rejeu, { instant: iso(T - 5 * MIN) });
    assert.equal(rejeu.boucle.rejeu.source, 'live_snapshots');
    // Le module de lecture illisible : les deux routes répondent « illisible », jamais une 500 ; la validation d'abord.
    regler({ charger: () => Promise.reject(new Error('module cassé (essai)')) });
    assert.deepEqual(await appel(getDirect, {}), { version: 1, etat: 'illisible', raison: 'module-illisible', genereLe: iso(T) });
    assert.deepEqual(await appel(getDirectMatch, { id: '4401' }), { version: 1, etat: 'illisible', raison: 'module-illisible', genereLe: iso(T) });
    await refuse(getDirectMatch, { home: 'Arsenal', away: 'fotmob-402', coup }, /jamais un nom/);
    // Une lecture qui lève : « lecture-ratee », avec le message.
    regler({ options: { note: null, ...F.sourcesActives(em), etatMinute: () => { throw new Error('boum (essai)'); } } });
    assert.deepEqual(await appel(getDirect, {}), { version: 1, etat: 'illisible', raison: 'lecture-ratee', genereLe: iso(T), message: 'boum (essai)' });
  } finally {
    __reglerControleurDuDirect();
  }
});

// ------------------------------------------------------------ T-L5

test('T-L5 la table en mémoire : même état → un seul calcul ; un but → un calcul neuf ; deux requêtes en même temps sur 30 matchs neufs → 30 calculs, pas 60', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const trois = matchsReels(3, { premier: 4501, base: 5000 });
  const em = F.etatMinute({ maintenant: T, matchs: trois });
  const a = await lire(db, em, { ligneDe: ligneVariee });
  assert.equal(a.calculs.faits, 3);
  const c1 = L.etatDesTables().compteurs;
  const b = await lire(db, em, { ligneDe: ligneVariee });
  assert.deepEqual([b.calculs.faits, b.calculs.deTable, b.calculs.ancrages, b.calculs.c0], [0, 3, 0, 0]);
  assert.deepEqual(L.etatDesTables().compteurs, c1, 'aucun calcul de plus');
  for (const e of b.matchs) assert.equal(e.calcul.deTable, true);
  assert.deepEqual(
    b.matchs.map((e) => e.calcul.un2),
    a.matchs.map((e) => e.calcul.un2)
  );
  // Un but pour le premier : un calcul neuf pour lui seul (C0 et l'ancrage restent ceux de la table).
  const avecBut = trois.map((m, i) =>
    i === 0 ? suivi(4501, m.homeId, m.awayId, { coup: m.kickoff, minute: 1, lectures: [{ t: T - 80_000, liste: m.liste }, { t: T - 20_000, liste: { ...m.liste, homeGoals: m.liste.homeGoals + 1 } }] }) : m
  );
  const c = await lire(db, F.etatMinute({ maintenant: T, matchs: avecBut }), { ligneDe: ligneVariee });
  assert.deepEqual([c.calculs.faits, c.calculs.deTable, c.calculs.ancrages, c.calculs.c0], [1, 2, 0, 0]);
  const neuf = c.matchs.find((e) => e.fotmobId === '4501');
  assert.equal(neuf.calcul.deTable, false);
  assert.notDeepEqual(neuf.calcul.un2, a.matchs.find((e) => e.fotmobId === '4501').calcul.un2);

  // Deux requêtes lancées ensemble sur 30 matchs neufs : chaque calcul fait une fois (table relue juste avant).
  L.viderLesTables();
  const em30 = F.etatMinute({ maintenant: T, matchs: matchsReels(30, { premier: 4510, base: 5100 }) });
  const [x, y] = await Promise.all([lire(db, em30, { ligneDe: ligneVariee, budgetMs: 600_000 }), lire(db, em30, { ligneDe: ligneVariee, budgetMs: 600_000 })]);
  const n = L.etatDesTables().compteurs;
  assert.equal(n.calculs, 30, 'trente calculs, pas soixante');
  assert.equal(n.c0, 30);
  // Un ancrage par ligne qui a un 1N2 d'avant-match (sans `fair`, direct-v1 d'emblée, P2).
  const avecFair = em30.matchs.filter((m) => ligneVariee({ homeId: m.homeId, awayId: m.awayId, kickoff: m.kickoff }).fair).length;
  assert.ok(avecFair > 0 && avecFair < 30, `${avecFair} lignes avec un fair`);
  assert.equal(n.ancrages, avecFair, 'un ancrage par ligne, pas deux');
  assert.equal(x.calculs.faits + y.calculs.faits, 30);
  assert.equal(x.calculs.deTable + y.calculs.deTable, 30);
  for (const r of [x, y]) for (const e of r.matchs) assert.equal(e.calcul.fait, true);
  assert.deepEqual(
    x.matchs.map((e) => e.calcul.un2),
    y.matchs.map((e) => e.calcul.un2)
  );
});

// ------------------------------------------------------------ T-L6 et P6 bis

/** Une requête mesurée : sa durée, et le plus long silence d'un battement extérieur (setImmediate) pendant qu'elle tourne. */
async function mesurer(db, em, extra = {}) {
  let max = 0;
  let dernier = performance.now();
  let actif = true;
  const battre = () => {
    const n = performance.now();
    max = Math.max(max, n - dernier);
    dernier = n;
    if (actif) setImmediate(battre);
  };
  setImmediate(battre);
  const t0 = performance.now();
  const r = await lire(db, em, { ligneDe: ligneVariee, ...extra });
  const ms = performance.now() - t0;
  actif = false;
  await new Promise((fin) => setImmediate(fin));
  return { r, ms, battementMax: max };
}
/** Un essai de minutage, relancé UNE fois s'il tombe sous la charge (et dit) ; le second essai fait foi. */
async function minutage(t, nom, essai) {
  const premier = await essai();
  if (premier.ok) return premier;
  t.diagnostic(`${nom} : minutage tombé sous la charge (${premier.pourquoi}) — relancé une fois`);
  return essai();
}

test('T-L6 le budget (O2) : 30 matchs réalistes en une requête, moins de 1 000 ms, tous calculés, aucun bloc de plus de 100 ms ; 40 matchs neufs → une partie « en attente », le reste aux requêtes suivantes', async (t) => {
  const db = F.baseDuDirect();
  // Le premier calcul du processus compile le code : un tableau d'autres matchs d'abord (le serveur ne le paie qu'une fois).
  await lire(db, F.etatMinute({ maintenant: T, matchs: matchsReels(5, { premier: 4600, base: 6900 }) }), { ligneDe: ligneVariee });
  const em30 = F.etatMinute({ maintenant: T, matchs: matchsReels(30, { premier: 4610, base: 6000 }) });
  const trente = await minutage(t, '30 matchs', async () => {
    L.viderLesTables();
    const m = await mesurer(db, em30);
    const ok = m.ms < 1000 && m.r.calculs.enAttente === 0 && m.r.calculs.blocMaxMs <= BLOC_MAX_MS && m.battementMax <= BLOC_MAX_MS;
    return { ...m, ok, pourquoi: `${Math.round(m.ms)} ms, ${m.r.calculs.enAttente} en attente, bloc ${m.r.calculs.blocMaxMs} ms, battement ${Math.round(m.battementMax)} ms` };
  });
  t.diagnostic(`30 matchs : ${Math.round(trente.ms)} ms, pire bloc ${trente.r.calculs.blocMaxMs} ms (battement ${Math.round(trente.battementMax)} ms), ${trente.r.calculs.rendus} mains rendues`);
  assert.ok(trente.ms < 1000, `${trente.ms} ms`);
  assert.equal(trente.r.matchs.length, 30);
  assert.equal(trente.r.calculs.enAttente, 0);
  assert.equal(trente.r.calculs.faits, 30);
  for (const e of trente.r.matchs) assert.equal(e.calcul.fait, true, e.fotmobId);
  assert.ok(trente.r.calculs.blocMaxMs <= BLOC_MAX_MS, `bloc de ${trente.r.calculs.blocMaxMs} ms`);
  assert.ok(trente.battementMax <= BLOC_MAX_MS, `battement de ${trente.battementMax} ms`);
  assert.ok(trente.r.calculs.rendus >= 30, 'la main rendue avant chaque calcul');

  // 40 matchs neufs, budget épuisé d'emblée : tous listés avec leurs faits, tous « en attente » ; les requêtes suivantes
  // reprennent (chacune avance, ce qui est fait vient de la table) jusqu'à ce que plus rien n'attende.
  const em40 = F.etatMinute({ maintenant: T, matchs: matchsReels(40, { premier: 4650, base: 6100 }) });
  L.viderLesTables();
  const a = await lire(db, em40, { ligneDe: ligneVariee, budgetMs: 0 });
  assert.equal(a.matchs.length, 40);
  assert.deepEqual([a.calculs.faits, a.calculs.enAttente, a.calculs.budgetMs], [0, 40, 0]);
  for (const e of a.matchs) {
    assert.deepEqual([e.calcul.enAttente, e.calcul.raison, e.calcul.fait, e.calcul.un2], [true, 'en-attente', false, null], e.fotmobId);
    assert.equal(e.avantMatch.trouve, true, 'les faits sont là');
    assert.equal(e.etat.phase, 'jeu');
  }
  const suite = await jusquAuBout(db, em40);
  t.diagnostic(`40 matchs neufs : tout calculé en ${suite.requetes} requête(s) après la première`);
  assert.equal(suite.faits, 40);
  for (const e of suite.derniere.matchs) assert.equal(e.calcul.fait, true);

  // Un budget court (150 ms) : une partie faite, dans l'ordre du tableau, le reste en attente ; la suite reprend de la table.
  const partiel = await minutage(t, '40 matchs, budget de 150 ms', async () => {
    L.viderLesTables();
    const c = await lire(db, em40, { ligneDe: ligneVariee, budgetMs: 150 });
    return { c, ok: c.calculs.faits >= 1 && c.calculs.enAttente >= 1, pourquoi: `${c.calculs.faits} faits, ${c.calculs.enAttente} en attente` };
  });
  const { c } = partiel;
  t.diagnostic(`budget de 150 ms : ${c.calculs.faits} matchs faits, ${c.calculs.enAttente} en attente`);
  assert.ok(c.calculs.faits >= 1 && c.calculs.enAttente >= 1, `${c.calculs.faits} faits, ${c.calculs.enAttente} en attente`);
  assert.equal(c.calculs.faits + c.calculs.enAttente, 40);
  assert.equal(c.matchs.length, 40);
  // L'ordre du tableau : les premiers (rang, coup d'envoi) sont faits d'abord.
  const faits = c.matchs.map((e) => e.calcul.fait);
  assert.equal(faits.indexOf(false), c.calculs.faits, 'les matchs faits sont les premiers du tableau');
  const reste = await jusquAuBout(db, em40, c.calculs.faits);
  assert.equal(reste.faits, 40 - c.calculs.faits);
});

/** Des requêtes jusqu'à ce que plus rien n'attende : chacune avance d'au moins un match, ce qui est déjà fait vient de la table. */
async function jusquAuBout(db, em, dejaFaits = 0) {
  let faits = 0;
  let requetes = 0;
  let derniere;
  do {
    derniere = await lire(db, em, { ligneDe: ligneVariee });
    requetes++;
    const k = derniere.calculs;
    assert.ok(k.faits >= 1, `la requête ${requetes} avance`);
    assert.equal(k.deTable, dejaFaits + faits, 'ce qui est déjà fait vient de la table');
    assert.equal(k.faits + k.deTable + k.enAttente, em.matchs.length);
    faits += k.faits;
  } while (derniere.calculs.enAttente > 0 && requetes < 20);
  assert.equal(derniere.calculs.enAttente, 0);
  return { faits, requetes, derniere };
}

test('P6 bis — 60 matchs en cours donnent 60 entrées, jamais coupées (même sans aucun budget), dans l’ordre du tableau', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const soixante = matchsReels(60, { premier: 4700, base: 7000 });
  soixante[59].rang = 0; // un favori : en tête
  const em = F.etatMinute({ maintenant: T, matchs: soixante });
  for (const budgetMs of [0, undefined]) {
    const r = await lire(db, em, { ligneDe: ligneVariee, ...(budgetMs === undefined ? {} : { budgetMs }) });
    assert.equal(r.matchs.length, 60, `budget ${budgetMs}`);
    assert.deepEqual(new Set(r.matchs.map((e) => e.fotmobId)), new Set(soixante.map((m) => m.id)));
    assert.equal(r.matchs[0].fotmobId, '4759', 'le rang d’abord');
    assert.equal(r.calculs.faits + r.calculs.deTable + r.calculs.enAttente, 60);
    for (const e of r.matchs) assert.ok(e.etat.phase === 'jeu' && e.avantMatch.trouve, e.fotmobId);
  }
});

// ------------------------------------------------------------ T-L7

/** name → taille et date de modification, de tout ce qui est sous un dossier. */
function inventaire(dossier) {
  const o = {};
  if (!fs.existsSync(dossier)) return o;
  for (const f of fs.readdirSync(dossier, { recursive: true }).map(String)) {
    const s = fs.statSync(path.join(dossier, f));
    o[f] = s.isFile() ? `${s.size}|${s.mtimeMs}` : 'dossier';
  }
  return o;
}

test('T-L7 aucune écriture : total_changes() inchangé après 50 appels (tableau, détail, non suivi, rejeu, référence, courbe) ; rien de créé ni de modifié dans data/runtime', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const m = suivi(4801, 'fotmob-801', 'fotmob-802', { minute: 34, h: 1 });
  F.poserUneLigne(db, { homeId: m.homeId, awayId: m.awayId, kickoff: m.kickoff, calculeLe: CALCULE });
  F.poserUnInstantane(db, { fotmobId: 4801, takenAt: iso(T - 10 * MIN), kickoff: m.kickoff, homeId: m.homeId, awayId: m.awayId, label: lbl(24), minute: 24, h: 1, a: 0 });
  F.poserDesCotes(db, { homeId: m.homeId, awayId: m.awayId, date: '2026-11-14', live: { home: [{ price: 1.5, releveAt: iso(T - 5 * MIN) }], draw: [{ price: 4.2, releveAt: iso(T - 5 * MIN) }], away: [{ price: 7.5, releveAt: iso(T - 5 * MIN) }] } });
  const em = F.etatMinute({ maintenant: T, matchs: [m] });
  const RUNTIME = path.join(SERVEUR, 'data', 'runtime');
  const fichiers = inventaire(RUNTIME);
  const changements = () => db.prepare('SELECT total_changes() AS n').get().n;
  const avant = changements();
  for (let i = 0; i < 10; i++) {
    const maintenant = T + i * 7000;
    await L.tableauDuDirect({ maintenant, database: db, note: null, ...F.sourcesActives(em) });
    await L.matchDuDirect({ maintenant, database: db, note: null, ...F.sourcesActives(em), id: '4801' });
    await L.matchDuDirect({ maintenant, database: db, note: null, ...F.sourcesActives(em), home: 'fotmob-891', away: 'fotmob-892', coup: iso(T + 3_600_000) });
    // Correctifs D2 : `calendrier` vide ajouté (la page du match ne lit jamais le vrai calendrier dans un essai).
    await L.tableauDuDirect({ maintenant, database: db, note: null, instant: iso(T - 8 * MIN), rejeuPermis: true, calendrier: () => [] });
    await L.matchDuDirect({ maintenant, database: db, note: null, instant: iso(T - 8 * MIN), rejeuPermis: true, id: '4801', ligneDe: (q) => F.ligneFabriquee(q), calendrier: () => [] });
  }
  assert.equal(changements(), avant, 'aucune ligne écrite, modifiée ni retirée');
  assert.deepEqual(inventaire(RUNTIME), fichiers, 'data/runtime inchangé');
});

// ------------------------------------------------------------ T-L8

test('T-L8 la référence (R2) : marge retirée, prix d’échange dit, source retardée, anomalie, issue manquante, avantLeDernierBut et avantLeRouge, JAMAIS d’écart, aucune cote payante, gardée 60 s', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const H = 'fotmob-811';
  const A = 'fotmob-812';
  const K = iso(T - 34 * MIN);
  const liste = (h, ra) => F.listeEnJeu({ id: 4811, homeId: H, awayId: A, kickoff: K, label: lbl(34), maxTime: 45, h, a: 0, rh: 0, ra });
  // But à T − 10 min (0-0 → 1-0), rouge de l'extérieur à T − 5 min.
  const m = F.matchSuivi({ id: 4811, homeId: H, awayId: A, kickoff: K, lectures: [{ t: T - 20 * MIN, liste: liste(0, 0) }, { t: T - 10 * MIN, liste: liste(1, 0) }, { t: T - 5 * MIN, liste: liste(1, 1) }, { t: T - 20_000, liste: liste(1, 1) }] });
  F.poserUneLigne(db, { homeId: H, awayId: A, kickoff: K, calculeLe: CALCULE });
  const date = '2026-11-14';
  const r1x2 = (t, prix) => ({ home: [{ price: prix[0], releveAt: iso(t) }], draw: [{ price: prix[1], releveAt: iso(t) }], away: [{ price: prix[2], releveAt: iso(t) }] });
  F.poserDesCotes(db, { source: 'espn', bookmaker: 'Bookmaker A', homeId: H, awayId: A, date, live: r1x2(T - 15 * MIN, [1.5, 4.2, 7.5]) });
  F.poserDesCotes(db, { source: 'espn', bookmaker: 'Bookmaker B', homeId: H, awayId: A, date, live: r1x2(T - 2 * MIN, [1.25, 5.5, 12]) });
  F.poserDesCotes(db, { source: 'espn', bookmaker: 'Bookmaker C', homeId: H, awayId: A, date, live: r1x2(T - 2 * MIN, [3.5, 3.6, 3.7]) });
  F.poserDesCotes(db, { source: 'espn', bookmaker: 'Bookmaker A', homeId: H, awayId: A, date, market: 'ou', line: 2.5, live: { over: [{ price: 1.4, releveAt: iso(T - 2 * MIN) }], under: [{ price: 2.9, releveAt: iso(T - 2 * MIN) }] } });
  F.poserDesCotes(db, { source: 'espn', bookmaker: 'Bookmaker A', homeId: H, awayId: A, date, market: 'ou', line: 4.5, live: { over: [{ price: 3.4, releveAt: iso(T - 2 * MIN) }], under: [{ price: 1.3, releveAt: iso(T - 2 * MIN) }] } });
  F.poserDesCotes(db, { source: 'espn', bookmaker: 'Bookmaker A', homeId: H, awayId: A, date, market: 'btts', live: { yes: [{ price: 2.1, releveAt: iso(T - 2 * MIN) }] } });
  F.poserDesCotes(db, { source: 'kalshi', bookmaker: 'Kalshi', homeId: H, awayId: A, date, live: { home: [{ price: 1.6, prob: 0.62, releveAt: iso(T - 4 * MIN) }] } });
  F.poserDesCotes(db, { source: 'smarkets', bookmaker: 'Smarkets', homeId: H, awayId: A, date, live: { home: [{ price: 1.5, releveAt: iso(T - 3 * MIN) }] } });
  F.poserDesCotes(db, { source: 'odds-api', bookmaker: 'Bookmaker P', homeId: H, awayId: A, date, live: r1x2(T - MIN, [1.3, 5, 9]) });
  const em = F.etatMinute({ maintenant: T, matchs: [m] });
  const d = await detail(db, em, { id: '4811' });
  const ref = d.reference;
  assert.deepEqual([ref.trouvee, ref.raison, ref.gardeeLe], [true, null, iso(T)]);
  const cle = (l) => `${l.marche}|${l.ligne}|${l.source}|${l.bookmaker}|${l.issue}`;
  assert.deepEqual(ref.lignes.map(cle), [
    '1x2|null|espn|Bookmaker A|home',
    '1x2|null|espn|Bookmaker A|draw',
    '1x2|null|espn|Bookmaker A|away',
    '1x2|null|espn|Bookmaker B|home',
    '1x2|null|espn|Bookmaker B|draw',
    '1x2|null|espn|Bookmaker B|away',
    '1x2|null|espn|Bookmaker C|home',
    '1x2|null|espn|Bookmaker C|draw',
    '1x2|null|espn|Bookmaker C|away',
    '1x2|null|kalshi|Kalshi|home',
    '1x2|null|smarkets|Smarkets|home',
    'ou|2.5|espn|Bookmaker A|over',
    'ou|2.5|espn|Bookmaker A|under',
    'btts|null|espn|Bookmaker A|yes'
  ], 'ni la ligne 4,5 (hors du lot 1), ni la source payante');
  for (const l of ref.lignes) {
    forme(l, CLES.ligneRef);
    assert.equal(l.ecartPt, null, 'JAMAIS d’écart (R2 a)');
    assert.equal(l.raison, 'pas-le-meme-instant');
    assert.notEqual(l.source, 'odds-api');
  }
  const ligne = (k) => ref.lignes.find((l) => cle(l) === k);
  const pa = removeMargin([1.5, 4.2, 7.5]).probabilities;
  ['home', 'draw', 'away'].forEach((issue, i) => proche(ligne(`1x2|null|espn|Bookmaker A|${issue}`).proba, pa[i], `marge retirée (${issue})`));
  const a = ligne('1x2|null|espn|Bookmaker A|home');
  assert.deepEqual([a.prix, a.echange, a.alerte, a.releveLe, a.ageS], [1.5, false, null, iso(T - 15 * MIN), 900]);
  assert.deepEqual([a.avantLeDernierBut, a.avantLeRouge], [true, true], 'relevé avant le but et avant le rouge');
  const bB = ligne('1x2|null|espn|Bookmaker B|home');
  assert.deepEqual([bB.avantLeDernierBut, bB.avantLeRouge], [false, false]);
  assert.deepEqual(['home', 'draw', 'away'].map((i) => ligne(`1x2|null|espn|Bookmaker C|${i}`).proba), [null, null, null], 'anomalie : aucune probabilité');
  assert.equal(ligne('1x2|null|espn|Bookmaker C|home').alerte, 'anomalie');
  assert.equal(ligne('1x2|null|espn|Bookmaker C|home').prix, 3.5, 'le prix reste dit');
  const k = ligne('1x2|null|kalshi|Kalshi|home');
  assert.deepEqual([k.echange, k.proba, k.prix, k.alerte], [true, 0.62, 1.6, null], 'échange : sa probabilité, telle quelle');
  const s = ligne('1x2|null|smarkets|Smarkets|home');
  assert.deepEqual([s.echange, s.alerte, s.prix], [true, 'source-retardee', 1.5]);
  proche(s.proba, 1 / 1.5, 'smarkets sans probabilité : 1 / prix');
  const po = removeMargin([1.4, 2.9]).probabilities;
  proche(ligne('ou|2.5|espn|Bookmaker A|over').proba, po[0], 'plus de 2,5');
  const btts = ligne('btts|null|espn|Bookmaker A|yes');
  assert.deepEqual([btts.alerte, btts.proba, btts.prix], ['issue-manquante', null, 2.1]);
  // Aucune cote payante, par construction : `avecPayantes` n'apparaît nulle part dans la lecture.
  assert.ok(!/avecPayantes/.test(fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'direct', 'lectureDuDirect.js'), 'utf8')));
  // Gardée 60 s : relue à 61 s seulement ; les drapeaux recalculés à chaque requête.
  const n0 = L.etatDesTables().compteurs.references;
  const d2 = await L.matchDuDirect({ maintenant: T + 30_000, database: db, note: null, ...F.sourcesActives(em), id: '4811' });
  assert.equal(L.etatDesTables().compteurs.references, n0, 'gardée');
  assert.equal(d2.reference.lignes[0].ageS, 930, 'l’âge recalculé');
  await L.matchDuDirect({ maintenant: T + 61_000, database: db, note: null, ...F.sourcesActives(em), id: '4811' });
  assert.equal(L.etatDesTables().compteurs.references, n0 + 1, 'relue après 60 s');
  // Un match sans cote : « aucune-cote ».
  const sans = suivi(4812, 'fotmob-813', 'fotmob-814', { minute: 34 });
  const d3 = await detail(db, F.etatMinute({ maintenant: T, matchs: [sans] }), { id: '4812' });
  assert.deepEqual([d3.reference.trouvee, d3.reference.raison, d3.reference.lignes], [false, 'aucune-cote', []]);
});

// ------------------------------------------------------------ T-L9

test('T-L9 la courbe : un point par instantané, trou de plus de 12 min dit, rouges reportés, prolongation sans chiffre ; second appel sans aucun calcul', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const H = 'fotmob-901';
  const A = 'fotmob-902';
  const m = suivi(4901, H, A, { minute: 34, h: 1, a: 0, rh: 0, ra: 1 });
  F.poserUneLigne(db, { homeId: H, awayId: A, kickoff: m.kickoff, calculeLe: CALCULE });
  const snap = (dt, o) => F.poserUnInstantane(db, { fotmobId: 4901, takenAt: iso(T - dt * MIN), kickoff: m.kickoff, homeId: H, awayId: A, ...o });
  snap(30, { label: lbl(5), minute: 5, h: 0, a: 0 });
  snap(25, { label: lbl(10), minute: 10, h: 0, a: 0, rh: 0, ra: 0 });
  snap(20, { label: lbl(15), minute: 15, h: 0, a: 0 }); // rouges non publiés : ceux d'avant, reportés
  snap(7, { label: lbl(28), minute: 28, h: 1, a: 0, rh: 0, ra: 1, source: 'liste + détail' }); // 13 minutes plus tard : un trou
  const em = F.etatMinute({ maintenant: T, matchs: [m] });
  const d = await detail(db, em, { id: '4901' });
  const c = d.courbe;
  assert.equal(c.variante, 'direct-ancre');
  assert.deepEqual(
    c.points.map((p) => p.type),
    ['avant-match', 'instantane', 'instantane', 'instantane', 'instantane', 'courant']
  );
  assert.deepEqual(c.trous, [{ de: iso(T - 20 * MIN), a: iso(T - 7 * MIN) }]);
  assert.equal(c.complete, false, 'un trou : la courbe est coupée');
  assert.deepEqual(c.points[0].un2, { home: 0.45, draw: 0.28, away: 0.27 }, 'avant-match : le 1N2 de la ligne');
  assert.equal(c.points[0].at, CALCULE);
  const [, p5, p10, p15, p28, courant] = c.points;
  assert.deepEqual([p5.rouges, p5.rougesReportes], [null, false], 'aucun rouge connu : null, jamais 0');
  assert.deepEqual([p10.rouges, p10.rougesReportes], [{ home: 0, away: 0 }, false]);
  assert.deepEqual([p15.rouges, p15.rougesReportes], [{ home: 0, away: 0 }, true], 'reportés de l’instantané d’avant');
  assert.deepEqual([p28.rouges, p28.score], [{ home: 0, away: 1 }, { home: 1, away: 0 }]);
  for (const p of [p5, p10, p15, p28]) {
    assert.equal(p.phase, 'jeu');
    assert.equal(p.raison, null);
    proche(p.un2.home + p.un2.draw + p.un2.away, 1, `point ${p.libelle}`, 1e-4);
  }
  assert.equal(p5.libelle, "5'");
  assert.equal(p28.creneau, 27);
  assert.deepEqual(courant.un2, d.match.calcul.un2, 'le dernier point : l’état courant');
  assert.equal(courant.at, iso(T - 20_000));
  assert.ok(p28.un2.home > p15.un2.home, 'le but se voit');
  // Second appel : rien de recalculé (le tableau, C0 et chaque point viennent des tables).
  const n0 = L.etatDesTables().compteurs;
  const d2 = await detail(db, em, { id: '4901' });
  assert.deepEqual(L.etatDesTables().compteurs, { ...n0, references: n0.references }, 'aucun calcul de plus');
  assert.deepEqual([d2.calculs.faits, d2.calculs.courbe, d2.calculs.c0, d2.calculs.ancrages], [0, 0, 0, 0]);
  assert.deepEqual(d2.courbe, c);

  // La prolongation : jamais un chiffre (« Break », puis la prolongation jouée), ni à la courbe, ni à l'état courant.
  const H2 = 'fotmob-903';
  const A2 = 'fotmob-904';
  const coup2 = iso(T - 115 * MIN);
  const enProl = F.listeEnJeu({ id: 4902, homeId: H2, awayId: A2, kickoff: coup2, label: lbl(95), maxTime: 105, h: 1, a: 1 });
  const m2 = F.matchSuivi({ id: 4902, homeId: H2, awayId: A2, kickoff: coup2, lectures: [{ t: T - 20_000, liste: enProl }] });
  F.poserUneLigne(db, { homeId: H2, awayId: A2, kickoff: coup2, calculeLe: CALCULE });
  const snap2 = (dt, o) => F.poserUnInstantane(db, { fotmobId: 4902, takenAt: iso(T - dt * MIN), kickoff: coup2, homeId: H2, awayId: A2, ...o });
  snap2(12, { label: lbl(90), minute: 90, h: 1, a: 1 });
  snap2(8, { label: 'Break', h: 1, a: 1 });
  snap2(3, { label: lbl(93), minute: 93, h: 1, a: 1 });
  const p2 = await detail(db, F.etatMinute({ maintenant: T, matchs: [m2] }), { id: '4902' });
  const pts = p2.courbe.points;
  assert.deepEqual(
    pts.map((p) => [p.type, p.phase, p.raison, p.un2 === null]),
    [
      ['avant-match', null, null, false],
      ['instantane', 'jeu', null, false],
      ['instantane', 'prolongation', 'prolongation', true],
      ['instantane', 'prolongation', 'prolongation', true],
      ['courant', 'prolongation', 'prolongation', true]
    ]
  );
  assert.deepEqual([p2.match.calcul.fait, p2.match.calcul.raison, p2.match.calcul.un2], [false, 'prolongation', null]);
  assert.equal(p2.match.calcul.variante, 'direct-ancre', 'au détail, la variante et la minute 0 quand même');
  assert.ok(p2.match.calcul.minute0 && p2.match.calcul.minute0.complet);
});

// ------------------------------------------------------------ T-L10

test('T-L10 la boucle (R10) : coupée, bac à sable, pas démarrée, suspendue, interrupteur du direct, arrêtée, plus de tour, trois erreurs de suite, absent de la liste, « aucun match, liste vieille de 9 min » → vide sans alarme ; le tableau vide est complet', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const vieux = (id, dtMin) => suivi(id, `fotmob-${1100 + 2 * (id % 100)}`, `fotmob-${1101 + 2 * (id % 100)}`, { minute: 34, h: 0, lectures: [{ t: T - dtMin * MIN, liste: F.listeEnJeu({ id, homeId: `fotmob-${1100 + 2 * (id % 100)}`, awayId: `fotmob-${1101 + 2 * (id % 100)}`, kickoff: iso(T - 34 * MIN), label: lbl(34), maxTime: 45 }) }] });
  const B = (em, sources = {}) => lire(db, em, { ligneDe: (q) => F.ligneFabriquee(q), ...sources });
  const COUPE = 'coupés avec l’actualisation automatique (MATCH_STATS_AUTO_REFRESH=false)';
  const BAC = 'coupés dans le bac à sable avec l’actualisation automatique (CM_BAC_ACTUALISATION=1 pour un essai)';
  const PAS_ENCORE = 'pas encore démarrés (deux minutes après le démarrage du serveur)';
  const vide = F.etatMinute({ maintenant: T, matchs: [] });

  const cas = [
    ['coupée', { coupure: () => COUPE }, 'coupee', COUPE],
    ['bac à sable', { coupure: () => BAC, bac: true, interrupteurs: { direct: true, actualisation: false } }, 'bac-a-sable', BAC],
    ['pas démarrée (enregistreurs)', { coupure: () => PAS_ENCORE }, 'pas-demarree', PAS_ENCORE],
    ['interrupteur du direct', { interrupteurs: { direct: false, actualisation: true } }, 'coupee', 'boucle du direct coupée (ENREGISTREURS_DIRECT=false)'],
    ['boucle arrêtée', { statut: F.statut({ running: false }) }, 'coupee', null]
  ];
  for (const [qui, sources, pourquoi, phrase] of cas) {
    const r = await B(vide, sources);
    assert.deepEqual([r.boucle.active, r.boucle.pourquoi, r.boucle.phrase, r.boucle.etat], [false, pourquoi, phrase, 'arretee'], qui);
    forme(r, CLES.tableau, qui);
    forme(r.boucle, CLES.boucle, qui);
    assert.deepEqual([r.matchs, r.finis], [[], []], `${qui} : le tableau vide, complet`);
    assert.deepEqual([r.calculs.faits, r.calculs.enAttente, r.calculs.sansCalcul], [0, 0, 0]);
  }
  // Pas démarrée : aucun tour encore (ni dans l'état, ni dans le statut).
  const jamais = await B(F.etatMinute({ maintenant: T, matchs: [], dernierTour: null }));
  assert.deepEqual([jamais.boucle.pourquoi, jamais.boucle.active, jamais.boucle.rythme, jamais.boucle.dernierTourLe], ['pas-demarree', false, null, null]);

  // Suspendue (cinq erreurs FotMob) : la reprise dite ; le relevé du match, vieux de 8 min, périmé « suspendue ».
  const sus = await B(F.etatMinute({ maintenant: T, matchs: [vieux(10, 8)], listeFotmobA: T - 8 * MIN, dernierTour: { at: iso(T - 20_000), suspendu: true } }), {
    statut: F.statut({ suspendu: true, suspenduJusqua: iso(T + 25 * MIN), erreursConsecutives: 5, erreur: { depuis: iso(T - 10 * MIN), jusqua: iso(T + 25 * MIN), erreurs: 5, message: 'HTTP 503' }, derniereErreur: { at: iso(T - 9 * MIN), message: 'HTTP 503' } })
  });
  assert.deepEqual([sus.boucle.pourquoi, sus.boucle.active, sus.boucle.etat, sus.boucle.rythme, sus.boucle.suspendueJusqua], ['suspendue', false, 'arretee', 'suspendu', iso(T + 25 * MIN)]);
  assert.deepEqual(sus.boucle.erreurs, { consecutives: 5, derniere: { at: iso(T - 9 * MIN), message: 'HTTP 503' }, depuis: iso(T - 10 * MIN) });
  assert.deepEqual([sus.matchs[0].etat.perime, sus.matchs[0].etat.perimeCause, sus.matchs[0].etat.ageS], [true, 'suspendue', 480]);

  // Plus de tour depuis 6 min (PC en veille, boucle bloquée) : active quand même, « plus-de-tour » ; le relevé périmé l'est pour cette raison.
  const veille = await B(F.etatMinute({ maintenant: T, matchs: [vieux(11, 6)], listeFotmobA: T - 6 * MIN, dernierTour: { at: iso(T - 6 * MIN), listeLue: true } }));
  assert.deepEqual([veille.boucle.pourquoi, veille.boucle.active, veille.boucle.vivante, veille.boucle.etat, veille.boucle.dernierTourAgeS], ['plus-de-tour', true, false, 'suivi', 360]);
  assert.deepEqual([veille.matchs[0].etat.perime, veille.matchs[0].etat.perimeCause], [true, 'plus-de-tour']);
  // À 4 min 50 : vivante encore (seuil de 5 min).
  const presque = await B(F.etatMinute({ maintenant: T, matchs: [], dernierTour: { at: iso(T - 290_000) } }));
  assert.deepEqual([presque.boucle.pourquoi, presque.boucle.vivante], [null, true]);

  // Trois erreurs de suite, la boucle vivante : le relevé de 6 min est périmé « fotmob-erreurs ».
  const err = await B(F.etatMinute({ maintenant: T, matchs: [vieux(12, 6)], listeFotmobA: T - 6 * MIN }), { statut: F.statut({ erreursConsecutives: 3, derniereErreur: { at: iso(T - 30_000), message: 'HTTP 503' } }) });
  assert.deepEqual([err.boucle.pourquoi, err.boucle.active, err.boucle.erreurs.consecutives], [null, true, 3]);
  assert.deepEqual([err.matchs[0].etat.perime, err.matchs[0].etat.perimeCause, err.matchs[0].etat.ambre], [true, 'fotmob-erreurs', true]);
  // Absent de la liste : la liste est fraîche, le match n'y est plus depuis 6 min.
  const absent = await B(F.etatMinute({ maintenant: T, matchs: [vieux(13, 6)], listeFotmobA: T - 20_000 }));
  assert.deepEqual([absent.matchs[0].etat.perime, absent.matchs[0].etat.perimeCause], [true, 'absent-de-la-liste']);
  // Un relevé de 3 min : ambre, pas périmé.
  const ambre = await B(F.etatMinute({ maintenant: T, matchs: [vieux(14, 3)], listeFotmobA: T - 3 * MIN }));
  assert.deepEqual([ambre.matchs[0].etat.ambre, ambre.matchs[0].etat.perime, ambre.matchs[0].etat.perimeCause, ambre.matchs[0].etat.ageS], [true, false, null, 180]);

  // Aucun match, liste vieille de 9 min, dernier tour il y a 20 s : « vide », sans aucune alarme.
  const calme = await B(F.etatMinute({ maintenant: T, matchs: [], listeFotmobA: T - 9 * MIN, dernierTour: { at: iso(T - 20_000), listeLue: false, enDirect: 0, attente: 9 } }));
  assert.deepEqual(
    [calme.boucle.active, calme.boucle.pourquoi, calme.boucle.phrase, calme.boucle.etat, calme.boucle.vivante, calme.boucle.rythme, calme.boucle.listeAgeS, calme.boucle.dernierTourAgeS],
    [true, null, null, 'vide', true, 'attente', 540, 20]
  );
  assert.deepEqual([calme.matchs, calme.finis], [[], []]);
  // La charge et le suivi de la 46 viennent de la boucle.
  assert.deepEqual(calme.boucle.suivi46, { module: 'charge', raison: null, pannes: 0, dernierePanne: null });
  assert.deepEqual(calme.boucle.charge.listesFotmob, 30);
});

// ------------------------------------------------------------ T-L11

const NOTE = Object.freeze({
  format: 1,
  modele: 'ancien-81',
  version: 5,
  role: 'service',
  candidateHash: null,
  variante: 'temps-restant',
  regard: 'surete',
  verdict: 'prouve',
  passeLe: '2026-11-22',
  modules: {},
  regles: { sha1: 'essai' },
  export: { sha1: 'essai', matchs: 812, de: '2026-09-24', a: '2026-11-20' },
  k: 3,
  n: 812,
  t: 2.4,
  jugements: [],
  tranchesNonMontrees: ['76-90'],
  famillesNonMontrees: ['scoreExact'],
  paires: {
    jugees: 24,
    ecartees: [
      { unite: 'totalGoals.2.5', tranche: '31-45', annonce: 0.61, realise: 0.52, n: 40 },
      { unite: 'result.home', tranche: '61-75', annonce: 0.5, realise: 0.41, n: 33 }
    ],
    aSurveiller: [{ unite: 'bothTeamsScore', tranche: '31-45' }]
  },
  rouges: { auBanc: 'a-la-minute', retardMedianCreneaux: 0, partSansRouge: 0.1 },
  additionnelSurP5: { ecartMax: 0.01 },
  phrase: 'Prouvé sur 812 matchs (essai fabriqué).'
});

test('T-L11 la note (P4, P5) : nulle → à blanc partout ; fabriquée → sa variante, les paires écartées de SA tranche, ses tranches non montrées ; autre grille ou version → « pas encore jugé pour cette version » ; candidate ; note illisible', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const m34 = suivi(5101, 'fotmob-1201', 'fotmob-1202', { minute: 34, h: 1 });
  const m80 = suivi(5102, 'fotmob-1203', 'fotmob-1204', { minute: 80, h: 0, a: 1 });
  const mV6 = suivi(5103, 'fotmob-1205', 'fotmob-1206', { minute: 34 });
  const mGr = suivi(5104, 'fotmob-1207', 'fotmob-1208', { minute: 34 });
  const mCa = suivi(5105, 'fotmob-1209', 'fotmob-1210', { minute: 34 });
  const lignes = { 'fotmob-1205': { engineVersion: 6 }, 'fotmob-1207': { grille: 'modele-buts-441' }, 'fotmob-1209': { candidateHash: 'f01dd8496f56a415' } };
  const ligneDe = (q) => F.ligneFabriquee({ ...q, ...(lignes[q.homeId] ?? {}) });
  const em = F.etatMinute({ maintenant: T, matchs: [m34, m80, mV6, mGr, mCa] });
  const avec = (note) => lire(db, em, { ligneDe, note });
  const par = (r) => Object.fromEntries(r.matchs.map((e) => [e.fotmobId, e]));

  // Sans note : tout est calculé, rien n'est montré.
  const nulle = await avec(null);
  assert.deepEqual(nulle.note, { etat: 'non-juge', raison: 'sans-note' });
  for (const e of nulle.matchs) {
    assert.deepEqual([e.calcul.fait, e.calcul.aBlanc, e.calcul.note.applique, e.calcul.note.raison, e.calcul.varianteSource], [true, true, false, 'sans-note', 'reglage'], e.fotmobId);
    assert.equal(e.calcul.variante, 'direct-ancre', 'le réglage : direct-ancre avec un fair');
  }
  // La note par défaut (noteDuDirect.js, partie C) : absente aujourd'hui → « sans-note ».
  if (!fs.existsSync(path.join(SERVEUR, 'src', 'data', 'direct', 'noteDuDirect.js'))) {
    const defaut = await L.tableauDuDirect({ maintenant: T, database: db, ...F.sourcesActives(em), ligneDe });
    assert.deepEqual(defaut.note, { etat: 'non-juge', raison: 'sans-note' });
    for (const e of defaut.matchs) assert.equal(e.calcul.aBlanc, true);
  }
  // Partie C (O12) : présente à `NOTE_DU_DIRECT = null` (--note-nulle) → la même réponse qu'absente : « sans-note », à blanc.
  if (fs.existsSync(path.join(SERVEUR, 'src', 'data', 'direct', 'noteDuDirect.js')) && (await import('../src/data/direct/noteDuDirect.js')).NOTE_DU_DIRECT === null) {
    const defaut = await L.tableauDuDirect({ maintenant: T, database: db, ...F.sourcesActives(em), ligneDe });
    assert.deepEqual(defaut.note, { etat: 'non-juge', raison: 'sans-note' });
    for (const e of defaut.matchs) assert.deepEqual([e.calcul.aBlanc, e.calcul.note.applique, e.calcul.note.raison], [true, false, 'sans-note'], e.fotmobId);
  }
  // Une note illisible (format inconnu, variante inconnue, candidate sans empreinte) : à blanc, « note-illisible ».
  for (const mauvaise of [{ ...NOTE, format: 2 }, { ...NOTE, variante: 'direct-sans-effets' }, { ...NOTE, role: 'candidate', candidateHash: null }, { ...NOTE, verdict: 'peut-etre' }]) {
    const r = await avec(mauvaise);
    assert.deepEqual(r.note, { etat: 'non-juge', raison: 'note-illisible' });
    for (const e of r.matchs) assert.deepEqual([e.calcul.aBlanc, e.calcul.note.raison], [true, 'note-illisible']);
  }

  // La note fabriquée (version 5, ancien-81, service).
  const r = await avec(NOTE);
  assert.deepEqual(r.note, {
    etat: 'juge',
    raison: null,
    format: 1,
    modele: 'ancien-81',
    version: 5,
    role: 'service',
    candidateHash: null,
    variante: 'temps-restant',
    regard: 'surete',
    verdict: 'prouve',
    passeLe: '2026-11-22',
    matchs: 812,
    tranchesNonMontrees: ['76-90'],
    famillesNonMontrees: ['scoreExact'],
    ecartees: NOTE.paires.ecartees,
    aSurveiller: NOTE.paires.aSurveiller,
    phrase: 'Prouvé sur 812 matchs (essai fabriqué).'
  });
  const e = par(r);
  // 34e (tranche 31-45) : la variante de la note, ses paires écartées et à surveiller de la tranche, montrée.
  assert.deepEqual([e['5101'].calcul.variante, e['5101'].calcul.varianteSource, e['5101'].calcul.aBlanc, e['5101'].calcul.fait], ['temps-restant', 'note', false, true]);
  assert.deepEqual(e['5101'].calcul.note, {
    applique: true,
    raison: null,
    verdict: 'prouve',
    regard: 'surete',
    tranche: '31-45',
    trancheNonMontree: false,
    famillesNonMontrees: ['scoreExact'],
    ecartees: [NOTE.paires.ecartees[0]],
    aSurveiller: NOTE.paires.aSurveiller,
    reconduite: null // § 2.7 (18/11/2026) : aucune reconduction, la ligne est de la version de la note
  });
  assert.notDeepEqual(e['5101'].calcul.un2, par(nulle)['5101'].calcul.un2, 'une autre variante, d’autres chiffres');
  // 80e (tranche 76-90, non montrée) : appliquée, à blanc.
  assert.deepEqual([e['5102'].calcul.note.tranche, e['5102'].calcul.note.trancheNonMontree, e['5102'].calcul.aBlanc, e['5102'].calcul.variante], ['76-90', true, true, 'temps-restant']);
  assert.deepEqual(e['5102'].calcul.note.ecartees, []);
  // Autre version du moteur, autre grille : pas jugé pour cette version → le réglage, à blanc.
  for (const id of ['5103', '5104']) {
    assert.deepEqual([e[id].calcul.note.applique, e[id].calcul.note.raison, e[id].calcul.aBlanc, e[id].calcul.variante, e[id].calcul.varianteSource], [false, 'pas-juge-pour-cette-version', true, 'direct-ancre', 'reglage'], id);
  }
  // Une note « service » ne regarde pas l'empreinte de candidate d'une ligne (seule la branche « candidate » la compare).
  assert.deepEqual([e['5105'].calcul.note.applique, e['5105'].calcul.varianteSource, e['5105'].calcul.aBlanc], [true, 'note', false]);
  // Verdict « faits seuls » : appliquée, à blanc.
  const faitsSeuls = par(await avec({ ...NOTE, verdict: 'faits-seuls' }));
  assert.deepEqual([faitsSeuls['5101'].calcul.note.applique, faitsSeuls['5101'].calcul.aBlanc], [true, true]);
  // La branche « candidate » : seulement les lignes de SA candidate.
  const candidate = par(await avec({ ...NOTE, role: 'candidate', candidateHash: 'f01dd8496f56a415' }));
  assert.deepEqual([candidate['5105'].calcul.note.applique, candidate['5105'].calcul.aBlanc], [true, false]);
  assert.deepEqual([candidate['5101'].calcul.note.applique, candidate['5101'].calcul.note.raison], [false, 'pas-juge-pour-cette-version']);
  // Le match sans ligne d'avant-match (une base sans nuit, la vraie lecture des lignes) : « sans-avant-match ».
  const sansLigne = await lire(F.baseDuDirect(), F.etatMinute({ maintenant: T, matchs: [m34] }), { note: NOTE });
  assert.deepEqual([sansLigne.matchs[0].calcul.note.raison, sansLigne.matchs[0].calcul.aBlanc], ['sans-avant-match', true]);
});

// ------------------------------------------------------------ le repli de l'ancrage (point laissé ouvert par A)

test('Le repli de l’ancrage (A → B) : λ + μ hors des bornes (sous 0,6 ou au-dessus de 8) → direct-v1 pour ce match, la raison rendue ; les deux réglages de la variante affichée', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const bas = suivi(5201, 'fotmob-1301', 'fotmob-1302', { minute: 34 });
  const haut = suivi(5202, 'fotmob-1303', 'fotmob-1304', { minute: 34 });
  const normal = suivi(5203, 'fotmob-1305', 'fotmob-1306', { minute: 34 });
  const sansFair = suivi(5204, 'fotmob-1307', 'fotmob-1308', { minute: 34 });
  const lignes = { 'fotmob-1301': { lambda: 0.25, mu: 0.25 }, 'fotmob-1303': { lambda: 5, mu: 4 }, 'fotmob-1307': { fair: null } };
  const ligneDe = (q) => F.ligneFabriquee({ ...q, ...(lignes[q.homeId] ?? {}) });
  const em = F.etatMinute({ maintenant: T, matchs: [bas, haut, normal, sansFair] });
  const par = (r) => Object.fromEntries(r.matchs.map((e) => [e.fotmobId, e]));
  const ancre = await lire(db, em, { ligneDe, varianteAffichee: 'ancre-si-fair' });
  const v1 = await lire(db, em, { ligneDe, varianteAffichee: 'direct-v1' });
  assert.deepEqual([ancre.varianteReglee, v1.varianteReglee], ['ancre-si-fair', 'direct-v1']);
  const a = par(ancre);
  const b = par(v1);
  for (const [id, total] of [
    ['5201', 0.5],
    ['5202', 9]
  ]) {
    const c = a[id].calcul;
    assert.deepEqual([c.fait, c.variante, c.varianteSource], [true, 'direct-v1', 'reglage'], id);
    assert.deepEqual(c.repli, { de: 'direct-ancre', vers: 'direct-v1', raison: 'total-hors-bornes' }, `${id} (λ + μ = ${total})`);
    assert.deepEqual([c.ancrage.fait, c.ancrage.raison, c.ancrage.lambda + c.ancrage.mu], [false, 'total-hors-bornes', total]);
    assert.deepEqual(c.un2, b[id].calcul.un2, `${id} : les chiffres de direct-v1`);
    assert.deepEqual([b[id].calcul.repli, b[id].calcul.ancrage, b[id].calcul.variante], [null, null, 'direct-v1']);
  }
  assert.deepEqual([a['5203'].calcul.variante, a['5203'].calcul.repli, a['5203'].calcul.ancrage.fait], ['direct-ancre', null, true]);
  assert.notDeepEqual(a['5203'].calcul.un2, b['5203'].calcul.un2);
  assert.deepEqual([a['5204'].calcul.variante, a['5204'].calcul.repli, a['5204'].calcul.ancrage], ['direct-v1', null, null], 'sans fair : direct-v1 d’emblée (P2), sans repli');
  // Une note qui retient une variante ancrée : le même repli.
  const temps = par(await lire(db, em, { ligneDe, note: { ...NOTE, variante: 'temps-restant-ancre' } }));
  assert.deepEqual([temps['5201'].calcul.variante, temps['5201'].calcul.varianteSource], ['temps-restant', 'note']);
  assert.deepEqual(temps['5201'].calcul.repli, { de: 'temps-restant-ancre', vers: 'temps-restant', raison: 'total-hors-bornes' });
  assert.equal(temps['5203'].calcul.variante, 'temps-restant-ancre');
  // Un réglage inconnu est refusé.
  await assert.rejects(() => lire(db, em, { ligneDe, varianteAffichee: 'direct-ancre' }), TypeError);
  assert.deepEqual(L.REPLIS_DE_L_ANCRAGE, { 'direct-ancre': 'direct-v1', 'temps-restant-ancre': 'temps-restant' });
});

// ------------------------------------------------------------ T-L12 (correctif K4) : à blanc, aucun chiffre dans le JSON

/** Les nombres de ]0 ; 1[ (des probabilités) trouvés sous `x`, avec leur chemin. */
function nombresDeZeroAUn(x, chemin = '', sortie = []) {
  if (typeof x === 'number') {
    if (x > 0 && x < 1) sortie.push(`${chemin} = ${x}`);
  } else if (Array.isArray(x)) x.forEach((v, i) => nombresDeZeroAUn(v, `${chemin}[${i}]`, sortie));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) nombresDeZeroAUn(v, `${chemin}.${k}`, sortie);
  return sortie;
}
/** Ce qui ne doit pas sortir à blanc, au tableau (`e` une entrée) et au détail (`d` la réponse). */
const chiffresDuCalcul = (e) => nombresDeZeroAUn({ un2: e.calcul.un2, plus25: e.calcul.plus25, lesDeuxMarquent: e.calcul.lesDeuxMarquent, minute0: e.calcul.minute0, marches: e.calcul.marches ?? null }, e.fotmobId);
const chiffresDeLaCourbe = (d) => nombresDeZeroAUn(d.courbe.points.filter((p) => p.type !== 'avant-match').map((p) => p.un2), 'courbe');

test('T-L12 (K4) à blanc, AUCUN chiffre ne sort du JSON : note nulle, sans `chiffresABlanc` (comme le contrôleur) → aucun nombre de ]0 ; 1[ sous calcul.un2, plus25, lesDeuxMarquent, minute0, marches, ni λ′ et μ′ de l’ancrage, ni dans la courbe hors « avant-match », ni la probabilité de la référence ; /api/direct et /api/direct/match par le contrôleur pareil (une option dans la requête n’y change rien) ; avec `chiffresABlanc: true` (les essais), les chiffres sont là', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const H = 'fotmob-1401';
  const A = 'fotmob-1402';
  const m = suivi(5401, H, A, { minute: 34, h: 1, a: 0, rh: 0, ra: 0 });
  F.poserUneLigne(db, { homeId: H, awayId: A, kickoff: m.kickoff, calculeLe: CALCULE });
  const snap = (dt, o) => F.poserUnInstantane(db, { fotmobId: 5401, takenAt: iso(T - dt * MIN), kickoff: m.kickoff, homeId: H, awayId: A, ...o });
  snap(25, { label: lbl(10), minute: 10, h: 0, a: 0, rh: 0, ra: 0 });
  snap(10, { label: lbl(25), minute: 25, h: 1, a: 0, rh: 0, ra: 0 });
  const r1x2 = (t, prix) => ({ home: [{ price: prix[0], releveAt: iso(t) }], draw: [{ price: prix[1], releveAt: iso(t) }], away: [{ price: prix[2], releveAt: iso(t) }] });
  F.poserDesCotes(db, { source: 'espn', bookmaker: 'Bookmaker A', homeId: H, awayId: A, date: '2026-11-14', live: r1x2(T - 2 * MIN, [1.5, 4.2, 7.5]) });
  F.poserDesCotes(db, { source: 'kalshi', bookmaker: 'Kalshi', homeId: H, awayId: A, date: '2026-11-14', live: { home: [{ price: 1.6, prob: 0.62, releveAt: iso(T - 4 * MIN) }] } });
  const em = F.etatMinute({ maintenant: T, matchs: [m] });
  const { chiffresABlanc, ...sansLOption } = F.sourcesActives(em);
  assert.equal(chiffresABlanc, true, 'les sources des essais lisent les chiffres à blanc');

  // 1. La lecture, sans l'option (ce que fait le contrôleur) : calculé, rien de rendu.
  const tab = await L.tableauDuDirect({ maintenant: T, database: db, note: null, ...sansLOption });
  const e = tab.matchs[0];
  assert.deepEqual([e.calcul.fait, e.calcul.aBlanc, e.calcul.variante, e.calcul.note.raison], [true, true, 'direct-ancre', 'sans-note'], 'calculé à blanc');
  assert.deepEqual(chiffresDuCalcul(e), [], 'au tableau, aucun chiffre');
  assert.deepEqual([e.calcul.un2, e.calcul.plus25, e.calcul.lesDeuxMarquent, e.calcul.minute0], [null, null, null, null]);
  assert.deepEqual([e.calcul.ancrage.fait, e.calcul.ancrage.lambda, e.calcul.ancrage.mu, e.calcul.ancrage.cible, e.calcul.ancrage.ecart], [true, null, null, null, null], 'l’ancrage fait, ses chiffres tus');
  assert.deepEqual(e.avantMatch.fair, { home: 0.45, draw: 0.28, away: 0.27 }, 'le pronostic d’avant-match reste (publié avant le coup d’envoi)');
  const d = await L.matchDuDirect({ maintenant: T, database: db, note: null, ...sansLOption, id: '5401' });
  assert.deepEqual([d.suivi, d.match.calcul.fait, d.match.calcul.aBlanc], [true, true, true]);
  assert.deepEqual(chiffresDuCalcul(d.match), [], 'au détail, aucun chiffre');
  assert.equal(d.match.calcul.marches, null);
  assert.deepEqual(chiffresDeLaCourbe(d), [], 'la courbe, hors « avant-match » : aucun chiffre');
  assert.ok(d.courbe.points.length >= 4, `${d.courbe.points.length} points`);
  assert.deepEqual(d.courbe.points[0].un2, { home: 0.45, draw: 0.28, away: 0.27 }, 'le point « avant-match » : le pronostic d’avant-match');
  assert.ok(d.reference.lignes.length >= 4, `${d.reference.lignes.length} lignes de référence`);
  assert.deepEqual(d.reference.lignes.map((l) => l.proba), d.reference.lignes.map(() => null), 'la référence : aucune probabilité à blanc');
  assert.ok(d.reference.lignes.every((l) => Number.isFinite(l.prix)), 'les prix relevés restent');

  // 2. Par le contrôleur (les options de la production n'ont pas `chiffresABlanc`) ; une option glissée dans la requête est ignorée.
  __reglerControleurDuDirect({ maintenant: () => T, database: () => db, options: { note: null, ...sansLOption } });
  try {
    const rt = await appel(getDirect, { chiffresABlanc: 'true' });
    assert.equal(rt.matchs.length, 1);
    assert.deepEqual([rt.matchs[0].calcul.fait, rt.matchs[0].calcul.aBlanc], [true, true]);
    assert.deepEqual(chiffresDuCalcul(rt.matchs[0]), [], 'GET /api/direct : aucun chiffre');
    assert.deepEqual([rt.matchs[0].calcul.ancrage.lambda, rt.matchs[0].calcul.ancrage.mu], [null, null]);
    const rd = await appel(getDirectMatch, { id: '5401', chiffresABlanc: 'true' });
    assert.deepEqual(chiffresDuCalcul(rd.match), [], 'GET /api/direct/match : aucun chiffre');
    assert.deepEqual(chiffresDeLaCourbe(rd), [], 'GET /api/direct/match : la courbe sans chiffre');
    assert.deepEqual(rd.reference.lignes.map((l) => l.proba), rd.reference.lignes.map(() => null), 'GET /api/direct/match : la référence sans probabilité');
  } finally {
    __reglerControleurDuDirect();
  }

  // 3. Avec `chiffresABlanc: true` (les essais) : les mêmes chiffres sont là.
  const dVu = await detail(db, em, { id: '5401' });
  assert.equal(dVu.match.calcul.aBlanc, true);
  assert.ok(chiffresDuCalcul(dVu.match).length > 50, `${chiffresDuCalcul(dVu.match).length} chiffres lus par les essais`);
  assert.ok(chiffresDeLaCourbe(dVu).length >= 9, 'la courbe lue par les essais');
  assert.ok(Number.isFinite(dVu.match.calcul.ancrage.lambda) && Number.isFinite(dVu.match.calcul.ancrage.mu));
  assert.ok(dVu.reference.lignes.some((l) => l.proba > 0 && l.proba < 1), 'la référence lue par les essais');
});

// ------------------------------------------------------------ K9 : la grille dans les clés de la lecture

test('K9 la grille dans les clés de la lecture : deux lignes du même match, égales sauf la GRILLE (λ, μ, ρ, fair), n’ont ni le même ancrage ni le même calcul (la seconde requête recalcule, la troisième relit la table)', async () => {
  L.viderLesTables();
  // Les tables des calculs sont communes à toutes les bases ; la ligne d'un match est gardée PAR base : deux bases fabriquées
  // donnent au même match deux lignes qui ne diffèrent que par la grille.
  const db81 = F.baseDuDirect();
  const db441 = F.baseDuDirect();
  const m = suivi(5501, 'fotmob-1501', 'fotmob-1502', { minute: 34, h: 0, a: 0 });
  const em = F.etatMinute({ maintenant: T, matchs: [m] });
  const avecGrille = (grille) => (q) => F.ligneFabriquee({ ...q, grille, lambda: 1.45, mu: 1.15, rho: -0.08, fair: { home: 0.45, draw: 0.28, away: 0.27 } });
  const r81 = await lire(db81, em, { ligneDe: avecGrille('ancien-81') });
  const r441 = await lire(db441, em, { ligneDe: avecGrille('modele-buts-441') });
  const encore = await lire(db441, em, { ligneDe: avecGrille('modele-buts-441') });
  const [a, b, c] = [r81.matchs[0].calcul, r441.matchs[0].calcul, encore.matchs[0].calcul];
  assert.deepEqual([a.fait, a.variante, a.ancrage.fait, b.fait, b.variante, b.ancrage.fait], [true, 'direct-ancre', true, true, 'direct-ancre', true]);
  assert.deepEqual([r81.calculs.ancrages, r441.calculs.ancrages, encore.calculs.ancrages], [1, 1, 0], 'l’ancrage de la seconde grille est calculé, pas relu');
  assert.deepEqual([a.deTable, b.deTable, c.deTable], [false, false, true], 'le calcul de la seconde grille est fait, pas relu ; le même relu ensuite');
  assert.notEqual(a.ancrage.lambda, b.ancrage.lambda, 'λ′ de chaque grille (les grilles fermées diffèrent)');
  assert.deepEqual(c.ancrage, b.ancrage);
});

// ------------------------------------------------------------ T-L13 (§ 2.6 point 4, mise en service, 13/11/2026 soir)

/** Les nombres et les null d'un objet, à plat : { 'chemin.de.la.feuille': valeur } (chaînes et booléens laissés). */
function feuilles(x, chemin = '', sortie = {}) {
  if (typeof x === 'number' || x === null) sortie[chemin] = x;
  else if (Array.isArray(x)) x.forEach((v, i) => feuilles(v, `${chemin}.${i}`, sortie));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) feuilles(v, chemin ? `${chemin}.${k}` : k, sortie);
  return sortie;
}
const chiffresDeLaCarte = (c) => feuilles({ un2: c.un2, plus25: c.plus25, lesDeuxMarquent: c.lesDeuxMarquent, minute0: c.minute0?.marches ?? null, marches: c.marches ?? null });

test('T-L13 (§ 2.6 point 4) ce que la note RETIRE ne sort pas non plus du JSON de la carte ni du détail : une famille non montrée (ses marchés à null), une paire écartée de SA tranche (le 1N2 issue par issue, le plus de 2,5, ses lignes des marchés à null, leurs états gardés), la minute 0 lue à la tranche du créneau 0 ; une paire d’une autre tranche ne retire rien ; avec ou sans `chiffresABlanc` ; les tables ne changent pas', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const m = suivi(5501, 'fotmob-1501', 'fotmob-1502', { minute: 34, h: 1 });
  const em = F.etatMinute({ maintenant: T, matchs: [m] });
  const ligneDe = (q) => F.ligneFabriquee({ ...q });
  const sansRien = { ...NOTE, tranchesNonMontrees: [], famillesNonMontrees: [], paires: { jugees: 24, ecartees: [], aSurveiller: [] } };
  const paire = (unite, tranche) => ({ unite, tranche, annonce: 0.5, realise: 0.4, n: 40 });
  const retire = {
    ...sansRien,
    famillesNonMontrees: ['teamGoals'],
    paires: { jugees: 24, ecartees: [paire('result.home', '31-45'), paire('totalGoals.2.5', '31-45'), paire('bothTeamsScore', '61-75'), paire('result.draw', '1-15')], aSurveiller: [] }
  };
  const lireLes = async (note, extra = {}) => ({ tab: (await lire(db, em, { ligneDe, note, ...extra })).matchs[0].calcul, det: (await detail(db, em, { id: '5501' }, { ligneDe, note, ...extra })).match.calcul });

  // Le témoin : la même note sans rien de retiré — tout est chiffré (c'est bien le filtre qui retire).
  const t = await lireLes(sansRien);
  assert.deepEqual([t.det.fait, t.det.aBlanc, t.det.note.applique, t.det.note.tranche], [true, false, true, '31-45']);
  const lt = chiffresDeLaCarte(t.det);
  const retireAttendu = (p) =>
    p === 'un2.home' || p === 'plus25' || p === 'marches.result.home' || /^marches\.totalGoals\.2\.5\./.test(p) || /^marches\.teamGoals\./.test(p) || /^minute0\.(result\.draw|teamGoals\..+)\.(direct|ecartPt)$/.test(p);
  const visees = Object.keys(lt).filter(retireAttendu);
  assert.ok(visees.length >= 21, `${visees.length} chiffres visés`);
  for (const p of visees) assert.ok(Number.isFinite(lt[p]), `témoin : ${p} chiffré`);

  // La note retire : la famille « teamGoals », les paires result.home et totalGoals.2.5 de la tranche 31-45, la paire
  // result.draw de la tranche 1-15 (la minute 0) ; la paire bothTeamsScore de la tranche 61-75 ne retire rien à la 34e.
  for (const extra of [{}, { chiffresABlanc: false }]) {
    const s = await lireLes(retire, extra);
    assert.deepEqual([s.det.fait, s.det.aBlanc, s.tab.fait, s.tab.aBlanc], [true, false, true, false], 'montré : la note s’applique');
    const lr = chiffresDeLaCarte(s.det);
    for (const p of Object.keys(lt)) {
      if (retireAttendu(p)) assert.ok(lr[p] === null || (p.startsWith('marches.teamGoals.') && lr['marches.teamGoals'] === null && !(p in lr)), `détail : ${p} retiré (${lr[p]})`);
      else assert.equal(lr[p], lt[p], `détail : ${p} gardé`);
    }
    assert.equal(s.det.marches.teamGoals, null, 'la famille non montrée : null');
    assert.deepEqual([s.det.marches.totalGoals['2.5'].etat, s.det.marches.totalGoals['2.5'].etats], [t.det.marches.totalGoals['2.5'].etat, t.det.marches.totalGoals['2.5'].etats], 'les états de la ligne écartée restent');
    assert.deepEqual([s.det.plus25Etat, s.det.lesDeuxMarquentEtat], [t.det.plus25Etat, t.det.lesDeuxMarquentEtat]);
    assert.deepEqual(s.det.minute0.marches['result.draw'], { avant: t.det.minute0.marches['result.draw'].avant, direct: null, ecartPt: null, dit: false }, 'la minute 0 : l’avant-match gardé, le calcul tu');
    assert.deepEqual(s.det.minute0.marches['result.home'], t.det.minute0.marches['result.home'], 'result.home n’est écarté qu’en 31-45 : la minute 0 le garde');
    // Au tableau (la carte) : les mêmes retraits.
    assert.deepEqual([s.tab.un2.home, s.tab.un2.draw, s.tab.un2.away, s.tab.plus25, s.tab.lesDeuxMarquent], [null, t.tab.un2.draw, t.tab.un2.away, null, t.tab.lesDeuxMarquent]);
    assert.deepEqual(s.tab.minute0.marches['result.draw'], { avant: t.tab.minute0.marches['result.draw'].avant, direct: null, ecartPt: null, dit: false });
    assert.ok(Object.keys(s.tab.minute0.marches).every((k) => !k.startsWith('teamGoals.') || s.tab.minute0.marches[k].direct === null), 'au tableau, la famille non montrée tue dans la minute 0');
  }

  // La tranche du créneau 0 non montrée : la carte de la 34e reste chiffrée, la minute 0 n'a plus aucun calcul (l'avant reste).
  const t15 = await lireLes({ ...sansRien, tranchesNonMontrees: ['1-15'] });
  assert.deepEqual([t15.det.aBlanc, t15.det.un2, t15.det.plus25], [false, t.det.un2, t.det.plus25]);
  const m0 = Object.entries(t15.det.minute0.marches);
  assert.ok(m0.length > 10, `${m0.length} marchés à la minute 0`);
  for (const [k, v] of m0) assert.deepEqual(v, { avant: t.det.minute0.marches[k].avant, direct: null, ecartPt: null, dit: false }, k);

  // Les tables n'ont pas changé : le témoin relu redonne les mêmes chiffres.
  assert.deepEqual(chiffresDeLaCarte((await lireLes(sansRien)).det), lt);
});

// ------------------------------------------------------------ R11 : un match non suivi

test('R11 un match non suivi : fini (terminé ou arrêté) ou coupure de 4 h, boucle coupée / suspendue / pas démarrée, pas commencé, plus suivi, pas encore vu, inconnu', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const fini = (id, status, at) => ({
    id: String(id),
    league: 'Premier League - England',
    leagueKey: 'ENG|Premier League',
    date: '2026-11-14',
    kickoff: iso(T - 130 * MIN),
    homeId: `fotmob-${id}1`,
    awayId: `fotmob-${id}2`,
    homeName: 'Domicile',
    awayName: 'Exterieur',
    at,
    liste: F.listeEnJeu({ id, homeId: `fotmob-${id}1`, awayId: `fotmob-${id}2`, kickoff: iso(T - 130 * MIN), label: status === 'terminé' ? 'FT' : lbl(90), h: 3, a: 1, finished: status === 'terminé', cancelled: status === 'annulé' }),
    fin: { status, homeGoals: 3, awayGoals: 1 },
    memoire: null
  });
  const em = F.etatMinute({ maintenant: T, matchs: [], finis: [fini(5301, 'terminé', T - 20 * MIN), fini(5302, 'annulé', T - 40 * MIN), fini(5303, 'en cours', T - 30 * MIN)] });
  const non = async (cible, sources = {}, emx = em) => {
    const r = await L.matchDuDirect({ maintenant: T, database: db, note: null, ...F.sourcesActives(emx), ...sources, ...cible });
    assert.deepEqual([r.suivi, r.match, r.reference, r.courbe], [false, null, null, null]);
    assert.ok(L.RAISONS_NON_SUIVI.includes(r.raison), r.raison);
    return r;
  };
  const termine = await non({ id: '5301' });
  assert.deepEqual([termine.raison, termine.fin.statut, termine.fin.score.home, termine.fin.score.away], ['fini', 'terminé', 3, 1]);
  assert.deepEqual([(await non({ id: '5302' })).raison, (await non({ id: '5302' })).fin.statut], ['fini', 'annulé']);
  assert.deepEqual([(await non({ id: '5303' })).raison, (await non({ id: '5303' })).fin.statut], ['coupure-4h', 'en cours']);
  // Par identifiants : le même fini.
  assert.equal((await non({ home: 'fotmob-53011', away: 'fotmob-53012', coup: iso(T - 130 * MIN) })).raison, 'fini');
  // Un instantané « fin » rangé (le match n'est plus gardé par la boucle) : fini.
  F.poserUnInstantane(db, { fotmobId: 5304, takenAt: iso(T - 200 * MIN), kind: 'fin', kickoff: iso(T - 320 * MIN), homeId: 'fotmob-53041', awayId: 'fotmob-53042', status: 'terminé', label: 'FT', h: 0, a: 2 });
  const range = await non({ id: '5304' });
  assert.deepEqual([range.raison, range.fin.score.home, range.fin.score.away], ['fini', 0, 2]);
  // La boucle ne tourne pas : sa raison.
  assert.equal((await non({ id: '5399' }, { coupure: () => 'coupés par ENREGISTREURS=false' })).raison, 'boucle-coupee');
  assert.equal((await non({ id: '5399' }, { statut: F.statut({ suspendu: true }) })).raison, 'boucle-suspendue');
  assert.equal((await non({ id: '5399' }, { coupure: () => 'pas encore démarrés (deux minutes après le démarrage du serveur)' })).raison, 'pas-demarree');
  // Pas commencé (coup d'envoi à venir) ; pas encore vu (passé depuis moins de 30 min) ; inconnu.
  assert.equal((await non({ home: 'fotmob-5381', away: 'fotmob-5382', coup: iso(T + 60 * MIN) })).raison, 'pas-commence');
  assert.equal((await non({ home: 'fotmob-5381', away: 'fotmob-5382', coup: iso(T - 10 * MIN) })).raison, 'pas-encore-vu');
  assert.equal((await non({ home: 'fotmob-5381', away: 'fotmob-5382', coup: iso(T - 50 * MIN) })).raison, 'inconnu');
  assert.equal((await non({ id: '5399' })).raison, 'inconnu');
  // Suivi puis disparu (un instantané « direct », plus dans la boucle) : plus suivi.
  F.poserUnInstantane(db, { fotmobId: 5305, takenAt: iso(T - 15 * MIN), kickoff: iso(T - 60 * MIN), homeId: 'fotmob-53051', awayId: 'fotmob-53052', label: lbl(44), minute: 44, h: 0, a: 0 });
  assert.equal((await non({ id: '5305' })).raison, 'plus-suivi');
  assert.equal((await non({ home: 'fotmob-53051', away: 'fotmob-53052', coup: iso(T - 60 * MIN) })).raison, 'plus-suivi');
  // Le tableau porte les finis : les plus récents d'abord.
  const r = await lire(db, em);
  assert.deepEqual(
    r.finis.map((f) => [f.fotmobId, f.raison]),
    [
      ['5301', 'fini'],
      ['5303', 'coupure-4h'],
      ['5302', 'fini']
    ]
  );
});

// ------------------------------------------------------------ R28 : le rejeu d'un instant

test('R28 le rejeu d’un instant : l’état refait depuis live_snapshots (6 min avant l’instant), les finis de moins de 3 h, les cotes d’avant l’instant ; sa limite : sans durée max, les arrêts de jeu de la 1re mi-temps restent « minute inconnue »', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const I = T - 5 * MIN;
  const K = iso(T - 40 * MIN);
  const H = 'fotmob-1401';
  const A = 'fotmob-1402';
  const snap = (id, dt, o) => F.poserUnInstantane(db, { fotmobId: id, takenAt: iso(T - dt * MIN), kickoff: K, homeId: H, awayId: A, ...o });
  snap(5401, 12, { label: lbl(28), minute: 28, h: 0, a: 0 });
  snap(5401, 9, { label: lbl(31), minute: 31, h: 1, a: 0, rh: 0, ra: 0, source: 'liste + détail' });
  snap(5401, 4, { label: lbl(36), minute: 36, h: 2, a: 0 }); // après l'instant : ignoré
  snap(5402, 70, { label: lbl(88), minute: 88, h: 2, a: 2 });
  snap(5402, 60, { kind: 'fin', status: 'terminé', label: 'FT', h: 2, a: 2 });
  snap(5403, 8, { label: lbl(47), minute: 47, h: 0, a: 0 }); // 47' en minute pleine, sans durée max ni pause vue
  snap(5404, 20, { label: lbl(10), minute: 10, h: 0, a: 0 }); // hors de la fenêtre de 6 min
  F.poserDesCotes(db, { homeId: H, awayId: A, date: '2026-11-14', live: { home: [{ price: 1.9, releveAt: iso(T - 7 * MIN) }, { price: 1.3, releveAt: iso(T - 2 * MIN) }], draw: [{ price: 3.4, releveAt: iso(T - 7 * MIN) }], away: [{ price: 4.4, releveAt: iso(T - 7 * MIN) }] } });
  // Correctifs D2 : `calendrier` vide ajouté (la page du match ne lit jamais le vrai calendrier dans un essai).
  const opts = { maintenant: T, database: db, note: null, instant: iso(I), rejeuPermis: true, ligneDe: (q) => F.ligneFabriquee(q), calendrier: () => [] };
  const r = await L.tableauDuDirect(opts);
  assert.deepEqual(r.rejeu, { instant: iso(I) });
  assert.deepEqual([r.boucle.active, r.boucle.pourquoi, r.boucle.etat], [true, null, 'suivi']);
  assert.deepEqual(r.boucle.rejeu, { instant: iso(I), fenetreMinutes: 6, source: 'live_snapshots' });
  assert.deepEqual(r.matchs.map((e) => e.fotmobId).sort(), ['5401', '5403']);
  const e = r.matchs.find((x) => x.fotmobId === '5401');
  assert.deepEqual([e.etat.phase, e.etat.minute, e.etat.score.home, e.etat.score.away, e.etat.score.depuisLe, e.etat.ageS, e.etat.ambre, e.etat.perime], ['jeu', 31, 1, 0, iso(T - 9 * MIN), 240, true, false]);
  assert.deepEqual(e.etat.score.precedent, { home: 0, away: 0 });
  assert.equal(e.calcul.fait, true);
  const s = r.matchs.find((x) => x.fotmobId === '5403');
  assert.deepEqual([s.etat.phase, s.etat.raison, s.calcul.raison], ['minute-inconnue', 'sans-duree-max', 'minute-inconnue'], 'la limite du rejeu (live_snapshots ne garde pas la durée max)');
  assert.deepEqual(
    r.finis.map((f) => [f.fotmobId, f.raison, f.statut, f.score.home, f.score.away]),
    [['5402', 'fini', 'terminé', 2, 2]]
  );
  // Le détail rejoué : les cotes d'avant l'instant seulement.
  const d = await L.matchDuDirect({ ...opts, id: '5401' });
  assert.equal(d.suivi, true);
  const home = d.reference.lignes.find((l) => l.issue === 'home');
  assert.deepEqual([home.prix, home.releveLe, home.ageS], [1.9, iso(T - 7 * MIN), 120]);
  assert.ok(d.courbe.points.every((p) => p.at === null || p.at <= iso(I)), 'la courbe s’arrête à l’instant');
  // Un instant trop tôt : rien à rejouer, un tableau vide et complet.
  const avant = await L.tableauDuDirect({ ...opts, instant: iso(T - 300 * MIN) });
  assert.deepEqual([avant.matchs, avant.finis, avant.boucle.etat], [[], [], 'vide']);
  // Une date illisible : refusée.
  await assert.rejects(() => L.tableauDuDirect({ ...opts, instant: 'hier soir' }), TypeError);
});

// ------------------------------------------------------------ R5 point 5 : le score de la 90e d'un match fini

// Étape 46 (12/11/2026), partie D : la campagne de bugs volontaires a montré qu'aucun essai ne voyait « les finis sans
// score de la 90e » (critique R5, points 5 et 6, pose R5c) ; cet essai, ajouté, le voit.
test('R5c un match fini après prolongation porte son score de la 90e, dans `finis` du tableau comme dans `fin` du détail ; sans mémoire, « non relevé » (null), jamais le score final à sa place', async () => {
  const { suivre } = await import('../src/data/direct/memoireDuDirect.js');
  L.viderLesTables();
  const db = F.baseDuDirect();
  const ids = { id: 5601, homeId: 'fotmob-56011', awayId: 'fotmob-56012', kickoff: iso(T - 150 * MIN) };
  // 89e à 1-1, la coupure « ET » (deux relevés), la prolongation jouée (durée max 120), un but à la 95e, puis « AET » 2-1.
  const releves = [
    [T - 50 * MIN, lbl(89), 1, 1, 90, false],
    [T - 48 * MIN, 'ET', 1, 1, 90, false],
    [T - 46 * MIN, 'ET', 1, 1, 90, false],
    [T - 43 * MIN, lbl(92), 1, 1, 120, false],
    [T - 40 * MIN, lbl(95), 2, 1, 120, false],
    [T - 12 * MIN, 'AET', 2, 1, 120, true]
  ];
  let memoire = null;
  for (const [t, label, h, a, maxTime, finished] of releves) memoire = suivre(memoire, { liste: F.listeEnJeu({ ...ids, label, h, a, maxTime, finished }), maintenant: t });
  const fini = (avecMemoire) => ({
    id: String(ids.id),
    league: 'Premier League - England',
    leagueKey: 'ENG|Premier League',
    date: '2026-11-14',
    kickoff: ids.kickoff,
    homeId: ids.homeId,
    awayId: ids.awayId,
    homeName: 'Domicile',
    awayName: 'Exterieur',
    at: T - 10 * MIN,
    liste: F.listeEnJeu({ ...ids, label: 'AET', h: 2, a: 1, maxTime: 120, finished: true }),
    fin: { status: 'terminé', homeGoals: 2, awayGoals: 1 },
    memoire: avecMemoire ? memoire : null
  });
  const em = F.etatMinute({ maintenant: T, matchs: [], finis: [fini(true)] });
  const r = await lire(db, em);
  assert.equal(r.finis.length, 1);
  const f = r.finis[0];
  assert.deepEqual([f.statut, f.raison, f.score.home, f.score.away, f.prolongation.joueeLe], ['terminé', 'fini', 2, 1, iso(T - 43 * MIN)]);
  assert.deepEqual(f.score90, { home: 1, away: 1, sur: true, vuLe: iso(T - 46 * MIN), libelle: 'ET' }, 'le score de la 90e, relevé à la coupure');
  const d = await detail(db, em, { id: '5601' });
  assert.deepEqual([d.suivi, d.raison, d.fin.score90], [false, 'fini', f.score90]);
  // Sans mémoire (module de la 46 indisponible dans la boucle) : « non relevé », jamais le 2-1 de la fin.
  const sans = await lire(db, F.etatMinute({ maintenant: T, matchs: [], finis: [fini(false)] }));
  assert.deepEqual([sans.finis[0].score90, sans.finis[0].score90Absent, sans.finis[0].score.home], [null, true, 2]);
});

// ------------------------------------------------------------ Correctifs D2 (12/11/2026) : points 2 a et 3

test('Correctifs D2, point 2 a — GET /api/direct/en-cours : TOUS les matchs suivis en cours (60 → 60), depuis l’état de la boucle seulement (aucun calcul, aucune ligne de nuit) ; la boucle coupée dit pourquoi ; le rejeu refusé hors du bac (400), permis dans le bac ; module illisible et lecture ratée → « illisible »', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const soixante = matchsReels(60, { premier: 4900, base: 9000 });
  soixante[7] = suivi(4907, 'fotmob-9014', 'fotmob-9015', { minute: 20, h: null, a: null }); // score inconnu : null, jamais 0
  soixante[8] = suivi(4908, 'fotmob-9016', 'fotmob-9017', { minute: 45, label: 'HT', halfTime: true, h: 1, a: 1 });
  const em = F.etatMinute({ maintenant: T, matchs: soixante });
  let lignesLues = 0;
  const ligneDe = (q) => {
    lignesLues += 1;
    return ligneVariee(q);
  };
  const regler = (r = {}) => __reglerControleurDuDirect({ maintenant: () => T, database: () => db, rejeuPermis: () => false, options: { note: null, ...F.sourcesActives(em), ligneDe }, ...r });
  const refuse = (query, motif) =>
    assert.rejects(
      () => appel(getDirectEnCours, query),
      (e) => e.statusCode === 400 && motif.test(e.message),
      JSON.stringify(query)
    );
  regler();
  try {
    const avant = L.etatDesTables().compteurs;
    const r = await appel(getDirectEnCours, {});
    forme(r, CLES.enCours, 'en cours');
    assert.deepEqual([r.version, r.genereLe, r.rejeu, r.boucle], [1, iso(T), null, { pourquoi: null }]);
    assert.equal(r.matchs.length, 60, 'les 60, sans plafond');
    assert.deepEqual(new Set(r.matchs.map((e) => e.fotmobId)), new Set(soixante.map((m) => String(m.id))));
    for (const e of r.matchs) {
      forme(e, CLES.enCoursMatch, e.fotmobId);
      forme(e.score, ['home', 'away'], e.fotmobId);
      assert.match(e.homeId, /^fotmob-\d+$/);
      assert.match(e.awayId, /^fotmob-\d+$/);
    }
    assert.deepEqual(L.etatDesTables().compteurs, avant, 'aucun calcul');
    assert.equal(lignesLues, 0, 'aucune ligne de nuit lue');
    // Chaque entrée dit le MÊME état que le tableau (la même règle, etatDuMatch) ; un score inconnu reste null.
    const tableau = await appel(getDirect, {});
    for (const e of r.matchs) {
      const t = tableau.matchs.find((x) => x.fotmobId === e.fotmobId);
      assert.deepEqual(
        [e.homeId, e.awayId, e.date, e.libelle, e.phase, e.minute, e.ajout, e.creneau, e.score.home, e.score.away],
        [t.home.id, t.away.id, t.date, t.etat.libelle, t.etat.phase, t.etat.minute, t.etat.ajout, t.etat.creneau, t.etat.score.home, t.etat.score.away],
        e.fotmobId
      );
      // Correctif « écrans 1 » (13/11/2026) : le relevé, le même que celui du tableau.
      assert.deepEqual([e.perime, e.ageS], [t.etat.perime, t.etat.ageS], `${e.fotmobId} : périmé et âge du relevé`);
    }
    assert.deepEqual(r.matchs.map((e) => e.fotmobId), tableau.matchs.map((e) => e.fotmobId), 'dans l’ordre du tableau');
    const inconnu = r.matchs.find((e) => e.fotmobId === '4907');
    assert.deepEqual([inconnu.phase, inconnu.score], ['jeu', { home: null, away: null }]);
    const pause = r.matchs.find((e) => e.fotmobId === '4908');
    assert.deepEqual([pause.phase, pause.libelle, pause.score], ['mi-temps', 'HT', { home: 1, away: 1 }]);

    // La boucle coupée, arrêtée, dans le bac, suspendue : elle dit pourquoi ; rien n'est en cours.
    const vide = F.etatMinute({ maintenant: T, matchs: [] });
    const BAC = 'coupés dans le bac à sable avec l’actualisation automatique (CM_BAC_ACTUALISATION=1 pour un essai)';
    for (const [sources, pourquoi] of [
      [{ statut: F.statut({ running: false }) }, 'coupee'],
      [{ coupure: () => 'coupés (ENREGISTREURS=false)' }, 'coupee'],
      [{ coupure: () => BAC, bac: true, interrupteurs: { direct: true, actualisation: false } }, 'bac-a-sable'],
      [{ statut: F.statut({ suspendu: true, suspenduJusqua: iso(T + 10 * MIN) }) }, 'suspendue']
    ]) {
      regler({ options: { note: null, ...F.sourcesActives(vide), ...sources } });
      const c = await appel(getDirectEnCours, {});
      forme(c, CLES.enCours, pourquoi);
      assert.deepEqual([c.boucle, c.matchs], [{ pourquoi }, []], pourquoi);
    }

    // Le rejeu : refusé hors du bac (400, comme les deux autres routes), date illisible refusée, permis dans le bac.
    regler();
    await refuse({ instant: iso(T - 5 * MIN) }, /bac à sable/);
    await refuse({ instant: 'hier' }, /"instant" doit être une date ISO/);
    await assert.rejects(
      () => L.enCoursDuDirect({ maintenant: T, database: db, instant: iso(T - MIN), rejeuPermis: false }),
      (e) => e instanceof L.RejeuRefuse && e.code === 'rejeu-refuse'
    );
    const K = iso(T - 40 * MIN);
    F.poserUnInstantane(db, { fotmobId: 5491, takenAt: iso(T - 9 * MIN), kickoff: K, homeId: 'fotmob-1491', awayId: 'fotmob-1492', label: lbl(31), minute: 31, h: 1, a: 0 });
    F.poserUnInstantane(db, { fotmobId: 5492, takenAt: iso(T - 7 * MIN), kickoff: K, homeId: 'fotmob-1493', awayId: 'fotmob-1494', label: 'HT', minute: 45, h: 0, a: 0, status: 'mi-temps' });
    regler({ rejeuPermis: () => true });
    const rj = await appel(getDirectEnCours, { instant: iso(T - 5 * MIN) });
    forme(rj, CLES.enCours, 'rejeu');
    assert.deepEqual([rj.rejeu, rj.boucle], [{ instant: iso(T - 5 * MIN) }, { pourquoi: null }]);
    assert.deepEqual(
      rj.matchs.map((e) => [e.fotmobId, e.homeId, e.awayId, e.phase, e.score.home, e.score.away]).sort((a, b) => a[0].localeCompare(b[0])),
      [
        ['5491', 'fotmob-1491', 'fotmob-1492', 'jeu', 1, 0],
        ['5492', 'fotmob-1493', 'fotmob-1494', 'mi-temps', 0, 0]
      ]
    );
    assert.equal(rj.matchs.find((e) => e.fotmobId === '5491').minute, 31);

    // Le module illisible : « illisible », jamais une 500 ; une lecture qui lève : « lecture-ratee », avec le message.
    regler({ charger: () => Promise.reject(new Error('module cassé (essai)')) });
    assert.deepEqual(await appel(getDirectEnCours, {}), { version: 1, etat: 'illisible', raison: 'module-illisible', genereLe: iso(T) });
    regler({
      options: {
        note: null,
        ...F.sourcesActives(em),
        etatMinute: () => {
          throw new Error('boum (essai)');
        }
      }
    });
    assert.deepEqual(await appel(getDirectEnCours, {}), { version: 1, etat: 'illisible', raison: 'lecture-ratee', genereLe: iso(T), message: 'boum (essai)' });
  } finally {
    __reglerControleurDuDirect();
  }
});

test('Correctifs D2, point 3 — la page du match dans l’appli : le match_id de SA ligne de nuit ; sinon l’unique entrée du calendrier du même jour dont les DEUX clubs ont ses identifiants FotMob (jamais un nom comparé) ; deux entrées → aucune page ; autre jour, un seul club, identifiants absents → aucune', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  F.poserLaNuit(db, NUIT);
  const nuit = suivi(4951, 'fotmob-951', 'fotmob-952', { minute: 30, h: 1 });
  const cal = suivi(4953, 'fotmob-953', 'fotmob-954', { minute: 30 });
  const deux = suivi(4955, 'fotmob-955', 'fotmob-956', { minute: 30 });
  const unClub = suivi(4957, 'fotmob-957', 'fotmob-958', { minute: 30 });
  const autreJour = suivi(4959, 'fotmob-959', 'fotmob-960', { minute: 30 });
  const sansIds = { ...suivi(4961, 'fotmob-961', 'fotmob-962', { minute: 30 }), homeId: null };
  const cle = F.poserUneLigne(db, { homeId: nuit.homeId, awayId: nuit.awayId, kickoff: nuit.kickoff, calculeLe: CALCULE });
  db.prepare('UPDATE simulation_matchs SET match_id = ? WHERE fixture_key = ?').run('cal-2026-11-14-ville-k-ville-l', cle);
  // Le calendrier du 14/11 (et du 13/11) : les noms ne disent rien ici, seul l'annuaire fabriqué donne les identifiants.
  const JOUR = '2026-11-14';
  const entree = (matchId, homeName, awayName, date = JOUR) => ({ matchId, date, league: 'Premier League - England', homeName, awayName });
  const calendrier = [
    entree('cal-2026-11-14-club-a-club-b', 'Club A', 'Club B'),
    entree('cal-2026-11-14-club-c-club-d', 'Club C', 'Club D'),
    entree('cal-2026-11-14-c-d-doublon', 'C. Doublon', 'D. Doublon'),
    entree('cal-2026-11-14-club-e-inconnu', 'Club E', 'Inconnu FC'),
    entree('cal-2026-11-13-club-g-club-h', 'Club G', 'Club H', '2026-11-13'),
    entree('cal-2026-11-14-club-i-club-j', 'Club I', 'Club J')
  ];
  const ANNUAIRE = { 'Club A': 'fotmob-953', 'Club B': 'fotmob-954', 'Club C': 'fotmob-955', 'Club D': 'fotmob-956', 'C. Doublon': 'fotmob-955', 'D. Doublon': 'fotmob-956', 'Club E': 'fotmob-957', 'Club G': 'fotmob-959', 'Club H': 'fotmob-960', 'Club I': 'fotmob-961', 'Club J': 'fotmob-962' };
  const jours = [];
  const sources = {
    calendrier: (jour) => {
      jours.push(jour);
      return calendrier.filter((c) => c.date === jour);
    },
    club: (nom) => ANNUAIRE[nom] ?? null
  };
  const em = F.etatMinute({ maintenant: T, matchs: [nuit, cal, deux, unClub, autreJour, sansIds] });
  const r = await lire(db, em, sources);
  const page = (id) => r.matchs.find((e) => e.fotmobId === id).page;
  assert.deepEqual(page('4951'), { id: 'cal-2026-11-14-ville-k-ville-l', source: 'nuit' }, 'la ligne de nuit');
  assert.deepEqual(page('4953'), { id: 'cal-2026-11-14-club-a-club-b', source: 'calendrier' }, 'l’unique entrée du jour');
  assert.equal(page('4955'), null, 'deux entrées répondent : aucune page');
  assert.equal(page('4957'), null, 'un seul club reconnu : aucune');
  assert.equal(page('4959'), null, 'l’entrée est d’un autre jour : aucune');
  assert.equal(page('4961'), null, 'sans identifiant FotMob : aucune');
  assert.deepEqual(jours, [JOUR], 'le calendrier d’un jour lu UNE fois pour tous les matchs');
  // Le détail porte la même page ; la requête suivante relit l'index gardé (aucune relecture du calendrier).
  const d = await detail(db, em, { id: '4953' }, sources);
  assert.deepEqual(d.match.page, { id: 'cal-2026-11-14-club-a-club-b', source: 'calendrier' });
  assert.deepEqual(jours, [JOUR], 'gardé 10 minutes');
  // Un annuaire qui lève, un calendrier illisible : aucune page, jamais une erreur.
  L.viderLesTables();
  const lever = (message) => () => {
    throw new Error(message);
  };
  const casse = await lire(db, em, { calendrier: lever('calendrier illisible (essai)'), club: lever('annuaire (essai)') });
  assert.deepEqual(
    casse.matchs.map((e) => [e.fotmobId, e.page?.source ?? null]).sort(),
    [['4951', 'nuit'], ['4953', null], ['4955', null], ['4957', null], ['4959', null], ['4961', null]]
  );
  // Le rejeu : la même page (la ligne de nuit) ; l'instant ne change rien à l'identifiant.
  L.viderLesTables();
  F.poserUnInstantane(db, { fotmobId: 4951, takenAt: iso(T - 3 * MIN), kickoff: nuit.kickoff, homeId: nuit.homeId, awayId: nuit.awayId, label: lbl(29), minute: 29, h: 1, a: 0 });
  const rj = await L.tableauDuDirect({ maintenant: T, database: db, note: null, instant: iso(T - MIN), rejeuPermis: true, ...sources });
  assert.deepEqual(rj.matchs.map((e) => [e.fotmobId, e.page]), [['4951', { id: 'cal-2026-11-14-ville-k-ville-l', source: 'nuit' }]]);
});

test('Correctifs D2, point 3 bis — l’index du calendrier (la page du match) se bâtit APRÈS les calculs : un annuaire lent ne prend jamais leur budget (O2)', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  // Trois matchs neufs à calculer ; leurs lignes ne portent aucune page : la page se cherche dans le calendrier du jour.
  const em = F.etatMinute({ maintenant: T, matchs: matchsReels(3, { premier: 4971, base: 6301 }) });
  const calendrier = Array.from({ length: 4 }, (_, i) => ({ matchId: `cal-2026-11-14-lent-${i}`, date: '2026-11-14', league: 'Premier League - England', homeName: `Lent ${2 * i}`, awayName: `Lent ${2 * i + 1}` }));
  let lus = 0;
  // Un annuaire lent (essai) : 150 ms par club, 8 clubs → 1,2 s, plus que le budget d'une seconde.
  const club = () => {
    lus += 1;
    const fin = performance.now() + 150;
    while (performance.now() < fin);
    return null;
  };
  const r = await lire(db, em, { ligneDe: ligneVariee, budgetMs: 1000, calendrier: (jour) => calendrier.filter((c) => c.date === jour), club });
  assert.equal(lus, 8, 'l’annuaire lu pour les deux clubs de chaque entrée du jour');
  assert.deepEqual([r.calculs.faits, r.calculs.enAttente], [3, 0], 'les trois calculs faits dans le budget, l’annuaire lent après eux');
  assert.deepEqual(r.matchs.map((e) => e.page), [null, null, null], 'aucune entrée du calendrier n’a les identifiants : aucune page');
});

// ------------------------------------------------------------ Correctifs D3 (12/11/2026) : points 1 et 2

/** Un dossier de travail pour un fichier fabriqué (dans le bac : bac-a-sable\essais-tests ; ailleurs, le dossier temporaire). */
function dossierDEssai(prefixe) {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  return fs.mkdtempSync(path.join(RACINE_ESSAIS, prefixe));
}
const pagesDu = (r) => r.matchs.map((e) => [e.fotmobId, e.page]).sort((x, y) => x[0].localeCompare(y[0]));

test('Correctifs D3, point 1 — l’index du calendrier bâti SANS tenir la main (patron T-L6) : le fichier de 18 Mo lu en asynchrone, les seules entrées du jour analysées, la main rendue dès 20 ms ; aucun bloc de plus de 100 ms (battement extérieur, requête et index mesurés) ; avant et après mesurés', async (t) => {
  const dossier = dossierDEssai('cm-direct-calendrier-');
  try {
    const JOUR = '2026-11-14';
    // Six matchs suivis SANS ligne de nuit (leur page vient du calendrier) ; 180 entrées le 14/11, dont les six leurs, aux
    // noms piégés (accolades, guillemets, lettres accentuées) ; l'annuaire fabriqué donne les identifiants FotMob.
    const db = F.baseDuDirect();
    const em = F.etatMinute({ maintenant: T, matchs: matchsReels(6, { premier: 4981, base: 6401 }) });
    const ANNUAIRE = {};
    const duJour = Array.from({ length: 180 }, (_, i) => {
      const home = `Ville {${i}} « Ø »`;
      const away = `Ville "${i}" bis`;
      ANNUAIRE[home] = `fotmob-${6401 + 2 * i}`;
      ANNUAIRE[away] = `fotmob-${6402 + 2 * i}`;
      return { matchId: `cal-${JOUR}-essai-${i}`, homeName: home, awayName: away };
    });
    const fichier = path.join(dossier, 'season-calendar.json');
    const { texte } = F.calendrierFabrique({ n: 47_000, jour: JOUR, duJour });
    fs.writeFileSync(fichier, texte);
    const mo = (Buffer.byteLength(texte) / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    // AVANT : la lecture d'un seul tenant (ce que faisait listSeasonCalendar quand le fichier avait changé) — mesurée, jamais exigée.
    const t0 = performance.now();
    const tout = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    const avantMs = performance.now() - t0;
    assert.equal(tout.filter((c) => c.date === JOUR).length, 180);
    // APRÈS : la requête mesurée par un battement extérieur ; l'index, bâti à côté, mesuré par lui-même.
    const club = (nom) => ANNUAIRE[nom] ?? null;
    const apres = await minutage(t, 'index du calendrier', async () => {
      L.viderLesTables();
      const m = await mesurer(db, em, { calendrier: undefined, fichierCalendrier: fichier, club });
      const cal = L.etatDesCalendriers(db).find((c) => c.jour === JOUR) ?? null;
      const ok = Boolean(cal?.pret) && cal.bilan.blocMaxMs <= BLOC_MAX_MS && m.battementMax <= BLOC_MAX_MS && m.r.calculs.blocMaxMs <= BLOC_MAX_MS;
      return { ...m, cal, ok, pourquoi: `index ${cal?.pret ? `bloc de ${cal.bilan.blocMaxMs} ms` : 'pas prêt'}, battement ${Math.round(m.battementMax)} ms, requête ${m.r.calculs.blocMaxMs} ms` };
    });
    const { cal } = apres;
    const s = cal.bilan.rendus > 1 ? 's' : '';
    t.diagnostic(`avant : ${Math.round(avantMs)} ms d’un seul bloc (lecture et analyse de ${mo} Mo) ; après : pire bloc de l’index ${cal.bilan.blocMaxMs} ms (${cal.bilan.rendus} main${s} rendue${s}, ${cal.bilan.ms} ms en tout), battement ${Math.round(apres.battementMax)} ms, requête ${Math.round(apres.ms)} ms`);
    assert.deepEqual([cal.pret, cal.erreur], [true, null], 'l’index prêt dès la première requête (elle l’attend sans tenir la main)');
    assert.equal(cal.bilan.entrees, 180, 'les 180 entrées du jour, et elles seules');
    assert.ok(cal.bilan.blocMaxMs <= BLOC_MAX_MS, `index : un bloc de ${cal.bilan.blocMaxMs} ms`);
    assert.ok(apres.battementMax <= BLOC_MAX_MS, `battement de ${apres.battementMax} ms`);
    assert.ok(apres.r.calculs.blocMaxMs <= BLOC_MAX_MS, `requête : un bloc de ${apres.r.calculs.blocMaxMs} ms`);
    assert.deepEqual(
      pagesDu(apres.r),
      Array.from({ length: 6 }, (_, i) => [String(4981 + i), { id: `cal-${JOUR}-essai-${i}`, source: 'calendrier' }]),
      'chaque match suivi : son entrée du calendrier, par les identifiants FotMob de ses deux clubs'
    );
  } finally {
    nettoyer(dossier);
  }
});

test('Correctifs D3, point 1 bis — l’index d’avant servi pendant qu’il se rebâtit (aucune requête n’attend après la première) ; une lecture ratée jamais gardée (reconstruction ratée, première ratée, fichier tronqué, d’une autre forme, absent) ; l’annuaire STRICT par défaut (l’alias exact, dans sa compétition ; jamais un rapprochement de noms)', async () => {
  const JOUR = '2026-11-14';
  const LIGUE = 'Ligue fabriquée';
  const db = F.baseDuDirect();
  const em = F.etatMinute({ maintenant: T, matchs: [suivi(4991, 'fotmob-7001', 'fotmob-7002', { minute: 30 }), suivi(4992, 'fotmob-7003', 'fotmob-7006', { minute: 30 }), suivi(4993, 'fotmob-7005', 'fotmob-7001', { minute: 30 })] });
  // L'annuaire du magasin (fabriqué) : « V. Une » est un alias de Ville Une ; « Homonyme » nomme deux clubs, dont un seul dans
  // la compétition de l'entrée ; « Ville Trois FC » n'est l'alias de personne (les secours de clubDuMagasin, par les mots,
  // l'auraient rapproché de Ville Trois : l'annuaire strict, non).
  F.poserUnClub(db, { teamId: 'fotmob-7001', name: 'Ville Une', league: LIGUE, aliases: ['V. Une'] });
  F.poserUnClub(db, { teamId: 'fotmob-7002', name: 'Ville Deux', league: LIGUE });
  F.poserUnClub(db, { teamId: 'fotmob-7003', name: 'Homonyme', league: LIGUE });
  F.poserUnClub(db, { teamId: 'fotmob-7004', name: 'Homonyme', league: 'Autre ligue' });
  F.poserUnClub(db, { teamId: 'fotmob-7005', name: 'Ville Trois', league: LIGUE });
  F.poserUnClub(db, { teamId: 'fotmob-7006', name: 'Ville Six', league: LIGUE });
  const duJour = [
    { matchId: `cal-${JOUR}-une-deux`, homeName: 'V. Une', awayName: 'Ville Deux', league: LIGUE },
    { matchId: `cal-${JOUR}-homonyme-six`, homeName: 'Homonyme', awayName: 'Ville Six', league: LIGUE },
    { matchId: `cal-${JOUR}-trois-une`, homeName: 'Ville Trois FC', awayName: 'Ville Une', league: LIGUE }
  ];
  const ATTENDU = [['4991', { id: `cal-${JOUR}-une-deux`, source: 'calendrier' }], ['4992', { id: `cal-${JOUR}-homonyme-six`, source: 'calendrier' }], ['4993', null]];
  const AUCUNE = [['4991', null], ['4992', null], ['4993', null]];

  // Le vrai lecteur du fichier et l'annuaire strict (par défaut, aucun `club` fabriqué).
  const dossier = dossierDEssai('cm-direct-calendrier-');
  try {
    const fichier = path.join(dossier, 'season-calendar.json');
    const { entrees, texte } = F.calendrierFabrique({ n: 400, jour: JOUR, duJour });
    const lireF = () => lire(db, em, { calendrier: undefined, fichierCalendrier: fichier });
    fs.writeFileSync(fichier, texte);
    L.viderLesTables();
    assert.deepEqual(pagesDu(await lireF()), ATTENDU, 'l’alias exact ; l’homonyme dans sa compétition ; « Ville Trois FC » sans page');
    for (const [cas, contenu, motif] of [
      ['tronqué (écriture en cours)', texte.slice(0, texte.length - 300), /tronqué/],
      ['d’une autre forme (sur une seule ligne)', JSON.stringify(entrees), /autre forme/],
      ['absent', null, /ENOENT/]
    ]) {
      L.viderLesTables();
      if (contenu === null) fs.rmSync(fichier);
      else fs.writeFileSync(fichier, contenu);
      assert.deepEqual(pagesDu(await lireF()), AUCUNE, `${cas} : aucune page, jamais une erreur`);
      const [cal] = L.etatDesCalendriers(db);
      assert.deepEqual([cal.pret, cal.enConstruction], [false, false], cas);
      assert.match(cal.erreur, motif, cas);
      fs.writeFileSync(fichier, texte);
      assert.deepEqual(pagesDu(await lireF()), ATTENDU, `${cas}, puis le fichier entier : relu à la requête suivante (rien de raté n’est gardé)`);
    }
  } finally {
    nettoyer(dossier);
  }

  // L'index d'avant servi pendant qu'il se rebâtit : la requête n'attend pas ; une reconstruction ratée garde l'index d'avant.
  L.viderLesTables();
  let lus = 0;
  let casse = false;
  let lent = null;
  const calendrier = async (jour) => {
    lus += 1;
    if (lent) await lent;
    if (casse) throw new Error('lecture ratée (essai)');
    return duJour.map((o) => ({ ...o, date: jour }));
  };
  const a = (dt) => L.tableauDuDirect({ maintenant: T + dt, database: db, note: null, ...F.sourcesActives(em), calendrier });
  assert.deepEqual(pagesDu(await a(0)), ATTENDU);
  assert.equal(lus, 1);
  assert.deepEqual(pagesDu(await a(5 * MIN)), ATTENDU);
  assert.equal(lus, 1, 'moins de 10 minutes : l’index gardé');
  let lacher;
  lent = new Promise((fin) => {
    lacher = fin;
  });
  assert.deepEqual(pagesDu(await a(11 * MIN)), ATTENDU, 'plus de 10 minutes : l’index d’avant servi tout de suite');
  assert.equal(lus, 2, 'et rebâti à côté');
  assert.deepEqual(L.etatDesCalendriers(db).map((c) => [c.jour, c.at, c.enConstruction]), [[JOUR, iso(T), true]], 'la requête rendue avant la fin de la reconstruction');
  lacher();
  lent = null;
  await L.calendriersBatis(db);
  assert.deepEqual(L.etatDesCalendriers(db).map((c) => [c.at, c.enConstruction, c.erreur]), [[iso(T + 11 * MIN), false, null]]);
  casse = true;
  assert.deepEqual(pagesDu(await a(22 * MIN)), ATTENDU, 'une reconstruction ratée : l’index d’avant reste servi');
  await L.calendriersBatis(db);
  const [rate] = L.etatDesCalendriers(db);
  assert.deepEqual([rate.at, rate.pret], [iso(T + 11 * MIN), true]);
  assert.match(rate.erreur, /lecture ratée \(essai\)/);
  const lusAvant = lus;
  assert.deepEqual(pagesDu(await a(23 * MIN)), ATTENDU);
  await L.calendriersBatis(db);
  assert.equal(lus, lusAvant + 1, 'relu à la requête suivante');
  // La première construction ratée : aucune page ; la requête suivante relit et les trouve.
  L.viderLesTables();
  assert.deepEqual(pagesDu(await a(0)), AUCUNE);
  casse = false;
  assert.deepEqual(pagesDu(await a(0)), ATTENDU, 'jamais un index vide gardé après une lecture ratée');
});

test('Correctifs D3, point 2 — la page d’un match FINI : sa fiche au magasin (la page « match terminé », /match/<clé>), par l’identifiant FotMob du match et son jour (à un jour près ; ses deux clubs quand il les a) ; une fiche rangée sans identifiant : par ses deux clubs et son jour ; jamais un nom ; deux fiches, aucune, un autre jour, d’autres clubs → aucune page ; dans `finis` et dans `fin` ; en rejeu aussi', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const JOUR = '2026-11-14';
  const K = iso(T - 130 * MIN);
  const fini = (id, homeId, awayId) => ({
    id: String(id),
    league: 'Premier League - England',
    leagueKey: 'ENG|Premier League',
    date: JOUR,
    kickoff: K,
    homeId,
    awayId,
    homeName: 'Domicile',
    awayName: 'Exterieur',
    at: T - 10 * MIN,
    liste: F.listeEnJeu({ id, homeId, awayId, kickoff: K, label: 'FT', h: 2, a: 0, finished: true }),
    fin: { status: 'terminé', homeGoals: 2, awayGoals: 0 },
    memoire: null
  });
  // Les fiches du magasin (fabriquées ; toutes aux mêmes noms « Domicile » et « Exterieur » : seuls les identifiants comptent).
  F.poserUneFiche(db, { matchKey: `${JOUR}-ville-a-ville-b`, date: JOUR, homeId: 'fotmob-801', awayId: 'fotmob-802', fotmobId: 5801 });
  F.poserUneFiche(db, { matchKey: '2026-11-15-ville-c-ville-d', date: '2026-11-15', homeId: 'fotmob-803', awayId: 'fotmob-804', fotmobId: 5802 });
  F.poserUneFiche(db, { matchKey: `${JOUR}-ville-e-ville-f`, date: JOUR, homeId: 'fotmob-805', awayId: 'fotmob-806' });
  F.poserUneFiche(db, { matchKey: '2025-11-14-ville-i-ville-j', date: '2025-11-14', homeId: 'fotmob-809', awayId: 'fotmob-810', fotmobId: 5805 });
  F.poserUneFiche(db, { matchKey: `${JOUR}-ville-k-ville-l`, date: JOUR, homeId: 'fotmob-811', awayId: 'fotmob-812' });
  F.poserUneFiche(db, { matchKey: `${JOUR}-ville-k-ville-l-bis`, date: JOUR, homeId: 'fotmob-811', awayId: 'fotmob-812' });
  F.poserUneFiche(db, { matchKey: `${JOUR}-ville-n-ville-m`, date: JOUR, homeId: 'fotmob-814', awayId: 'fotmob-813', fotmobId: 5807 });
  F.poserUneFiche(db, { matchKey: `${JOUR}-domicile-exterieur`, date: JOUR, homeId: 'fotmob-891', awayId: 'fotmob-892' });
  F.poserUneFiche(db, { matchKey: `${JOUR}-ville-o-ville-p`, date: JOUR, homeId: 'fotmob-817', awayId: 'fotmob-818', fotmobId: 5809 });
  const finis = [
    fini(5801, 'fotmob-801', 'fotmob-802'), // par l'identifiant du match, le même jour
    fini(5802, 'fotmob-803', 'fotmob-804'), // rangée au jour d'après : à un jour près
    fini(5803, 'fotmob-805', 'fotmob-806'), // fiche sans identifiant de match : par ses deux clubs et son jour
    fini(5804, 'fotmob-807', 'fotmob-808'), // pas encore rangée
    fini(5805, 'fotmob-809', 'fotmob-810'), // une fiche de cet identifiant, un an plus tôt : aucune
    fini(5806, 'fotmob-811', 'fotmob-812'), // deux fiches sans identifiant, même paire, même jour : aucune
    fini(5807, 'fotmob-813', 'fotmob-814'), // l'identifiant du match, mais d'autres clubs au magasin : aucune
    fini(5808, 'fotmob-815', 'fotmob-816'), // mêmes noms qu'une fiche, d'autres identifiants : aucune
    fini(5809, null, null) // sans identifiants de clubs : l'identifiant du match et son jour
  ];
  const ATTENDU = {
    5801: { id: `${JOUR}-ville-a-ville-b`, source: 'magasin' },
    5802: { id: '2026-11-15-ville-c-ville-d', source: 'magasin' },
    5803: { id: `${JOUR}-ville-e-ville-f`, source: 'magasin' },
    5804: null,
    5805: null,
    5806: null,
    5807: null,
    5808: null,
    5809: { id: `${JOUR}-ville-o-ville-p`, source: 'magasin' }
  };
  const em = F.etatMinute({ maintenant: T, matchs: [], finis });
  const r = await lire(db, em);
  assert.deepEqual(Object.fromEntries(r.finis.map((f) => [f.fotmobId, f.page])), ATTENDU);
  for (const f of r.finis) forme(f, CLES.fini, f.fotmobId);
  // Le détail d'un match fini (non suivi) : la même page dans `fin`.
  const d = await detail(db, em, { id: '5801' });
  assert.deepEqual([d.suivi, d.raison, d.fin.page], [false, 'fini', ATTENDU[5801]]);
  assert.equal((await detail(db, em, { id: '5804' })).fin.page, null);
  // Rangée par la passe suivante : vue à la lecture suivante (rien n'est gardé).
  F.poserUneFiche(db, { matchKey: `${JOUR}-ville-g-ville-h`, date: JOUR, homeId: 'fotmob-807', awayId: 'fotmob-808', fotmobId: 5804 });
  assert.deepEqual((await lire(db, em)).finis.find((f) => f.fotmobId === '5804').page, { id: `${JOUR}-ville-g-ville-h`, source: 'magasin' });
  // Une base sans le magasin : aucune page, jamais une erreur.
  const sans = F.baseDuDirect();
  sans.exec('DROP TABLE matches');
  assert.deepEqual((await lire(sans, em)).finis.map((f) => f.page), finis.map(() => null));
  // Le rejeu : le fini d'un instantané « fin » trouve sa fiche par les mêmes identifiants.
  L.viderLesTables();
  F.poserUnInstantane(db, { fotmobId: 5801, takenAt: iso(T - 12 * MIN), kind: 'fin', kickoff: K, homeId: 'fotmob-801', awayId: 'fotmob-802', status: 'terminé', label: 'FT', h: 2, a: 0 });
  const rj = await L.tableauDuDirect({ maintenant: T, database: db, note: null, instant: iso(T - 5 * MIN), rejeuPermis: true, calendrier: () => [] });
  assert.deepEqual(rj.finis.map((f) => [f.fotmobId, f.page]), [['5801', ATTENDU[5801]]]);
});

// ------------------------------------------------------------ § 2.7 de la vérification de la 46 (18/11/2026) : la reconduction

// Corrigé le 18/11 au matin (O15) : l'inscription porte sa preuve entière et les empreintes (code + réglages) des deux versions ;
// l'écran la recontrôle avec le vrai sceau, le registre des versions (ici fabriqué : `registreDesVersions`) et le sha1 de la
// preuve. Le jour de lecture est celui de T (14/11 à Paris) : l'inscription est du 13/11.
const JOURS_DE_L_ESSAI = { le: '2026-11-13', entreeEnService: '2026-11-12' };
const inscriptionFabriquee = (plusPreuve = {}, plus = {}) => RF.inscriptionDe(RF.preuveFabriquee(plusPreuve), { ...JOURS_DE_L_ESSAI, ...plus });
const REGISTRE_DE_L_ESSAI = RF.registreFabrique();

test('T-L11 bis — la reconduction (§ 2.7, O15) : sans inscription, une ligne de la version 6 reste « pas encore jugé pour cette version », à blanc ; inscrite (5 → 6, même grille, contrôlée avec le sceau, le registre et sa preuve), elle est lue comme la version 5 de la note — variante de la note, chiffres montrés, minute 0 comprise — et `note.reconduite` le dit ; une inscription d’une autre grille, d’un autre départ, en double, sous les seuils, à preuve retouchée, d’un registre qui ne la redit pas, sans registre ou d’un jour à venir ne vaut rien ; une note « candidate » n’est jamais contournée', async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const m5 = suivi(5111, 'fotmob-1221', 'fotmob-1222', { minute: 34, h: 1 });
  const m6 = suivi(5112, 'fotmob-1223', 'fotmob-1224', { minute: 34, h: 1 });
  const m7 = suivi(5113, 'fotmob-1225', 'fotmob-1226', { minute: 34, h: 1 });
  const versions = { 'fotmob-1223': { engineVersion: 6 }, 'fotmob-1225': { engineVersion: 7 } };
  const ligneDe = (q) => F.ligneFabriquee({ ...q, ...(versions[q.homeId] ?? {}) });
  const em = F.etatMinute({ maintenant: T, matchs: [m5, m6, m7] });
  const avec = (reconductions, plus = {}) => lire(db, em, { ligneDe, note: NOTE, registreDesVersions: REGISTRE_DE_L_ESSAI, ...(reconductions === undefined ? {} : { reconductions }), ...plus });
  const par = (r) => Object.fromEntries(r.matchs.map((e) => [e.fotmobId, e]));
  // (Les essais lisent les chiffres à blanc : sourcesActives passe chiffresABlanc ; seul `aBlanc` dit s'ils sont montrés.)
  const strict = (e, qui) => assert.deepEqual([e.calcul.note.applique, e.calcul.note.raison, e.calcul.aBlanc, e.calcul.note.reconduite], [false, 'pas-juge-pour-cette-version', true, null], qui);
  // Sans inscription ([], null, ou la liste du code tant qu'elle est vide) : l'écran reste strict.
  const { RECONDUCTIONS } = await import('../src/data/direct/reconductionDuDirect.js');
  for (const [qui, liste] of [['vide', []], ['nulle', null], ...(RECONDUCTIONS.length === 0 ? [['celle du code, vide', undefined]] : [])]) {
    const e = par(await avec(liste));
    strict(e['5112'], `sans inscription (${qui})`);
    assert.deepEqual([e['5111'].calcul.note.applique, e['5111'].calcul.aBlanc, e['5111'].calcul.note.reconduite], [true, false, null], `version 5 (${qui})`);
  }
  // Inscrite : la ligne de la version 6 est lue comme la version 5 (variante de la note, chiffres montrés) et la note le dit.
  const i = inscriptionFabriquee();
  const e = par(await avec([i]));
  assert.deepEqual([e['5112'].calcul.note.applique, e['5112'].calcul.note.raison, e['5112'].calcul.aBlanc, e['5112'].calcul.variante, e['5112'].calcul.varianteSource], [true, null, false, 'temps-restant', 'note']);
  assert.deepEqual(e['5112'].calcul.note.reconduite, { de: 5, vers: 6, le: '2026-11-13', nuits: 3, rencontres: 312 });
  assert.ok(e['5112'].calcul.un2 && Number.isFinite(e['5112'].calcul.un2.home), 'les chiffres sont là');
  assert.deepEqual(e['5112'].calcul.un2, e['5111'].calcul.un2, 'la même ligne, les mêmes chiffres que la version jugée');
  assert.equal(e['5111'].calcul.note.reconduite, null, 'la version jugée elle-même : aucune reconduction dite');
  strict(e['5113'], 'version 7, non inscrite');
  // Ne vaut rien : autre grille, autre départ, en double, sous les seuils, écart, module changé sans lectures, preuve retouchée
  // ou sans sha1, empreintes qui ne redisent pas la preuve, inscrite après le jour de lecture.
  const retouchee = { ...i, preuve: { ...i.preuve, contenu: { ...i.preuve.contenu, rencontres: 400 } } };
  for (const [qui, liste] of [
    ['autre grille', [inscriptionFabriquee({}, { grille: 'modele-buts-441' })]],
    ['autre départ', [inscriptionFabriquee({}, { de: 4 })]],
    ['en double', [i, inscriptionFabriquee({}, { le: '2026-11-12' })]],
    ['2 nuits', [inscriptionFabriquee({ nuits: 2 })]],
    ['299 rencontres', [inscriptionFabriquee({ rencontres: 299 })]],
    ['écart 1e-9', [inscriptionFabriquee({}, { ecartMax: { lambda: 1e-9, mu: 0, rho: 0, fair: 0 } })]],
    ['module changé sans lectures', [inscriptionFabriquee({}, { modulesDuDirectChanges: ['src/data/direct/calculDuDirect.js'] })]],
    ['preuve retouchée (sha1 gardé)', [retouchee]],
    ['preuve sans sha1', [inscriptionFabriquee({}, { preuve: { ...i.preuve, sha1: 'x' } })]],
    ['empreintes qui ne redisent pas la preuve', [inscriptionFabriquee({}, { empreintes: { de: { ...RF.IDENTITE_5 }, vers: { ...RF.IDENTITE_5 } } })]],
    ['inscrite après le jour de lecture', [inscriptionFabriquee({}, { le: '2026-11-15' })]]
  ]) strict(par(await avec(liste))['5112'], qui);
  // Le registre des versions : le 6 qui y est n'a pas les empreintes inscrites (autres réglages), il manque, ou pas de registre.
  for (const [qui, registre] of [
    ['le 6 du registre a d’autres réglages', RF.registreFabrique({ 5: RF.IDENTITE_5, 6: { ...RF.IDENTITE_6, reglages: 'c'.repeat(40) } })],
    ['le 6 manque au registre', RF.registreFabrique({ 5: RF.IDENTITE_5 })],
    ['registre illisible', { versions: 'non' }],
    ['sans registre', null]
  ]) strict(par(await avec([i], { registreDesVersions: registre }))['5112'], qui);
  // Une note « candidate » n'est jamais contournée : la ligne de la version 6 sans SA candidate reste stricte, même inscrite.
  const candidate = par(await avec([i], { note: { ...NOTE, role: 'candidate', candidateHash: 'f01dd8496f56a415' } }));
  strict(candidate['5112'], 'note candidate, ligne 6 sans sa candidate');
  // Le détail du match suit la même règle, minute 0 comprise (lue avec la note : ses marchés dits, pas tus).
  const montree = (d) => Object.values(d.match.calcul.minute0?.marches ?? {}).some((v) => v && v.direct !== null && v.direct !== undefined);
  const d = await detail(db, em, { id: '5112' }, { ligneDe, note: NOTE, reconductions: [i], registreDesVersions: REGISTRE_DE_L_ESSAI });
  assert.deepEqual([d.match.calcul.note.applique, d.match.calcul.aBlanc, d.match.calcul.note.reconduite?.vers, montree(d)], [true, false, 6, true]);
  const dStrict = await detail(db, em, { id: '5112' }, { ligneDe, note: NOTE, reconductions: [], registreDesVersions: REGISTRE_DE_L_ESSAI });
  assert.deepEqual([dStrict.match.calcul.note.applique, dStrict.match.calcul.aBlanc], [false, true]);
  const dSansRegistre = await detail(db, em, { id: '5112' }, { ligneDe, note: NOTE, reconductions: [i], registreDesVersions: null });
  assert.deepEqual([dSansRegistre.match.calcul.note.applique, dSansRegistre.match.calcul.aBlanc], [false, true], 'le détail sans registre : strict');
  // La courbe aussi (son filtre point par point, § 2.6) : reconduite, ses points en jeu gardent leurs chiffres ; stricte, ils
  // sont tus (« non-montre »). (Ajouté le 18/11 : la pose P20 — la courbe lue sans les reconductions — passait sans lui.)
  const enJeu = (c) => (c?.points ?? []).filter((p) => p.type !== 'avant-match');
  assert.ok(enJeu(d.courbe).length >= 1, `courbe : ${JSON.stringify((d.courbe?.points ?? []).map((p) => p.type))}`);
  assert.ok(enJeu(d.courbe).every((p) => p.raison !== 'non-montre' && Number.isFinite(p.un2?.home)), `reconduite : ${JSON.stringify(enJeu(d.courbe))}`);
  assert.ok(enJeu(dStrict.courbe).length >= 1 && enJeu(dStrict.courbe).every((p) => p.un2 === null && p.raison === 'non-montre'), `stricte : ${JSON.stringify(enJeu(dStrict.courbe))}`);
});
